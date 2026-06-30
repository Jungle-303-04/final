"""manifest-render-worker — git.changed → manifest 렌더 → manifest.rendered.

우현 원본 GitOpsSyncWorkflow.handle()의 manifest dict 생성, repo_change 저장,
rendered Kubernetes object 생성, MANIFEST_RENDERED 발행 블록에 대응. Git 변경을
Kubernetes manifest로 바꾸는 책임만 분리.
"""

from __future__ import annotations

import json
import subprocess
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any
from urllib import error, parse, request

import yaml

from packages.config.constants import Sandbox
from packages.config.settings import env
from packages.contracts.event_bus.bodies import (
    EventBody,
    GitChangedBody,
    Manifest,
    ManifestInvalidBody,
    ManifestRenderedBody,
    RenderedManifest,
    RenderedMetadata,
    RenderedSpec,
)
from packages.contracts.gitops import (
    DEFAULT_GITHUB_API_BASE,
    GITHUB_API_BASE_ENV,
    GITHUB_TOKEN_ENV,
    ManifestArtifactStatus,
)
from packages.contracts.stores import RepoChangeStore
from packages.runtime.app import App, EventContext

app = App("manifest-render-worker")

DEFAULT_APP_NAME = "checkout-api"
MANIFEST_API_VERSION = "apps/v1"
MANIFEST_KIND = "Deployment"
METADATA_FIELD = "metadata"
SPEC_FIELD = "spec"
TEMPLATE_FIELD = "template"
CONTAINERS_FIELD = "containers"
NAMESPACED_KINDS = {"Deployment", "Service", "ConfigMap"}
GIT_REPO_PATH_ENV = "GIT_REPO_PATH"
GIT_MANIFEST_PATH_ENV = "GIT_MANIFEST_PATH"
GIT_REMOTE_MANIFEST_ENABLED_ENV = "GIT_REMOTE_MANIFEST_ENABLED"
GIT_REMOTE_MANIFEST_REQUIRED_ENV = "GIT_REMOTE_MANIFEST_REQUIRED"
GITHUB_MANIFEST_TIMEOUT_SECONDS_ENV = "GITHUB_MANIFEST_TIMEOUT_SECONDS"
DEFAULT_GITHUB_MANIFEST_TIMEOUT_SECONDS = "5"
TRUTHY_VALUES = {"1", "true", "yes", "on"}


class ManifestSourceError(Exception):
    """Manifest source exists conceptually but cannot be loaded."""


def env_truthy(name: str, default: str = "") -> bool:
    return env(name, default).strip().lower() in TRUTHY_VALUES


def github_contents_url(repo_ref: str, commit_sha: str, manifest_path: str) -> str:
    api_base = env(GITHUB_API_BASE_ENV, DEFAULT_GITHUB_API_BASE).rstrip("/")
    encoded_repo = parse.quote(repo_ref.strip("/"), safe="/")
    encoded_path = parse.quote(manifest_path.lstrip("/"), safe="/")
    encoded_ref = parse.quote(commit_sha, safe="")
    return f"{api_base}/repos/{encoded_repo}/contents/{encoded_path}?ref={encoded_ref}"


def read_github_manifest_source(repo_ref: str, commit_sha: str, manifest_path: str) -> str | None:
    if not env_truthy(GIT_REMOTE_MANIFEST_ENABLED_ENV):
        return None
    if not repo_ref or not commit_sha or not manifest_path:
        return None

    headers = {"Accept": "application/vnd.github.raw"}
    token = env(GITHUB_TOKEN_ENV, "")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = request.Request(github_contents_url(repo_ref, commit_sha, manifest_path), headers=headers)
    timeout = float(
        env(GITHUB_MANIFEST_TIMEOUT_SECONDS_ENV, DEFAULT_GITHUB_MANIFEST_TIMEOUT_SECONDS)
    )
    try:
        with request.urlopen(req, timeout=timeout) as response:
            return response.read().decode("utf-8")
    except (error.HTTPError, error.URLError, TimeoutError) as exc:
        if env_truthy(GIT_REMOTE_MANIFEST_REQUIRED_ENV):
            raise ManifestSourceError(f"failed to load GitHub manifest: {exc}") from exc
        return None


def read_manifest_source(evt: GitChangedBody) -> str | None:
    manifest_path = env(GIT_MANIFEST_PATH_ENV, evt.manifest_path)
    if not manifest_path:
        return None

    repo_path = env(GIT_REPO_PATH_ENV, "")
    if repo_path:
        # TODO(gitops): local clone 접근을 repo integration checkout/cache로 교체
        result = subprocess.run(
            ["git", "-C", repo_path, "show", f"{evt.commit_sha}:{manifest_path}"],
            check=True,
            capture_output=True,
            text=True,
        )
        return result.stdout

    path = Path(manifest_path)
    if path.exists():
        # TODO(gitops): local-file 경로는 dev/test 전용, production은 repo ref 사용
        return path.read_text(encoding="utf-8")

    remote_source = read_github_manifest_source(evt.repo_ref, evt.commit_sha, manifest_path)
    if remote_source is not None:
        return remote_source
    return None


def parse_rendered_manifest_source(source: str) -> list[RenderedManifest]:
    payloads = load_manifest_documents(source)
    rendered = [
        render_manifest_payload(payload)
        for payload in payloads
        if isinstance(payload, dict) and payload
    ]
    if not rendered:
        raise ValueError("manifest source did not contain a Kubernetes object")
    return rendered


def load_manifest_documents(source: str) -> list[Any]:
    try:
        payload = json.loads(source)
        return payload if isinstance(payload, list) else [payload]
    except json.JSONDecodeError:
        try:
            return list(yaml.safe_load_all(source))
        except yaml.YAMLError as exc:
            raise ValueError(f"invalid YAML manifest: {exc}") from exc


def render_manifest_payload(payload: dict[str, Any]) -> RenderedManifest:
    kind = str(payload.get("kind", ""))
    api_version = str(payload.get("apiVersion", ""))
    metadata = payload.get(METADATA_FIELD, {})
    if not isinstance(metadata, dict):
        raise ValueError("manifest metadata must be an object")
    name = str(metadata.get("name", ""))
    if not kind or not api_version or not name:
        raise ValueError("manifest must include apiVersion, kind, and metadata.name")

    namespace = str(metadata.get("namespace") or Sandbox.NAMESPACE)
    if kind in NAMESPACED_KINDS:
        payload = {
            **payload,
            METADATA_FIELD: {
                **metadata,
                "namespace": namespace,
            },
        }

    return RenderedManifest(
        api_version=api_version,
        kind=kind,
        metadata=RenderedMetadata(name=name, namespace=namespace),
        spec=rendered_spec_from_payload(kind, payload),
        manifest=payload,
    )


def rendered_spec_from_payload(kind: str, payload: dict[str, Any]) -> RenderedSpec:
    spec = payload.get(SPEC_FIELD, {})
    if not isinstance(spec, dict):
        return RenderedSpec()
    if kind != MANIFEST_KIND:
        return RenderedSpec()
    return RenderedSpec(
        replicas=deployment_replicas(spec),
        image=deployment_image(spec),
    )


def deployment_replicas(spec: dict[str, Any]) -> int:
    raw = spec.get("replicas", 1)
    if raw is None:
        return 1
    if isinstance(raw, bool):
        raise ValueError("deployment spec.replicas must be an integer")
    return int(raw)


def deployment_image(spec: dict[str, Any]) -> str:
    template = spec.get(TEMPLATE_FIELD, {})
    if not isinstance(template, dict):
        return ""
    pod_spec = template.get(SPEC_FIELD, {})
    if not isinstance(pod_spec, dict):
        return ""
    containers = pod_spec.get(CONTAINERS_FIELD, [])
    if not isinstance(containers, list) or not containers:
        return ""
    first = containers[0]
    if not isinstance(first, dict):
        return ""
    return str(first.get("image", ""))


def build_manifest_from_git_change(evt: GitChangedBody) -> Manifest:
    # TODO(gitops): commit metadata 보존으로 render 실패와 repo revision 추적
    return Manifest(
        app=DEFAULT_APP_NAME,
        image=evt.image,
        replicas=evt.replicas,
        namespace=Sandbox.NAMESPACE,
        manifest_path=evt.manifest_path,
    )


def build_rendered_manifests_from_git_change(evt: GitChangedBody) -> list[RenderedManifest]:
    source = read_manifest_source(evt)
    if source is not None:
        return parse_rendered_manifest_source(source)
    return [render_deployment_manifest(build_manifest_from_git_change(evt))]


def render_deployment_manifest(manifest: Manifest) -> RenderedManifest:
    # TODO(gitops): Deployment 전용 shape를 Kustomize/Helm renderer 출력으로 교체
    # TODO(gitops): raw exception 대신 구조화된 render 오류 반환
    raw = {
        "apiVersion": MANIFEST_API_VERSION,
        "kind": MANIFEST_KIND,
        "metadata": {"name": manifest.app, "namespace": manifest.namespace},
        "spec": {
            "replicas": manifest.replicas,
            "template": {
                "spec": {
                    "containers": [
                        {
                            "name": manifest.app,
                            "image": manifest.image,
                        }
                    ]
                }
            },
        },
    }
    return RenderedManifest(
        api_version=MANIFEST_API_VERSION,
        kind=MANIFEST_KIND,
        metadata=RenderedMetadata(name=manifest.app, namespace=manifest.namespace),
        spec=RenderedSpec(replicas=manifest.replicas, image=manifest.image),
        manifest=raw,
    )


def rendered_resource_suffix(rendered: RenderedManifest) -> str:
    return f"{rendered.kind.lower()}/{rendered.metadata.name}"


def artifact_manifest_path(evt: GitChangedBody, rendered: RenderedManifest | None) -> str:
    if rendered is None:
        return evt.manifest_path
    return f"{evt.manifest_path}#{rendered_resource_suffix(rendered)}"


def artifact_payload(
    evt: GitChangedBody,
    status: str,
    rendered: RenderedManifest | None = None,
    reason: str | None = None,
) -> dict[str, object]:
    return {
        "workspace_id": evt.workspace_id,
        "repository_id": evt.repository_id,
        "watch_target_id": evt.watch_target_id,
        "binding_id": evt.binding_id,
        "commit_sha": evt.commit_sha,
        "manifest_path": artifact_manifest_path(evt, rendered),
        "status": status,
        "status_reason": reason,
        "rendered_manifest": rendered.to_body() if rendered is not None else None,
        "source_summary": {
            "repo_ref": evt.repo_ref,
            "branch": evt.branch,
            "manifest_path": evt.manifest_path,
            "resource": rendered_resource_suffix(rendered) if rendered is not None else None,
            "cluster_id": evt.cluster_id,
            "application_id": evt.application_id,
            "workflow_run_id": evt.workflow_run_id,
            "environment": evt.environment,
        },
    }


@app.on(GitChangedBody)
async def on_git_changed(
    evt: GitChangedBody, ctx: EventContext[RepoChangeStore]
) -> AsyncIterator[EventBody]:
    # 우현 원본 보존(GitOpsSyncWorkflow.handle 중 manifest + repo 저장 + render):
    #
    # manifest = {
    #     "app": DEFAULT_APP_NAME,
    #     "image": payload.get("image", DEFAULT_IMAGE),
    #     "replicas": payload.get("replicas", DEFAULT_REPLICAS),
    #     "namespace": SANDBOX_NAMESPACE,
    # }
    # self.repo.save_repo_change(evt["correlation_id"], commit_sha, manifest)
    #
    # rendered = {
    #     "apiVersion": MANIFEST_API_VERSION,
    #     "kind": MANIFEST_KIND,
    #     "metadata": {"name": manifest["app"], "namespace": manifest["namespace"]},
    #     "spec": {"replicas": manifest["replicas"], "image": manifest["image"]},
    # }
    # await self.events.publish(
    #     EventSubject.MANIFEST_RENDERED,
    #     SERVICE_NAME,
    #     {"rendered_manifest": rendered},
    #     evt["correlation_id"],
    # )
    #
    # 현재 split 구조: dict 대신 Manifest/RenderedManifest 값 객체 생성
    # 저장소 호출: EventContext[RepoChangeStore] + await
    try:
        rendered_manifests = build_rendered_manifests_from_git_change(evt)
    except (subprocess.CalledProcessError, ManifestSourceError, ValueError) as exc:
        reason = str(exc)
        await ctx.db.record_manifest_artifact(
            artifact_payload(evt, ManifestArtifactStatus.INVALID_CONFIG.value, reason=reason)
        )
        yield ManifestInvalidBody(
            workspace_id=evt.workspace_id,
            repository_id=evt.repository_id,
            watch_target_id=evt.watch_target_id,
            binding_id=evt.binding_id,
            commit_sha=evt.commit_sha,
            manifest_path=evt.manifest_path,
            reason=reason,
            application_id=evt.application_id,
            workflow_run_id=evt.workflow_run_id,
            environment=evt.environment,
            cluster_id=evt.cluster_id,
        )
        return

    for rendered in rendered_manifests:
        await ctx.db.save_repo_change(
            ctx.correlation_id,
            evt.commit_sha,
            rendered.manifest or rendered.to_body(),
            evt.workspace_id,
            evt.repository_id,
            evt.watch_target_id,
            evt.binding_id,
            evt.manifest_path,
        )
        await ctx.db.record_manifest_artifact(
            artifact_payload(evt, ManifestArtifactStatus.RENDERED.value, rendered=rendered)
        )
        yield ManifestRenderedBody(
            rendered_manifest=rendered,
            workspace_id=evt.workspace_id,
            repository_id=evt.repository_id,
            watch_target_id=evt.watch_target_id,
            binding_id=evt.binding_id,
            application_id=evt.application_id,
            workflow_run_id=evt.workflow_run_id,
            environment=evt.environment,
            cluster_id=evt.cluster_id,
            commit_sha=evt.commit_sha,
            manifest_path=evt.manifest_path,
        )


if __name__ == "__main__":
    app.run()

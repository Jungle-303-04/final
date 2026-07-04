"""manifest-render-worker — git.changed → manifest 렌더 → manifest.rendered.

우현 원본 GitOpsSyncWorkflow.handle()의 manifest dict 생성, repo_change 저장,
rendered Kubernetes object 생성, MANIFEST_RENDERED 발행 블록에 대응. Git 변경을
Kubernetes manifest로 바꾸는 책임만 분리.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any
from urllib import error, parse, request

import yaml
from repo_cache import GitRepoCache, GitRepoCacheError

from domains.gitops.diffing import extract_declared_field_paths
from domains.gitops.events import (
    GitChangedBody,
    ManifestInvalidBody,
    ManifestRenderedBody,
    RenderedManifest,
    RenderedMetadata,
    RenderedSpec,
)
from packages.config.constants import Sandbox
from packages.config.settings import env
from packages.contracts.event_bus.bodies import EventBody
from packages.contracts.gitops import (
    DEFAULT_GITHUB_API_BASE,
    GITHUB_API_BASE_ENV,
    GITHUB_TOKEN_ENV,
    GITHUB_TOKEN_REF_ENV,
    ManifestArtifactStatus,
    supported_kubernetes_resource,
)
from packages.contracts.security import SecretRef
from packages.contracts.stores import RepoChangeStore
from packages.runtime.app import App, EventContext
from packages.security import SecretNotFound, build_token_vault

app = App("manifest-render-worker")

MANIFEST_KIND = "Deployment"
METADATA_FIELD = "metadata"
SPEC_FIELD = "spec"
TEMPLATE_FIELD = "template"
CONTAINERS_FIELD = "containers"
GIT_REPO_PATH_ENV = "GIT_REPO_PATH"
GIT_MANIFEST_PATH_ENV = "GIT_MANIFEST_PATH"
GIT_MANIFEST_SOURCE_MODE_ENV = "GIT_MANIFEST_SOURCE_MODE"
GIT_LOCAL_MANIFEST_ENABLED_ENV = "GIT_LOCAL_MANIFEST_ENABLED"
GIT_CHECKOUT_CACHE_ENABLED_ENV = "GIT_CHECKOUT_CACHE_ENABLED"
GIT_CHECKOUT_CACHE_REQUIRED_ENV = "GIT_CHECKOUT_CACHE_REQUIRED"
GIT_CACHE_DIR_ENV = "GIT_CACHE_DIR"
GIT_CACHE_REMOTE_URL_ENV = "GIT_CACHE_REMOTE_URL"
GIT_CACHE_MAX_BYTES_ENV = "GIT_CACHE_MAX_BYTES"
GIT_CACHE_MAX_REPOS_ENV = "GIT_CACHE_MAX_REPOS"
GIT_REMOTE_MANIFEST_ENABLED_ENV = "GIT_REMOTE_MANIFEST_ENABLED"
GIT_REMOTE_MANIFEST_REQUIRED_ENV = "GIT_REMOTE_MANIFEST_REQUIRED"
GITHUB_MANIFEST_TIMEOUT_SECONDS_ENV = "GITHUB_MANIFEST_TIMEOUT_SECONDS"
GIT_MANIFEST_COMMAND_TIMEOUT_SECONDS_ENV = "GIT_MANIFEST_COMMAND_TIMEOUT_SECONDS"
DEFAULT_GITHUB_MANIFEST_TIMEOUT_SECONDS = "5"
DEFAULT_GIT_MANIFEST_COMMAND_TIMEOUT_SECONDS = "5"
DEFAULT_GIT_CACHE_DIR = "/tmp/gitops-repo-cache"
TRUTHY_VALUES = {"1", "true", "yes", "on"}
SOURCE_MODE_AUTO = "auto"
SOURCE_MODE_REMOTE = "remote"
SOURCE_MODE_LOCAL = "local"
# manifest 원천(local clone/파일/GitHub contents) 어디에서도 소스를 못 찾은 경우의 사유.
# 합성 manifest 생성 대신 manifest.invalid 로 정직하게 실패함.
MANIFEST_SOURCE_UNAVAILABLE_REASON = "manifest source unavailable"


class ManifestSourceError(Exception):
    """Manifest source exists conceptually but cannot be loaded."""


def env_truthy(name: str, default: str = "") -> bool:
    return env(name, default).strip().lower() in TRUTHY_VALUES


def manifest_source_mode() -> str:
    mode = env(GIT_MANIFEST_SOURCE_MODE_ENV, SOURCE_MODE_AUTO).strip().lower()
    if mode in {SOURCE_MODE_AUTO, SOURCE_MODE_REMOTE, SOURCE_MODE_LOCAL}:
        return mode
    raise ManifestSourceError(f"{GIT_MANIFEST_SOURCE_MODE_ENV} must be one of auto, remote, local")


def remote_manifest_enabled() -> bool:
    return env_truthy(GIT_REMOTE_MANIFEST_ENABLED_ENV)


def checkout_cache_enabled() -> bool:
    return env_truthy(GIT_CHECKOUT_CACHE_ENABLED_ENV)


def checkout_cache_required() -> bool:
    return env_truthy(GIT_CHECKOUT_CACHE_REQUIRED_ENV)


def local_manifest_enabled(mode: str) -> bool:
    if mode == SOURCE_MODE_LOCAL:
        return True
    if mode == SOURCE_MODE_REMOTE:
        return False
    if env_truthy(GIT_LOCAL_MANIFEST_ENABLED_ENV):
        return True
    # 개발/테스트 편의를 위해 remote source가 꺼진 auto 모드에서만 local fallback 허용.
    return not remote_manifest_enabled()


def env_int(name: str, default: str = "0") -> int:
    try:
        return max(0, int(env(name, default)))
    except ValueError:
        return max(0, int(default))


def github_token() -> str:
    token_ref = env(GITHUB_TOKEN_REF_ENV, "").strip()
    if token_ref:
        return build_token_vault().read_token(SecretRef(token_ref))
    token = env(GITHUB_TOKEN_ENV, "").strip()
    if token:
        return build_token_vault("env").read_token(SecretRef(GITHUB_TOKEN_ENV))
    return ""


def github_auth_header() -> str | None:
    try:
        token = github_token()
    except SecretNotFound:
        return None
    return f"Authorization: Bearer {token}" if token else None


def repo_remote_url(repo_ref: str) -> str:
    configured = env(GIT_CACHE_REMOTE_URL_ENV, "").strip()
    if configured:
        return configured
    normalized = repo_ref.strip()
    if not normalized:
        return ""
    if "://" in normalized or normalized.startswith("git@"):
        return normalized
    return f"https://github.com/{normalized.strip('/')}.git"


def read_checkout_cache_manifest_source(evt: GitChangedBody, manifest_path: str) -> str | None:
    if not checkout_cache_enabled():
        return None
    remote_url = repo_remote_url(evt.repo_ref)
    if not remote_url:
        return None
    cache = GitRepoCache(
        cache_dir=env(GIT_CACHE_DIR_ENV, DEFAULT_GIT_CACHE_DIR),
        remote_url=remote_url,
        timeout_seconds=float(
            env(
                GIT_MANIFEST_COMMAND_TIMEOUT_SECONDS_ENV,
                DEFAULT_GIT_MANIFEST_COMMAND_TIMEOUT_SECONDS,
            )
        ),
        max_bytes=env_int(GIT_CACHE_MAX_BYTES_ENV),
        max_repos=env_int(GIT_CACHE_MAX_REPOS_ENV),
        http_extra_header=github_auth_header(),
    )
    try:
        return cache.read_file(evt.commit_sha, manifest_path)
    except GitRepoCacheError:
        if checkout_cache_required():
            raise
        return None


def github_contents_url(repo_ref: str, commit_sha: str, manifest_path: str) -> str:
    api_base = env(GITHUB_API_BASE_ENV, DEFAULT_GITHUB_API_BASE).rstrip("/")
    encoded_repo = parse.quote(repo_ref.strip("/"), safe="/")
    encoded_path = parse.quote(manifest_path.lstrip("/"), safe="/")
    encoded_ref = parse.quote(commit_sha, safe="")
    return f"{api_base}/repos/{encoded_repo}/contents/{encoded_path}?ref={encoded_ref}"


def read_github_manifest_source(repo_ref: str, commit_sha: str, manifest_path: str) -> str | None:
    if not remote_manifest_enabled():
        return None
    if not repo_ref or not commit_sha or not manifest_path:
        return None

    headers = {"Accept": "application/vnd.github.raw"}
    try:
        token = github_token()
    except SecretNotFound as exc:
        raise ManifestSourceError(f"failed to load {GITHUB_TOKEN_REF_ENV}") from exc
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
        if env_truthy(GIT_REMOTE_MANIFEST_REQUIRED_ENV, "1"):
            raise ManifestSourceError(f"failed to load GitHub manifest: {exc}") from exc
        return None


def read_local_manifest_source(evt: GitChangedBody, manifest_path: str) -> str | None:
    repo_path = env(GIT_REPO_PATH_ENV, "")
    if repo_path:
        result = subprocess.run(
            ["git", "-C", repo_path, "show", f"{evt.commit_sha}:{manifest_path}"],
            check=True,
            capture_output=True,
            text=True,
            timeout=float(
                env(
                    GIT_MANIFEST_COMMAND_TIMEOUT_SECONDS_ENV,
                    DEFAULT_GIT_MANIFEST_COMMAND_TIMEOUT_SECONDS,
                )
            ),
        )
        return result.stdout

    path = Path(manifest_path)
    if path.exists():
        return path.read_text(encoding="utf-8")
    return None


def read_manifest_source(evt: GitChangedBody) -> str | None:
    manifest_path = env(GIT_MANIFEST_PATH_ENV, evt.manifest_path)
    if not manifest_path:
        return None

    mode = manifest_source_mode()
    if mode != SOURCE_MODE_LOCAL:
        cached_source = read_checkout_cache_manifest_source(evt, manifest_path)
        if cached_source is not None:
            return cached_source
        remote_source = read_github_manifest_source(evt.repo_ref, evt.commit_sha, manifest_path)
        if remote_source is not None:
            return remote_source

    if local_manifest_enabled(mode):
        return read_local_manifest_source(evt, manifest_path)
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

    contract = supported_kubernetes_resource(api_version, kind)
    namespace = str(metadata.get("namespace") or Sandbox.NAMESPACE)
    if contract.namespaced:
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
        artifact_digest=manifest_artifact_digest(payload),
        declared_fields=extract_declared_field_paths(payload),
    )


def manifest_artifact_digest(payload: dict[str, Any]) -> str:
    canonical = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return f"sha256:{hashlib.sha256(canonical.encode()).hexdigest()}"


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
    if isinstance(raw, bool) or not isinstance(raw, int):
        raise ValueError("deployment spec.replicas must be an integer")
    if raw < 0:
        raise ValueError("deployment spec.replicas must be a non-negative integer")
    return raw


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


def build_rendered_manifests_from_git_change(evt: GitChangedBody) -> list[RenderedManifest]:
    source = read_manifest_source(evt)
    if source is None:
        # 소스 없이 Deployment 를 합성하지 않음 — 정직한 실패 경로(manifest.invalid)로 보냄.
        raise ManifestSourceError(MANIFEST_SOURCE_UNAVAILABLE_REASON)
    return parse_rendered_manifest_source(source)


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
        "artifact_digest": rendered.artifact_digest if rendered is not None else None,
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
    # Git change를 Manifest/RenderedManifest 값 객체로 변환하고 render artifact를 저장함.
    # subject 발행은 yield된 이벤트를 런타임이 처리함.
    try:
        rendered_manifests = build_rendered_manifests_from_git_change(evt)
    except (
        subprocess.CalledProcessError,
        subprocess.TimeoutExpired,
        GitRepoCacheError,
        ManifestSourceError,
        ValueError,
    ) as exc:
        reason = str(exc)
        await ctx.db.record_manifest_artifact(
            artifact_payload(evt, ManifestArtifactStatus.INVALID_CONFIG.value, reason=reason)
        )
        if isinstance(exc, ValueError):
            await ctx.db.mark_watch_observed(
                evt.watch_target_id,
                evt.commit_sha,
                evt.workspace_id,
                evt.repository_id,
                evt.branch,
                evt.manifest_path,
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
    await ctx.db.mark_watch_observed(
        evt.watch_target_id,
        evt.commit_sha,
        evt.workspace_id,
        evt.repository_id,
        evt.branch,
        evt.manifest_path,
    )


if __name__ == "__main__":
    app.run()

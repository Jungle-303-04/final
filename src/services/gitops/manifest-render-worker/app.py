"""manifest-render-worker — git.changed → manifest 렌더 → manifest.rendered.

우현 원본 GitOpsSyncWorkflow.handle()의 manifest dict 생성, repo_change 저장,
rendered Deployment 생성, MANIFEST_RENDERED 발행 블록에 대응. Git 변경을
Kubernetes 배포 사양으로 바꾸는 책임만 분리.
"""

from __future__ import annotations

import json
import subprocess
from collections.abc import AsyncIterator
from pathlib import Path

from packages.config.constants import Sandbox
from packages.config.settings import env
from packages.contracts.event_bus.bodies import (
    EventBody,
    GitChangedBody,
    Manifest,
    ManifestRenderedBody,
    RenderedManifest,
    RenderedMetadata,
    RenderedSpec,
)
from packages.contracts.stores import RepoChangeStore
from packages.runtime.app import App, EventContext

app = App("manifest-render-worker")

DEFAULT_APP_NAME = "checkout-api"
MANIFEST_API_VERSION = "apps/v1"
MANIFEST_KIND = "Deployment"
GIT_REPO_PATH_ENV = "GIT_REPO_PATH"
GIT_MANIFEST_PATH_ENV = "GIT_MANIFEST_PATH"


def read_manifest_source(evt: GitChangedBody) -> str | None:
    manifest_path = env(GIT_MANIFEST_PATH_ENV, "")
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
    return None


def parse_manifest_source(source: str) -> Manifest:
    try:
        payload = json.loads(source)
        metadata = payload.get("metadata", {})
        spec = payload.get("spec", {})
        template = spec.get("template", {})
        containers = template.get("spec", {}).get("containers", [])
        image = containers[0]["image"]
        return Manifest(
            app=metadata["name"],
            image=image,
            replicas=int(spec.get("replicas", 1)),
            namespace=metadata.get("namespace", Sandbox.NAMESPACE),
        )
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return parse_simple_yaml_manifest(source)


def parse_simple_yaml_manifest(source: str) -> Manifest:
    # TODO(gitops): 최소 Deployment 파서를 Kustomize/Helm/YAML 어댑터로 교체
    name: str | None = None
    namespace = Sandbox.NAMESPACE
    replicas = 1
    image: str | None = None
    section: str | None = None

    for raw_line in source.splitlines():
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if not raw_line.startswith((" ", "-")):
            section = stripped.removesuffix(":")
        if section == "metadata":
            if stripped.startswith("name:") and name is None:
                name = stripped.split(":", 1)[1].strip().strip('"')
            if stripped.startswith("namespace:"):
                namespace = stripped.split(":", 1)[1].strip().strip('"')
        if stripped.startswith("replicas:"):
            replicas = int(stripped.split(":", 1)[1].strip())
        if "image:" in stripped and image is None:
            image = stripped.split("image:", 1)[1].strip().strip('"')

    if not name or not image:
        raise ValueError("manifest must include metadata.name and a container image")
    return Manifest(app=name, image=image, replicas=replicas, namespace=namespace)


def build_manifest_from_git_change(evt: GitChangedBody) -> Manifest:
    source = read_manifest_source(evt)
    if source is not None:
        return parse_manifest_source(source)
    # TODO(gitops): commit metadata 보존으로 render 실패와 repo revision 추적
    return Manifest(
        app=DEFAULT_APP_NAME,
        image=evt.image,
        replicas=evt.replicas,
        namespace=Sandbox.NAMESPACE,
    )


def render_deployment_manifest(manifest: Manifest) -> RenderedManifest:
    # TODO(gitops): Deployment 전용 shape를 Kustomize/Helm renderer 출력으로 교체
    # TODO(gitops): raw exception 대신 구조화된 render 오류 반환
    return RenderedManifest(
        api_version=MANIFEST_API_VERSION,
        kind=MANIFEST_KIND,
        metadata=RenderedMetadata(name=manifest.app, namespace=manifest.namespace),
        spec=RenderedSpec(replicas=manifest.replicas, image=manifest.image),
    )


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
    manifest = build_manifest_from_git_change(evt)
    await ctx.db.save_repo_change(ctx.correlation_id, evt.commit_sha, manifest.to_body())
    rendered = render_deployment_manifest(manifest)
    yield ManifestRenderedBody(rendered_manifest=rendered)


if __name__ == "__main__":
    app.run()

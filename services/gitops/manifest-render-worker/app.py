"""manifest-render-worker — git.changed → manifest 렌더 → manifest.rendered.

우현 원본 GitOpsSyncWorkflow.handle()의 manifest dict 생성, repo_change 저장,
rendered Deployment 생성, MANIFEST_RENDERED 발행 블록에 대응. Git 변경을
Kubernetes 배포 사양으로 바꾸는 책임만 분리.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from packages.config.constants import Sandbox
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


@app.sub(GitChangedBody)
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
    # 현재 split 구조에서는 dict 대신 Manifest/RenderedManifest 값 객체를 만들고,
    # 저장소는 EventContext[RepoChangeStore]를 통해 await로 호출한다.
    manifest = Manifest(
        app=DEFAULT_APP_NAME, image=evt.image, replicas=evt.replicas, namespace=Sandbox.NAMESPACE
    )
    await ctx.db.save_repo_change(ctx.correlation_id, evt.commit_sha, manifest.to_body())
    rendered = RenderedManifest(
        api_version=MANIFEST_API_VERSION,
        kind=MANIFEST_KIND,
        metadata=RenderedMetadata(name=manifest.app, namespace=manifest.namespace),
        spec=RenderedSpec(replicas=manifest.replicas, image=manifest.image),
    )
    yield ManifestRenderedBody(rendered_manifest=rendered)


if __name__ == "__main__":
    app.run()

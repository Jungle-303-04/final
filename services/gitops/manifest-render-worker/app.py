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

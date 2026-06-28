"""manifest-render-worker — git.changed → manifest 렌더 → manifest.rendered.

원시 변경(commit/image/replicas) → 배포 사양 + 렌더된 Deployment, repo_change
저장.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from packages.config.constants import Sandbox
from packages.contracts.event_bus.bodies import EventBody, GitChangedBody, Manifest, ManifestRenderedBody, RenderedManifest, RenderedMetadata, RenderedSpec
from packages.runtime.app import App, EventContext

app = App("manifest-render-worker")

DEFAULT_APP_NAME = "checkout-api"
MANIFEST_API_VERSION = "apps/v1"
MANIFEST_KIND = "Deployment"


@app.sub(GitChangedBody)
async def on_git_changed(evt: GitChangedBody, ctx: EventContext) -> AsyncIterator[EventBody]:
    manifest = Manifest(app=DEFAULT_APP_NAME, image=evt.image, replicas=evt.replicas, namespace=Sandbox.NAMESPACE)
    ctx.db.save_repo_change(ctx.correlation_id, evt.commit_sha, manifest.to_body())
    rendered = RenderedManifest(api_version=MANIFEST_API_VERSION, kind=MANIFEST_KIND, metadata=RenderedMetadata(name=manifest.app, namespace=manifest.namespace), spec=RenderedSpec(replicas=manifest.replicas, image=manifest.image))
    yield ManifestRenderedBody(rendered_manifest=rendered)


if __name__ == "__main__":
    app.run()

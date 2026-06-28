"""diff-worker — manifest.rendered → desired.diff.detected (원하는 vs 실제).

렌더 이미지(원하는 것) vs 현재 이미지(실제) 비교. 중첩 body
(rendered_manifest)는 타입 객체로 받아 속성 접근.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from packages.config.constants import Sandbox
from packages.contracts.event_bus.bodies import (
    DesiredDiffBody,
    Diff,
    EventBody,
    ManifestRenderedBody,
)
from packages.runtime.app import App, EventContext

app = App("diff-worker")

PREVIOUS_IMAGE = "ghcr.io/project/checkout-api:previous"
RESOURCE_REF = "deployment/checkout-api"


@app.sub(ManifestRenderedBody)
async def on_manifest_rendered(
    evt: ManifestRenderedBody, ctx: EventContext
) -> AsyncIterator[EventBody]:
    rendered = evt.rendered_manifest  # 중첩 디코드로 타입 객체
    diff = Diff(
        resource=RESOURCE_REF,
        namespace=Sandbox.NAMESPACE,
        desired_image=rendered.spec.image,
        actual_image=PREVIOUS_IMAGE,
        risk=Sandbox.RISK_TAG,
    )
    yield DesiredDiffBody(diff=diff)


if __name__ == "__main__":
    app.run()

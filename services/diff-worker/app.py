"""diff-worker — manifest.rendered 를 받아 원하는 상태 vs 실제 차이를 낸다.

렌더된 이미지(원하는 것)와 현재 이미지(실제)를 비교해 desired.diff.detected
를 흘린다. 중첩 payload(rendered_manifest)를 타입 객체로 받아 속성 접근한다.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from packages.config.constants import Sandbox
from packages.contracts.event_bus.payloads import (
    DesiredDiffPayload,
    Diff,
    EventPayload,
    ManifestRenderedPayload,
)
from packages.runtime.app import App, EventContext

app = App("diff-worker")

PREVIOUS_IMAGE = "ghcr.io/project/checkout-api:previous"
RESOURCE_REF = "deployment/checkout-api"
SYNC_RISK = "sandbox-only"


@app.sub(ManifestRenderedPayload)
async def on_manifest_rendered(
    evt: ManifestRenderedPayload, ctx: EventContext
) -> AsyncIterator[EventPayload]:
    rendered = evt.rendered_manifest  # 중첩 디코드로 타입 객체
    diff = Diff(
        resource=RESOURCE_REF,
        namespace=Sandbox.NAMESPACE,
        desired_image=rendered.spec.image,
        actual_image=PREVIOUS_IMAGE,
        risk=SYNC_RISK,
    )
    yield DesiredDiffPayload(diff=diff)


if __name__ == "__main__":
    app.run()

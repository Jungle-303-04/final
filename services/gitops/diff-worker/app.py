"""diff-worker — manifest.rendered → desired.diff.detected (원하는 vs 실제).

우현 원본 GitOpsSyncWorkflow.handle()의 diff dict 생성과
DESIRED_DIFF_DETECTED 발행 블록에 대응. 렌더 결과와 현재 상태 비교만
분리해 실제 cluster 조회 로직으로 교체하기 쉽게 유지.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from packages.config.constants import Sandbox
from packages.contracts.event_bus.bodies import (
    Diff,
    DiffDetectedBody,
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
    yield DiffDetectedBody(diff=diff)


if __name__ == "__main__":
    app.run()

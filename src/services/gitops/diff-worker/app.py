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


def load_actual_resource_image(rendered: ManifestRenderedBody) -> str:
    # TODO(gitops): query the target cluster desired/actual state through a read-only adapter.
    # TODO(gitops): compare by resource identity, namespace, kind, and field path, not only image.
    return PREVIOUS_IMAGE


def build_desired_diff(evt: ManifestRenderedBody, actual_image: str) -> Diff:
    rendered = evt.rendered_manifest
    # TODO(gitops): include create/update/delete operation type and machine-readable risk reasons.
    return Diff(
        resource=RESOURCE_REF,
        namespace=Sandbox.NAMESPACE,
        desired_image=rendered.spec.image,
        actual_image=actual_image,
        risk=Sandbox.RISK_TAG,
    )


@app.on(ManifestRenderedBody)
async def on_manifest_rendered(
    evt: ManifestRenderedBody, ctx: EventContext
) -> AsyncIterator[EventBody]:
    # 우현 원본 보존(GitOpsSyncWorkflow.handle 중 diff + desired.diff.detected):
    #
    # diff = {
    #     "resource": RESOURCE_REF,
    #     "namespace": SANDBOX_NAMESPACE,
    #     "desired_image": rendered["spec"]["image"],
    #     "actual_image": PREVIOUS_IMAGE,
    #     "risk": SYNC_RISK,
    # }
    # await self.events.publish(
    #     EventSubject.DESIRED_DIFF_DETECTED,
    #     SERVICE_NAME,
    #     {"diff": diff},
    #     evt["correlation_id"],
    # )
    #
    # 현재 split 구조에서는 rendered manifest body를 받아 Diff 값 객체로 변환하고,
    # subject 발행은 yield DiffDetectedBody(...)로 런타임이 처리한다.
    actual_image = load_actual_resource_image(evt)
    diff = build_desired_diff(evt, actual_image)
    yield DiffDetectedBody(diff=diff)


if __name__ == "__main__":
    app.run()

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
RESOURCE_NOT_INSPECTED = "resource-not-inspected"


def load_actual_resource_image(rendered: ManifestRenderedBody) -> str:
    # TODO(gitops): target cluster desired/actual 상태 읽기 전용 어댑터 조회
    # TODO(gitops): image뿐 아니라 리소스 식별자, namespace, kind, 필드 경로 비교
    return PREVIOUS_IMAGE


def resource_ref(kind: str, name: str) -> str:
    return f"{kind.lower()}/{name}"


def risk_for_namespace(namespace: str) -> str:
    if namespace == Sandbox.NAMESPACE:
        return Sandbox.RISK_TAG
    return Sandbox.UNSAFE_NAMESPACE_RISK_TAG


def build_desired_diff(evt: ManifestRenderedBody, actual_image: str) -> Diff:
    rendered = evt.rendered_manifest
    namespace = rendered.metadata.namespace or Sandbox.NAMESPACE
    # TODO(gitops): create/update/delete 작업 유형과 기계 판독용 위험 사유 포함
    return Diff(
        resource=resource_ref(rendered.kind, rendered.metadata.name),
        namespace=namespace,
        desired_image=rendered.spec.image,
        actual_image=actual_image,
        risk=risk_for_namespace(namespace),
        workspace_id=evt.workspace_id,
        repository_id=evt.repository_id,
        watch_target_id=evt.watch_target_id,
        binding_id=evt.binding_id,
        application_id=evt.application_id,
        workflow_run_id=evt.workflow_run_id,
        environment=evt.environment,
        cluster_id=evt.cluster_id,
        manifest_path=evt.manifest_path,
        resource_class=rendered.resource_class,
        desired_manifest=rendered.manifest,
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
    # 현재 split 구조: rendered manifest body → Diff 값 객체 변환
    # subject 발행은 yield DiffDetectedBody(...)로 런타임 처리
    actual_image = (
        load_actual_resource_image(evt)
        if evt.rendered_manifest.spec.image
        else RESOURCE_NOT_INSPECTED
    )
    diff = build_desired_diff(evt, actual_image)
    yield DiffDetectedBody(diff=diff)


if __name__ == "__main__":
    app.run()

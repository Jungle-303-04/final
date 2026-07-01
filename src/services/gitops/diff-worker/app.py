"""diff-worker — manifest.rendered → desired.diff.detected (원하는 vs 실제).

우현 원본 GitOpsSyncWorkflow.handle()의 diff dict 생성과
DESIRED_DIFF_DETECTED 발행 블록에 대응. 렌더 결과와 현재 상태 비교만
분리해 실제 cluster 조회 로직으로 교체하기 쉽게 유지.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from packages.config.constants import Sandbox
from packages.contracts.event_bus.bodies import (
    Diff,
    DiffDetectedBody,
    EventBody,
    ManifestRenderedBody,
)
from packages.runtime.app import App, EventContext

app = App("diff-worker")

UNKNOWN_ACTUAL_IMAGE = "unknown"
RESOURCE_NOT_INSPECTED = "resource-not-inspected"


async def load_actual_resource_image(evt: ManifestRenderedBody, ctx: EventContext[Any]) -> str:
    try:
        reader = ctx.db.get_actual_resource_image
    except AttributeError:
        return UNKNOWN_ACTUAL_IMAGE
    actual = await reader(
        evt.workspace_id,
        evt.cluster_id,
        evt.rendered_manifest.metadata.namespace or Sandbox.NAMESPACE,
        resource_ref(evt.rendered_manifest.kind, evt.rendered_manifest.metadata.name),
    )
    return str(actual) if actual else UNKNOWN_ACTUAL_IMAGE


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
    # 렌더 결과를 Diff 값 객체로 변환하고 subject 발행은 런타임 yield가 처리한다.
    actual_image = (
        await load_actual_resource_image(evt, ctx)
        if evt.rendered_manifest.spec.image
        else RESOURCE_NOT_INSPECTED
    )
    diff = build_desired_diff(evt, actual_image)
    yield DiffDetectedBody(diff=diff)


if __name__ == "__main__":
    app.run()

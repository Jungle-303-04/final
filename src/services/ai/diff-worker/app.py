"""ai-diff-worker — safe_pr.patch_prepared -> diff.explained + ready."""

from __future__ import annotations

from collections.abc import AsyncIterator, Mapping

from domains.alert.events import AlertRequestedBody
from domains.rca.events import DiffExplainedBody, SafePrPatchPreparedBody
from domains.scm.events import SafePrFilePatch, SafePrReadyForCreationBody
from packages.contracts.event_bus.bodies import EventBody, PipelineContractFailedBody
from packages.contracts.event_bus.bodies.base import EventBodyDecodeError
from packages.runtime.app import App

app = App("ai-diff-worker")


def _decode_patches(evt: SafePrPatchPreparedBody) -> list[SafePrFilePatch]:
    raw_patches = evt.patch.get("patches", [])
    if not isinstance(raw_patches, list):
        raise EventBodyDecodeError("SafePrPatchPreparedBody.patch.patches must be a list")
    patches: list[SafePrFilePatch] = []
    for raw_patch in raw_patches:
        if not isinstance(raw_patch, Mapping):
            raise EventBodyDecodeError("SafePrPatchPreparedBody.patch.patches[] must be an object")
        patches.append(SafePrFilePatch.from_body(raw_patch))
    return patches


def _decode_next_alert(evt: SafePrPatchPreparedBody) -> AlertRequestedBody | None:
    if evt.next_alert is None:
        return None
    return AlertRequestedBody.from_body(evt.next_alert)


def _contract_failed(evt: SafePrPatchPreparedBody, exc: Exception) -> PipelineContractFailedBody:
    evidence_ref = evt.patch.get("evidence_ref")
    return PipelineContractFailedBody(
        contract="safe_pr.patch_prepared",
        reason=str(exc),
        consumer=app.name,
        payload=evt.to_body(),
        workspace_id=evt.workspace_id,
        evidence_ref=evidence_ref if isinstance(evidence_ref, str) else None,
        diagnostics={
            "expected": {
                "patch.patches": "list[SafePrFilePatch]",
                "next_alert": "AlertRequestedBody | null",
            }
        },
    )


@app.on(SafePrPatchPreparedBody)
async def on_safe_pr_patch_prepared(evt: SafePrPatchPreparedBody) -> AsyncIterator[EventBody]:
    try:
        patches = _decode_patches(evt)
        next_alert = _decode_next_alert(evt)
    except EventBodyDecodeError as exc:
        yield _contract_failed(evt, exc)
        return

    explanation = DiffExplainedBody(
        summary=f"{evt.title} 패치 초안의 위험도를 설명합니다.",
        risk="review_required",
        details={
            "provider": evt.provider,
            "patch_keys": sorted(evt.patch.keys()),
            "body_length": len(evt.body),
            "patch_count": len(patches),
        },
        workspace_id=evt.workspace_id,
    )
    yield explanation
    yield SafePrReadyForCreationBody(
        title=evt.title,
        body=evt.body,
        provider=evt.provider,
        diff_summary=explanation.summary,
        diff_risk=explanation.risk,
        diff_details=explanation.details,
        patches=patches,
        workspace_id=evt.workspace_id,
        repository_id=evt.repository_id,
        binding_id=evt.binding_id,
        application_id=evt.application_id,
        workflow_run_id=evt.workflow_run_id,
        environment=evt.environment,
        manifest_path=evt.manifest_path,
        approval_ref=evt.approval_ref,
        policy_decision_ref=evt.policy_decision_ref,
        next_alert=next_alert,
    )


if __name__ == "__main__":
    app.run()

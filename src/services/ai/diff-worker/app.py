"""ai-diff-worker - safe_pr.patch_prepared -> diff.explained."""

from __future__ import annotations

from collections.abc import AsyncIterator

from domains.rca.events import DiffExplainedBody, SafePrPatchPreparedBody
from packages.contracts.event_bus.bodies import EventBody
from packages.runtime.app import App

app = App("ai-diff-worker")


@app.on(SafePrPatchPreparedBody)
async def on_safe_pr_patch_prepared(evt: SafePrPatchPreparedBody) -> AsyncIterator[EventBody]:
    yield DiffExplainedBody(
        summary=f"{evt.title} 패치 초안의 위험도를 설명합니다.",
        risk="review_required",
        details={
            "provider": evt.provider,
            "patch_keys": sorted(evt.patch.keys()),
            "body_length": len(evt.body),
            "approval_ref": evt.approval_ref,
            "policy_decision_ref": evt.policy_decision_ref,
        },
        workspace_id=evt.workspace_id,
    )


if __name__ == "__main__":
    app.run()

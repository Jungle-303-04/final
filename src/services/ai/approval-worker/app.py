"""approval-worker — selection/rollout events -> approval recommendation."""

from __future__ import annotations

from collections.abc import AsyncIterator

from domains.rca.events import (
    ApprovalRecommendedBody,
    RecoveryActionCandidate,
    RecoveryPlan,
    RecoverySelectionRequestedBody,
    RolloutDiagnosedBody,
)
from packages.contracts.event_bus.bodies import EventBody, JsonObject
from packages.contracts.stores import RecoveryPlanStore
from packages.runtime.app import App, EventContext

app = App("approval-worker")


def candidate_summary(candidate: RecoveryActionCandidate | None) -> JsonObject | None:
    if candidate is None:
        return None
    return {
        "action_id": candidate.action_id,
        "title": candidate.title,
        "route": candidate.route,
        "risk_level": candidate.risk_level,
        "blast_radius": candidate.blast_radius,
        "approval_required": candidate.approval_required,
        "rank": candidate.rank,
        "score": candidate.score,
        "action_type": candidate.draft.action_type,
    }


def recommended_candidate(plan: RecoveryPlan) -> RecoveryActionCandidate | None:
    for candidate in plan.candidates:
        if candidate.action_id == plan.recommended_action_id:
            return candidate
    return plan.candidates[0] if plan.candidates else None


def recovery_selection_details(evt: RecoverySelectionRequestedBody) -> JsonObject:
    plan = evt.plan
    recommended = recommended_candidate(plan)
    recommended_summary = candidate_summary(recommended)
    return {
        "plan": plan.to_body(),
        "approval_summary": {
            "kind": "recovery_selection",
            "plan_id": plan.plan_id,
            "incident_id": plan.incident_id,
            "evidence_ref": plan.evidence_ref,
            "target": plan.target,
            "recommended_action_id": plan.recommended_action_id,
            "execution_route": plan.execution_route,
            "selection_required": plan.selection_required,
            "candidate_count": len(plan.candidates),
            "approval_required": bool(
                recommended.approval_required if recommended is not None else True
            ),
            "reason": evt.reason,
            "recommended_candidate": recommended_summary,
        },
        "candidates": [
            summary
            for summary in (candidate_summary(candidate) for candidate in plan.candidates)
            if summary is not None
        ],
    }


def rollout_details(evt: RolloutDiagnosedBody) -> JsonObject:
    return {
        **evt.details,
        "approval_summary": {
            "kind": "rollout_diagnosis",
            "recommendation": evt.next_action,
            "diagnosis": evt.diagnosis,
            "command_id": evt.details.get("command_id"),
            "status": evt.details.get("status"),
            "resource": evt.details.get("resource"),
        },
    }


@app.on(RecoverySelectionRequestedBody)
async def on_recovery_selection_requested(
    evt: RecoverySelectionRequestedBody,
    ctx: EventContext[RecoveryPlanStore],
) -> AsyncIterator[EventBody]:
    if ctx.db is not None:
        await ctx.db.upsert_recovery_selection_request(
            ctx.correlation_id,
            evt.workspace_id,
            evt.plan.to_body(),
        )
    yield ApprovalRecommendedBody(
        recommendation="user_selection_required",
        reason=evt.reason,
        details=recovery_selection_details(evt),
        workspace_id=evt.workspace_id,
    )


@app.on(RolloutDiagnosedBody)
async def on_rollout_diagnosed(evt: RolloutDiagnosedBody) -> AsyncIterator[EventBody]:
    yield ApprovalRecommendedBody(
        recommendation=evt.next_action,
        reason=evt.diagnosis,
        details=rollout_details(evt),
        workspace_id=evt.workspace_id,
    )


if __name__ == "__main__":
    app.run()

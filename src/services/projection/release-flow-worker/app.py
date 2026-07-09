"""release-flow-worker — workflow/agent/RCA events -> release-run read model."""

from __future__ import annotations

from domains.command.events import (
    CommandCompletedBody,
    CommandDispatchedBody,
    CommandQueuedForAgentBody,
    CommandRejectedBody,
    CommandRequestedBody,
)
from domains.gitops.events import (
    ApprovalGrantedBody,
    ApprovalRejectedBody,
    ApprovalRequestedBody,
    WorkflowRunCompletedBody,
    WorkflowRunFailedBody,
    WorkflowRunStartedBody,
    WorkflowStepRecordedBody,
)
from domains.rca.events import (
    ClusterEvidenceReceivedBody,
    EvidenceBuiltBody,
    EvidenceBundleBuiltBody,
    IncidentDetectedBody,
    RcaActionRequiredBody,
    RcaAnalysisBlockedBody,
    RcaCandidatesEvaluatedBody,
    RcaCandidatesPlannedBody,
    RcaCompletedBody,
    RecoveryActionSelectedBody,
    RecoveryPlannedBody,
    RecoverySelectionRequestedBody,
    SafePrPatchPreparedBody,
)
from domains.release_flow.projection import (
    evidence_queued_update,
    release_failure_evidence_request,
    release_workflow_update_from_event,
)
from domains.scm.events import (
    SafePrCreatedBody,
    SafePrFailedBody,
    SafePrReadyForCreationBody,
    SafePrRequestedBody,
)
from domains.target.events import EvidenceJobsQueuedBody, EvidenceJobUpdatedBody
from packages.contracts.event_bus.bodies.base import EventBody
from packages.contracts.event_bus.interfaces import EventEnvelope
from packages.contracts.stores import ReleaseFlowStore
from packages.runtime.app import App, EventContext

app = App("release-flow-worker")


@app.on(CommandCompletedBody)
@app.on(CommandRejectedBody)
@app.on(CommandQueuedForAgentBody)
@app.on(CommandDispatchedBody)
@app.on(CommandRequestedBody)
@app.on(EvidenceJobsQueuedBody)
@app.on(SafePrFailedBody)
@app.on(SafePrCreatedBody)
@app.on(SafePrReadyForCreationBody)
@app.on(SafePrRequestedBody)
@app.on(SafePrPatchPreparedBody)
@app.on(RecoveryActionSelectedBody)
@app.on(RecoverySelectionRequestedBody)
@app.on(RecoveryPlannedBody)
@app.on(RcaActionRequiredBody)
@app.on(RcaAnalysisBlockedBody)
@app.on(RcaCompletedBody)
@app.on(RcaCandidatesEvaluatedBody)
@app.on(RcaCandidatesPlannedBody)
@app.on(EvidenceBundleBuiltBody)
@app.on(IncidentDetectedBody)
@app.on(EvidenceBuiltBody)
@app.on(ClusterEvidenceReceivedBody)
@app.on(EvidenceJobUpdatedBody)
@app.on(WorkflowRunFailedBody)
@app.on(WorkflowRunCompletedBody)
@app.on(ApprovalRejectedBody)
@app.on(ApprovalGrantedBody)
@app.on(ApprovalRequestedBody)
@app.on(WorkflowStepRecordedBody)
@app.on(WorkflowRunStartedBody)
async def on_event(
    evt: EventBody | EventEnvelope,
    ctx: EventContext[ReleaseFlowStore],
) -> EventBody | None:
    envelope = evt if isinstance(evt, EventEnvelope) else envelope_from_body(evt, ctx)
    return await project_event(envelope, ctx)


def envelope_from_body(evt: EventBody, ctx: EventContext[ReleaseFlowStore]) -> EventEnvelope:
    return EventEnvelope(
        event_id=ctx.event_id,
        subject=ctx.subject,
        source=ctx.source,
        correlation_id=ctx.correlation_id,
        causation_id=ctx.causation_id,
        created_at=ctx.created_at,
        payload=evt.to_body(),
    )


async def project_event(
    evt: EventEnvelope,
    ctx: EventContext[ReleaseFlowStore],
) -> EventBody | None:
    update = release_workflow_update_from_event(evt)
    if update is None:
        return None
    projected = await ctx.db.project_release_workflow_event(update)
    evidence_request = release_failure_evidence_request(update, projected)
    if projected is None or evidence_request is None:
        return None
    queued = await ctx.db.queue_evidence_jobs(**evidence_request)
    if queued:
        await ctx.db.project_release_workflow_event(evidence_queued_update(update, queued))
        return evidence_jobs_queued_body(evidence_request, queued)
    return None


def evidence_jobs_queued_body(
    evidence_request: dict[str, object],
    queued: dict[str, object],
) -> EvidenceJobsQueuedBody:
    release_context = evidence_request.get("release_context")
    return EvidenceJobsQueuedBody(
        workspace_id=str(evidence_request.get("workspace_id") or ""),
        cluster_id=str(evidence_request.get("cluster_id") or ""),
        evidence_key=str(queued.get("evidence_key") or ""),
        source_id=str(evidence_request.get("source_id") or ""),
        window_start=str(evidence_request.get("window_start") or ""),
        provider_keys=[
            str(provider_key) for provider_key in list(evidence_request.get("provider_keys") or [])
        ],
        queued=int(queued.get("queued") or 0),
        job_ids=[str(job_id) for job_id in list(queued.get("job_ids") or [])],
        workflow_run_id=str(evidence_request.get("window_start") or "") or None,
        release_context=dict(release_context) if isinstance(release_context, dict) else {},
    )


if __name__ == "__main__":
    app.run()

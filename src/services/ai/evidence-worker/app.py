"""evidence-worker — cluster.evidence.received -> evidence.built."""

from __future__ import annotations

from collections.abc import AsyncIterator

from domains.gitops.events import GitOpsChangeContextDetectedBody
from domains.rca.events import (
    ClusterEvidenceReceivedBody,
    compact_evidence_built_body,
)
from packages.contracts.event_bus.bodies import EventBody
from packages.contracts.stores import RcaStore
from packages.runtime.app import App, EventContext
from services.ai.agent.pipeline import EvidencePipeline

app = App("evidence-worker")
pipeline = EvidencePipeline()
GITOPS_CHANGE_CONTEXT_EVIDENCE_KIND = "gitops_change_context"


@app.on(ClusterEvidenceReceivedBody)
async def on_cluster_evidence(
    evt: ClusterEvidenceReceivedBody,
    ctx: EventContext[RcaStore],
) -> AsyncIterator[EventBody]:
    evt = await hydrate_evidence(evt, ctx)
    evidence = pipeline.build_evidence(evt, ctx.correlation_id)
    await ctx.db.save_evidence(
        ctx.correlation_id,
        evidence.workspace_id,
        pipeline.kind,
        evidence.to_body(),
    )
    yield compact_evidence_built_body(evidence, ctx.correlation_id, pipeline.kind)


@app.on(GitOpsChangeContextDetectedBody)
async def on_gitops_change_context(
    evt: GitOpsChangeContextDetectedBody,
    ctx: EventContext[RcaStore],
) -> None:
    await ctx.db.save_evidence(
        ctx.correlation_id,
        evt.workspace_id,
        GITOPS_CHANGE_CONTEXT_EVIDENCE_KIND,
        evt.to_body(),
    )


async def hydrate_evidence(
    evt: ClusterEvidenceReceivedBody,
    ctx: EventContext[RcaStore],
) -> ClusterEvidenceReceivedBody:
    """reference 이벤트면 evidence_windows.payload의 원문으로 복원한다."""
    if has_inline_evidence(evt) or not evt.evidence_key:
        return evt
    payload = await ctx.db.get_evidence_window_payload(evt.evidence_key)
    if not isinstance(payload, dict):
        return evt
    return ClusterEvidenceReceivedBody.from_body(payload)  # type: ignore[return-value]


def has_inline_evidence(evt: ClusterEvidenceReceivedBody) -> bool:
    return bool(evt.kubernetes or evt.metrics or evt.logs or evt.traces)


if __name__ == "__main__":
    app.run()

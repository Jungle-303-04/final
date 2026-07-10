"""rca-worker — rca.candidates.evaluated -> rca.completed."""

from __future__ import annotations

from collections.abc import AsyncIterator

from domains.rca.events import RcaCandidatesEvaluatedBody, RcaCompletedBody
from domains.rca.repository import rca_report_resource_key
from packages.contracts.event_bus.bodies import EventBody
from packages.contracts.stores import RcaStore
from packages.runtime.app import App, EventContext
from services.ai.agent.defaults import EvidenceDefaults
from services.ai.agent.pipeline import RcaCompletionPipeline

app = App("rca-worker")
pipeline = RcaCompletionPipeline()

# 리포트 dedup 창(초) — 장애가 지속되면 evidence 주기(~10s)마다 동일한 rca.completed 가
# 반복되는데, 같은 (workspace, root_cause, 리소스) 리포트는 이 창 안에서 1건만 저장한다.
# 장애가 계속되면 창이 지날 때마다 1건씩 다시 남아 지속 여부는 추적 가능하다.
RCA_REPORT_DEDUP_WINDOW_SECONDS = 300
RCA_EVIDENCE_KIND = EvidenceDefaults().kind


@app.on(RcaCandidatesEvaluatedBody)
async def on_candidates_evaluated(
    evt: RcaCandidatesEvaluatedBody,
    ctx: EventContext[RcaStore],
) -> AsyncIterator[EventBody]:
    result = pipeline.complete_body(evt)
    if isinstance(result, RcaCompletedBody):
        duplicate = None
        if not await has_rca_test_metadata(result, ctx):
            duplicate = await ctx.db.find_recent_rca_report(
                result.workspace_id,
                result.root_cause,
                rca_report_resource_key(result.incident.to_body() if result.incident else None),
                RCA_REPORT_DEDUP_WINDOW_SECONDS,
            )
        if duplicate is None:
            await ctx.db.save_rca_report(
                ctx.correlation_id,
                result.workspace_id,
                result.root_cause,
                result.action,
                result.to_body(),
            )
    yield result


async def has_rca_test_metadata(
    result: RcaCompletedBody,
    ctx: EventContext[RcaStore],
) -> bool:
    if result.evidence is not None and isinstance(result.evidence.metadata.get("rca_test"), dict):
        return True
    payload = await ctx.db.get_evidence_payload(
        result.workspace_id,
        ctx.correlation_id,
        RCA_EVIDENCE_KIND,
    )
    metadata = payload.get("metadata") if isinstance(payload, dict) else None
    return isinstance(metadata, dict) and isinstance(metadata.get("rca_test"), dict)


if __name__ == "__main__":
    app.run()

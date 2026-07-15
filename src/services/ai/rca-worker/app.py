"""rca-worker — rca.candidates.evaluated -> rca.completed."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from domains.rca.events import RcaCandidatesEvaluatedBody, RcaCompletedBody
from domains.rca.report_narrative import (
    RCA_NARRATIVE_GENERATED,
    RCA_NARRATIVE_PAYLOAD_KEY,
    RCA_NARRATIVE_STATUS_KEY,
    RCA_NARRATIVE_UNAVAILABLE,
)
from domains.rca.repository import rca_report_resource_key
from packages.ai.llm import PROVIDER_UNCONFIGURED, build_llm_client, describe_llm_client
from packages.ai.metrics import metered_llm_client
from packages.config.logs import CONTEXT_KEY, get_logger
from packages.config.settings import env
from packages.contracts.event_bus.bodies import EventBody
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.stores import RcaStore
from packages.runtime.app import App, EventContext
from services.ai.agent.defaults import EvidenceDefaults
from services.ai.agent.pipeline import RcaCompletionPipeline
from services.ai.agent.pipeline.rca_narrative import RcaNarrativeWriter

app = App("rca-worker")
pipeline = RcaCompletionPipeline()
llm_client = build_llm_client()
narrative_writer = RcaNarrativeWriter()
LOGGER = get_logger(__name__)

# 리포트 dedup 창(초) — 장애가 지속되면 evidence 주기(~10s)마다 동일한 rca.completed 가
# 반복되는데, 같은 (workspace, root_cause, 리소스) 리포트는 이 창 안에서 1건만 저장한다.
# 장애가 계속되면 창이 지날 때마다 1건씩 다시 남아 지속 여부는 추적 가능하다.
RCA_REPORT_DEDUP_WINDOW_SECONDS = 300
RCA_EVIDENCE_KIND = EvidenceDefaults().kind
RCA_NARRATIVE_TIMEOUT_SECONDS_ENV = "RCA_NARRATIVE_TIMEOUT_SECONDS"
RCA_NARRATIVE_TIMEOUT_SECONDS = float(env(RCA_NARRATIVE_TIMEOUT_SECONDS_ENV, "15"))


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
            report_body = await enriched_report_body(result, ctx)
            await ctx.db.save_rca_report(
                ctx.correlation_id,
                result.workspace_id,
                result.root_cause,
                result.action,
                report_body,
            )
    yield result


async def enriched_report_body(
    result: RcaCompletedBody,
    ctx: EventContext[RcaStore],
) -> JsonObject:
    """Best-effort narrative enrichment; deterministic RCA persistence always wins."""
    body = result.to_body()
    body[RCA_NARRATIVE_STATUS_KEY] = RCA_NARRATIVE_UNAVAILABLE
    try:
        if describe_llm_client(llm_client).get("provider") == PROVIDER_UNCONFIGURED:
            return body
        async with asyncio.timeout(RCA_NARRATIVE_TIMEOUT_SECONDS):
            narrative = await narrative_writer.write(
                result,
                metered_llm_client(
                    llm_client,
                    ctx.db,
                    workspace_id=result.workspace_id,
                    event_id=ctx.event_id,
                    correlation_id=ctx.correlation_id,
                    causation_id=ctx.causation_id,
                ),
            )
    except Exception as exc:
        # Never persist provider errors or model output.  The public status exposes
        # the backend gap without leaking credentials, endpoints, or prompt data.
        LOGGER.warning(
            "rca_narrative_llm_unavailable",
            extra={
                CONTEXT_KEY: {
                    "exception_type": type(exc).__name__,
                    "incident_id": result.incident.incident_id if result.incident else None,
                }
            },
        )
        return body
    body[RCA_NARRATIVE_PAYLOAD_KEY] = narrative
    body[RCA_NARRATIVE_STATUS_KEY] = RCA_NARRATIVE_GENERATED
    return body


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

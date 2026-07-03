"""evidence-worker — cluster.evidence.received -> evidence.built."""

from __future__ import annotations

from collections.abc import AsyncIterator

from packages.contracts.event_bus.bodies import (
    ClusterEvidenceReceivedBody,
    EventBody,
    EvidenceBuiltBody,
)
from packages.contracts.stores import RcaStore
from packages.runtime.app import App, EventContext
from services.ai.agent.pipeline import EvidencePipeline

app = App("evidence-worker")
pipeline = EvidencePipeline()


@app.on(ClusterEvidenceReceivedBody)
async def on_cluster_evidence(
    evt: ClusterEvidenceReceivedBody,
    ctx: EventContext[RcaStore],
) -> AsyncIterator[EventBody]:
    evidence = pipeline.build_evidence(evt, ctx.correlation_id)
    await ctx.db.save_evidence(
        ctx.correlation_id,
        evidence.workspace_id,
        pipeline.kind,
        evidence.to_body(),
    )
    yield EvidenceBuiltBody(evidence=evidence)


if __name__ == "__main__":
    app.run()

"""rca-worker — rca.candidates.evaluated -> rca.completed."""

from __future__ import annotations

from collections.abc import AsyncIterator

from packages.contracts.event_bus.bodies import (
    EventBody,
    RcaCandidatesEvaluatedBody,
    RcaCompletedBody,
)
from packages.contracts.stores import RcaStore
from packages.runtime.app import App, EventContext
from services.ai.agent.pipeline import RcaCompletionPipeline

app = App("rca-worker")
pipeline = RcaCompletionPipeline()


@app.on(RcaCandidatesEvaluatedBody)
async def on_candidates_evaluated(
    evt: RcaCandidatesEvaluatedBody,
    ctx: EventContext[RcaStore],
) -> AsyncIterator[EventBody]:
    result = pipeline.complete_body(evt)
    if isinstance(result, RcaCompletedBody):
        await ctx.db.save_rca_report(
            ctx.correlation_id,
            result.workspace_id,
            result.root_cause,
            result.action,
            result.to_body(),
        )
    yield result


if __name__ == "__main__":
    app.run()

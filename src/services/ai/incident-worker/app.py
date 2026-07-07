"""incident-worker — evidence.built -> incident.detected -> evidence.bundle.built."""

from __future__ import annotations

from collections.abc import AsyncIterator

from domains.rca.events import EvidenceBuiltBody
from packages.contracts.event_bus.bodies import EventBody
from packages.runtime.app import App, EventContext
from services.ai.agent.pipeline import IncidentPipeline

app = App("incident-worker")
pipeline = IncidentPipeline()


@app.on(EvidenceBuiltBody)
async def on_evidence_built(
    evt: EvidenceBuiltBody,
    ctx: EventContext[object],
) -> AsyncIterator[EventBody]:
    bodies = pipeline.build_bodies(evt.evidence, ctx.correlation_id)
    yield bodies.detected_body
    if not bodies.detected_body.detected:
        return
    yield bodies.next_body


if __name__ == "__main__":
    app.run()

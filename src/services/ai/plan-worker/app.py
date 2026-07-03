"""plan-worker — evidence.bundle.built -> rca.candidates.planned."""

from __future__ import annotations

from collections.abc import AsyncIterator

from packages.contracts.event_bus.bodies import EventBody, EvidenceBundleBuiltBody
from packages.runtime.app import App
from services.ai.agent.pipeline import CausePlanningPipeline

app = App("plan-worker")
pipeline = CausePlanningPipeline()


@app.on(EvidenceBundleBuiltBody)
async def on_evidence_bundle_built(
    evt: EvidenceBundleBuiltBody,
) -> AsyncIterator[EventBody]:
    for body in pipeline.plan_bodies(evt):
        yield body


if __name__ == "__main__":
    app.run()

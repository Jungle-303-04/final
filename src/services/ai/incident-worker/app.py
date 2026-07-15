"""incident-worker — evidence.built -> incident.detected -> evidence.bundle.built."""

from __future__ import annotations

from collections.abc import AsyncIterator

from domains.rca.events import Evidence, EvidenceBuiltBody
from packages.contracts.event_bus.bodies import EventBody
from packages.contracts.stores import RcaStore
from packages.runtime.app import App, EventContext
from services.ai.agent.defaults import EvidenceDefaults
from services.ai.agent.pipeline import IncidentPipeline
from services.ai.agent.pipeline.incident_signal import incident_termination_identity

app = App("incident-worker")
pipeline = IncidentPipeline()
defaults = EvidenceDefaults()


@app.on(EvidenceBuiltBody)
async def on_evidence_built(
    evt: EvidenceBuiltBody,
    ctx: EventContext[RcaStore],
) -> AsyncIterator[EventBody]:
    evt = await hydrate_evidence_built(evt, ctx)
    bodies = pipeline.build_bodies(evt.evidence, ctx.correlation_id)
    if not bodies.detected_body.detected:
        yield bodies.detected_body
        return
    incident = bodies.detected_body.incident
    if incident is not None:
        identity = incident_termination_identity(evt.evidence, incident)
        if identity is not None:
            claimed = await ctx.db.claim_incident_signal(
                evt.evidence.workspace_id,
                evt.evidence.cluster_id,
                identity.signal_key,
                ctx.correlation_id,
                identity.payload,
            )
            if not claimed:
                return
    yield bodies.detected_body
    yield bodies.next_body


async def hydrate_evidence_built(
    evt: EvidenceBuiltBody,
    ctx: EventContext[RcaStore],
) -> EvidenceBuiltBody:
    """reference evidence.built 이벤트면 저장된 Evidence 원문을 복원한다."""
    if has_inline_evidence(evt.evidence):
        return evt
    correlation_id = evt.correlation_id or ctx.correlation_id
    kind = evt.kind or defaults.kind
    payload = await ctx.db.get_evidence_payload(evt.evidence.workspace_id, correlation_id, kind)
    if not isinstance(payload, dict):
        return evt
    evidence = Evidence.from_body(payload)  # type: ignore[assignment]
    if not isinstance(evidence, Evidence):
        return evt
    return EvidenceBuiltBody(
        evidence=evidence,
        correlation_id=correlation_id,
        kind=kind,
        payload_size=evt.payload_size,
        summary=evt.summary,
    )


def has_inline_evidence(evidence: Evidence) -> bool:
    return bool(evidence.kubernetes or evidence.metrics or evidence.logs or evidence.traces)


if __name__ == "__main__":
    app.run()

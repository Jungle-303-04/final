"""rca-fallback-worker — AI fallback 미구성 시 사람 조치 이벤트로 수렴."""

from __future__ import annotations

from collections.abc import AsyncIterator

from domains.rca.events import RcaActionRequiredBody, RcaAiFallbackRequestedBody
from packages.config.logs import get_logger
from packages.contracts.event_bus.bodies import EventBody
from packages.runtime.app import App

app = App("rca-fallback-worker")
LOGGER = get_logger(__name__)


@app.on(RcaAiFallbackRequestedBody)
async def on_ai_fallback_requested(evt: RcaAiFallbackRequestedBody) -> AsyncIterator[EventBody]:
    LOGGER.info(
        "rca ai fallback requested",
        extra={
            "context": {
                "reason": evt.reason,
                "evidence_ref": evt.evidence_ref,
                "missing_evidence": evt.missing_evidence,
            }
        },
    )
    yield RcaActionRequiredBody(
        reason=f"AI fallback required: {evt.reason}",
        evidence_ref=evt.evidence_ref,
        workspace_id=evt.workspace_id,
    )


if __name__ == "__main__":
    app.run()

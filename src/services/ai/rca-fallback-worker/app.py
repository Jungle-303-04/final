"""rca-fallback-worker — rca.ai_fallback.requested 소비 스텁.

rule 미매칭 incident 의 AI fallback 분석 요청을 받아 기록만 함(말단 소비자).
"""

from __future__ import annotations

from domains.rca.events import RcaAiFallbackRequestedBody
from packages.config.logs import get_logger
from packages.runtime.app import App

app = App("rca-fallback-worker")
LOGGER = get_logger(__name__)


@app.on(RcaAiFallbackRequestedBody)
async def on_ai_fallback_requested(evt: RcaAiFallbackRequestedBody) -> None:
    # TODO: AI fallback 분석 파이프라인 연결
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


if __name__ == "__main__":
    app.run()

"""diff-analyze-worker — desired.diff.detected 를 받아 위험도를 분석한다.

diff 가 sandbox 한정이면 안전(safe)으로 판정하고 diff.analyzed 를 흘린다.
실제로는 여기서 변경 영향/정책/블라스트반경 등을 분석한다.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from packages.contracts.event_bus.payloads import (
    DesiredDiffPayload,
    DiffAnalyzedPayload,
    EventPayload,
)
from packages.runtime.app import App, EventContext

app = App("diff-analyze-worker")

SAFE_RISK = "sandbox-only"
SAFE_REASON = "sandbox 한정 변경이라 안전"
UNSAFE_REASON = "프로덕션 영향 가능 — 검토 필요"


@app.sub(DesiredDiffPayload)
async def on_desired_diff(
    evt: DesiredDiffPayload, ctx: EventContext
) -> AsyncIterator[EventPayload]:
    diff = evt.diff  # 중첩 디코드로 타입 객체
    safe = diff.risk == SAFE_RISK
    yield DiffAnalyzedPayload(
        diff=diff,
        safe=safe,
        risk=diff.risk,
        reason=SAFE_REASON if safe else UNSAFE_REASON,
    )


if __name__ == "__main__":
    app.run()

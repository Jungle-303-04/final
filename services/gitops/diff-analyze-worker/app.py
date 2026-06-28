"""diff-analyze-worker — desired.diff.detected 를 받아 위험도를 분석한다.

diff 가 sandbox 한정이면 안전(safe)으로 보고 diff.analyzed 를 흘린다.
안전하면 PR 생성을 repo-gateway 에 위임(safe_pr.requested)한다.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from packages.config.constants import GitHub
from packages.contracts.event_bus.payloads import (
    DesiredDiffPayload,
    DiffAnalyzedPayload,
    EventPayload,
    SafePrRequestedPayload,
)
from packages.runtime.app import App, EventContext

app = App("diff-analyze-worker")

SAFE_RISK = "sandbox-only"
SAFE_REASON = "sandbox 한정 변경이라 안전"
UNSAFE_REASON = "프로덕션 영향 가능 — 검토 필요"
PR_TITLE = "Apply sandbox manifest"


@app.sub(DesiredDiffPayload)
async def on_desired_diff(
    evt: DesiredDiffPayload, ctx: EventContext
) -> AsyncIterator[EventPayload]:
    diff = evt.diff
    safe = diff.risk == SAFE_RISK
    reason = SAFE_REASON if safe else UNSAFE_REASON
    yield DiffAnalyzedPayload(
        diff=diff, safe=safe, risk=diff.risk, reason=reason
    )
    if safe:
        yield SafePrRequestedPayload(
            title=PR_TITLE,
            body=f"{diff.resource}: {diff.actual_image} → {diff.desired_image}",
            provider=GitHub.PROVIDER,
        )


if __name__ == "__main__":
    app.run()

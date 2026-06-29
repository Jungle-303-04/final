"""diff-analyze-worker — desired.diff.detected → 위험도 분석 → diff.analyzed.

우현 원본 GitOpsSyncWorkflow.handle()의 COMMAND_REQUESTED 직접 발행 블록을
대체. 지금 구조는 diff를 바로 실행 명령으로 보내지 않고 안전 판정 후
safe_pr.requested로 넘겨 repo-gateway가 PR 생성을 맡게 분리.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from packages.config.constants import GitHub, Sandbox
from packages.contracts.event_bus.bodies import (
    DiffAnalyzedBody,
    DiffDetectedBody,
    EventBody,
    SafePrRequestedBody,
)
from packages.runtime.app import App, EventContext

app = App("diff-analyze-worker")

SAFE_REASON = "sandbox 한정 변경이라 안전"
UNSAFE_REASON = "프로덕션 영향 가능 — 검토 필요"
PR_TITLE = "Apply sandbox manifest"


@app.on(DiffDetectedBody)
async def on_desired_diff(evt: DiffDetectedBody, ctx: EventContext) -> AsyncIterator[EventBody]:
    diff = evt.diff
    safe = diff.risk == Sandbox.RISK_TAG
    reason = SAFE_REASON if safe else UNSAFE_REASON
    yield DiffAnalyzedBody(diff=diff, safe=safe, risk=diff.risk, reason=reason)
    if safe:
        # 우현 원본 보존(GitOpsSyncWorkflow.handle 중 command.requested 직접 발행):
        #
        # await self.events.publish(
        #     EventSubject.COMMAND_REQUESTED,
        #     SERVICE_NAME,
        #     {
        #         "cluster_id": env(TARGET_CLUSTER_ENV, DEFAULT_TARGET_CLUSTER_ID),
        #         "action": SYNC_ACTION,
        #         "namespace": SANDBOX_NAMESPACE,
        #         "reason": SYNC_REASON,
        #         "diff": diff,
        #     },
        #     evt["correlation_id"],
        # )
        #
        # 현재 split 구조에서는 diff를 바로 실행 command로 보내지 않고,
        # 안전 판정 후 safe_pr.requested를 발행한다.
        yield SafePrRequestedBody(
            title=PR_TITLE,
            body=f"{diff.resource}: {diff.actual_image} → {diff.desired_image}",
            provider=GitHub.PROVIDER,
        )


if __name__ == "__main__":
    app.run()

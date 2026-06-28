"""repo-gateway-worker — safe_pr.requested → GitHub PR → safe_pr.created.

우현 원본에는 없던 새 outbound 경계. 원본은 diff 후 command를 직접
요청했지만, 현 구조는 안전한 GitOps 복구를 위해 PR 생성 책임을 이
게이트웨이로 중앙화.
"""

from __future__ import annotations

import time
from collections.abc import AsyncIterator

from packages.contracts.event_bus.bodies import (
    EventBody,
    SafePrCreatedBody,
    SafePrFailedBody,
    SafePrRequestedBody,
)
from packages.contracts.stores import PullRequestStore
from packages.runtime.app import App, EventContext
from packages.runtime.outbound import deliver

app = App("repo-gateway-worker")

PR_URL_PREFIX = "https://github.example.local/project/repo/pull"
PR_MODE = "fake_github_api_call"
PR_STATUS_CREATED = "created"
PR_NUMBER_MODULO = 100000
MISSING_GITHUB_TOKEN_REF = "missing-github-oauth-fallback"


@app.sub(SafePrRequestedBody)
async def on_safe_pr_requested(
    evt: SafePrRequestedBody, ctx: EventContext[PullRequestStore]
) -> AsyncIterator[EventBody]:
    # outbound 게이트웨이 정형: 외부 호출(PR 생성)의 try/except 는 deliver 가 흡수하고,
    # 핸들러는 "무엇을 호출하고 성공/실패를 어떤 이벤트로 낼지"만 선언(타 게이트웨이와 동일 모양).
    async def create_pr() -> tuple[str, str]:
        pr_url = f"{PR_URL_PREFIX}/{int(time.time()) % PR_NUMBER_MODULO}"
        token_ref = await ctx.db.latest_github_token_ref() or MISSING_GITHUB_TOKEN_REF
        await ctx.db.save_pull_request(
            ctx.correlation_id, pr_url, evt.title, evt.body, PR_STATUS_CREATED
        )
        return pr_url, token_ref

    def created(result: tuple[str, str]) -> SafePrCreatedBody:
        pr_url, token_ref = result
        return SafePrCreatedBody(
            pr_url=pr_url, provider=evt.provider, token_ref=token_ref, mode=PR_MODE
        )

    async for out in deliver(
        call=create_pr,
        ok=created,
        fail=lambda exc: SafePrFailedBody(provider=evt.provider, title=evt.title, reason=str(exc)),
    ):
        yield out


if __name__ == "__main__":
    app.run()

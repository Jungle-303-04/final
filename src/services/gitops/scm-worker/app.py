"""scm-worker — safe_pr.requested → GitHub PR → safe_pr.created.

우현 원본에는 없던 새 outbound 경계. 원본은 diff 후 command를 직접
요청했지만, 현 구조는 안전한 GitOps 복구를 위해 PR 생성 책임을 이
게이트웨이로 중앙화.
"""

from __future__ import annotations

import time
from collections.abc import AsyncIterator

from packages.config.settings import env
from packages.contracts.event_bus.bodies import (
    EventBody,
    SafePrCreatedBody,
    SafePrFailedBody,
    SafePrRequestedBody,
)
from packages.contracts.stores import PullRequestStore
from packages.runtime.app import App, EventContext
from packages.runtime.outbound import deliver

app = App("scm-worker")

SCM_PR_URL_PREFIX_ENV = "SCM_PR_URL_PREFIX"
PR_MODE = "stub_pr_adapter"
PR_STATUS_CREATED = "created"
PR_NUMBER_MODULO = 100000
MISSING_PR_ADAPTER_MESSAGE = "github pr adapter not configured"
SAFE_PR_CREATION_FAILED_MESSAGE = "safe pr creation failed"


def resolve_pr_url_prefix() -> str:
    # TODO(scm): replace the stub URL prefix with the real GitHub App adapter response URL.
    prefix = env(SCM_PR_URL_PREFIX_ENV, "").rstrip("/")
    if not prefix:
        raise RuntimeError(MISSING_PR_ADAPTER_MESSAGE)
    return prefix


async def create_safe_pr(evt: SafePrRequestedBody, ctx: EventContext[PullRequestStore]) -> str:
    # TODO(scm): create branch, commit patch, open PR, and persist provider response atomically.
    # TODO(scm): enforce repo allowlist, branch naming, and rollback metadata before write.
    pr_url = f"{resolve_pr_url_prefix()}/{int(time.time()) % PR_NUMBER_MODULO}"
    await ctx.db.save_pull_request(
        ctx.correlation_id, pr_url, evt.title, evt.body, PR_STATUS_CREATED
    )
    return pr_url


def safe_pr_failure_reason(exc: Exception) -> str:
    return SAFE_PR_CREATION_FAILED_MESSAGE


@app.on(SafePrRequestedBody)
async def on_safe_pr_requested(
    evt: SafePrRequestedBody, ctx: EventContext[PullRequestStore]
) -> AsyncIterator[EventBody]:
    # 우현 원본 보존:
    #
    # 원본 GitOpsSyncWorkflow.handle에는 repo-gateway 단계가 없었다.
    # 원본은 desired.diff.detected 뒤에 command.requested를 직접 발행했다.
    # 이 파일은 그 직접 실행 흐름을 보존 가능한 PR 제안 경계로 바꾸기 위해
    # 새로 생긴 split worker다. 원본 command.requested 블록은
    # diff-analyze-worker의 safe 분기 주석으로 남겨 두었다.
    #
    # outbound 게이트웨이 정형: 외부 호출(PR 생성)의 try/except 는 deliver 가 흡수하고,
    # 핸들러는 "무엇을 호출하고 성공/실패를 어떤 이벤트로 낼지"만 선언(타 게이트웨이와 동일 모양).
    async def create_pr() -> str:
        return await create_safe_pr(evt, ctx)

    def created(pr_url: str) -> SafePrCreatedBody:
        return SafePrCreatedBody(pr_url=pr_url, provider=evt.provider, mode=PR_MODE)

    async for out in deliver(
        call=create_pr,
        ok=created,
        fail=lambda exc: SafePrFailedBody(
            provider=evt.provider, title=evt.title, reason=safe_pr_failure_reason(exc)
        ),
    ):
        yield out


if __name__ == "__main__":
    app.run()

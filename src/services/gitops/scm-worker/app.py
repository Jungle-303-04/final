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
    # TODO(scm): stub URL prefix를 실제 GitHub App adapter response URL로 교체
    prefix = env(SCM_PR_URL_PREFIX_ENV, "").rstrip("/")
    if not prefix:
        raise RuntimeError(MISSING_PR_ADAPTER_MESSAGE)
    return prefix


async def create_safe_pr(evt: SafePrRequestedBody, ctx: EventContext[PullRequestStore]) -> str:
    # TODO(scm): branch 생성, patch commit, PR 생성, provider response 원자 저장
    # TODO(scm): write 전 repo allowlist, branch naming, rollback metadata 검증
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
    # repo-gateway는 외부 PR 생성 경계다. 핸들러는 호출과 결과 이벤트만 선언하고
    # provider 예외 처리는 deliver가 공통으로 맡는다.
    async def create_pr() -> str:
        return await create_safe_pr(evt, ctx)

    def created(pr_url: str) -> SafePrCreatedBody:
        return SafePrCreatedBody(
            pr_url=pr_url,
            provider=evt.provider,
            mode=PR_MODE,
            workspace_id=evt.workspace_id,
            repository_id=evt.repository_id,
            binding_id=evt.binding_id,
            application_id=evt.application_id,
            workflow_run_id=evt.workflow_run_id,
            environment=evt.environment,
        )

    async for out in deliver(
        call=create_pr,
        ok=created,
        fail=lambda exc: SafePrFailedBody(
            provider=evt.provider,
            title=evt.title,
            reason=safe_pr_failure_reason(exc),
            workspace_id=evt.workspace_id,
            repository_id=evt.repository_id,
            binding_id=evt.binding_id,
            application_id=evt.application_id,
            workflow_run_id=evt.workflow_run_id,
            environment=evt.environment,
        ),
    ):
        yield out


if __name__ == "__main__":
    app.run()

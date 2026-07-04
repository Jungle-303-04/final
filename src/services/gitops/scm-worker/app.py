"""scm-worker — safe_pr.requested → GitHub PR → safe_pr.created.

우현 원본에는 없던 새 outbound 경계. 원본은 diff 후 command를 직접
요청했지만, 현 구조는 안전한 GitOps 복구를 위해 PR 생성 책임을 이
게이트웨이로 중앙화. PR 생성 성공 뒤에만 후속 alert/apply 흐름을 연다.
"""

from __future__ import annotations

import time
from collections.abc import AsyncIterator

from domains.scm.events import SafePrCreatedBody, SafePrFailedBody, SafePrRequestedBody
from packages.config.settings import env
from packages.contracts.event_bus.bodies import EventBody
from packages.contracts.scm.provider import ScmProvider
from packages.contracts.stores import PullRequestStore
from packages.runtime.app import App, EventContext
from packages.runtime.outbound import deliver

app = App("scm-worker")

SCM_PR_URL_PREFIX_ENV = "SCM_PR_URL_PREFIX"
PR_MODE = "stub_pr_adapter"
PR_STATUS_CREATED = "created"
PR_NUMBER_MODULO_ENV = "PR_NUMBER_MODULO"  # 스텁 PR 번호 합성용 모듈로(기본 100000)
PR_NUMBER_MODULO = int(env(PR_NUMBER_MODULO_ENV, "100000"))
MISSING_PR_ADAPTER_MESSAGE = (
    f"{SCM_PR_URL_PREFIX_ENV} 미설정 — PR 어댑터 없이 기동하면 자동 승인 배포(safe PR)가 "
    "런타임에 전부 실패함. deploy env 에 PR URL prefix 설정 필요"
)
SAFE_PR_CREATION_FAILED_MESSAGE = "safe pr creation failed"


def validate_pr_url_prefix(raw: str) -> str:
    """PR URL prefix 검증(순수 함수) — 비어 있으면 명확한 한국어 메시지로 실패함."""
    prefix = raw.strip().rstrip("/")
    if not prefix:
        raise RuntimeError(MISSING_PR_ADAPTER_MESSAGE)
    return prefix


def resolve_pr_url_prefix() -> str:
    # TODO(scm): stub URL prefix를 실제 GitHub App adapter response URL로 교체
    return validate_pr_url_prefix(env(SCM_PR_URL_PREFIX_ENV, ""))


class StubScmProvider:
    """ScmProvider 구현 — 실제 SCM 호출 없이 PR URL 을 합성하는 스텁."""

    async def create_pull_request(
        self, request: SafePrRequestedBody, ctx: EventContext[PullRequestStore]
    ) -> str:
        # TODO(scm): branch 생성, patch commit, PR 생성, provider response 원자 저장
        # TODO(scm): write 전 repo allowlist, branch naming, rollback metadata 검증
        pr_url = f"{resolve_pr_url_prefix()}/{int(time.time()) % PR_NUMBER_MODULO}"
        await ctx.db.save_pull_request(
            ctx.correlation_id, pr_url, request.title, request.body, PR_STATUS_CREATED
        )
        return pr_url


# PR 생성 전략 주입 지점 — 지금은 스텁 provider 하나만 씀.
SCM_PROVIDER: ScmProvider = StubScmProvider()


async def create_safe_pr(evt: SafePrRequestedBody, ctx: EventContext[PullRequestStore]) -> str:
    """기존 호출자 호환용 — SCM 전략 인스턴스로 위임함."""
    return await SCM_PROVIDER.create_pull_request(evt, ctx)


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

    def created_body(pr_url: str) -> SafePrCreatedBody:
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
        ok=created_body,
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
        if isinstance(out, SafePrCreatedBody) and evt.next_alert is not None:
            yield evt.next_alert


if __name__ == "__main__":
    # 부팅 fail-fast — 설정 없이 떠서 이벤트마다 실패하는 대신 기동 시점에 즉시 종료함
    resolve_pr_url_prefix()
    app.run()

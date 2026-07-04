"""scm-worker — safe_pr.requested → GitHub PR → safe_pr.created.

우현 원본에는 없던 새 outbound 경계. 원본은 diff 후 command를 직접
요청했지만, 현 구조는 안전한 GitOps 복구를 위해 PR 생성 책임을 이
게이트웨이로 중앙화. PR 생성 성공 뒤에만 후속 alert/apply 흐름을 연다.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from github_provider import GithubScmProvider

from domains.scm.events import SafePrCreatedBody, SafePrFailedBody, SafePrRequestedBody
from packages.config.settings import env
from packages.contracts.event_bus.bodies import EventBody
from packages.contracts.scm.provider import ScmProvider
from packages.contracts.stores import PullRequestStore
from packages.runtime.app import App, EventContext
from packages.runtime.outbound import deliver

app = App("scm-worker")

SCM_PROVIDER_ENV = "SCM_PROVIDER"  # PR 생성 provider 선택(현재 github 만 지원)
DEFAULT_SCM_PROVIDER = "github"
PR_MODE = "github_rest"
SAFE_PR_CREATION_FAILED_MESSAGE = "safe pr creation failed"
UNSUPPORTED_SCM_PROVIDER_MESSAGE = (
    f"{SCM_PROVIDER_ENV} 값이 지원 목록에 없음 — 지원: {DEFAULT_SCM_PROVIDER}"
)


def build_scm_provider(name: str | None = None) -> ScmProvider:
    """SCM_PROVIDER env 로 provider 를 선택함.

    자격 증명(GITHUB_TOKEN/SCM_REPO) 부재는 부팅 실패가 아니라 요청 시점의
    safe_pr.failed 로 처리함 — provider 이름 오설정만 부팅 fail-fast.
    """
    provider = (name or env(SCM_PROVIDER_ENV, DEFAULT_SCM_PROVIDER)).strip().lower()
    if provider == DEFAULT_SCM_PROVIDER:
        return GithubScmProvider()
    raise RuntimeError(f"{UNSUPPORTED_SCM_PROVIDER_MESSAGE} (got: {provider})")


# PR 생성 전략 주입 지점 — 테스트는 transport 를 주입한 provider 로 교체함.
SCM_PROVIDER: ScmProvider = build_scm_provider()


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
    app.run()

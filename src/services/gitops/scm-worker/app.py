"""scm-worker - safe_pr.requested -> GitHub PR -> safe_pr.created."""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import replace

from github_provider import GithubScmProvider, validate_request_paths

from domains.gitops.repository import (
    derive_application_id,
    derive_deployment_binding_id,
    derive_repository_id,
    derive_workflow_run_id,
)
from domains.providers.catalog import ProviderCategory, require_available_provider
from domains.rca.events import SafePrPatchPreparedBody
from domains.scm.events import SafePrCreatedBody, SafePrFailedBody, SafePrRequestedBody
from packages.config.settings import env
from packages.contracts.event_bus.bodies import EventBody
from packages.contracts.scm.provider import ScmProvider
from packages.contracts.stores import PullRequestStore
from packages.runtime.app import App, EventContext
from packages.runtime.outbound import deliver

app = App("scm-worker")

SCM_PROVIDER_ENV = "SCM_PROVIDER"
DEFAULT_SCM_PROVIDER = "github"
PR_MODE = "github_rest"
SAFE_PR_CREATION_FAILED_MESSAGE = "safe pr creation failed"
UNSUPPORTED_SCM_PROVIDER_MESSAGE = f"{SCM_PROVIDER_ENV} 값이 provider registry 지원 목록에 없음"


def build_scm_provider(name: str | None = None) -> ScmProvider:
    """SCM_PROVIDER env 로 provider 를 선택함."""

    provider = (name or env(SCM_PROVIDER_ENV, DEFAULT_SCM_PROVIDER)).strip().lower()
    try:
        definition = require_available_provider(ProviderCategory.SOURCE, provider)
    except ValueError as exc:
        raise RuntimeError(f"{UNSUPPORTED_SCM_PROVIDER_MESSAGE} (got: {provider})") from exc
    if definition.key == DEFAULT_SCM_PROVIDER:
        return GithubScmProvider()
    raise RuntimeError(
        f"{SCM_PROVIDER_ENV} adapter binding is missing for provider: {definition.key}"
    )


ACTIVE_SCM_PROVIDER = (
    env(SCM_PROVIDER_ENV, DEFAULT_SCM_PROVIDER).strip().lower() or DEFAULT_SCM_PROVIDER
)
SCM_PROVIDER: ScmProvider = build_scm_provider()


def normalize_safe_pr_request(evt: SafePrRequestedBody) -> SafePrRequestedBody:
    payload = evt.to_body()
    repository_id = derive_repository_id(payload)
    binding_id = derive_deployment_binding_id({**payload, "repository_id": repository_id})
    application_id = derive_application_id(
        {**payload, "repository_id": repository_id, "binding_id": binding_id}
    )
    workflow_run_id = derive_workflow_run_id(
        {
            **payload,
            "repository_id": repository_id,
            "binding_id": binding_id,
            "application_id": application_id,
        }
    )
    return replace(
        evt,
        repository_id=repository_id,
        binding_id=binding_id,
        application_id=application_id,
        workflow_run_id=workflow_run_id,
    )


def patch_prepared_body(request: SafePrRequestedBody) -> SafePrPatchPreparedBody:
    return SafePrPatchPreparedBody(
        title=request.title,
        body=request.body,
        patch={
            "provider": request.provider,
            "repository_id": request.repository_id,
            "manifest_path": request.manifest_path,
            "approval_ref": request.approval_ref,
            "policy_decision_ref": request.policy_decision_ref,
            "patches": [patch.to_body() for patch in request.patches],
        },
        provider=request.provider,
        workspace_id=request.workspace_id,
        repository_id=request.repository_id,
        binding_id=request.binding_id,
        application_id=request.application_id,
        workflow_run_id=request.workflow_run_id,
        environment=request.environment,
        manifest_path=request.manifest_path,
        approval_ref=request.approval_ref,
        policy_decision_ref=request.policy_decision_ref,
        next_alert=request.next_alert.to_body() if request.next_alert is not None else None,
    )


async def create_safe_pr(evt: SafePrRequestedBody, ctx: EventContext[PullRequestStore]) -> str:
    if evt.provider != ACTIVE_SCM_PROVIDER:
        raise RuntimeError(
            f"safe_pr provider mismatch: event={evt.provider}, worker={ACTIVE_SCM_PROVIDER}"
        )
    return await SCM_PROVIDER.create_pull_request(evt, ctx)


def safe_pr_failure_reason(exc: Exception) -> str:
    return SAFE_PR_CREATION_FAILED_MESSAGE


def preflight_failure_body(request: SafePrRequestedBody) -> SafePrFailedBody | None:
    if request.provider != ACTIVE_SCM_PROVIDER:
        return SafePrFailedBody(
            provider=request.provider,
            title=request.title,
            reason=SAFE_PR_CREATION_FAILED_MESSAGE,
            workspace_id=request.workspace_id,
            repository_id=request.repository_id,
            binding_id=request.binding_id,
            application_id=request.application_id,
            workflow_run_id=request.workflow_run_id,
            environment=request.environment,
        )
    try:
        validate_request_paths(request)
    except Exception:
        return SafePrFailedBody(
            provider=request.provider,
            title=request.title,
            reason=SAFE_PR_CREATION_FAILED_MESSAGE,
            workspace_id=request.workspace_id,
            repository_id=request.repository_id,
            binding_id=request.binding_id,
            application_id=request.application_id,
            workflow_run_id=request.workflow_run_id,
            environment=request.environment,
        )
    return None


@app.on(SafePrRequestedBody)
async def on_safe_pr_requested(
    evt: SafePrRequestedBody, ctx: EventContext[PullRequestStore]
) -> AsyncIterator[EventBody]:
    request = normalize_safe_pr_request(evt)
    yield patch_prepared_body(request)

    preflight_failed = preflight_failure_body(request)
    if preflight_failed is not None:
        yield preflight_failed
        return

    async def create_pr() -> str:
        return await create_safe_pr(request, ctx)

    def created_body(pr_url: str) -> SafePrCreatedBody:
        return SafePrCreatedBody(
            pr_url=pr_url,
            provider=request.provider,
            mode=PR_MODE,
            workspace_id=request.workspace_id,
            repository_id=request.repository_id,
            binding_id=request.binding_id,
            application_id=request.application_id,
            workflow_run_id=request.workflow_run_id,
            environment=request.environment,
        )

    async for out in deliver(
        call=create_pr,
        ok=created_body,
        fail=lambda exc: SafePrFailedBody(
            provider=request.provider,
            title=request.title,
            reason=safe_pr_failure_reason(exc),
            workspace_id=request.workspace_id,
            repository_id=request.repository_id,
            binding_id=request.binding_id,
            application_id=request.application_id,
            workflow_run_id=request.workflow_run_id,
            environment=request.environment,
        ),
    ):
        yield out
        if isinstance(out, SafePrCreatedBody) and request.next_alert is not None:
            yield request.next_alert


if __name__ == "__main__":
    app.run()

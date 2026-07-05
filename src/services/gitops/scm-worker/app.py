"""scm-worker - safe_pr.ready_for_creation -> GitHub PR -> safe_pr.created."""

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
from domains.scm.events import (
    SafePrCreatedBody,
    SafePrFailedBody,
    SafePrReadyForCreationBody,
    SafePrRequestedBody,
)
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


def request_from_ready(evt: SafePrReadyForCreationBody) -> SafePrRequestedBody:
    diff_section = (
        f"\n\n## Diff explanation\n- risk: `{evt.diff_risk}`\n- summary: {evt.diff_summary}\n"
    )
    return normalize_safe_pr_request(
        SafePrRequestedBody(
            title=evt.title,
            body=f"{evt.body}{diff_section}",
            provider=evt.provider,
            patches=evt.patches,
            workspace_id=evt.workspace_id,
            repository_id=evt.repository_id,
            binding_id=evt.binding_id,
            application_id=evt.application_id,
            workflow_run_id=evt.workflow_run_id,
            environment=evt.environment,
            manifest_path=evt.manifest_path,
            approval_ref=evt.approval_ref,
            policy_decision_ref=evt.policy_decision_ref,
            next_alert=evt.next_alert,
        )
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


def ready_from_request(request: SafePrRequestedBody) -> SafePrReadyForCreationBody:
    return SafePrReadyForCreationBody(
        title=request.title,
        body=request.body,
        provider=request.provider,
        diff_summary="safe patch prepared",
        diff_risk="review_required",
        diff_details={"source": "legacy_safe_pr_requested"},
        patches=request.patches,
        workspace_id=request.workspace_id,
        repository_id=request.repository_id,
        binding_id=request.binding_id,
        application_id=request.application_id,
        workflow_run_id=request.workflow_run_id,
        environment=request.environment,
        manifest_path=request.manifest_path,
        approval_ref=request.approval_ref,
        policy_decision_ref=request.policy_decision_ref,
        next_alert=request.next_alert,
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


async def on_safe_pr_requested(
    evt: SafePrRequestedBody, ctx: EventContext[PullRequestStore]
) -> AsyncIterator[EventBody]:
    """Backward-compatible direct call path; production subscription is ready-only."""

    request = normalize_safe_pr_request(evt)
    preflight_failed = preflight_failure_body(request)
    if preflight_failed is not None:
        yield preflight_failed
        return
    yield patch_prepared_body(request)
    async for out in on_safe_pr_ready_for_creation(ready_from_request(request), ctx):
        yield out


@app.on(SafePrReadyForCreationBody)
async def on_safe_pr_ready_for_creation(
    evt: SafePrReadyForCreationBody, ctx: EventContext[PullRequestStore]
) -> AsyncIterator[EventBody]:
    request = request_from_ready(evt)
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

"""safe-pr-worker — safe_pr.requested -> safe_pr.patch_prepared.

Patch 준비는 외부 SCM 쓰기와 분리한다. 이 워커는 요청을 정규화하고
diff-worker가 설명할 수 있는 안전한 패치 초안 이벤트만 발행한다.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import replace

from domains.gitops.repository import (
    derive_application_id,
    derive_deployment_binding_id,
    derive_repository_id,
    derive_workflow_run_id,
)
from domains.rca.events import SafePrPatchPreparedBody
from domains.scm.events import SafePrRequestedBody
from packages.contracts.event_bus.bodies import EventBody
from packages.runtime.app import App

app = App("safe-pr-worker")


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


@app.on(SafePrRequestedBody)
async def on_safe_pr_requested(evt: SafePrRequestedBody) -> AsyncIterator[EventBody]:
    yield patch_prepared_body(normalize_safe_pr_request(evt))


if __name__ == "__main__":
    app.run()

"""Safe PR event pipeline helpers."""

from __future__ import annotations

from dataclasses import replace

from domains.gitops.repository import (
    derive_application_id,
    derive_deployment_binding_id,
    derive_repository_id,
    derive_workflow_run_id,
)
from domains.rca.events import SafePrPatchPreparedBody
from domains.scm.events import SafePrRequestedBody


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
        request=request.to_body(),
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

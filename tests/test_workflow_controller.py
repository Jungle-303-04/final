from __future__ import annotations

from dataclasses import replace

from conftest import SpyDb, load_service, run_handler, subjects_of

from packages.config.constants import CommandStatus, Sandbox, Target
from packages.contracts.event_bus.bodies import (
    CommandCompletedBody,
    CommandQueuedForAgentBody,
    Diff,
    DiffAnalyzedBody,
    GitWebhookReceivedBody,
)


def workflow_db(**returns):
    return SpyDb(
        record_workflow_step={
            "workflow_run_id": "workflow-1",
            "step_id": "step-1",
            "name": "git",
        },
        request_workflow_approval={
            "workflow_run_id": "workflow-1",
            "approval_id": "approval-1",
        },
        **returns,
    )


def workflow_diff(risk: str = Sandbox.RISK_TAG) -> Diff:
    return Diff(
        resource="deployment/checkout-api",
        namespace=Sandbox.NAMESPACE,
        desired_image="checkout:new",
        actual_image="checkout:old",
        risk=risk,
        workspace_id="workspace-1",
        repository_id="repo-1",
        watch_target_id="watch-1",
        binding_id="binding-1",
        application_id="app-1",
        workflow_run_id="workflow-1",
        environment="prod",
        cluster_id=Target.DEFAULT_CLUSTER_ID,
    )


def test_workflow_controller_starts_run_from_git_webhook() -> None:
    workflow = load_service("gitops/workflow-controller")
    db = workflow_db()

    outs = run_handler(
        workflow.on_git_webhook,
        GitWebhookReceivedBody(
            commit_sha="abc123",
            image="checkout:new",
            replicas=2,
            workspace_id="workspace-1",
            repository_id="repo-1",
            watch_target_id="watch-1",
            binding_id="binding-1",
            application_id="app-1",
            workflow_run_id="workflow-1",
            environment="prod",
        ),
        db,
    )

    assert subjects_of(outs) == [
        "workflow.created",
        "workflow.run.started",
        "workflow.step.recorded",
    ]
    assert db.called("upsert_application")
    assert db.called("start_workflow_run")
    assert db.called("record_workflow_step")
    assert outs[1].workflow_run_id == "workflow-1"
    assert outs[2].step == "git"


def test_workflow_controller_requests_approval_for_unsafe_diff() -> None:
    workflow = load_service("gitops/workflow-controller")
    db = workflow_db()
    outs = run_handler(
        workflow.on_diff_analyzed,
        DiffAnalyzedBody(
            diff=workflow_diff("production"),
            safe=False,
            risk="production",
            reason="production requires approval",
        ),
        db,
    )

    assert subjects_of(outs) == [
        "workflow.step.recorded",
        "workflow.step.recorded",
        "approval.requested",
    ]
    assert db.called("request_workflow_approval")
    assert db.called("update_workflow_run")
    assert outs[-1].approval_id == "approval-1"
    assert outs[-1].workflow_run_id == "workflow-1"


def test_workflow_controller_auto_approves_safe_diff() -> None:
    workflow = load_service("gitops/workflow-controller")
    db = workflow_db()
    outs = run_handler(
        workflow.on_diff_analyzed,
        DiffAnalyzedBody(
            diff=workflow_diff(),
            safe=True,
            risk=Sandbox.RISK_TAG,
            reason="sandbox safe",
        ),
        db,
    )

    assert subjects_of(outs) == [
        "workflow.step.recorded",
        "workflow.step.recorded",
        "approval.granted",
    ]
    assert db.called("request_workflow_approval")
    assert db.called("resolve_workflow_approval")
    assert outs[-1].decision == "auto-approved"


def test_workflow_controller_does_not_complete_manifest_diff_only_by_same_image() -> None:
    workflow = load_service("gitops/workflow-controller")
    db = workflow_db()
    diff = workflow_diff()
    manifest_diff = replace(
        diff,
        desired_image=diff.actual_image,
        desired_manifest={
            "apiVersion": "apps/v1",
            "kind": "Deployment",
            "metadata": {"name": "checkout-api", "namespace": Sandbox.NAMESPACE},
            "spec": {"replicas": 3},
        },
    )

    outs = run_handler(
        workflow.on_diff_analyzed,
        DiffAnalyzedBody(
            diff=manifest_diff,
            safe=True,
            risk=Sandbox.RISK_TAG,
            reason="sandbox safe",
        ),
        db,
    )

    assert subjects_of(outs) == [
        "workflow.step.recorded",
        "workflow.step.recorded",
        "approval.granted",
    ]
    assert db.called("resolve_workflow_approval")
    assert outs[-1].decision == "auto-approved"


def test_workflow_controller_links_command_lifecycle_to_run() -> None:
    workflow = load_service("gitops/workflow-controller")
    identity = {
        "workflow_run_id": "workflow-1",
        "workspace_id": "workspace-1",
        "application_id": "app-1",
        "binding_id": "binding-1",
        "environment": "prod",
        "cluster_id": Target.DEFAULT_CLUSTER_ID,
        "commit_sha": "abc123",
    }
    queued_db = workflow_db()
    queued = run_handler(
        workflow.on_command_queued,
        CommandQueuedForAgentBody(
            command_id="cmd-1",
            cluster_id=Target.DEFAULT_CLUSTER_ID,
            workspace_id="workspace-1",
            application_id="app-1",
            workflow_run_id="workflow-1",
            binding_id="binding-1",
            environment="prod",
        ),
        queued_db,
    )

    assert subjects_of(queued) == ["workflow.step.recorded"]
    assert queued_db.called("attach_workflow_command")

    completed_db = workflow_db(get_workflow_identity_for_command=identity)
    completed = run_handler(
        workflow.on_command_completed,
        CommandCompletedBody(
            command_id="cmd-1",
            result={"status": CommandStatus.COMPLETED, "message": "applied"},
        ),
        completed_db,
    )

    assert subjects_of(completed) == [
        "workflow.step.recorded",
        "workflow.step.recorded",
        "workflow.run.completed",
    ]
    assert completed_db.called("attach_workflow_command")
    assert completed_db.called("update_workflow_run_for_command")
    assert completed[-1].workflow_run_id == "workflow-1"


def test_workflow_controller_does_not_trust_agent_result_identity_without_mapping() -> None:
    workflow = load_service("gitops/workflow-controller")
    db = workflow_db(get_workflow_identity_for_command=None)
    outs = run_handler(
        workflow.on_command_completed,
        CommandCompletedBody(
            command_id="cmd-orphan",
            result={
                "status": CommandStatus.COMPLETED,
                "message": "applied",
                "workspace_id": "spoofed-workspace",
                "application_id": "spoofed-app",
                "workflow_run_id": "spoofed-workflow",
                "binding_id": "spoofed-binding",
                "environment": "prod",
            },
        ),
        db,
    )

    assert outs == []
    assert not db.called("attach_workflow_command")
    assert not db.called("update_workflow_run_for_command")


def test_workflow_controller_treats_completed_but_unapplied_command_as_failed() -> None:
    workflow = load_service("gitops/workflow-controller")
    identity = {
        "workflow_run_id": "workflow-1",
        "workspace_id": "workspace-1",
        "application_id": "app-1",
        "binding_id": "binding-1",
        "environment": "prod",
        "cluster_id": Target.DEFAULT_CLUSTER_ID,
    }
    db = workflow_db(get_workflow_identity_for_command=identity)

    outs = run_handler(
        workflow.on_command_completed,
        CommandCompletedBody(
            command_id="cmd-1",
            result={
                "status": CommandStatus.COMPLETED,
                "applied": False,
                "message": "kubernetes api not configured; dry-run only",
            },
        ),
        db,
    )

    assert subjects_of(outs) == ["workflow.step.recorded", "workflow.run.failed"]
    assert outs[-1].reason == "kubernetes api not configured; dry-run only"

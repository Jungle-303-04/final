from __future__ import annotations

from dataclasses import replace

from conftest import SpyDb, load_service, run_handler, subjects_of

from domains.command.events import (
    CommandCompletedBody,
    CommandQueuedForAgentBody,
    CommandRejectedBody,
    CommandRequestedBody,
)
from domains.gitops.events import (
    Diff,
    DiffAnalyzedBody,
    DiffDetectedBody,
    GitWebhookReceivedBody,
    ManifestRenderedBody,
    RenderedManifest,
    RenderedMetadata,
    RenderedSpec,
)
from domains.gitops.repository import (
    derive_deployment_binding_id,
    derive_repository_id,
    derive_watch_target_id,
)
from domains.scm.events import SafePrFailedBody
from packages.config.constants import CommandStatus, Sandbox, Target
from packages.contracts.gitops import DEFAULT_DEPLOYMENT_BINDING_ID


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


def test_workflow_controller_emits_workspace_scoped_default_ids() -> None:
    workflow = load_service("gitops/workflow-controller")
    db = workflow_db()
    payload = {
        "workspace_id": "workspace-b",
        "repo_ref": "org/checkout",
        "cluster_id": Target.DEFAULT_CLUSTER_ID,
        "manifest_path": "deploy/app.yaml",
    }
    expected_repository_id = derive_repository_id(payload)
    expected_watch_target_id = derive_watch_target_id(
        {**payload, "repository_id": expected_repository_id}
    )
    expected_binding_id = derive_deployment_binding_id(
        {
            **payload,
            "repository_id": expected_repository_id,
            "watch_target_id": expected_watch_target_id,
        }
    )

    outs = run_handler(
        workflow.on_git_webhook,
        GitWebhookReceivedBody(
            commit_sha="abc123",
            image="checkout:new",
            replicas=2,
            workspace_id="workspace-b",
            repo_ref="org/checkout",
            manifest_path="deploy/app.yaml",
        ),
        db,
    )

    started = outs[1]
    start_calls = [args[0] for name, args in db.calls if name == "start_workflow_run"]
    assert expected_binding_id != DEFAULT_DEPLOYMENT_BINDING_ID
    assert started.repository_id == expected_repository_id
    assert started.watch_target_id == expected_watch_target_id
    assert started.binding_id == expected_binding_id
    assert start_calls[0]["repository_id"] == expected_repository_id
    assert start_calls[0]["watch_target_id"] == expected_watch_target_id
    assert start_calls[0]["binding_id"] == expected_binding_id


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
    ]
    assert db.called("request_workflow_approval")
    assert db.called("resolve_workflow_approval")


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
    ]
    assert db.called("resolve_workflow_approval")


def test_workflow_controller_fails_run_when_safe_pr_fails() -> None:
    workflow = load_service("gitops/workflow-controller")
    db = workflow_db()

    outs = run_handler(
        workflow.on_safe_pr_failed,
        SafePrFailedBody(
            provider="github",
            title="Apply sandbox manifest",
            reason="safe pr creation failed",
            workspace_id="workspace-1",
            repository_id="repo-1",
            binding_id="binding-1",
            application_id="app-1",
            workflow_run_id="workflow-1",
            environment="prod",
        ),
        db,
    )

    assert subjects_of(outs) == ["workflow.step.recorded", "workflow.run.failed"]
    assert db.called("update_workflow_run")
    assert outs[-1].workflow_run_id == "workflow-1"
    assert outs[-1].reason == "safe pr creation failed"


def test_workflow_controller_uses_deployment_name_as_application_name_on_render() -> None:
    workflow = load_service("gitops/workflow-controller")
    db = workflow_db()

    outs = run_handler(
        workflow.on_manifest_rendered,
        ManifestRenderedBody(
            rendered_manifest=RenderedManifest(
                api_version="apps/v1",
                kind="Deployment",
                metadata=RenderedMetadata(name="checkout-api", namespace="sandbox"),
                spec=RenderedSpec(replicas=2, image="checkout:new"),
                manifest={"apiVersion": "apps/v1", "kind": "Deployment"},
            ),
            application_id="app-1",
            workflow_run_id="workflow-1",
        ),
        db,
    )

    assert subjects_of(outs) == ["workflow.step.recorded"]
    upserts = [args[0] for name, args in db.calls if name == "upsert_application"]
    assert upserts[0]["name"] == "checkout-api"
    assert db.called("start_workflow_run")


def test_workflow_controller_does_not_upsert_application_from_auxiliary_manifest() -> None:
    workflow = load_service("gitops/workflow-controller")
    db = workflow_db()

    outs = run_handler(
        workflow.on_manifest_rendered,
        ManifestRenderedBody(
            rendered_manifest=RenderedManifest(
                api_version="v1",
                kind="ConfigMap",
                metadata=RenderedMetadata(name="checkout-api-config", namespace="sandbox"),
                spec=RenderedSpec(),
                manifest={"apiVersion": "v1", "kind": "ConfigMap"},
            ),
            application_id="app-1",
            workflow_run_id="workflow-1",
        ),
        db,
    )

    assert subjects_of(outs) == ["workflow.step.recorded"]
    assert not db.called("upsert_application")
    assert not db.called("start_workflow_run")
    assert db.called("update_workflow_run")


def test_workflow_controller_does_not_upsert_application_from_resource_diff() -> None:
    workflow = load_service("gitops/workflow-controller")
    db = workflow_db()

    outs = run_handler(
        workflow.on_diff_detected,
        DiffDetectedBody(
            diff=Diff(
                resource="configmap/checkout-api-config",
                namespace="sandbox",
                desired_image="",
                actual_image="resource-not-inspected",
                risk=Sandbox.RISK_TAG,
                application_id="app-1",
                workflow_run_id="workflow-1",
                desired_manifest={"apiVersion": "v1", "kind": "ConfigMap"},
            )
        ),
        db,
    )

    assert subjects_of(outs) == ["workflow.step.recorded"]
    assert not db.called("upsert_application")
    assert not db.called("start_workflow_run")
    assert db.called("update_workflow_run")


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


def test_workflow_controller_fails_run_when_command_rejected() -> None:
    workflow = load_service("gitops/workflow-controller")
    db = workflow_db()
    requested = CommandRequestedBody(
        cluster_id=Target.DEFAULT_CLUSTER_ID,
        action="delete",
        namespace=Sandbox.NAMESPACE,
        reason="unsafe command",
        diff=workflow_diff(),
        workspace_id="workspace-1",
        application_id="app-1",
        workflow_run_id="workflow-1",
        binding_id="binding-1",
        environment="prod",
    )

    outs = run_handler(
        workflow.on_command_rejected,
        CommandRejectedBody(reason="unsupported command action", requested=requested.to_body()),
        db,
    )

    assert subjects_of(outs) == ["workflow.step.recorded", "workflow.run.failed"]
    assert db.called("update_workflow_run")
    assert outs[-1].workflow_run_id == "workflow-1"
    assert outs[-1].reason == "unsupported command action"


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

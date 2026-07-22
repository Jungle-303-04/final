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
    DesiredDesiredDiffDetectedBody,
    Diff,
    DiffAnalyzedBody,
    GitChangedBody,
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
    derive_workflow_run_id,
)
from domains.scm.events import SafePrCreatedBody, SafePrFailedBody
from domains.timeline.repository import TimelineLedgerAppend
from packages.config.constants import CommandStatus, Sandbox, Target
from packages.contracts.gitops import DEFAULT_DEPLOYMENT_BINDING_ID, WorkflowMutation


class WorkflowDb(SpyDb):
    """Workflow persistence fixture with an explicit durable Timeline ledger."""

    async def append_timeline_event(self, event):
        self.calls.append(("append_timeline_event", (event,)))
        return TimelineLedgerAppend(event=event, sequence=len(self.calls), inserted=True)


class DuplicateTimelineDb(WorkflowDb):
    """A redelivered source key must not create a second workflow event."""

    async def append_timeline_event(self, event):
        self.calls.append(("append_timeline_event", (event,)))
        return TimelineLedgerAppend(event=event, sequence=1, inserted=False)


def workflow_db(**returns):
    defaults = {
        "start_workflow_run": WorkflowMutation(applied=True),
        "update_workflow_run": WorkflowMutation(applied=True),
        "record_workflow_step": WorkflowMutation(applied=True),
        "update_workflow_run_for_command": WorkflowMutation(applied=True),
        "request_workflow_approval": {
            "workflow_run_id": "workflow-1",
            "approval_id": "approval-1",
        },
    }
    return WorkflowDb(**{**defaults, **returns})


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


def test_workflow_controller_does_not_publish_rejected_or_duplicate_run_mutations() -> None:
    workflow = load_service("gitops/workflow-controller")
    db = workflow_db(start_workflow_run=WorkflowMutation(applied=False))

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

    assert outs == []
    assert not db.called("record_workflow_step")
    assert not db.called("append_timeline_event")


def test_workflow_controller_does_not_publish_when_timeline_source_key_already_exists() -> None:
    workflow = load_service("gitops/workflow-controller")
    db = DuplicateTimelineDb(
        start_workflow_run=WorkflowMutation(applied=True),
        record_workflow_step=WorkflowMutation(applied=True),
    )

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

    assert outs == []
    assert not db.called("record_workflow_step")
    assert len([call for call in db.calls if call[0] == "append_timeline_event"]) == 1


def test_workflow_controller_appends_only_safe_application_workflow_timeline_fields() -> None:
    workflow = load_service("gitops/workflow-controller")
    db = workflow_db()

    run_handler(
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

    events = [args[0] for name, args in db.calls if name == "append_timeline_event"]
    assert [event.source for event in events] == [
        "application_workflow",
        "application_workflow",
    ]
    assert {event.subject.kind for event in events} == {"application_workflow"}
    assert all("raw" not in event.metadata for event in events)
    assert all("details" not in event.metadata for event in events)
    assert all("summary" not in event.metadata for event in events)


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
            diff=workflow_diff("non-sandbox-namespace"),
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
    assert not db.called("request_workflow_approval")
    assert db.called("update_workflow_run")
    assert outs[-1].approval_id.startswith("approval-")
    assert outs[-1].workflow_run_id == "workflow-1"
    assert outs[-1].details["policy_decision_ref"]


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
    assert not db.called("request_workflow_approval")
    assert not db.called("resolve_workflow_approval")


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
    assert not db.called("resolve_workflow_approval")


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


def test_standalone_manifest_safe_pr_does_not_create_orphan_workflow_timeline() -> None:
    workflow = load_service("gitops/workflow-controller")
    db = workflow_db(get_workflow_run=None)

    outs = run_handler(
        workflow.on_safe_pr_created,
        SafePrCreatedBody(
            pr_url="https://github.com/project/repo/pull/2",
            provider="github",
            mode="github_rest",
            workspace_id="workspace-1",
            repository_id="repo-1",
            binding_id="binding-1",
            application_id="app-1",
            workflow_run_id="workflow-manifest-edit-1",
            environment="prod",
            manifest_path="deploy/app.yaml",
            repo_ref="project/repo",
            base_branch="main",
            commit_sha="abc123",
        ),
        db,
    )

    assert outs == []
    assert db.called("get_workflow_run")
    assert not db.called("record_workflow_step")
    assert not db.called("append_timeline_event")


def test_safe_pr_created_records_step_for_matching_persisted_workflow() -> None:
    workflow = load_service("gitops/workflow-controller")
    db = workflow_db(
        get_workflow_run={
            "workspace_id": "workspace-1",
            "workflow_run_id": "workflow-1",
            "application_id": "app-1",
            "binding_id": "binding-1",
            "environment": "prod",
            "commit_sha": "abc123",
        }
    )

    outs = run_handler(
        workflow.on_safe_pr_created,
        SafePrCreatedBody(
            pr_url="https://github.com/project/repo/pull/2",
            provider="github",
            mode="github_rest",
            workspace_id="workspace-1",
            repository_id="repo-1",
            binding_id="binding-1",
            application_id="app-1",
            workflow_run_id="workflow-1",
            environment="prod",
            manifest_path="deploy/app.yaml",
            repo_ref="project/repo",
            base_branch="main",
            commit_sha="abc123",
        ),
        db,
    )

    assert subjects_of(outs) == ["workflow.step.recorded"]
    assert db.called("record_workflow_step")
    assert db.called("append_timeline_event")


def test_safe_pr_created_rejects_mismatched_persisted_workflow_identity() -> None:
    workflow = load_service("gitops/workflow-controller")
    db = workflow_db(
        get_workflow_run={
            "workspace_id": "workspace-1",
            "workflow_run_id": "workflow-1",
            "application_id": "different-app",
            "binding_id": "binding-1",
            "environment": "prod",
            "commit_sha": "abc123",
        }
    )

    outs = run_handler(
        workflow.on_safe_pr_created,
        SafePrCreatedBody(
            pr_url="https://github.com/project/repo/pull/2",
            provider="github",
            mode="github_rest",
            workspace_id="workspace-1",
            repository_id="repo-1",
            binding_id="binding-1",
            application_id="app-1",
            workflow_run_id="workflow-1",
            environment="prod",
            manifest_path="deploy/app.yaml",
            repo_ref="project/repo",
            base_branch="main",
            commit_sha="abc123",
        ),
        db,
    )

    assert outs == []
    assert not db.called("record_workflow_step")
    assert not db.called("append_timeline_event")


def test_workflow_controller_does_not_upsert_application_from_deployment_manifest() -> None:
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
    assert not db.called("upsert_application")
    assert not db.called("start_workflow_run")
    assert db.called("update_workflow_run")


def test_workflow_controller_keeps_one_application_identity_for_multiple_deployments() -> None:
    workflow = load_service("gitops/workflow-controller")
    db = workflow_db()

    for deployment_name in ("checkout-api", "checkout-worker"):
        outs = run_handler(
            workflow.on_manifest_rendered,
            ManifestRenderedBody(
                rendered_manifest=RenderedManifest(
                    api_version="apps/v1",
                    kind="Deployment",
                    metadata=RenderedMetadata(name=deployment_name, namespace="sandbox"),
                    spec=RenderedSpec(replicas=2, image=f"{deployment_name}:new"),
                    manifest={"apiVersion": "apps/v1", "kind": "Deployment"},
                ),
                application_id="app-1",
                workflow_run_id="workflow-1",
            ),
            db,
        )
        assert subjects_of(outs) == ["workflow.step.recorded"]

    transitions = [args[0] for name, args in db.calls if name == "update_workflow_run"]
    assert len(transitions) == 2
    assert {transition["application_id"] for transition in transitions} == {"app-1"}
    assert {transition["workflow_run_id"] for transition in transitions} == {"workflow-1"}
    assert not db.called("upsert_application")
    assert not db.called("start_workflow_run")


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
        DesiredDesiredDiffDetectedBody(
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


def test_workflow_controller_uses_canonical_application_from_repository() -> None:
    workflow = load_service("gitops/workflow-controller")
    expected_workflow_run_id = derive_workflow_run_id(
        {
            "workspace_id": "workspace-1",
            "repository_id": "repo-1",
            "repo_ref": "org/checkout",
            "watch_target_id": "watch-1",
            "binding_id": "binding-1",
            "application_id": "app-canonical",
            "manifest_path": "deploy/app.yaml",
            "commit_sha": "abc123",
        }
    )
    db = workflow_db(
        upsert_application={"application_id": "app-canonical"},
        get_deployment_binding={
            "workspace_id": "workspace-1",
            "binding_id": "binding-1",
            "repository_id": "repo-1",
            "cluster_id": Target.DEFAULT_CLUSTER_ID,
            "environment": "sandbox",
            "manifest_path": "deploy/app.yaml",
            "app_name": "checkout",
            "status": "active",
        },
        get_application={
            "workspace_id": "workspace-1",
            "application_id": "app-canonical",
            "repository_id": "repo-1",
            "manifest_path": "deploy/app.yaml",
            "name": "checkout",
        },
        get_workflow_run={
            "workspace_id": "workspace-1",
            "workflow_run_id": expected_workflow_run_id,
            "application_id": "app-canonical",
            "binding_id": "binding-1",
            "cluster_id": Target.DEFAULT_CLUSTER_ID,
            "environment": "sandbox",
            "commit_sha": "abc123",
        },
    )

    outs = run_handler(
        workflow.on_git_changed,
        GitChangedBody(
            commit_sha="abc123",
            image="checkout:new",
            replicas=2,
            workspace_id="workspace-1",
            repository_id="repo-1",
            repo_ref="org/checkout",
            watch_target_id="watch-1",
            binding_id="binding-1",
            application_id="app-stale",
            workflow_run_id="workflow-stale",
            manifest_path="deploy/app.yaml",
        ),
        db,
    )
    start_calls = [args[0] for name, args in db.calls if name == "start_workflow_run"]
    assert subjects_of(outs) == ["workflow.step.recorded"]
    assert start_calls[0]["application_id"] == "app-canonical"
    assert start_calls[0]["workflow_run_id"] == expected_workflow_run_id
    assert outs[0].application_id == "app-canonical"


def test_git_changed_appends_only_the_persisted_canonical_gitops_fact() -> None:
    workflow = load_service("gitops/workflow-controller")
    db = workflow_db(
        get_deployment_binding={
            "workspace_id": "workspace-1",
            "binding_id": "binding-1",
            "repository_id": "repo-1",
            "cluster_id": Target.DEFAULT_CLUSTER_ID,
            "environment": "prod",
            "manifest_path": "deploy/app.yaml",
            "app_name": "checkout",
            "status": "active",
        },
        get_application={
            "workspace_id": "workspace-1",
            "application_id": "app-1",
            "repository_id": "repo-1",
            "manifest_path": "deploy/app.yaml",
            "name": "checkout",
        },
        get_workflow_run={
            "workflow_run_id": "workflow-1",
            "workspace_id": "workspace-1",
            "application_id": "app-1",
            "binding_id": "binding-1",
            "cluster_id": Target.DEFAULT_CLUSTER_ID,
            "environment": "prod",
            "commit_sha": "abc123",
        },
    )

    outs = run_handler(
        workflow.on_git_changed,
        GitChangedBody(
            commit_sha="abc123",
            image="registry.example/checkout:private-tag",
            replicas=2,
            workspace_id="workspace-1",
            repository_id="repo-1",
            repo_ref="org/checkout",
            branch="main",
            watch_target_id="watch-1",
            binding_id="binding-1",
            application_id="app-1",
            workflow_run_id="workflow-1",
            environment="prod",
            cluster_id=Target.DEFAULT_CLUSTER_ID,
            manifest_path="deploy/app.yaml",
        ),
        db,
    )

    assert subjects_of(outs) == ["workflow.step.recorded"]
    events = [args[0] for name, args in db.calls if name == "append_timeline_event"]
    gitops = [event for event in events if event.source == "gitops"]
    assert len(gitops) == 1
    event = gitops[0]
    assert event.subject.kind == "application_workflow"
    assert event.subject.application_id == "app-1"
    assert event.subject.binding_id == "binding-1"
    assert event.subject.workflow_run_id == "workflow-1"
    assert event.resource is None
    assert event.title == "Git change confirmed"
    assert event.metadata == {"state": "changed"}
    assert "registry.example" not in event.title
    assert "manifest" not in event.metadata
    assert "repo_changes" not in event.metadata


def test_git_changed_with_unregistered_binding_creates_no_outbox_or_timeline_fact() -> None:
    workflow = load_service("gitops/workflow-controller")
    db = workflow_db(get_deployment_binding=None)

    outs = run_handler(
        workflow.on_git_changed,
        GitChangedBody(
            commit_sha="abc123",
            image="checkout:new",
            replicas=2,
            workspace_id="workspace-1",
            repository_id="repo-1",
            binding_id="binding-missing",
            application_id="app-1",
            workflow_run_id="workflow-1",
            environment="prod",
            cluster_id=Target.DEFAULT_CLUSTER_ID,
            manifest_path="deploy/app.yaml",
        ),
        db,
    )

    assert outs == []
    assert db.called("get_deployment_binding")
    assert not db.called("upsert_application")
    assert not db.called("start_workflow_run")
    assert not db.called("append_timeline_event")


def test_duplicate_git_changed_creates_no_timeline_fact_or_outbox() -> None:
    workflow = load_service("gitops/workflow-controller")
    db = workflow_db(
        start_workflow_run=WorkflowMutation(applied=False),
        get_deployment_binding={
            "workspace_id": "workspace-1",
            "binding_id": "binding-1",
            "repository_id": "repo-1",
            "cluster_id": Target.DEFAULT_CLUSTER_ID,
            "environment": "prod",
            "manifest_path": "deploy/app.yaml",
            "app_name": "checkout",
            "status": "active",
        },
    )

    outs = run_handler(
        workflow.on_git_changed,
        GitChangedBody(
            commit_sha="abc123",
            image="checkout:new",
            replicas=2,
            workspace_id="workspace-1",
            repository_id="repo-1",
            binding_id="binding-1",
            application_id="app-1",
            workflow_run_id="workflow-1",
            environment="prod",
            cluster_id=Target.DEFAULT_CLUSTER_ID,
            manifest_path="deploy/app.yaml",
        ),
        db,
    )

    assert outs == []
    assert db.called("start_workflow_run")
    assert not db.called("append_timeline_event")


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


def test_workflow_controller_blocks_promotion_for_image_pull_backoff() -> None:
    workflow = load_service("gitops/workflow-controller")
    identity = {
        "workflow_run_id": "workflow-canary",
        "workspace_id": "workspace-1",
        "application_id": "app-1",
        "binding_id": "binding-1",
        "environment": "development",
        "cluster_id": Target.DEFAULT_CLUSTER_ID,
    }
    db = workflow_db(get_workflow_identity_for_command=identity)
    result = {
        "status": CommandStatus.COMPLETED,
        "applied": True,
        "message": "ImagePullBackOff",
        "resources": [
            {
                "kind": "Deployment",
                "name": "canary-room",
                "status": "failed",
                "applied": True,
                "reason": "ImagePullBackOff",
            }
        ],
        "rollout": {"ready": False, "reason": "ImagePullBackOff"},
    }

    outs = run_handler(
        workflow.on_command_completed,
        CommandCompletedBody(command_id="cmd-canary", result=result),
        db,
    )

    assert subjects_of(outs) == ["workflow.step.recorded", "workflow.run.failed"]
    assert outs[-1].reason == "ImagePullBackOff"
    update = next(call[1][0] for call in db.calls if call[0] == "update_workflow_run_for_command")
    assert update["status"] == "failed"
    assert update["metadata"]["result"] == result
    assert update["metadata"]["failed_resources"][0]["reason"] == "ImagePullBackOff"

from __future__ import annotations

from pathlib import Path

import pytest
import yaml
from conftest import SpyDb, load_service, run_handler, subjects_of

from domains.gitops.events import Diff
from domains.rca.events import RolloutDiagnosedBody
from packages.config.constants import RiskLevel

ROOT = Path(__file__).resolve().parents[1]


def rollout_diff() -> Diff:
    return Diff(
        resource="deployment/checkout-api",
        namespace="sandbox",
        desired_image="ghcr.io/project/checkout-api:v2",
        actual_image="ghcr.io/project/checkout-api:v1",
        risk=RiskLevel.SANDBOX_ONLY,
        workspace_id="workspace-1",
        repository_id="repo-1",
        binding_id="binding-1",
        application_id="app-1",
        workflow_run_id="workflow-1",
        environment="sandbox",
        cluster_id="cluster-1",
        manifest_path="deploy/checkout-api.yaml",
        desired_manifest={
            "apiVersion": "apps/v1",
            "kind": "Deployment",
            "metadata": {"name": "checkout-api", "namespace": "sandbox"},
            "spec": {
                "template": {
                    "spec": {
                        "containers": [
                            {
                                "name": "checkout-api",
                                "image": "ghcr.io/project/checkout-api:v2",
                            }
                        ]
                    }
                }
            },
        },
        changes=[
            {
                "field_path": "spec.template.spec.containers[name=checkout-api].image",
                "before": "ghcr.io/project/checkout-api:v1",
                "after": "ghcr.io/project/checkout-api:v2",
                "classification": "changed",
            }
        ],
        basis={"policy_source": "stored-workflow-diff"},
    )


def registered_application() -> dict[str, object]:
    return {
        "workspace_id": "workspace-1",
        "application_id": "app-1",
        "repository_id": "repo-1",
        "manifest_path": "deploy/checkout-api.yaml",
        "repo_ref": "project/repo",
        "default_branch": "main",
    }


def failed_rollout(*, next_action: str = "manual_review"):
    details: dict[str, object] = {"command_id": "cmd-1"}
    return RolloutDiagnosedBody(
        diagnosis="deployment rollout not ready before timeout: checkout-api",
        next_action=next_action,
        details=details,
        workspace_id="workspace-1",
    )


def test_auto_revert_flag_defaults_off_and_emits_nothing(monkeypatch) -> None:
    monkeypatch.delenv("RECOVERY_ENABLE_AUTO_REVERT_PR", raising=False)
    worker = load_service("gitops/auto-revert-worker")
    db = SpyDb(
        get_workflow_identity_for_command={"workflow_run_id": "workflow-1"},
        get_workflow_step_details=rollout_diff().to_body(),
    )

    outs = run_handler(worker.on_rollout_diagnosed, failed_rollout(), db)

    assert outs == []
    assert db.calls == []


def test_auto_revert_flag_on_does_not_emit_for_observe(monkeypatch) -> None:
    monkeypatch.setenv("RECOVERY_ENABLE_AUTO_REVERT_PR", "true")
    worker = load_service("gitops/auto-revert-worker")
    db = SpyDb()

    outs = run_handler(
        worker.on_rollout_diagnosed,
        failed_rollout(next_action="observe"),
        db,
    )

    assert outs == []
    assert db.calls == []


def test_auto_revert_flag_on_emits_previous_image_safe_pr(monkeypatch) -> None:
    monkeypatch.setenv("RECOVERY_ENABLE_AUTO_REVERT_PR", "1")
    worker = load_service("gitops/auto-revert-worker")
    db = SpyDb(
        get_workflow_identity_for_command={
            "workflow_run_id": "workflow-1",
            "workspace_id": "workspace-1",
            "application_id": "app-1",
            "binding_id": "binding-1",
            "environment": "sandbox",
            "cluster_id": "cluster-1",
            "commit_sha": "bad-commit",
        },
        get_workflow_step_details=rollout_diff().to_body(),
        get_application=registered_application(),
    )

    outs = run_handler(worker.on_rollout_diagnosed, failed_rollout(), db)

    assert subjects_of(outs) == ["safe_pr.requested"]
    request = outs[0]
    assert request.title == "[auto-revert] checkout-api rollout recovery"
    assert request.provider == "github"
    assert request.workspace_id == "workspace-1"
    assert request.repository_id == "repo-1"
    assert request.binding_id == "binding-1"
    assert request.application_id == "app-1"
    assert request.workflow_run_id == "workflow-1"
    assert request.manifest_path == "deploy/checkout-api.yaml"
    assert request.repo_ref == "project/repo"
    assert request.base_branch == "main"
    assert request.commit_sha == "bad-commit"
    assert "deployment rollout not ready" in request.body
    assert "manual_review" in request.body
    assert len(request.patches) == 1
    assert request.patches[0].path == "deploy/checkout-api.yaml"
    manifest = yaml.safe_load(request.patches[0].content)
    assert manifest["spec"]["template"]["spec"]["containers"][0]["image"] == (
        "ghcr.io/project/checkout-api:v1"
    )
    assert [call[0] for call in db.calls] == [
        "get_workflow_identity_for_command",
        "get_workflow_step_details",
        "get_application",
    ]

    safe_pr_worker = load_service("gitops/safe-pr-worker")
    prepared = run_handler(safe_pr_worker.on_safe_pr_requested, request)
    assert subjects_of(prepared) == ["safe_pr.patch_prepared"]


def test_auto_revert_fails_closed_without_previous_image_context(monkeypatch) -> None:
    monkeypatch.setenv("RECOVERY_ENABLE_AUTO_REVERT_PR", "yes")
    worker = load_service("gitops/auto-revert-worker")
    db = SpyDb(
        get_workflow_identity_for_command={"workflow_run_id": "workflow-1"},
        get_workflow_step_details=None,
    )

    outs = run_handler(worker.on_rollout_diagnosed, failed_rollout(), db)

    assert outs == []


@pytest.mark.parametrize("previous_image", ["unknown", "resource-not-inspected"])
def test_auto_revert_fails_closed_without_known_previous_image(monkeypatch, previous_image) -> None:
    monkeypatch.setenv("RECOVERY_ENABLE_AUTO_REVERT_PR", "true")
    worker = load_service("gitops/auto-revert-worker")
    diff = rollout_diff().to_body()
    diff["actual_image"] = previous_image
    diff["changes"][0]["before"] = previous_image
    db = SpyDb(
        get_workflow_identity_for_command={
            "workflow_run_id": "workflow-1",
            "workspace_id": "workspace-1",
            "application_id": "app-1",
            "binding_id": "binding-1",
            "environment": "sandbox",
            "cluster_id": "cluster-1",
            "commit_sha": "bad-commit",
        },
        get_workflow_step_details=diff,
        get_application=registered_application(),
    )

    outs = run_handler(worker.on_rollout_diagnosed, failed_rollout(), db)

    assert outs == []


@pytest.mark.parametrize(
    "missing_field",
    [
        "repository_id",
        "binding_id",
        "application_id",
        "workflow_run_id",
        "manifest_path",
        "repo_ref",
        "base_branch",
        "commit_sha",
    ],
)
def test_auto_revert_fails_closed_when_pr_target_is_incomplete(monkeypatch, missing_field) -> None:
    monkeypatch.setenv("RECOVERY_ENABLE_AUTO_REVERT_PR", "true")
    worker = load_service("gitops/auto-revert-worker")
    diff = rollout_diff().to_body()
    application = registered_application()
    identity = {
        "workflow_run_id": "workflow-1",
        "workspace_id": "workspace-1",
        "application_id": "app-1",
        "binding_id": "binding-1",
        "environment": "sandbox",
        "cluster_id": "cluster-1",
        "commit_sha": "bad-commit",
    }
    if missing_field in {"binding_id", "application_id", "workflow_run_id"}:
        diff[missing_field] = ""
        identity[missing_field] = ""
    elif missing_field in {"repository_id", "manifest_path"}:
        diff[missing_field] = ""
        application[missing_field] = ""
    elif missing_field == "repo_ref":
        application["repo_ref"] = ""
    elif missing_field == "base_branch":
        application["default_branch"] = ""
    else:
        identity["commit_sha"] = ""
    db = SpyDb(
        get_workflow_identity_for_command=identity,
        get_workflow_step_details=diff,
        get_application=application,
    )

    outs = run_handler(worker.on_rollout_diagnosed, failed_rollout(), db)

    assert outs == []


def test_auto_revert_rejects_workspace_mismatch_even_when_diff_matches_event(monkeypatch) -> None:
    monkeypatch.setenv("RECOVERY_ENABLE_AUTO_REVERT_PR", "true")
    worker = load_service("gitops/auto-revert-worker")
    db = SpyDb(
        get_workflow_identity_for_command={
            "workflow_run_id": "workflow-1",
            "workspace_id": "workspace-other",
            "application_id": "app-1",
            "binding_id": "binding-1",
            "environment": "sandbox",
            "cluster_id": "cluster-1",
            "commit_sha": "bad-commit",
        },
        get_workflow_step_details=rollout_diff().to_body(),
    )

    outs = run_handler(worker.on_rollout_diagnosed, failed_rollout(), db)

    assert outs == []
    assert [call[0] for call in db.calls] == ["get_workflow_identity_for_command"]


@pytest.mark.parametrize("identity_field", ["application_id", "binding_id", "workflow_run_id"])
def test_auto_revert_rejects_diff_identity_mismatch(monkeypatch, identity_field) -> None:
    monkeypatch.setenv("RECOVERY_ENABLE_AUTO_REVERT_PR", "true")
    worker = load_service("gitops/auto-revert-worker")
    identity = {
        "workflow_run_id": "workflow-1",
        "workspace_id": "workspace-1",
        "application_id": "app-1",
        "binding_id": "binding-1",
        "environment": "sandbox",
        "cluster_id": "cluster-1",
        "commit_sha": "bad-commit",
    }
    identity[identity_field] = f"other-{identity_field}"
    db = SpyDb(
        get_workflow_identity_for_command=identity,
        get_workflow_step_details=rollout_diff().to_body(),
        get_application=registered_application(),
    )

    outs = run_handler(worker.on_rollout_diagnosed, failed_rollout(), db)

    assert outs == []


def test_auto_revert_deployment_defaults_flag_off() -> None:
    deployment = yaml.safe_load(
        (ROOT / "deploy/management/auto-revert-worker.yaml").read_text(encoding="utf-8")
    )
    container = deployment["spec"]["template"]["spec"]["containers"][0]
    environment = {item["name"]: item["value"] for item in container["env"]}

    assert environment["RECOVERY_ENABLE_AUTO_REVERT_PR"] == "false"

from __future__ import annotations

from pathlib import Path

import pytest
import yaml
from conftest import SpyDb, load_service, run_handler, subjects_of

from domains.gitops.events import Diff
from domains.gitops.source_patch import canonical_manifest_digest, parse_image_patch_plan
from domains.rca.events import RolloutDiagnosedBody
from packages.config.constants import RiskLevel

ROOT = Path(__file__).resolve().parents[1]


def desired_manifest() -> dict[str, object]:
    return {
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
    }


ARTIFACT_DIGEST = canonical_manifest_digest(desired_manifest())
SOURCE_MANIFEST_DIGEST = ARTIFACT_DIGEST
COMMIT_SHA = "b" * 40


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
        desired_manifest=desired_manifest(),
        changes=[
            {
                "field_path": "spec.template.spec.containers[name=checkout-api].image",
                "old_desired": "ghcr.io/project/checkout-api:v1",
                "live": "ghcr.io/project/checkout-api:v1",
                "new_desired": "ghcr.io/project/checkout-api:v2",
                "before": "ghcr.io/project/checkout-api:v1",
                "after": "ghcr.io/project/checkout-api:v2",
                "classification": "changed",
            }
        ],
        basis={
            "policy_source": "stored-workflow-diff",
            "old_desired_source": "last_approved_snapshot",
            "artifact_digest": ARTIFACT_DIGEST,
        },
    )


def registered_application() -> dict[str, object]:
    return {
        "workspace_id": "workspace-1",
        "application_id": "app-1",
        "name": "checkout-api",
        "repository_id": "repo-1",
        "manifest_path": "deploy/checkout-api.yaml",
        "repo_ref": "project/repo",
        "default_branch": "main",
        "metadata": {"source_type": "raw-yaml"},
    }


def registered_binding(*, source_type: str = "raw-yaml") -> dict[str, object]:
    return {
        "workspace_id": "workspace-1",
        "repository_id": "repo-1",
        "binding_id": "binding-1",
        "application_id": "app-1",
        "app_name": "checkout-api",
        "manifest_path": "deploy/checkout-api.yaml",
        "environment": "sandbox",
        "cluster_id": "cluster-1",
        "status": "active",
        "deploy_policy": {"manifest_source": source_type},
    }


def manifest_source_summary(
    *,
    source_type: str = "raw-yaml",
    source_origin: str = "github_contents",
    source_is_file: bool = True,
    source_document_count: int = 1,
    manifest_path: str = "deploy/checkout-api.yaml",
    branch: str = "main",
) -> dict[str, object]:
    return {
        "workspace_id": "workspace-1",
        "repository_id": "repo-1",
        "binding_id": "binding-1",
        "application_id": "app-1",
        "workflow_run_id": "workflow-1",
        "commit_sha": COMMIT_SHA,
        "manifest_path": manifest_path,
        "repo_ref": "project/repo",
        "branch": branch,
        "source_type": source_type,
        "source_origin": source_origin,
        "source_is_file": source_is_file,
        "source_document_count": source_document_count,
        "artifact_count": source_document_count,
        "artifact_manifest_path": f"{manifest_path}#deployment/checkout-api",
        "artifact_digest": ARTIFACT_DIGEST,
        "source_manifest_sha256": SOURCE_MANIFEST_DIGEST,
        "environment": "sandbox",
        "cluster_id": "cluster-1",
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
            "commit_sha": COMMIT_SHA,
        },
        get_workflow_step_details=rollout_diff().to_body(),
        get_application=registered_application(),
        get_deployment_binding=registered_binding(),
        get_manifest_artifact_provenance=manifest_source_summary(),
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
    assert request.commit_sha == COMMIT_SHA
    assert "deployment rollout not ready" in request.body
    assert "manual_review" in request.body
    assert len(request.patches) == 1
    patch = request.patches[0]
    assert patch.path.startswith(".gitops/safe-pr/patches/")
    assert patch.path.endswith(".yaml")
    plan = parse_image_patch_plan(patch.content)
    assert plan is not None
    assert plan.expected_base_sha == COMMIT_SHA
    assert plan.source_manifest_sha256 == SOURCE_MANIFEST_DIGEST
    assert plan.manifest_path == "deploy/checkout-api.yaml"
    assert plan.replacements[0].container_name == "checkout-api"
    assert plan.replacements[0].current_image == "ghcr.io/project/checkout-api:v2"
    assert plan.replacements[0].previous_image == "ghcr.io/project/checkout-api:v1"
    assert "apiVersion: apps/v1" not in patch.content
    assert "kind: Deployment" not in patch.content
    assert [call[0] for call in db.calls] == [
        "get_workflow_identity_for_command",
        "get_workflow_step_details",
        "get_application",
        "get_deployment_binding",
        "get_manifest_artifact_provenance",
    ]

    safe_pr_worker = load_service("gitops/safe-pr-worker")
    prepared = run_handler(safe_pr_worker.on_safe_pr_requested, request)
    assert subjects_of(prepared) == ["safe_pr.patch_prepared"]
    assert prepared[0].request["patches"][0]["content"] == patch.content


def test_auto_revert_prefers_last_approved_image_over_live_drift(monkeypatch) -> None:
    monkeypatch.setenv("RECOVERY_ENABLE_AUTO_REVERT_PR", "true")
    worker = load_service("gitops/auto-revert-worker")
    diff = rollout_diff().to_body()
    diff["actual_image"] = "ghcr.io/project/checkout-api:drift"
    diff["changes"][0].update(
        {
            "classification": "conflict",
            "old_desired": "ghcr.io/project/checkout-api:v1",
            "live": "ghcr.io/project/checkout-api:drift",
            "before": "ghcr.io/project/checkout-api:drift",
        }
    )
    diff["basis"]["old_desired_source"] = "last_approved_snapshot"
    db = SpyDb(
        get_workflow_identity_for_command={
            "workflow_run_id": "workflow-1",
            "workspace_id": "workspace-1",
            "application_id": "app-1",
            "binding_id": "binding-1",
            "environment": "sandbox",
            "cluster_id": "cluster-1",
            "commit_sha": COMMIT_SHA,
        },
        get_workflow_step_details=diff,
        get_application=registered_application(),
        get_deployment_binding=registered_binding(),
        get_manifest_artifact_provenance=manifest_source_summary(),
    )

    outs = run_handler(worker.on_rollout_diagnosed, failed_rollout(), db)

    assert subjects_of(outs) == ["safe_pr.requested"]
    plan = parse_image_patch_plan(outs[0].patches[0].content)
    assert plan is not None
    assert plan.replacements[0].previous_image == "ghcr.io/project/checkout-api:v1"
    assert "previous_healthy_image: `ghcr.io/project/checkout-api:v1`" in outs[0].body
    assert "ghcr.io/project/checkout-api:drift" not in outs[0].body


@pytest.mark.parametrize(
    ("source_type", "source_origin", "source_is_file", "source_document_count"),
    [
        ("helm", "github_tree", False, 1),
        ("kustomize", "github_tree", False, 1),
        ("raw-yaml", "github_contents", False, 1),
        ("raw-yaml", "github_contents", True, 2),
        ("raw-yaml", "local_path", True, 1),
    ],
)
def test_auto_revert_fails_closed_for_non_roundtrippable_manifest_source(
    monkeypatch,
    source_type,
    source_origin,
    source_is_file,
    source_document_count,
) -> None:
    monkeypatch.setenv("RECOVERY_ENABLE_AUTO_REVERT_PR", "true")
    worker = load_service("gitops/auto-revert-worker")
    db = SpyDb(
        get_workflow_identity_for_command={
            "workflow_run_id": "workflow-1",
            "workspace_id": "workspace-1",
            "application_id": "app-1",
            "binding_id": "binding-1",
            "environment": "sandbox",
            "cluster_id": "cluster-1",
            "commit_sha": COMMIT_SHA,
        },
        get_workflow_step_details=rollout_diff().to_body(),
        get_application={
            **registered_application(),
            "metadata": {"source_type": source_type},
        },
        get_deployment_binding=registered_binding(source_type=source_type),
        get_manifest_artifact_provenance=manifest_source_summary(
            source_type=source_type,
            source_origin=source_origin,
            source_is_file=source_is_file,
            source_document_count=source_document_count,
        ),
    )

    outs = run_handler(worker.on_rollout_diagnosed, failed_rollout(), db)

    assert outs == []


def test_auto_revert_fails_closed_for_raw_json_until_fallback_is_lossless(monkeypatch) -> None:
    monkeypatch.setenv("RECOVERY_ENABLE_AUTO_REVERT_PR", "true")
    worker = load_service("gitops/auto-revert-worker")
    diff = rollout_diff().to_body()
    diff["manifest_path"] = "deploy/checkout-api.json"
    application = {
        **registered_application(),
        "manifest_path": "deploy/checkout-api.json",
        "metadata": {"source_type": "raw-json"},
    }
    binding = {
        **registered_binding(source_type="raw-json"),
        "manifest_path": "deploy/checkout-api.json",
    }
    db = SpyDb(
        get_workflow_identity_for_command={
            "workflow_run_id": "workflow-1",
            "workspace_id": "workspace-1",
            "application_id": "app-1",
            "binding_id": "binding-1",
            "environment": "sandbox",
            "cluster_id": "cluster-1",
            "commit_sha": COMMIT_SHA,
        },
        get_workflow_step_details=diff,
        get_application=application,
        get_deployment_binding=binding,
        get_manifest_artifact_provenance=manifest_source_summary(
            source_type="raw-json",
            manifest_path="deploy/checkout-api.json",
        ),
    )

    outs = run_handler(worker.on_rollout_diagnosed, failed_rollout(), db)

    assert outs == []


def test_auto_revert_targets_commit_provenance_branch_not_repository_default(monkeypatch) -> None:
    monkeypatch.setenv("RECOVERY_ENABLE_AUTO_REVERT_PR", "true")
    worker = load_service("gitops/auto-revert-worker")
    db = SpyDb(
        get_workflow_identity_for_command={
            "workflow_run_id": "workflow-1",
            "workspace_id": "workspace-1",
            "application_id": "app-1",
            "binding_id": "binding-1",
            "environment": "sandbox",
            "cluster_id": "cluster-1",
            "commit_sha": COMMIT_SHA,
        },
        get_workflow_step_details=rollout_diff().to_body(),
        get_application=registered_application(),
        get_deployment_binding=registered_binding(),
        get_manifest_artifact_provenance=manifest_source_summary(branch="release/staging"),
    )

    outs = run_handler(worker.on_rollout_diagnosed, failed_rollout(), db)

    assert subjects_of(outs) == ["safe_pr.requested"]
    assert outs[0].base_branch == "release/staging"


@pytest.mark.parametrize(
    "field",
    [
        "workspace_id",
        "repository_id",
        "binding_id",
        "application_id",
        "workflow_run_id",
        "commit_sha",
        "manifest_path",
        "artifact_manifest_path",
        "artifact_digest",
        "source_type",
        "source_origin",
        "source_manifest_sha256",
        "environment",
        "cluster_id",
    ],
)
def test_auto_revert_rejects_manifest_provenance_identity_mismatch(monkeypatch, field) -> None:
    monkeypatch.setenv("RECOVERY_ENABLE_AUTO_REVERT_PR", "true")
    worker = load_service("gitops/auto-revert-worker")
    provenance = manifest_source_summary()
    provenance[field] = f"other-{field}"
    db = SpyDb(
        get_workflow_identity_for_command={
            "workflow_run_id": "workflow-1",
            "workspace_id": "workspace-1",
            "application_id": "app-1",
            "binding_id": "binding-1",
            "environment": "sandbox",
            "cluster_id": "cluster-1",
            "commit_sha": COMMIT_SHA,
        },
        get_workflow_step_details=rollout_diff().to_body(),
        get_application=registered_application(),
        get_deployment_binding=registered_binding(),
        get_manifest_artifact_provenance=provenance,
    )

    outs = run_handler(worker.on_rollout_diagnosed, failed_rollout(), db)

    assert outs == []


def test_auto_revert_rejects_desired_manifest_not_bound_to_artifact_digest(monkeypatch) -> None:
    monkeypatch.setenv("RECOVERY_ENABLE_AUTO_REVERT_PR", "true")
    worker = load_service("gitops/auto-revert-worker")
    diff = rollout_diff().to_body()
    diff["desired_manifest"]["metadata"]["annotations"] = {"unexpected": "stale"}
    db = SpyDb(
        get_workflow_identity_for_command={
            "workflow_run_id": "workflow-1",
            "workspace_id": "workspace-1",
            "application_id": "app-1",
            "binding_id": "binding-1",
            "environment": "sandbox",
            "cluster_id": "cluster-1",
            "commit_sha": COMMIT_SHA,
        },
        get_workflow_step_details=diff,
        get_application=registered_application(),
        get_deployment_binding=registered_binding(),
        get_manifest_artifact_provenance=manifest_source_summary(),
    )

    outs = run_handler(worker.on_rollout_diagnosed, failed_rollout(), db)

    assert outs == []


@pytest.mark.parametrize("reference_only", [False, True])
def test_auto_revert_never_emits_literal_secret_values(monkeypatch, reference_only) -> None:
    monkeypatch.setenv("RECOVERY_ENABLE_AUTO_REVERT_PR", "true")
    worker = load_service("gitops/auto-revert-worker")
    diff = rollout_diff().to_body()
    container = diff["desired_manifest"]["spec"]["template"]["spec"]["containers"][0]
    if reference_only:
        container["env"] = [
            {
                "name": "AWS_SECRET_ACCESS_KEY",
                "valueFrom": {"secretKeyRef": {"name": "checkout-secret", "key": "api-token"}},
            }
        ]
    else:
        container["env"] = [{"name": "AWS_SECRET_ACCESS_KEY", "value": "sentinel-super-secret"}]
    digest = canonical_manifest_digest(diff["desired_manifest"])
    diff["basis"]["artifact_digest"] = digest
    provenance = manifest_source_summary()
    provenance["artifact_digest"] = digest
    provenance["source_manifest_sha256"] = digest
    db = SpyDb(
        get_workflow_identity_for_command={
            "workflow_run_id": "workflow-1",
            "workspace_id": "workspace-1",
            "application_id": "app-1",
            "binding_id": "binding-1",
            "environment": "sandbox",
            "cluster_id": "cluster-1",
            "commit_sha": COMMIT_SHA,
        },
        get_workflow_step_details=diff,
        get_application=registered_application(),
        get_deployment_binding=registered_binding(),
        get_manifest_artifact_provenance=provenance,
    )

    outs = run_handler(worker.on_rollout_diagnosed, failed_rollout(), db)

    if reference_only:
        assert subjects_of(outs) == ["safe_pr.requested"]
        assert "secretKeyRef" not in outs[0].patches[0].content
    else:
        assert outs == []
        assert "sentinel-super-secret" not in repr(outs)


def test_auto_revert_allows_safe_boolean_token_setting(monkeypatch) -> None:
    monkeypatch.setenv("RECOVERY_ENABLE_AUTO_REVERT_PR", "true")
    worker = load_service("gitops/auto-revert-worker")
    diff = rollout_diff().to_body()
    pod_spec = diff["desired_manifest"]["spec"]["template"]["spec"]
    pod_spec["automountServiceAccountToken"] = False
    digest = canonical_manifest_digest(diff["desired_manifest"])
    diff["basis"]["artifact_digest"] = digest
    provenance = manifest_source_summary()
    provenance["artifact_digest"] = digest
    provenance["source_manifest_sha256"] = digest
    db = SpyDb(
        get_workflow_identity_for_command={
            "workflow_run_id": "workflow-1",
            "workspace_id": "workspace-1",
            "application_id": "app-1",
            "binding_id": "binding-1",
            "environment": "sandbox",
            "cluster_id": "cluster-1",
            "commit_sha": COMMIT_SHA,
        },
        get_workflow_step_details=diff,
        get_application=registered_application(),
        get_deployment_binding=registered_binding(),
        get_manifest_artifact_provenance=provenance,
    )

    outs = run_handler(worker.on_rollout_diagnosed, failed_rollout(), db)

    assert subjects_of(outs) == ["safe_pr.requested"]


def test_auto_revert_instruction_never_serializes_credential_uri(monkeypatch) -> None:
    monkeypatch.setenv("RECOVERY_ENABLE_AUTO_REVERT_PR", "true")
    worker = load_service("gitops/auto-revert-worker")
    diff = rollout_diff().to_body()
    secret = "postgresql://prod:sentinel-password@db/prod"
    container = diff["desired_manifest"]["spec"]["template"]["spec"]["containers"][0]
    container["env"] = [{"name": "DATABASE_URL", "value": secret}]
    digest = canonical_manifest_digest(diff["desired_manifest"])
    diff["basis"]["artifact_digest"] = digest
    provenance = manifest_source_summary()
    provenance["artifact_digest"] = digest
    provenance["source_manifest_sha256"] = digest
    db = SpyDb(
        get_workflow_identity_for_command={
            "workflow_run_id": "workflow-1",
            "workspace_id": "workspace-1",
            "application_id": "app-1",
            "binding_id": "binding-1",
            "environment": "sandbox",
            "cluster_id": "cluster-1",
            "commit_sha": COMMIT_SHA,
        },
        get_workflow_step_details=diff,
        get_application=registered_application(),
        get_deployment_binding=registered_binding(),
        get_manifest_artifact_provenance=provenance,
    )

    outs = run_handler(worker.on_rollout_diagnosed, failed_rollout(), db)

    assert subjects_of(outs) == ["safe_pr.requested"]
    assert secret not in repr(outs)
    assert secret not in outs[0].patches[0].content


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
    diff["changes"][0]["old_desired"] = previous_image
    db = SpyDb(
        get_workflow_identity_for_command={
            "workflow_run_id": "workflow-1",
            "workspace_id": "workspace-1",
            "application_id": "app-1",
            "binding_id": "binding-1",
            "environment": "sandbox",
            "cluster_id": "cluster-1",
            "commit_sha": COMMIT_SHA,
        },
        get_workflow_step_details=diff,
        get_application=registered_application(),
        get_deployment_binding=registered_binding(),
        get_manifest_artifact_provenance=manifest_source_summary(),
    )

    outs = run_handler(worker.on_rollout_diagnosed, failed_rollout(), db)

    assert outs == []


def test_auto_revert_rejects_live_drift_without_approved_snapshot(monkeypatch) -> None:
    monkeypatch.setenv("RECOVERY_ENABLE_AUTO_REVERT_PR", "true")
    worker = load_service("gitops/auto-revert-worker")
    diff = rollout_diff().to_body()
    diff["actual_image"] = "ghcr.io/project/checkout-api:drift"
    diff["basis"]["old_desired_source"] = "missing_last_approved_snapshot"
    diff["changes"][0].pop("old_desired")
    diff["changes"][0]["before"] = "ghcr.io/project/checkout-api:drift"
    diff["changes"][0]["live"] = "ghcr.io/project/checkout-api:drift"
    db = SpyDb(
        get_workflow_identity_for_command={
            "workflow_run_id": "workflow-1",
            "workspace_id": "workspace-1",
            "application_id": "app-1",
            "binding_id": "binding-1",
            "environment": "sandbox",
            "cluster_id": "cluster-1",
            "commit_sha": COMMIT_SHA,
        },
        get_workflow_step_details=diff,
        get_application=registered_application(),
        get_deployment_binding=registered_binding(),
        get_manifest_artifact_provenance=manifest_source_summary(),
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
        "commit_sha": COMMIT_SHA,
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
            "commit_sha": COMMIT_SHA,
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
        "commit_sha": COMMIT_SHA,
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

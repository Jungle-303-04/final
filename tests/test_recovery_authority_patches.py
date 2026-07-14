from __future__ import annotations

import asyncio
import json
import subprocess
from copy import deepcopy
from dataclasses import replace
from pathlib import Path

import pytest

from domains.gitops.source_patch import canonical_manifest_digest, parse_scalar_patch_plan
from domains.rca.events import (
    HealingActionDraft,
    RecoveryActionCandidate,
    RecoveryActionSelectedBody,
    RecoveryPlan,
)
from domains.scm.events import SafePrRequestedBody
from packages.contracts.gitops_authority import (
    GitOpsAuthorityContext,
    GitOpsAuthorityQuery,
)
from services.ai.agent.recovery.authority import DatabaseGitOpsAuthorityReadPort
from services.ai.agent.recovery.catalog import registered_recovery_rules
from services.ai.agent.recovery.dispatch import RecoveryDispatcher

BASE_SHA = "a" * 40
ROOT = Path(__file__).resolve().parents[1]


class FakeAuthorityPort:
    def __init__(self, context: GitOpsAuthorityContext | None) -> None:
        self.context = context
        self.queries: list[GitOpsAuthorityQuery] = []

    async def load_authority(self, query: GitOpsAuthorityQuery) -> GitOpsAuthorityContext | None:
        self.queries.append(query)
        return self.context


class FakeAuthorityDb:
    def __init__(self) -> None:
        manifest = desired_manifest()
        digest = canonical_manifest_digest(manifest)
        self.evidence = {
            "gitops_change_context": {
                "workspace_id": "workspace-1",
                "repository_id": "repo-1",
                "binding_id": "binding-1",
                "application_id": "app-1",
                "workflow_run_id": "workflow-1",
                "environment": "sandbox",
                "cluster_id": "cluster-1",
                "commit_sha": BASE_SHA,
                "manifest_path": "deploy/app.yaml",
                "repo_ref": "project/repo",
                "branch": "main",
                "resource": "deployment/checkout-api",
            },
            "rca_bundle": {"metrics": {"container_memory_working_set_bytes": 600 * 1024**2}},
        }
        self.run = {
            "workflow_run_id": "workflow-1",
            "workspace_id": "workspace-1",
            "application_id": "app-1",
            "binding_id": "binding-1",
            "environment": "sandbox",
            "commit_sha": BASE_SHA,
        }
        self.diff = {
            "workspace_id": "workspace-1",
            "repository_id": "repo-1",
            "binding_id": "binding-1",
            "application_id": "app-1",
            "workflow_run_id": "workflow-1",
            "environment": "sandbox",
            "manifest_path": "deploy/app.yaml",
            "namespace": "sandbox",
            "resource": "deployment/checkout-api",
            "desired_manifest": manifest,
            "basis": {
                "old_desired_source": "last_approved_snapshot",
                "artifact_digest": digest,
            },
            "changes": [
                {
                    "field_path": "spec.template.spec.containers[name=checkout-api].image",
                    "old_desired": "ghcr.io/project/checkout-api:v1",
                    "new_desired": "ghcr.io/project/checkout-api:v2",
                }
            ],
        }
        self.application = {
            "application_id": "app-1",
            "workspace_id": "workspace-1",
            "repository_id": "repo-1",
            "name": "checkout-api",
            "manifest_path": "deploy/app.yaml",
            "repo_ref": "project/repo",
            "default_branch": "main",
        }
        self.binding = {
            "workspace_id": "workspace-1",
            "binding_id": "binding-1",
            "repository_id": "repo-1",
            "cluster_id": "cluster-1",
            "namespace": "sandbox",
            "manifest_path": "deploy/app.yaml",
            "environment": "sandbox",
            "status": "active",
        }
        self.provenance = {
            "workspace_id": "workspace-1",
            "repository_id": "repo-1",
            "binding_id": "binding-1",
            "application_id": "app-1",
            "workflow_run_id": "workflow-1",
            "environment": "sandbox",
            "commit_sha": BASE_SHA,
            "manifest_path": "deploy/app.yaml",
            "artifact_digest": digest,
            "repo_ref": "project/repo",
            "branch": "main",
            "source_type": "raw-yaml",
            "source_origin": "github_contents",
            "source_is_file": True,
            "source_document_count": 1,
            "artifact_count": 1,
            "source_manifest_sha256": digest,
        }

    async def get_evidence_payload(self, _workspace: str, _correlation: str, kind: str):
        return self.evidence.get(kind)

    async def get_workflow_run(self, _workflow_run_id: str):
        return self.run

    async def get_workflow_step_details(self, _workflow_run_id: str, _name: str):
        return self.diff

    async def get_application(self, _workspace: str, _application_id: str):
        return self.application

    async def get_deployment_binding(self, _workspace: str, _binding_id: str):
        return self.binding

    async def get_manifest_artifact_provenance(self, *_args):
        return self.provenance


def desired_manifest() -> dict[str, object]:
    return {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {"name": "checkout-api"},
        "spec": {
            "replicas": 2,
            "selector": {"matchLabels": {"app": "checkout-old"}},
            "template": {
                "metadata": {"labels": {"app": "checkout-api"}},
                "spec": {
                    "containers": [
                        {
                            "name": "checkout-api",
                            "image": "ghcr.io/project/checkout-api:v2",
                            "resources": {
                                "requests": {"memory": "256Mi"},
                                "limits": {"memory": "512Mi"},
                            },
                            "readinessProbe": {
                                "httpGet": {"path": "/health", "port": 8080},
                                "timeoutSeconds": 1,
                            },
                        }
                    ]
                },
            },
        },
    }


def authority_context() -> GitOpsAuthorityContext:
    manifest = desired_manifest()
    return GitOpsAuthorityContext(
        workspace_id="workspace-1",
        repository_id="repo-1",
        binding_id="binding-1",
        application_id="app-1",
        workflow_run_id="workflow-1",
        environment="sandbox",
        cluster_id="cluster-1",
        manifest_path="deploy/app.yaml",
        repo_ref="project/repo",
        base_branch="main",
        commit_sha=BASE_SHA,
        source_type="raw-yaml",
        source_manifest_sha256=canonical_manifest_digest(manifest),
        resource="deployment/checkout-api",
        desired_manifest=manifest,
        changes=(
            {
                "field_path": "spec.template.spec.containers[name=checkout-api].image",
                "old_desired": "ghcr.io/project/checkout-api:v1",
                "new_desired": "ghcr.io/project/checkout-api:v2",
            },
        ),
        evidence={"metrics": {"container_memory_working_set_bytes": 600 * 1024**2}},
    )


def selected_event(action_type: str) -> RecoveryActionSelectedBody:
    draft = HealingActionDraft(
        action_type=action_type,
        namespace="sandbox",
        resource_kind="Deployment",
        resource_name="checkout-api",
        reason="verified recovery",
        risk_level="medium",
        dry_run=True,
        source_evidence=["evidence-1"],
        params={"root_cause": "test-cause"},
    )
    candidate = RecoveryActionCandidate(
        action_id=f"action:{action_type}",
        title=f"{action_type} patch",
        description="generate an authority-pinned patch",
        draft=draft,
        route="draft_pr",
        rank=1,
        score=0.8,
        risk_level="medium",
        blast_radius="target_workload",
        approval_required=True,
        prerequisites=["authority context"],
        validation_checks=["workload ready"],
        rollback_plan="apply the inverse rollback patch",
        evidence_refs=["evidence-1"],
    )
    plan = RecoveryPlan(
        plan_id="plan-1",
        incident_id="incident-1",
        evidence_ref="object://evidence/corr-1.json",
        summary="verified diagnosis",
        target={
            "workspace_id": "workspace-1",
            "cluster_id": "cluster-1",
            "namespace": "sandbox",
            "resource_kind": "Deployment",
            "resource_name": "checkout-api",
        },
        recommended_action_id=candidate.action_id,
        execution_route="draft_pr",
        selection_required=True,
        candidates=[candidate],
    )
    return RecoveryActionSelectedBody(
        plan=plan,
        selected=candidate,
        selected_by="operator-1",
        auto_selected=False,
        reason="approved",
        workspace_id="workspace-1",
    )


@pytest.mark.parametrize(
    ("action_type", "expected_paths"),
    [
        (
            "oom_memory",
            {
                "spec.template.spec.containers[name=checkout-api].resources.requests.memory",
                "spec.template.spec.containers[name=checkout-api].resources.limits.memory",
            },
        ),
        (
            "image_rollback",
            {"spec.template.spec.containers[name=checkout-api].image"},
        ),
        (
            "image_tag_fix",
            {"spec.template.spec.containers[name=checkout-api].image"},
        ),
        ("replica_scale", {"spec.replicas"}),
        (
            "probe_fix",
            {"spec.template.spec.containers[name=checkout-api].readinessProbe.timeoutSeconds"},
        ),
        ("selector_fix", {"spec.selector.matchLabels.app"}),
    ],
)
def test_dispatcher_generates_six_authority_pinned_patch_types(
    action_type: str,
    expected_paths: set[str],
) -> None:
    port = FakeAuthorityPort(authority_context())
    event = selected_event(action_type)

    body = asyncio.run(
        RecoveryDispatcher().dispatch_body(
            event,
            authority=port,
            correlation_id="corr-1",
        )
    )

    assert isinstance(body, SafePrRequestedBody)
    assert body.pr_kind == "safe_pr_patch"
    assert body.repository_id == "repo-1"
    assert body.binding_id == "binding-1"
    assert body.commit_sha == BASE_SHA
    assert len(body.patches) == 1
    patch_plan = parse_scalar_patch_plan(body.patches[0].content)
    assert patch_plan is not None
    assert patch_plan.action_type == action_type
    assert {item.field_path for item in patch_plan.replacements} == expected_paths
    assert {
        (item.field_path, item.current_value, item.desired_value)
        for item in patch_plan.rollback_replacements
    } == {
        (item.field_path, item.desired_value, item.current_value)
        for item in patch_plan.replacements
    }
    assert port.queries == [
        GitOpsAuthorityQuery(
            correlation_id="corr-1",
            workspace_id="workspace-1",
            incident_id="incident-1",
            cluster_id="cluster-1",
            namespace="sandbox",
            resource_kind="Deployment",
            resource_name="checkout-api",
        )
    ]


def test_dispatcher_returns_unsupported_when_authority_is_unavailable() -> None:
    event = selected_event("image_rollback")

    body = asyncio.run(
        RecoveryDispatcher().dispatch_body(
            event,
            authority=FakeAuthorityPort(None),
            correlation_id="corr-1",
        )
    )

    assert body.__subject__ == "rca.action_required"
    assert body.reason_code == "gitops_authority_unavailable"
    assert body.missing_evidence == ["gitops_authority_context"]


def test_dispatcher_rejects_authority_for_another_cluster() -> None:
    context = replace(authority_context(), cluster_id="cluster-other")

    body = asyncio.run(
        RecoveryDispatcher().dispatch_body(
            selected_event("replica_scale"),
            authority=FakeAuthorityPort(context),
            correlation_id="corr-1",
        )
    )

    assert body.__subject__ == "rca.action_required"
    assert body.reason_code == "gitops_authority_mismatch"


@pytest.mark.parametrize(
    ("field_suffix", "current", "approved"),
    [
        ("readinessProbe.httpGet.path", "/wrong", "/healthz"),
        ("readinessProbe.httpGet.port", 9090, 8080),
    ],
)
def test_probe_fix_restores_approved_path_or_port(
    field_suffix: str,
    current: object,
    approved: object,
) -> None:
    context = authority_context()
    manifest = deepcopy(context.desired_manifest)
    probe = manifest["spec"]["template"]["spec"]["containers"][0]["readinessProbe"]
    target = probe
    parts = field_suffix.split(".")[1:]
    for part in parts[:-1]:
        target = target[part]
    target[parts[-1]] = current
    field_path = f"spec.template.spec.containers[name=checkout-api].{field_suffix}"
    context = replace(
        context,
        desired_manifest=manifest,
        source_manifest_sha256=canonical_manifest_digest(manifest),
        changes=(
            {
                "field_path": field_path,
                "old_desired": approved,
                "new_desired": current,
            },
        ),
    )

    body = asyncio.run(
        RecoveryDispatcher().dispatch_body(
            selected_event("probe_fix"),
            authority=FakeAuthorityPort(context),
            correlation_id="corr-1",
        )
    )

    assert isinstance(body, SafePrRequestedBody)
    patch_plan = parse_scalar_patch_plan(body.patches[0].content)
    assert patch_plan is not None
    assert patch_plan.replacements == (
        type(patch_plan.replacements[0])(field_path, current, approved),
    )


def test_database_port_reloads_and_cross_checks_authority_at_patch_time() -> None:
    query = GitOpsAuthorityQuery(
        correlation_id="corr-1",
        workspace_id="workspace-1",
        incident_id="incident-1",
        cluster_id="cluster-1",
        namespace="sandbox",
        resource_kind="Deployment",
        resource_name="checkout-api",
    )

    context = asyncio.run(DatabaseGitOpsAuthorityReadPort(FakeAuthorityDb()).load_authority(query))

    assert context is not None
    assert context.repository_id == "repo-1"
    assert context.binding_id == "binding-1"
    assert context.commit_sha == BASE_SHA
    assert context.source_manifest_sha256 == canonical_manifest_digest(desired_manifest())
    assert context.evidence["metrics"]["container_memory_working_set_bytes"] == 600 * 1024**2


def test_builtin_catalog_declares_real_patch_actions_and_isolates_review_documents() -> None:
    specs_by_cause = {
        cause: rule.action_specs
        for rule in registered_recovery_rules()
        if hasattr(rule, "root_causes")
        for cause in rule.root_causes
    }

    assert {spec.action_type for spec in specs_by_cause["oom_killed"]} >= {
        "oom_memory",
        "replica_scale",
    }
    assert specs_by_cause["bad_image_rollout"][0].action_type == "image_rollback"
    assert specs_by_cause["wrong_image_tag"][0].action_type == "image_tag_fix"
    assert specs_by_cause["timeout_too_short"][0].action_type == "probe_fix"
    assert specs_by_cause["selector_label_mismatch"][0].action_type == "selector_fix"
    assert all(
        "patch" not in spec.params
        for specs in specs_by_cause.values()
        for spec in specs
        if spec.action_type != "gitops_recovery_review"
    )
    review = next(
        spec
        for spec in specs_by_cause["application_5xx_spike"]
        if spec.action_type == "gitops_recovery_review"
    )
    actual = next(
        spec
        for spec in specs_by_cause["application_5xx_spike"]
        if spec.action_type == "replica_scale"
    )
    assert review.params == {"document_type": "recovery_review"}
    assert review.score < actual.score


def test_static_recovery_patch_scorer_passes_all_six_action_types() -> None:
    result = subprocess.run(
        ["uv", "run", "python", "scripts/verify-recovery-patches.py"],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    summary = json.loads(result.stdout.splitlines()[-1])
    assert summary == {"failed": 0, "passed": 6, "total": 6}

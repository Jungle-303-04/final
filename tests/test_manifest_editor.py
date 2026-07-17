from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from domains.gitops.repository_discovery import RepositoryDiscoveryService
from domains.manifest_editor.router import (
    apply_resource_manifest_now,
    approve_resource_manifest_edit,
    edit_workflow_id,
    ensure_source_is_current,
)
from domains.manifest_editor.validation import (
    ManifestIdentity,
    manifest_sha256,
    validate_manifest_edit,
    validate_manifest_source,
)
from domains.scm.events import SafePrRequestedBody
from domains.scm.pipeline import safe_pr_patch_sha256
from packages.contracts.auth import Actor
from packages.contracts.gateway.requests import (
    ResourceManifestApproveRequest,
    ResourceManifestDirectApplyRequest,
)

SOURCE = """\
apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout-api
  namespace: shop
spec:
  replicas: 2
  selector:
    matchLabels:
      app: checkout-api
  template:
    metadata:
      labels:
        app: checkout-api
    spec:
      containers:
        - name: checkout-api
          image: ghcr.io/project/checkout-api:v2
"""
IDENTITY = ManifestIdentity("apps/v1", "Deployment", "shop", "checkout-api")


def test_manifest_edit_returns_exact_diff_without_rewriting_yaml() -> None:
    desired = SOURCE.replace("replicas: 2", "replicas: 3")

    result = validate_manifest_edit(SOURCE, desired, selected_identity=IDENTITY)

    assert result.valid is True
    assert result.changed is True
    assert result.source_sha256 == manifest_sha256(SOURCE)
    assert result.desired_sha256 == manifest_sha256(desired)
    assert "-  replicas: 2" in result.diff
    assert "+  replicas: 3" in result.diff
    assert "Safe PR or direct apply" in result.warnings[0]


@pytest.mark.parametrize(
    "desired,error",
    [
        (SOURCE.replace("name: checkout-api", "name: checkout-v2", 1), "identities"),
        (SOURCE.replace("kind: Deployment", "kind: Secret", 1), "Secret"),
        (
            SOURCE.replace(
                "image: ghcr.io/project/checkout-api:v2",
                "image: ghcr.io/project/checkout-api:v2\n          env:\n"
                "            - name: DATABASE_PASSWORD\n              value: do-not-print",
            ),
            "secret-like",
        ),
        (SOURCE.replace("replicas: 2", "replicas: &count 2"), "anchors"),
    ],
)
def test_manifest_edit_rejects_unsafe_or_nonlocal_changes_without_diff(
    desired: str, error: str
) -> None:
    result = validate_manifest_edit(SOURCE, desired, selected_identity=IDENTITY)

    assert result.valid is False
    assert any(error in item for item in result.errors)
    assert result.diff == ""


def test_manifest_source_allows_namespace_to_be_supplied_by_binding() -> None:
    source = SOURCE.replace("  namespace: shop\n", "")

    assert validate_manifest_source(source, selected_identity=IDENTITY) == ()


def test_source_pinning_rejects_branch_or_content_drift() -> None:
    with pytest.raises(HTTPException) as error:
        ensure_source_is_current(
            "a" * 40,
            manifest_sha256(SOURCE),
            "b" * 40,
            SOURCE,
        )
    assert error.value.status_code == 409


def test_workflow_identity_is_deterministic_and_authority_bound() -> None:
    source = {
        "application_id": "app-1",
        "binding_id": "binding-1",
    }
    first = edit_workflow_id("workspace-1", "resource-1", source, "a" * 40, manifest_sha256(SOURCE))
    second = edit_workflow_id(
        "workspace-1", "resource-1", source, "a" * 40, manifest_sha256(SOURCE)
    )
    changed = edit_workflow_id(
        "workspace-1", "resource-1", source, "b" * 40, manifest_sha256(SOURCE)
    )

    assert first == second
    assert first != changed
    assert first.startswith("workflow-manifest-edit-")


class ManifestApprovalDb:
    def __init__(self) -> None:
        self.approvals: list[dict[str, object]] = []

    def get_inventory_resource_by_key(
        self, *, workspace_id: str, inventory_key: str
    ) -> dict[str, object] | None:
        assert workspace_id == "workspace-1"
        assert inventory_key == "resource-1"
        return {
            "inventory_key": inventory_key,
            "cluster_id": "cluster-1",
            "api_version": "apps/v1",
            "kind": "Deployment",
            "namespace": "shop",
            "name": "checkout-api",
            "uid": "deployment-uid-1",
        }

    def list_resource_manifest_sources(
        self, *, workspace_id: str, resource_id: str, cluster_id: str
    ) -> list[dict[str, object]]:
        assert (workspace_id, resource_id, cluster_id) == (
            "workspace-1",
            "resource-1",
            "cluster-1",
        )
        return [
            {
                "application_id": "app-1",
                "application_name": "Checkout",
                "repository_id": "repo-1",
                "provider": "github",
                "repo_ref": "project/repo",
                "branch": "main",
                "binding_id": "binding-1",
                "environment": "sandbox",
                "manifest_path": "deploy/checkout.yaml",
                "source_type": "raw-yaml",
            }
        ]

    def can_access(self, *_args: object) -> bool:
        return True

    def request_workflow_approval(self, payload: dict[str, object]) -> None:
        self.approvals.append(payload)

    def list_cluster_agent_statuses(
        self, workspace_id: str, cluster_id: str
    ) -> list[dict[str, object]]:
        assert (workspace_id, cluster_id) == ("workspace-1", "cluster-1")
        return [{"status": "connected", "capabilities": ["command_receiver"]}]

    async def get_agent_command(
        self, _command_id: str, _workspace_id: str
    ) -> dict[str, object] | None:
        return None


class ManifestApprovalClient:
    async def branch_sha(self, repo_ref: str, branch: str) -> str:
        assert (repo_ref, branch) == ("project/repo", "main")
        return "a" * 40

    async def content(self, repo_ref: str, ref: str, path: str) -> bytes:
        assert (repo_ref, ref, path) == (
            "project/repo",
            "a" * 40,
            "deploy/checkout.yaml",
        )
        return SOURCE.encode()


class PinnedManifestClient(ManifestApprovalClient):
    def __init__(self, content: str) -> None:
        self.pinned_content = content

    async def content(self, repo_ref: str, ref: str, path: str) -> bytes:
        assert (repo_ref, ref, path) == (
            "project/repo",
            "a" * 40,
            "deploy/checkout.yaml",
        )
        return self.pinned_content.encode()


class ManifestApprovalEvents:
    def __init__(self) -> None:
        self.body: object | None = None

    async def accept_body(self, body: object, *, actor: Actor, **kwargs: object) -> SimpleNamespace:
        self.body = body
        self.accept_kwargs = kwargs
        assert actor.user_id == "operator-1"
        return SimpleNamespace(
            event=SimpleNamespace(event_id="event-1", correlation_id="correlation-1")
        )


class ManifestOperationEvents:
    def __init__(self) -> None:
        self.published: list[dict[str, object]] = []

    async def publish(self, **payload: object) -> None:
        self.published.append(payload)


def test_approval_records_exact_authority_before_requesting_safe_pr() -> None:
    desired = SOURCE.replace("replicas: 2", "replicas: 3")
    payload = ResourceManifestApproveRequest(
        application_id="app-1",
        base_sha="a" * 40,
        source_sha256=manifest_sha256(SOURCE),
        edited_yaml=desired,
        confirmed=True,
        reason="Scale for the verified peak load",
    )
    db = ManifestApprovalDb()
    events = ManifestApprovalEvents()

    response = asyncio.run(
        approve_resource_manifest_edit(
            "resource-1",
            payload,
            SimpleNamespace(
                workspace_id="workspace-1",
                user_id="operator-1",
                roles=("release_operator",),
            ),
            db,
            events,
            RepositoryDiscoveryService(ManifestApprovalClient()),
        )
    )

    assert response.accepted is True
    assert response.sync_state == "awaiting_pr_merge"
    assert len(db.approvals) == 1
    approval = db.approvals[0]
    request = events.body
    assert approval["status"] == "granted"
    assert approval["requested_by"] == approval["decided_by"] == "operator-1"
    assert isinstance(request, SafePrRequestedBody)
    assert request.pr_kind == "safe_pr_manifest_edit"
    assert request.commit_sha == "a" * 40
    assert request.patches[0].path == "deploy/checkout.yaml"
    assert request.patches[0].content == desired
    assert approval["details"]["source_sha256"] == manifest_sha256(SOURCE)
    assert approval["details"]["desired_sha256"] == manifest_sha256(desired)
    assert approval["details"]["patch_sha256"] == safe_pr_patch_sha256(request.patches)


def test_direct_apply_builds_server_owned_exact_command_and_common_receipt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CONTROL_ALLOWED_NAMESPACES", "shop")
    desired = SOURCE.replace("replicas: 2", "replicas: 3")
    db = ManifestApprovalDb()
    events = ManifestApprovalEvents()
    operation_events = ManifestOperationEvents()

    response = asyncio.run(
        apply_resource_manifest_now(
            "resource-1",
            ResourceManifestDirectApplyRequest(
                application_id="app-1",
                base_sha="a" * 40,
                source_sha256=manifest_sha256(SOURCE),
                edited_yaml=desired,
                expected_desired_sha256=manifest_sha256(desired),
                confirmation=True,
                reason="Apply the inspected replica change",
            ),
            "manifest-idempotency-key-001",
            SimpleNamespace(
                workspace_id="workspace-1",
                user_id="operator-1",
                roles=("release_operator",),
            ),
            db,
            events,
            operation_events,
            RepositoryDiscoveryService(PinnedManifestClient(SOURCE)),
        )
    )

    assert response.status == "queued"
    assert response.audit_event_id == response.event_id
    command = events.body
    assert command.action == "apply_manifest"
    assert command.direct_execution is command.direct_execution_confirmed is True
    assert command.approval_ref is None
    assert command.diff.basis["resource_ref"] == {
        "api_group": "apps",
        "version": "v1",
        "kind": "Deployment",
        "namespace": "shop",
        "name": "checkout-api",
        "uid": "deployment-uid-1",
    }
    assert command.payload["desired_documents"][0]["spec"]["replicas"] == 3
    assert command.payload["source"]["base_sha"] == "a" * 40
    assert callable(events.accept_kwargs["transactional_stage"])
    assert operation_events.published[0]["command_id"] == response.command_id


def test_direct_apply_rejects_any_multi_document_namespace_before_acceptance(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CONTROL_ALLOWED_NAMESPACES", "shop")
    source = (
        SOURCE
        + """\
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: shared
  namespace: kube-system
data:
  mode: safe
"""
    )
    desired = source.replace("replicas: 2", "replicas: 3")
    db = ManifestApprovalDb()
    events = ManifestApprovalEvents()

    with pytest.raises(HTTPException) as error:
        asyncio.run(
            apply_resource_manifest_now(
                "resource-1",
                ResourceManifestDirectApplyRequest(
                    application_id="app-1",
                    base_sha="a" * 40,
                    source_sha256=manifest_sha256(source),
                    edited_yaml=desired,
                    expected_desired_sha256=manifest_sha256(desired),
                    confirmation=True,
                    reason="Apply two reviewed documents",
                ),
                "manifest-idempotency-key-002",
                SimpleNamespace(
                    workspace_id="workspace-1",
                    user_id="operator-1",
                    roles=("release_operator",),
                ),
                db,
                events,
                ManifestOperationEvents(),
                RepositoryDiscoveryService(PinnedManifestClient(source)),
            )
        )

    assert error.value.status_code == 422
    assert "namespace" in str(error.value.detail)
    assert events.body is None

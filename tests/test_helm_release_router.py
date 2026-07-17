from __future__ import annotations

import asyncio
import importlib
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from domains.helm.release_router import (
    create_helm_artifact_read,
    create_helm_release_rollback,
    create_helm_release_uninstall,
    create_helm_release_upgrade,
)
from domains.helm.repository import HelmOwnedResourceObservationBatch
from domains.helm.source_router import get_helm_chart_version_provider
from domains.identity.dependencies import require_session
from packages.config.constants import Command
from packages.contracts.helm import (
    HELM_ARTIFACT_MAX_ACTIVE_PER_CLUSTER,
    HELM_RELEASE_ARTIFACT_READ_ACTION,
    HELM_RELEASE_ARTIFACT_READ_CAPABILITY,
    HELM_RELEASE_OPERATION_ACTION,
    HELM_RELEASE_OPERATION_CAPABILITY,
    HelmArtifactReadRequest,
    HelmReleaseRollbackRequest,
    HelmReleaseUninstallRequest,
    HelmReleaseUpgradeRequest,
)
from packages.contracts.helm.sources import (
    HelmChartSource,
    HelmChartVersion,
    HelmChartVersionObservation,
)
from packages.contracts.identity import Permission
from packages.runtime.dependencies import get_db


class HelmReleaseDb:
    def __init__(self, agent_statuses: dict[str, dict[str, str]] | None = None) -> None:
        self.agent_statuses = (
            agent_statuses
            if agent_statuses is not None
            else {
                "cluster-a": {"last_seen_at": datetime.now(UTC).isoformat()},
            }
        )

    def accessible_resource_ids(
        self,
        _user_id: str,
        workspace_id: str,
        resource_type: str,
        permission: str,
    ) -> set[str]:
        assert workspace_id == "workspace-a"
        if resource_type == "cluster" and permission == Permission.INVENTORY_READ.value:
            return {"cluster-a"}
        return set()

    def helm_release_observation_contexts(
        self,
        *,
        workspace_id: str,
        cluster_ids: tuple[str, ...],
    ) -> dict[str, dict[str, object]]:
        assert workspace_id == "workspace-a"
        return {
            cluster_id: {
                "snapshot_revision": 11,
                "observed_at": "2026-07-16T09:00:00+00:00",
                "labels_complete": True,
                "resources_complete": True,
                "partial_reason_codes": [],
            }
            for cluster_id in cluster_ids
        }

    def list_helm_storage_observations(
        self,
        *,
        workspace_id: str,
        cluster_ids: tuple[str, ...],
        namespaces: tuple[str, ...],
    ) -> list[dict[str, object]]:
        assert workspace_id == "workspace-a"
        assert set(cluster_ids).issubset({"cluster-a"})
        assert not namespaces or namespaces == ("storefront",)
        return [
            {
                "workspace_id": "workspace-a",
                "cluster_id": "cluster-a",
                "inventory_key": "inventory-storefront-v3",
                "api_version": "v1",
                "kind": "Secret",
                "namespace": "storefront",
                "name": "sh.helm.release.v1.storefront.v3",
                "uid": "uid-storefront-v3",
                "resource_version": "1042",
                "labels": {
                    "owner": "helm",
                    "name": "storefront",
                    "version": "3",
                    "status": "deployed",
                },
                "observed_at": datetime(2026, 7, 16, 9, 0, tzinfo=UTC),
                "raw": {"data": {"release": "must-not-leak"}},
            }
        ]

    def list_helm_owned_resource_observations(
        self,
        *,
        workspace_id: str,
        release_scopes: tuple[tuple[str, str, str], ...],
        limit: int,
    ) -> HelmOwnedResourceObservationBatch:
        assert workspace_id == "workspace-a"
        assert release_scopes == (("cluster-a", "storefront", "storefront"),)
        assert limit > 0
        return HelmOwnedResourceObservationBatch(
            rows=(
                {
                    "workspace_id": "workspace-a",
                    "cluster_id": "cluster-a",
                    "inventory_key": "deployment-storefront",
                    "api_version": "apps/v1",
                    "kind": "Deployment",
                    "namespace": "storefront",
                    "name": "storefront",
                    "uid": "deployment-storefront",
                    "status": "Available",
                    "health": "healthy",
                    "observed_at": "2026-07-16T09:00:00+00:00",
                    "release_name": "storefront",
                    "release_namespace": "storefront",
                },
            ),
            truncated=False,
        )

    def latest_cluster_agent_statuses(
        self,
        workspace_id: str,
        cluster_ids: set[str],
    ) -> dict[str, dict[str, str]]:
        assert workspace_id == "workspace-a"
        assert cluster_ids.issubset({"cluster-a"})
        return {
            cluster_id: status
            for cluster_id, status in self.agent_statuses.items()
            if cluster_id in cluster_ids
        }

    def list_cluster_agent_statuses(
        self,
        workspace_id: str,
        cluster_id: str,
    ) -> list[dict[str, object]]:
        assert workspace_id == "workspace-a"
        assert cluster_id == "cluster-a"
        return [
            {
                "status": "connected",
                "capabilities": [HELM_RELEASE_ARTIFACT_READ_CAPABILITY],
            }
        ]


class HelmUpgradeDb(HelmReleaseDb):
    def can_access(
        self,
        user_id: str,
        workspace_id: str,
        resource_type: str,
        resource_id: str,
        permission: str,
    ) -> bool:
        return (
            user_id == "user-a"
            and workspace_id == "workspace-a"
            and resource_type == "cluster"
            and resource_id == "cluster-a"
            and permission == Permission.DEPLOY_RUN.value
        )

    def accessible_resource_ids(
        self,
        _user_id: str,
        workspace_id: str,
        resource_type: str,
        permission: str,
    ) -> set[str]:
        assert workspace_id == "workspace-a"
        if resource_type == "cluster" and permission in {
            Permission.INVENTORY_READ.value,
            Permission.DEPLOY_RUN.value,
        }:
            return {"cluster-a"}
        if resource_type == "helm_chart_source" and permission == Permission.CATALOG_READ.value:
            return {"source-redis"}
        return set()

    def list_helm_storage_observations(
        self,
        *,
        workspace_id: str,
        cluster_ids: tuple[str, ...],
        namespaces: tuple[str, ...],
    ) -> list[dict[str, object]]:
        rows = super().list_helm_storage_observations(
            workspace_id=workspace_id,
            cluster_ids=cluster_ids,
            namespaces=(),
        )
        rows[0]["namespace"] = "sandbox"
        return rows

    def list_helm_owned_resource_observations(
        self,
        *,
        workspace_id: str,
        release_scopes: tuple[tuple[str, str, str], ...],
        limit: int,
    ) -> HelmOwnedResourceObservationBatch:
        assert release_scopes == (("cluster-a", "sandbox", "storefront"),)
        batch = super().list_helm_owned_resource_observations(
            workspace_id=workspace_id,
            release_scopes=(("cluster-a", "storefront", "storefront"),),
            limit=limit,
        )
        rows = [dict(row) for row in batch.rows]
        rows[0]["namespace"] = "sandbox"
        rows[0]["release_namespace"] = "sandbox"
        rows[0]["chart_label"] = "redis-22.0.0"
        return HelmOwnedResourceObservationBatch(rows=tuple(rows), truncated=False)

    def list_helm_chart_source_records(
        self,
        *,
        workspace_id: str,
        source_ids: set[str] | None,
        limit: int,
    ) -> SimpleNamespace:
        assert workspace_id == "workspace-a"
        assert source_ids == {"source-redis"}
        assert limit > 0
        return SimpleNamespace(
            rows=(
                {
                    "source_id": "source-redis",
                    "workspace_id": "workspace-a",
                    "provider": "repository",
                    "name": "redis-stable",
                    "canonical_ref": "https://charts.example.test/stable",
                    "credential_ref": None,
                    "status": "active",
                    "updated_at": datetime(2026, 7, 17, tzinfo=UTC),
                },
            ),
            truncated=False,
        )

    def list_cluster_agent_statuses(
        self,
        workspace_id: str,
        cluster_id: str,
    ) -> list[dict[str, object]]:
        assert workspace_id == "workspace-a"
        assert cluster_id == "cluster-a"
        return [
            {
                "status": "connected",
                "last_seen_at": datetime.now(UTC).isoformat(),
                "capabilities": [
                    "command_receiver",
                    Command.CATALOG_HELM_INSTALL_CAPABILITY,
                    Command.CATALOG_HELM_UPGRADE_CAS_CAPABILITY,
                    HELM_RELEASE_ARTIFACT_READ_CAPABILITY,
                    HELM_RELEASE_OPERATION_CAPABILITY,
                ],
            }
        ]


class HelmUpgradeInfoDb(HelmReleaseDb):
    def accessible_resource_ids(
        self,
        _user_id: str,
        workspace_id: str,
        resource_type: str,
        permission: str,
    ) -> set[str]:
        assert workspace_id == "workspace-a"
        if resource_type == "cluster" and permission == Permission.INVENTORY_READ.value:
            return {"cluster-a"}
        if resource_type == "helm_chart_source" and permission == Permission.CATALOG_READ.value:
            return {"source-a"}
        return set()

    def list_helm_owned_resource_observations(
        self,
        *,
        workspace_id: str,
        release_scopes: tuple[tuple[str, str, str], ...],
        limit: int,
    ) -> HelmOwnedResourceObservationBatch:
        batch = super().list_helm_owned_resource_observations(
            workspace_id=workspace_id,
            release_scopes=release_scopes,
            limit=limit,
        )
        rows = [dict(row) for row in batch.rows]
        rows[0]["chart_label"] = "storefront-1.2.3"
        return HelmOwnedResourceObservationBatch(rows=tuple(rows), truncated=False)

    def list_helm_chart_source_records(
        self,
        *,
        workspace_id: str,
        source_ids: set[str] | None,
        limit: int,
    ) -> SimpleNamespace:
        assert workspace_id == "workspace-a"
        assert source_ids == {"source-a"}
        assert limit > 0
        return SimpleNamespace(
            rows=(
                {
                    "source_id": "source-a",
                    "workspace_id": "workspace-a",
                    "provider": "repository",
                    "name": "stable",
                    "canonical_ref": "https://charts.example.test/stable",
                    "credential_ref": None,
                    "status": "active",
                    "updated_at": datetime(2026, 7, 17, tzinfo=UTC),
                },
            ),
            truncated=False,
        )


class HelmUpgradeInfoProvider:
    async def fetch_versions(
        self,
        source: HelmChartSource,
        chart_name: str,
        *,
        credential: object = None,
    ) -> HelmChartVersionObservation:
        assert source.source_id == "source-a"
        assert chart_name == "storefront"
        assert credential is None
        return HelmChartVersionObservation(
            source=source,
            chart_name=chart_name,
            availability="available",
            versions=(
                HelmChartVersion(version="2.0.0"),
                HelmChartVersion(version="1.2.3"),
            ),
            observed_at="2026-07-17T00:01:00+00:00",
        )


class HelmUpgradeProvider:
    async def fetch_versions(
        self,
        source: HelmChartSource,
        chart_name: str,
        *,
        credential: object = None,
    ) -> HelmChartVersionObservation:
        assert source.source_id == "source-redis"
        assert chart_name == "redis"
        assert credential is None
        return HelmChartVersionObservation(
            source=source,
            chart_name=chart_name,
            availability="available",
            versions=(
                HelmChartVersion(version="23.1.1"),
                HelmChartVersion(version="22.0.0"),
            ),
            observed_at="2026-07-17T00:01:00+00:00",
        )


def _client(agent_statuses: dict[str, dict[str, str]] | None = None) -> TestClient:
    module = importlib.import_module("domains.helm.release_router")
    app = FastAPI()
    app.include_router(module.router)
    app.dependency_overrides[require_session] = lambda: SimpleNamespace(
        user_id="user-a",
        workspace_id="workspace-a",
        roles=("user",),
    )
    app.dependency_overrides[get_db] = lambda: HelmReleaseDb(agent_statuses)
    return TestClient(app)


def _upgrade_info_client() -> TestClient:
    module = importlib.import_module("domains.helm.release_router")
    app = FastAPI()
    app.include_router(module.router)
    app.dependency_overrides[require_session] = lambda: SimpleNamespace(
        user_id="user-a",
        workspace_id="workspace-a",
        roles=("user",),
    )
    app.dependency_overrides[get_db] = HelmUpgradeInfoDb
    app.dependency_overrides[get_helm_chart_version_provider] = HelmUpgradeInfoProvider
    return TestClient(app)


def test_release_list_is_rbac_scoped_and_never_decodes_storage_payload() -> None:
    response = _client().get("/helm/releases?clusters=cluster-a&namespaces=storefront")

    assert response.status_code == 200
    body = response.json()
    assert body["coverage"]["availability"] == "available"
    assert body["refresh_after_seconds"] == 30
    assert body["post_mutation_refresh_after_seconds"] == 1.2
    assert body["releases"][0]["name"] == "storefront"
    assert body["releases"][0]["scope"]["freshness"] == "live"
    assert body["releases"][0]["chart"] is None
    assert body["releases"][0]["resource_health"] == {
        "availability": "available",
        "health": "healthy",
        "resource_count": 1,
        "observed_at": "2026-07-16T09:00:00+00:00",
        "reason_codes": [],
    }
    assert "must-not-leak" not in response.text
    assert '"raw"' not in response.text


def test_release_detail_requires_the_exact_authorized_cluster_scope() -> None:
    client = _client()

    denied = client.get("/helm/releases/storefront/storefront?cluster_id=cluster-private")
    allowed = client.get("/helm/releases/storefront/storefront?cluster_id=cluster-a")

    assert denied.status_code == 404
    assert allowed.status_code == 200
    assert allowed.json()["refresh_after_seconds"] == 10
    assert allowed.json()["post_mutation_refresh_after_seconds"] == 1.2
    body = allowed.json()["detail"]
    assert body["commands"] == {
        "availability": "unavailable",
        "reason_code": "helm_upgrade_permission_denied",
    }
    assert body["values"]["reason_code"] == "helm_values_provider_not_integrated"
    assert body["owned_resources"]["availability"] == "available"
    assert body["owned_resources"]["items"][0]["resource"]["kind"] == "Deployment"


def test_release_list_hides_an_unauthorized_requested_scope() -> None:
    response = _client().get("/helm/releases?clusters=cluster-private")

    assert response.status_code == 404


def test_release_scope_reports_stale_or_missing_agent_without_relaxing_rbac() -> None:
    stale = _client({"cluster-a": {"last_seen_at": "2000-01-01T00:00:00+00:00"}}).get(
        "/helm/releases?clusters=cluster-a"
    )
    disconnected = _client({}).get("/helm/releases?clusters=cluster-a")

    assert stale.status_code == 200
    assert stale.json()["releases"][0]["scope"]["freshness"] == "stale"
    assert disconnected.status_code == 200
    assert disconnected.json()["releases"][0]["scope"]["freshness"] == "disconnected"
    assert "must-not-leak" not in stale.text


def test_release_upgrade_info_and_versions_share_one_authorized_source_resolution() -> None:
    client = _upgrade_info_client()

    info = client.get("/helm/releases/storefront/storefront/upgrade-info?cluster_id=cluster-a")
    versions = client.get("/helm/releases/storefront/storefront/versions?cluster_id=cluster-a")

    assert info.status_code == 200
    assert info.json()["availability"] == "available"
    assert info.json()["current_version"] == "1.2.3"
    assert info.json()["latest_version"] == "2.0.0"
    assert info.json()["update_available"] is True
    assert info.json()["source"]["source_id"] == "source-a"
    assert info.json()["refresh_after_seconds"] == 10
    assert versions.status_code == 200
    assert [item["version"] for item in versions.json()["versions"]] == [
        "2.0.0",
        "1.2.3",
    ]
    assert versions.json()["source"]["source_id"] == "source-a"
    assert versions.json()["refresh_after_seconds"] == 10


def test_batch_upgrade_check_is_bounded_and_uses_cluster_safe_release_keys() -> None:
    response = _upgrade_info_client().get(
        "/helm/upgrade-check?clusters=cluster-a&namespaces=storefront"
    )

    assert response.status_code == 200
    body = response.json()
    assert list(body["releases"]) == ["cluster-a/storefront/storefront"]
    assert body["releases"]["cluster-a/storefront/storefront"]["latest_version"] == "2.0.0"
    assert body["coverage"]["availability"] == "available"
    assert body["truncated"] is False
    assert body["reason_codes"] == []
    assert body["refresh_after_seconds"] == 30


def test_artifact_read_queues_one_exact_read_only_agent_command(monkeypatch) -> None:
    captured: dict[str, object] = {}

    async def fake_accept(_events, command, *, actor, max_active_per_action):
        captured["command"] = command
        assert actor.user_id == "user-a"
        assert max_active_per_action == HELM_ARTIFACT_MAX_ACTIVE_PER_CLUSTER
        accepted = SimpleNamespace(
            event=SimpleNamespace(event_id="evt-helm-1", correlation_id="corr-helm-1")
        )
        return accepted, None

    monkeypatch.setattr(
        "domains.helm.release_router.accept_command_with_receipt_stage",
        fake_accept,
    )
    response = asyncio.run(
        create_helm_artifact_read(
            namespace="storefront",
            release_name="storefront",
            payload=HelmArtifactReadRequest(
                cluster_id="cluster-a",
                artifact="manifest_diff",
                revision=2,
                comparison_revision=3,
            ),
            current=SimpleNamespace(
                user_id="user-a",
                workspace_id="workspace-a",
                roles=("user",),
            ),
            db=HelmReleaseDb(),
            events=SimpleNamespace(),
            operation_events=SimpleNamespace(),
        )
    )

    assert response.event_id == response.audit_event_id == "evt-helm-1"
    command = captured["command"]
    assert command.action == HELM_RELEASE_ARTIFACT_READ_ACTION
    assert command.namespace == "storefront"
    assert command.payload == {
        "cluster_id": "cluster-a",
        "artifact": "manifest_diff",
        "revision": 2,
        "comparison_revision": 3,
        "all_values": False,
        "namespace": "storefront",
        "release_name": "storefront",
    }
    assert command.direct_execution is False


def test_structured_artifact_read_hides_an_unauthorized_cluster_scope() -> None:
    with pytest.raises(HTTPException) as captured:
        asyncio.run(
            create_helm_artifact_read(
                namespace="storefront",
                release_name="storefront",
                payload=HelmArtifactReadRequest(
                    cluster_id="cluster-private",
                    artifact="resources_diff",
                    revision=2,
                    comparison_revision=3,
                ),
                current=SimpleNamespace(
                    user_id="user-a",
                    workspace_id="workspace-a",
                    roles=("user",),
                ),
                db=HelmReleaseDb(),
                events=SimpleNamespace(),
                operation_events=SimpleNamespace(),
            )
        )

    assert captured.value.status_code == 404


def test_release_detail_exposes_only_the_real_agent_upgrade_with_server_inputs() -> None:
    module = importlib.import_module("domains.helm.release_router")
    app = FastAPI()
    app.include_router(module.router)
    app.dependency_overrides[require_session] = lambda: SimpleNamespace(
        user_id="user-a",
        workspace_id="workspace-a",
        roles=("user",),
    )
    app.dependency_overrides[get_db] = HelmUpgradeDb

    response = TestClient(app).get("/helm/releases/sandbox/storefront?cluster_id=cluster-a")

    assert response.status_code == 200
    commands = response.json()["detail"]["commands"]
    assert commands["availability"] == "available"
    assert commands["actions"] == ["upgrade"]
    assert commands["confirmation_required"] is True
    assert commands["realtime"] is True
    assert [target["item_id"] for target in commands["upgrade_targets"]] == ["catalog-redis"]
    assert commands["upgrade_targets"][0]["inputs"]
    assert "package_ref" not in response.text
    assert "chart_digest" not in response.text


def test_release_upgrade_reuses_the_real_catalog_agent_command_and_audit_receipt(
    monkeypatch,
) -> None:
    captured: dict[str, object] = {}

    async def fake_accept(_events, command, *, actor, max_active_per_action=None):
        captured["command"] = command
        assert actor.user_id == "user-a"
        assert max_active_per_action is None
        return SimpleNamespace(
            event=SimpleNamespace(event_id="evt-upgrade-1", correlation_id="corr-upgrade-1")
        ), None

    monkeypatch.setattr(
        "domains.helm.release_router.accept_command_with_receipt_stage",
        fake_accept,
    )

    receipt = asyncio.run(
        create_helm_release_upgrade(
            namespace="sandbox",
            release_name="storefront",
            payload=HelmReleaseUpgradeRequest(
                cluster_id="cluster-a",
                expected_revision=3,
                catalog_item_id="catalog-redis",
                catalog_version="1.0.0",
                values={"master.persistence.storageClass": "gp3"},
                confirmation=True,
                reason="upgrade to the selected server recipe",
            ),
            current=SimpleNamespace(
                user_id="user-a",
                workspace_id="workspace-a",
                roles=("user",),
            ),
            db=HelmUpgradeDb(),
            events=SimpleNamespace(),
            operation_events=SimpleNamespace(),
            provider=HelmUpgradeProvider(),
        )
    )

    assert receipt.event_id == receipt.audit_event_id == "evt-upgrade-1"
    command = captured["command"]
    assert command.action == Command.CATALOG_HELM_INSTALL_ACTION
    assert command.namespace == "sandbox"
    assert command.direct_execution is True
    assert command.direct_execution_confirmed is True
    assert command.payload == {
        "catalog_item_id": "catalog-redis",
        "catalog_version": "1.0.0",
        "namespace": "sandbox",
        "application_name": "storefront",
        "release_name": "storefront",
        "values": {"master.persistence.storageClass": "gp3"},
        "upgrade_guard": {
            "expected_revision": 3,
            "storage": {
                "api_group": "",
                "version": "v1",
                "kind": "Secret",
                "namespace": "sandbox",
                "name": "sh.helm.release.v1.storefront.v3",
                "uid": "uid-storefront-v3",
            },
            "storage_resource_version": "1042",
            "chart_name": "redis",
            "chart_version": "22.0.0",
        },
    }
    assert command.diff.basis["expected_revision"] == 3
    assert command.diff.basis["catalog_item_id"] == "catalog-redis"


def test_release_rollback_reuses_common_receipt_and_revision_bound_agent_command(
    monkeypatch,
) -> None:
    captured: dict[str, object] = {}

    async def fake_accept(_events, command, *, actor, max_active_per_action=None):
        captured["command"] = command
        assert actor.user_id == "user-a"
        assert max_active_per_action is None
        return SimpleNamespace(
            event=SimpleNamespace(event_id="evt-rollback-1", correlation_id="corr-rollback-1")
        ), None

    monkeypatch.setattr(
        "domains.helm.release_router.accept_command_with_receipt_stage",
        fake_accept,
    )
    receipt = asyncio.run(
        create_helm_release_rollback(
            namespace="sandbox",
            release_name="storefront",
            payload=HelmReleaseRollbackRequest(
                cluster_id="cluster-a",
                expected_revision=3,
                revision=2,
                confirmation=True,
            ),
            current=SimpleNamespace(
                user_id="user-a",
                workspace_id="workspace-a",
                roles=("user",),
            ),
            db=HelmUpgradeDb(),
            events=SimpleNamespace(),
            operation_events=SimpleNamespace(),
        )
    )

    assert receipt.event_id == "evt-rollback-1"
    command = captured["command"]
    assert command.action == HELM_RELEASE_OPERATION_ACTION
    assert command.payload["operation"] == "rollback"
    assert command.payload["rollback_revision"] == 2
    assert command.payload["guard"]["expected_revision"] == 3
    assert command.payload["guard"]["storage_resource_version"] == "1042"
    assert command.direct_execution_confirmed is True


def test_release_uninstall_rejects_stale_browser_revision_before_agent_queue(
    monkeypatch,
) -> None:
    async def unexpected_accept(*_args, **_kwargs):
        raise AssertionError("stale uninstall must not queue an agent command")

    monkeypatch.setattr(
        "domains.helm.release_router.accept_command_with_receipt_stage",
        unexpected_accept,
    )
    with pytest.raises(HTTPException) as captured:
        asyncio.run(
            create_helm_release_uninstall(
                namespace="sandbox",
                release_name="storefront",
                payload=HelmReleaseUninstallRequest(
                    cluster_id="cluster-a",
                    expected_revision=2,
                    confirmation=True,
                ),
                current=SimpleNamespace(
                    user_id="user-a",
                    workspace_id="workspace-a",
                    roles=("user",),
                ),
                db=HelmUpgradeDb(),
                events=SimpleNamespace(),
                operation_events=SimpleNamespace(),
            )
        )

    assert captured.value.status_code == 409
    assert captured.value.detail == "Helm release revision changed; refresh before operating"


def test_release_upgrade_fails_closed_for_a_stale_revision_before_command_acceptance(
    monkeypatch,
) -> None:
    async def unexpected_accept(*_args, **_kwargs):
        raise AssertionError("a stale release must not queue an agent command")

    monkeypatch.setattr(
        "domains.helm.release_router.accept_command_with_receipt_stage",
        unexpected_accept,
    )

    with pytest.raises(HTTPException) as captured:
        asyncio.run(
            create_helm_release_upgrade(
                namespace="sandbox",
                release_name="storefront",
                payload=HelmReleaseUpgradeRequest(
                    cluster_id="cluster-a",
                    expected_revision=2,
                    catalog_item_id="catalog-redis",
                    catalog_version="1.0.0",
                    values={"master.persistence.storageClass": "gp3"},
                    confirmation=True,
                ),
                current=SimpleNamespace(
                    user_id="user-a",
                    workspace_id="workspace-a",
                    roles=("user",),
                ),
                db=HelmUpgradeDb(),
                events=SimpleNamespace(),
                operation_events=SimpleNamespace(),
                provider=HelmUpgradeProvider(),
            )
        )

    assert captured.value.status_code == 409
    assert captured.value.detail == "Helm release revision changed; refresh before upgrading"


def test_release_upgrade_rejects_unknown_values_before_command_acceptance(monkeypatch) -> None:
    async def unexpected_accept(*_args, **_kwargs):
        raise AssertionError("invalid values must not queue an agent command")

    monkeypatch.setattr(
        "domains.helm.release_router.accept_command_with_receipt_stage",
        unexpected_accept,
    )

    with pytest.raises(HTTPException) as captured:
        asyncio.run(
            create_helm_release_upgrade(
                namespace="sandbox",
                release_name="storefront",
                payload=HelmReleaseUpgradeRequest(
                    cluster_id="cluster-a",
                    expected_revision=3,
                    catalog_item_id="catalog-redis",
                    catalog_version="1.0.0",
                    values={"undeclared": "must-not-pass"},
                    confirmation=True,
                ),
                current=SimpleNamespace(
                    user_id="user-a",
                    workspace_id="workspace-a",
                    roles=("user",),
                ),
                db=HelmUpgradeDb(),
                events=SimpleNamespace(),
                operation_events=SimpleNamespace(),
                provider=HelmUpgradeProvider(),
            )
        )

    assert captured.value.status_code == 422
    assert captured.value.detail == "Helm release upgrade recipe is invalid"


def test_release_upgrade_rejects_a_recipe_for_a_different_observed_chart(
    monkeypatch,
) -> None:
    async def unexpected_accept(*_args, **_kwargs):
        raise AssertionError("an incompatible chart must not queue an agent command")

    monkeypatch.setattr(
        "domains.helm.release_router.accept_command_with_receipt_stage",
        unexpected_accept,
    )

    with pytest.raises(HTTPException) as captured:
        asyncio.run(
            create_helm_release_upgrade(
                namespace="sandbox",
                release_name="storefront",
                payload=HelmReleaseUpgradeRequest(
                    cluster_id="cluster-a",
                    expected_revision=3,
                    catalog_item_id="catalog-postgresql",
                    catalog_version="1.0.0",
                    values={
                        "auth.database": "storefront",
                        "primary.persistence.storageClass": "gp3",
                    },
                    confirmation=True,
                ),
                current=SimpleNamespace(
                    user_id="user-a",
                    workspace_id="workspace-a",
                    roles=("user",),
                ),
                db=HelmUpgradeDb(),
                events=SimpleNamespace(),
                operation_events=SimpleNamespace(),
                provider=HelmUpgradeProvider(),
            )
        )

    assert captured.value.status_code == 409
    assert captured.value.detail == "Helm release chart does not match the selected upgrade"

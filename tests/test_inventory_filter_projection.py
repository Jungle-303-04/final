from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import BigInteger

from domains.inventory.kubernetes_snapshot import kubernetes_evidence_to_inventory_snapshot
from domains.inventory_filter.models import (
    InventoryFilterRevision,
    InventoryResourceApplicationVersion,
    InventoryResourceLabelVersion,
    InventoryResourceVersion,
)
from domains.inventory_filter.repository import _serialize_version_row, _version_row


def test_kubernetes_inventory_translation_promotes_bounded_labels_and_completeness() -> None:
    snapshot = kubernetes_evidence_to_inventory_snapshot(
        {
            "cluster": {"collected_at": "2026-07-13T00:00:00Z"},
            "pods": [
                {
                    "name": "api-1",
                    "namespace": "shop",
                    "phase": "Running",
                    "labels": {"app": "api", "team": "checkout"},
                    "labels_complete": True,
                }
            ],
            "workloads": [
                {
                    "kind": "Deployment",
                    "name": "api",
                    "namespace": "shop",
                    "desired_replicas": 1,
                    "ready_replicas": 1,
                    "labels": {"app": "api"},
                    "labels_complete": False,
                }
            ],
        },
        cluster_id="cluster-a",
        agent_id="agent-a",
    )

    resources = {str(row["name"]): row for row in snapshot["resources"]}
    assert resources["api-1"]["labels"] == {"app": "api", "team": "checkout"}
    assert resources["api"]["labels"] == {"app": "api"}
    assert snapshot["summary"]["labels_complete"] is False


def test_namespace_evidence_success_never_claims_authoritative_cluster_replacement() -> None:
    snapshot = kubernetes_evidence_to_inventory_snapshot(
        {
            "cluster": {"collected_at": "2026-07-13T00:00:00Z"},
            "provider_status": {
                "pods": {"status": "success"},
                "workloads": {"status": "success"},
            },
            "pods": [
                {
                    "name": "scoped-pod",
                    "namespace": "sandbox",
                    "phase": "Running",
                    "labels": {"team": "checkout"},
                    "labels_complete": True,
                }
            ],
        },
        cluster_id="cluster-a",
        agent_id="agent-a",
    )

    assert snapshot["replace"] is False
    assert snapshot["summary"]["resources_complete"] is False
    assert snapshot["summary"]["labels_complete"] is False


def test_filter_projection_models_preserve_temporal_snapshot_and_index_contract() -> None:
    revision = InventoryFilterRevision.__table__
    version = InventoryResourceVersion.__table__
    label = InventoryResourceLabelVersion.__table__
    application = InventoryResourceApplicationVersion.__table__

    assert isinstance(revision.c.revision_id.type, BigInteger)
    assert revision.c.snapshot_id.unique is True
    assert version.c.valid_to_revision.nullable is True
    assert version.c.content_hash.nullable is False
    assert tuple(column.name for column in label.primary_key.columns) == ("version_id", "key")
    assert tuple(column.name for column in application.primary_key.columns) == (
        "version_id",
        "application_id",
    )

    version_indexes = {index.name: index for index in version.indexes}
    assert tuple(
        column.name for column in version_indexes["ix_inventory_versions_scope_sort"].columns
    ) == (
        "workspace_id",
        "cluster_id",
        "resource_type",
        "namespace",
        "health",
        "name",
        "inventory_key",
    )
    assert "valid_to_revision IS NULL" in str(
        version_indexes["ux_inventory_versions_active_key"].dialect_options["postgresql"]["where"]
    )
    assert tuple(
        str(expression)
        for expression in version_indexes["ix_inventory_versions_page_sort"].expressions
    ) == (
        "inventory_resource_versions.workspace_id",
        "inventory_resource_versions.cluster_id",
        "COALESCE(namespace, '')",
        "inventory_resource_versions.resource_type",
        "inventory_resource_versions.kind",
        "inventory_resource_versions.name",
        "inventory_resource_versions.inventory_key",
    )


def test_inventory_snapshot_replace_uses_snapshot_boundary_not_seen_type_subset() -> None:
    source = __import__("inspect").getsource(
        __import__(
            "domains.inventory.repository", fromlist=["InventoryRepository"]
        ).InventoryRepository.save_inventory_snapshot
    )

    assert "snapshot_id !=" in source or "snapshot_id != current_snapshot" in source
    assert "seen_keys and seen_types" not in source


def test_resource_serialization_preserves_historical_cursor_and_source_observation() -> None:
    observed_at = datetime(2026, 7, 13, 1, 0, tzinfo=UTC)
    closed_at = datetime(2026, 7, 13, 2, 0, tzinfo=UTC)
    row = {
        "inventory_key": "resource-a",
        "source_snapshot_id": "snapshot-observed-resource-a",
        "as_of_snapshot_id": "later-partial-snapshot",
        "workspace_id": "workspace-a",
        "cluster_id": "cluster-a",
        "resource_type": "workload",
        "api_version": "apps/v1",
        "kind": "Deployment",
        "namespace": "shop",
        "name": "checkout",
        "uid": "uid-a",
        "resource_version": "7",
        "status": "Ready",
        "health": "healthy",
        "labels": {"team": "checkout"},
        "summary": {},
        "observed_at": observed_at,
        "as_of_observed_at": closed_at,
        "first_seen_at": observed_at,
        "created_at": observed_at,
        "valid_to_revision": 12,
        "valid_to_observed_at": closed_at,
        "application_binding_complete": True,
    }

    historical = _serialize_version_row(
        row,
        snapshot_revision=11,
        application_scope=([], False),
        cluster=None,
    )["resource"]
    deleted = _serialize_version_row(
        row,
        snapshot_revision=12,
        application_scope=([], False),
        cluster=None,
    )["resource"]

    assert historical["snapshot_id"] == "snapshot-observed-resource-a"
    assert historical["observed_at"] == observed_at.isoformat()
    assert historical["deleted_at"] is None
    assert deleted["deleted_at"] == closed_at.isoformat()


def test_projection_hash_changes_when_application_completeness_changes() -> None:
    observed_at = datetime(2026, 7, 13, 1, 0, tzinfo=UTC)
    resource = {
        "inventory_key": "resource-a",
        "workspace_id": "workspace-a",
        "cluster_id": "cluster-a",
        "resource_type": "workload",
        "api_version": "apps/v1",
        "kind": "Deployment",
        "namespace": "shop",
        "name": "checkout",
        "uid": None,
        "resource_version": "7",
        "status": "Ready",
        "health": "healthy",
        "summary": {},
        "observed_at": observed_at,
        "first_seen_at": observed_at,
    }

    incomplete = _version_row(
        resource,
        revision_id=1,
        snapshot_id="snapshot-a",
        labels={},
        application_ids=(),
        application_binding_complete=False,
    )
    complete = _version_row(
        resource,
        revision_id=2,
        snapshot_id="snapshot-b",
        labels={},
        application_ids=(),
        application_binding_complete=True,
    )

    assert incomplete["content_hash"] != complete["content_hash"]

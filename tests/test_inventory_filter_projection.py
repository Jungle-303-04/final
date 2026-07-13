from __future__ import annotations

from domains.inventory_filter.models import (
    InventoryFilterRevision,
    InventoryResourceApplicationVersion,
    InventoryResourceLabelVersion,
    InventoryResourceVersion,
)
from sqlalchemy import BigInteger

from domains.inventory.kubernetes_snapshot import kubernetes_evidence_to_inventory_snapshot


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


def test_inventory_snapshot_replace_uses_snapshot_boundary_not_seen_type_subset() -> None:
    source = __import__("inspect").getsource(
        __import__(
            "domains.inventory.repository", fromlist=["InventoryRepository"]
        ).InventoryRepository.save_inventory_snapshot
    )

    assert "snapshot_id !=" in source or "snapshot_id != current_snapshot" in source
    assert "seen_keys and seen_types" not in source

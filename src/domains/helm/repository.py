"""Database reads for Helm release storage metadata only."""

from __future__ import annotations

from collections.abc import Collection
from typing import Any

from sqlalchemy import func, select

from domains.inventory.models import ClusterInventoryResourceRecord
from domains.inventory_filter.models import InventoryFilterRevision
from packages.storage.engine import DatabaseConnection, iso_or_none

HELM_STORAGE_OWNER_LABEL = "owner"
HELM_STORAGE_OWNER_VALUE = "helm"
HELM_STORAGE_KINDS = ("secret", "configmap")


class HelmReleaseRepository(DatabaseConnection):
    """Read current Helm storage labels without reading Secret data."""

    def list_helm_storage_observations(
        self,
        *,
        workspace_id: str,
        cluster_ids: Collection[str],
        namespaces: Collection[str],
    ) -> list[dict[str, Any]]:
        clusters = _ids(cluster_ids)
        namespace_values = _ids(namespaces)
        if not workspace_id or not clusters:
            return []
        table = ClusterInventoryResourceRecord.__table__
        statement = select(
            table.c.workspace_id,
            table.c.cluster_id,
            table.c.inventory_key,
            table.c.api_version,
            table.c.kind,
            table.c.namespace,
            table.c.name,
            table.c.uid,
            table.c.labels,
            table.c.observed_at,
        ).where(
            table.c.workspace_id == workspace_id,
            table.c.cluster_id.in_(clusters),
            table.c.deleted_at.is_(None),
            func.lower(table.c.kind).in_(HELM_STORAGE_KINDS),
            table.c.labels[HELM_STORAGE_OWNER_LABEL].as_string() == HELM_STORAGE_OWNER_VALUE,
        )
        if namespace_values:
            statement = statement.where(table.c.namespace.in_(namespace_values))
        statement = statement.order_by(
            table.c.cluster_id,
            table.c.namespace,
            table.c.name,
            table.c.inventory_key,
        )
        with self.connection() as conn:
            rows = [dict(row) for row in conn.execute(statement).mappings().all()]
        return [_serialize_storage_row(row) for row in rows]

    def helm_release_observation_contexts(
        self,
        *,
        workspace_id: str,
        cluster_ids: Collection[str],
    ) -> dict[str, dict[str, Any]]:
        """Return one latest inventory completeness cut per requested cluster."""

        clusters = _ids(cluster_ids)
        if not workspace_id or not clusters:
            return {}
        table = InventoryFilterRevision.__table__
        ranked = (
            select(
                table.c.cluster_id,
                table.c.revision_id,
                table.c.observed_at,
                table.c.labels_complete,
                table.c.resources_complete,
                table.c.partial_reason_codes,
                func.row_number()
                .over(partition_by=table.c.cluster_id, order_by=table.c.revision_id.desc())
                .label("rank"),
            )
            .where(table.c.workspace_id == workspace_id, table.c.cluster_id.in_(clusters))
            .cte("helm_observation_contexts")
        )
        statement = select(ranked).where(ranked.c.rank == 1)
        with self.connection() as conn:
            rows = [dict(row) for row in conn.execute(statement).mappings().all()]
        return {
            str(row["cluster_id"]): {
                "snapshot_revision": int(row["revision_id"]),
                "observed_at": iso_or_none(row.get("observed_at")),
                "labels_complete": bool(row["labels_complete"]),
                "resources_complete": bool(row["resources_complete"]),
                "partial_reason_codes": [
                    str(reason) for reason in list(row.get("partial_reason_codes") or [])
                ],
            }
            for row in rows
        }


def _ids(values: Collection[str]) -> tuple[str, ...]:
    return tuple(sorted({str(value).strip() for value in values if str(value).strip()}))


def _serialize_storage_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "workspace_id": str(row["workspace_id"]),
        "cluster_id": str(row["cluster_id"]),
        "inventory_key": str(row["inventory_key"]),
        "api_version": str(row.get("api_version") or ""),
        "kind": str(row.get("kind") or ""),
        "namespace": str(row.get("namespace") or ""),
        "name": str(row.get("name") or ""),
        "uid": str(row.get("uid") or "") or None,
        "labels": dict(row.get("labels") or {}),
        "observed_at": iso_or_none(row.get("observed_at")),
    }

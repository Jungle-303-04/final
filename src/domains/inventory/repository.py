"""inventory 도메인 repository — 클러스터 리소스 스냅샷·read model 영속."""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from domains.inventory.models import (
    ClusterInventoryResourceRecord,
    ClusterInventorySnapshotRecord,
    ClusterUsageSampleRecord,
)
from packages.contracts.event_bus.interfaces import JsonObject
from packages.storage.engine import DatabaseConnection, iso_or_none

SYNTHETIC_NAMESPACE = None
HEALTH_RESOURCE_TYPE = "health"
USAGE_RESOURCE_TYPE = "usage"
UNKNOWN_STATUS = "unknown"


def parse_observed_at(value: str | None) -> datetime:
    if not value:
        return datetime.now(UTC)
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return datetime.now(UTC)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed


def inventory_resource_key(
    workspace_id: str,
    cluster_id: str,
    resource_type: str,
    namespace: str | None,
    kind: str,
    name: str,
) -> str:
    identity = [workspace_id, cluster_id, resource_type, namespace or "", kind, name]
    raw = json.dumps(identity, ensure_ascii=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode()).hexdigest()


def resource_type_of(resource: JsonObject) -> str:
    return str(resource.get("resource_type") or "custom").strip().lower()


def normalize_inventory_resource(
    resource: JsonObject,
    *,
    workspace_id: str,
    cluster_id: str,
    snapshot_id: str,
    observed_at: datetime,
) -> JsonObject:
    resource_type = resource_type_of(resource)
    kind = str(resource.get("kind") or resource_type)
    namespace = resource.get("namespace")
    name = str(resource.get("name") or resource.get("uid") or f"{resource_type}-resource")
    return {
        "inventory_key": inventory_resource_key(
            workspace_id,
            cluster_id,
            resource_type,
            str(namespace) if namespace is not None else None,
            kind,
            name,
        ),
        "snapshot_id": snapshot_id,
        "workspace_id": workspace_id,
        "cluster_id": cluster_id,
        "resource_type": resource_type,
        "api_version": str(resource.get("api_version") or ""),
        "kind": kind,
        "namespace": str(namespace) if namespace is not None else None,
        "name": name,
        "uid": resource.get("uid"),
        "resource_version": resource.get("resource_version"),
        "status": str(resource.get("status") or UNKNOWN_STATUS),
        "health": str(resource.get("health") or UNKNOWN_STATUS),
        "labels": dict(resource.get("labels") or {}),
        "annotations": dict(resource.get("annotations") or {}),
        "summary": dict(resource.get("summary") or {}),
        "raw": dict(resource.get("raw") or {}),
        "observed_at": observed_at,
        "first_seen_at": observed_at,
        "last_seen_at": observed_at,
        "deleted_at": None,
    }


def snapshot_resources(payload: JsonObject) -> list[JsonObject]:
    resources = [dict(item) for item in payload.get("resources", [])]
    health = dict(payload.get("health") or {})
    if health:
        resources.append(
            {
                "resource_type": HEALTH_RESOURCE_TYPE,
                "api_version": "platform/v1",
                "kind": "ClusterHealth",
                "namespace": SYNTHETIC_NAMESPACE,
                "name": "cluster",
                "status": str(health.get("status") or UNKNOWN_STATUS),
                "health": str(health.get("health") or health.get("status") or UNKNOWN_STATUS),
                "summary": health,
                "raw": health,
            }
        )
    usage = dict(payload.get("usage") or {})
    if usage:
        resources.append(
            {
                "resource_type": USAGE_RESOURCE_TYPE,
                "api_version": "platform/v1",
                "kind": "ClusterUsage",
                "namespace": SYNTHETIC_NAMESPACE,
                "name": "cluster",
                "status": str(usage.get("status") or "sampled"),
                "health": UNKNOWN_STATUS,
                "summary": usage,
                "raw": usage,
            }
        )
    return resources


def snapshot_summary(payload: JsonObject) -> JsonObject:
    return {
        "summary": dict(payload.get("summary") or {}),
        "health": dict(payload.get("health") or {}),
        "usage": dict(payload.get("usage") or {}),
    }


class InventoryRepository(DatabaseConnection):
    def save_inventory_snapshot(
        self,
        *,
        workspace_id: str,
        cluster_id: str,
        agent_id: str,
        payload: JsonObject,
    ) -> JsonObject:
        snapshot_id = str(uuid.uuid4())
        observed_at = parse_observed_at(payload.get("collected_at"))
        resources = snapshot_resources(payload)
        normalized = [
            normalize_inventory_resource(
                resource,
                workspace_id=workspace_id,
                cluster_id=cluster_id,
                snapshot_id=snapshot_id,
                observed_at=observed_at,
            )
            for resource in resources
        ]

        snapshot_table = ClusterInventorySnapshotRecord.__table__
        resource_table = ClusterInventoryResourceRecord.__table__
        usage_table = ClusterUsageSampleRecord.__table__
        summary = snapshot_summary(payload)
        seen_keys = {resource["inventory_key"] for resource in normalized}
        seen_types = {resource["resource_type"] for resource in normalized}
        marked_deleted = 0

        with self.connection() as conn:
            conn.execute(
                pg_insert(snapshot_table).values(
                    snapshot_id=snapshot_id,
                    workspace_id=workspace_id,
                    cluster_id=cluster_id,
                    agent_id=agent_id,
                    source=str(payload.get("source") or "cluster-agent"),
                    status=str(payload.get("status") or "accepted"),
                    collected_at=observed_at,
                    resource_count=len(normalized),
                    summary=summary,
                )
            )
            for resource in normalized:
                conn.execute(
                    pg_insert(resource_table)
                    .values(**resource, updated_at=func.now())
                    .on_conflict_do_update(
                        index_elements=[resource_table.c.inventory_key],
                        set_={
                            "snapshot_id": resource["snapshot_id"],
                            "api_version": resource["api_version"],
                            "kind": resource["kind"],
                            "namespace": resource["namespace"],
                            "name": resource["name"],
                            "uid": resource["uid"],
                            "resource_version": resource["resource_version"],
                            "status": resource["status"],
                            "health": resource["health"],
                            "labels": resource["labels"],
                            "annotations": resource["annotations"],
                            "summary": resource["summary"],
                            "raw": resource["raw"],
                            "observed_at": resource["observed_at"],
                            "last_seen_at": resource["last_seen_at"],
                            "deleted_at": None,
                            "updated_at": func.now(),
                        },
                    )
                )
            if summary["usage"]:
                conn.execute(
                    pg_insert(usage_table).values(
                        snapshot_id=snapshot_id,
                        workspace_id=workspace_id,
                        cluster_id=cluster_id,
                        sampled_at=observed_at,
                        usage=summary["usage"],
                    )
                )
            if payload.get("replace") and seen_keys and seen_types:
                result = conn.execute(
                    update(resource_table)
                    .where(
                        resource_table.c.workspace_id == workspace_id,
                        resource_table.c.cluster_id == cluster_id,
                        resource_table.c.resource_type.in_(seen_types),
                        resource_table.c.inventory_key.notin_(seen_keys),
                        resource_table.c.deleted_at.is_(None),
                    )
                    .values(deleted_at=func.now(), updated_at=func.now())
                )
                marked_deleted = int(result.rowcount or 0)

        return {
            "accepted": True,
            "snapshot_id": snapshot_id,
            "cluster_id": cluster_id,
            "resource_count": len(normalized),
            "marked_deleted": marked_deleted,
            "resource_types": sorted(seen_types),
        }

    def list_inventory_resources(
        self,
        *,
        workspace_id: str,
        cluster_id: str,
        resource_type: str | None = None,
        namespace: str | None = None,
        include_deleted: bool = False,
        limit: int = 200,
    ) -> list[JsonObject]:
        table = ClusterInventoryResourceRecord.__table__
        statement = select(table).where(
            table.c.workspace_id == workspace_id,
            table.c.cluster_id == cluster_id,
        )
        if resource_type:
            statement = statement.where(table.c.resource_type == resource_type)
        if namespace:
            statement = statement.where(table.c.namespace == namespace)
        if not include_deleted:
            statement = statement.where(table.c.deleted_at.is_(None))
        statement = statement.order_by(
            table.c.resource_type,
            table.c.namespace.nullsfirst(),
            table.c.name,
        ).limit(max(1, min(limit, 1000)))
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        return [self.serialize_inventory_resource(dict(row)) for row in rows]

    def latest_inventory_snapshot(self, workspace_id: str, cluster_id: str) -> JsonObject | None:
        table = ClusterInventorySnapshotRecord.__table__
        statement = (
            select(
                table.c.snapshot_id,
                table.c.workspace_id,
                table.c.cluster_id,
                table.c.agent_id,
                table.c.source,
                table.c.status,
                table.c.collected_at,
                table.c.resource_count,
                table.c.summary,
                table.c.created_at,
            )
            .where(table.c.workspace_id == workspace_id, table.c.cluster_id == cluster_id)
            .order_by(table.c.created_at.desc())
            .limit(1)
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return self.serialize_inventory_snapshot(dict(row)) if row else None

    def inventory_resource_counts(self, workspace_id: str, cluster_id: str) -> list[JsonObject]:
        table = ClusterInventoryResourceRecord.__table__
        statement = (
            select(
                table.c.resource_type,
                table.c.health,
                func.count().label("count"),
            )
            .where(
                table.c.workspace_id == workspace_id,
                table.c.cluster_id == cluster_id,
                table.c.deleted_at.is_(None),
            )
            .group_by(table.c.resource_type, table.c.health)
            .order_by(table.c.resource_type, table.c.health)
        )
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        return [
            {
                "resource_type": row["resource_type"],
                "health": row["health"],
                "count": int(row["count"]),
            }
            for row in rows
        ]

    def serialize_inventory_snapshot(self, row: JsonObject) -> JsonObject:
        item = dict(row)
        item["collected_at"] = iso_or_none(item.get("collected_at"))
        item["created_at"] = iso_or_none(item.get("created_at"))
        return item

    def serialize_inventory_resource(self, row: JsonObject) -> JsonObject:
        item = dict(row)
        item["observed_at"] = iso_or_none(item.get("observed_at"))
        item["first_seen_at"] = iso_or_none(item.get("first_seen_at"))
        item["last_seen_at"] = iso_or_none(item.get("last_seen_at"))
        item["deleted_at"] = iso_or_none(item.get("deleted_at"))
        item["created_at"] = iso_or_none(item.get("created_at"))
        item["updated_at"] = iso_or_none(item.get("updated_at"))
        return item

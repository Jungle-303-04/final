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

# 스냅샷 리소스 배치 업서트 청크 크기 — 다중 VALUES 1문으로 실행되는 행 수 상한.
# (파라미터 수 제한과 단일 트랜잭션 락 시간 사이의 절충값, env 아님: 계약이 아니라 내부 상수)
INVENTORY_UPSERT_CHUNK = 500

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


def first_container_image(raw: JsonObject, summary: JsonObject) -> str | None:
    """K8s 리소스 raw/summary 에서 첫 컨테이너 이미지를 찾음(workload → pod → summary 순)."""
    for path in (("spec", "template", "spec", "containers"), ("spec", "containers")):
        node: object = raw
        for key in path:
            node = node.get(key) if isinstance(node, dict) else None
            if node is None:
                break
        if isinstance(node, list):
            for container in node:
                image = container.get("image") if isinstance(container, dict) else None
                if image:
                    return str(image)
    image = summary.get("image")
    return str(image) if image else None


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
            # 배치 업서트 — 리소스당 1문(5천 팟 = 5천 쿼리)이던 것을 청크당 1문으로.
            # excluded.* 로 충돌 행을 새 값으로 갱신하므로 행별 set_ 값을 만들 필요가 없다.
            for start in range(0, len(normalized), INVENTORY_UPSERT_CHUNK):
                chunk = normalized[start : start + INVENTORY_UPSERT_CHUNK]
                insert = pg_insert(resource_table).values(
                    [{**resource, "deleted_at": None} for resource in chunk]
                )
                update_columns = {
                    column: insert.excluded[column]
                    for column in (
                        "snapshot_id",
                        "api_version",
                        "kind",
                        "namespace",
                        "name",
                        "uid",
                        "resource_version",
                        "status",
                        "health",
                        "labels",
                        "annotations",
                        "summary",
                        "raw",
                        "observed_at",
                        "last_seen_at",
                    )
                }
                conn.execute(
                    insert.on_conflict_do_update(
                        index_elements=[resource_table.c.inventory_key],
                        set_={**update_columns, "deleted_at": None, "updated_at": func.now()},
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

    def get_actual_resource_image(
        self,
        workspace_id: str,
        cluster_id: str,
        namespace: str | None,
        resource: str,
    ) -> str | None:
        """diff-worker actual-state 조회 — 최신 inventory 리소스에서 컨테이너 이미지 추출.

        resource 는 gitops resource_ref 형식("kind/name", kind 는 소문자)이다.
        스냅샷이 없거나 이미지가 없으면 None — 호출부(diff-worker)가 "unknown" 처리.
        """
        kind, _, name = str(resource).partition("/")
        if not kind or not name:
            return None
        table = ClusterInventoryResourceRecord.__table__
        statement = (
            select(table.c.summary, table.c.raw)
            .where(
                table.c.workspace_id == workspace_id,
                table.c.cluster_id == cluster_id,
                func.lower(table.c.kind) == kind.strip().lower(),
                table.c.name == name,
                table.c.deleted_at.is_(None),
            )
            .order_by(table.c.last_seen_at.desc())
            .limit(1)
        )
        if namespace:
            statement = statement.where(table.c.namespace == namespace)
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        if row is None:
            return None
        return first_container_image(
            dict(row["raw"] or {}),
            dict(row["summary"] or {}),
        )

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

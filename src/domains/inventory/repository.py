"""inventory 도메인 repository — 클러스터 리소스 스냅샷·read model 영속."""

from __future__ import annotations

import hashlib
import json
import uuid
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal

from sqlalchemy import func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from domains.inventory.models import (
    ClusterInventoryResourceRecord,
    ClusterInventorySnapshotRecord,
    ClusterUsageSampleRecord,
)
from domains.inventory_filter.repository import (
    inventory_snapshot_lock_key,
    sync_inventory_filter_projection,
)
from domains.timeline.mapping import inventory_timeline_event
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.timeline import TimelineEvent
from packages.storage.engine import DatabaseConnection, iso_or_none

# 스냅샷 리소스 배치 업서트 청크 크기 — 다중 VALUES 1문으로 실행되는 행 수 상한.
# (파라미터 수 제한과 단일 트랜잭션 락 시간 사이의 절충값, env 아님: 계약이 아니라 내부 상수)
INVENTORY_UPSERT_CHUNK = 500

SYNTHETIC_NAMESPACE = None
HEALTH_RESOURCE_TYPE = "health"
USAGE_RESOURCE_TYPE = "usage"
UNKNOWN_STATUS = "unknown"

# fleet 롤업 대상 리소스 타입·판정 기준값 — kubernetes_snapshot 이 기록하는 값과 동일해야 함.
POD_RESOURCE_TYPE = "pod"
NODE_RESOURCE_TYPE = "node"
WORKLOAD_RESOURCE_TYPE = "workload"
EVENT_RESOURCE_TYPE = "event"
FLEET_ROLLUP_RESOURCE_TYPES = (POD_RESOURCE_TYPE, NODE_RESOURCE_TYPE, WORKLOAD_RESOURCE_TYPE)
POD_RUNNING_STATUS = "Running"
NODE_READY_STATUS = "Ready"
DEGRADED_HEALTH = "degraded"

# 이 필드들은 수집 시점·read-model bookkeeping 이 아니라 실제 inventory resource의
# 상태를 뜻한다. 스냅샷 ID/관측시각은 매 수집마다 달라질 수 있으므로 timeline 변경 판정에
# 포함하지 않는다.
INVENTORY_TIMELINE_SEMANTIC_FIELDS = (
    "resource_type",
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
)
InventoryTimelineChange = Literal["add", "update", "delete"]


@dataclass(frozen=True)
class InventorySnapshotMutation:
    """수집 저장의 내부 결과.

    ``timeline_events``는 ledger append 전의 도메인 사실이다. HTTP 응답은 ``result``만
    사용하므로 내부 mutation/ledger sequence가 외부 계약으로 새지 않는다.
    """

    result: JsonObject
    timeline_events: tuple[TimelineEvent, ...] = ()


def live_inventory_snapshot_clause(table: Any) -> Any:
    """Legacy/normal snapshots are fleet truth; label-scoped RCA snapshots are not."""
    return func.coalesce(
        table.c.summary["summary"]["live_inventory"].as_boolean(),
        True,
    ).is_(True)


def parse_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed


def parse_observed_at(value: str | None) -> datetime:
    return parse_timestamp(value) or datetime.now(UTC)


def inventory_resource_times(
    resource_type: str,
    summary: JsonObject,
    collected_at: datetime,
) -> tuple[datetime, datetime]:
    """Return first/last occurrence time without conflating collection time.

    Kubernetes Event objects can remain in the API long after the underlying failure was
    resolved. Their first/last timestamps describe the event; ``collected_at`` only says
    when the agent happened to read that object.
    """
    if resource_type != EVENT_RESOURCE_TYPE:
        return collected_at, collected_at
    parsed_first = parse_timestamp(
        str(summary.get("first_timestamp")) if summary.get("first_timestamp") else None
    )
    parsed_last = parse_timestamp(
        str(summary.get("last_timestamp")) if summary.get("last_timestamp") else None
    )
    first_seen = parsed_first or parsed_last or collected_at
    last_seen = parsed_last or parsed_first or collected_at
    return first_seen, last_seen


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
    summary = dict(resource.get("summary") or {})
    first_seen_at, last_seen_at = inventory_resource_times(
        resource_type,
        summary,
        observed_at,
    )
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
        "summary": summary,
        "raw": dict(resource.get("raw") or {}),
        "observed_at": last_seen_at,
        "first_seen_at": first_seen_at,
        "last_seen_at": last_seen_at,
        "deleted_at": None,
    }


def dedupe_inventory_rows(rows: list[JsonObject]) -> list[JsonObject]:
    """conflict key(inventory_key) 중복 행 제거 — 마지막 관측 승리(last-wins).

    kubernetes provider 가 namespace 별 쿼리 결과를 병합하면 cluster-scoped 리소스
    (node 등)가 같은 스냅샷 안에 중복 수집될 수 있다. 같은 배치 VALUES 에 같은
    conflict key 가 두 번 들어가면 postgres 가 "ON CONFLICT DO UPDATE command cannot
    affect row a second time"(CardinalityViolation) 으로 스냅샷 저장 전체를 실패시키므로,
    upsert 전에 키당 1행으로 줄인다. dict 삽입 순서 특성상 위치는 첫 관측, 값은 마지막
    관측이 남는다.
    """
    by_key: dict[str, JsonObject] = {}
    for row in rows:
        by_key[str(row["inventory_key"])] = row
    return list(by_key.values())


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


def inventory_timeline_events(
    *,
    workspace_id: str,
    cluster_id: str,
    observed_at: datetime,
    previous_rows: Sequence[Mapping[str, object]],
    current_rows: Sequence[Mapping[str, object]],
    resources_complete: bool,
) -> tuple[TimelineEvent, ...]:
    """Derive durable inventory changes from one authoritative collection cut.

    An incomplete collection may be missing arbitrary namespaces or resource kinds, so it
    cannot truthfully establish either an addition or a deletion. The resource read model
    still accepts it, but the timeline receives no fact until a complete collection has
    established the comparison boundary.
    """
    if not resources_complete:
        return ()

    previous_by_key = {
        str(row["inventory_key"]): row
        for row in previous_rows
        if is_timeline_inventory_resource(row)
    }
    current_by_key = {
        str(row["inventory_key"]): row
        for row in current_rows
        if is_timeline_inventory_resource(row)
    }
    changes: list[tuple[InventoryTimelineChange, Mapping[str, object]]] = []
    for inventory_key in sorted(current_by_key):
        current = current_by_key[inventory_key]
        previous = previous_by_key.get(inventory_key)
        if previous is None:
            changes.append(("add", current))
        elif inventory_resource_changed(previous, current):
            changes.append(("update", current))
    for inventory_key in sorted(set(previous_by_key) - set(current_by_key)):
        changes.append(("delete", previous_by_key[inventory_key]))

    return tuple(
        inventory_change_timeline_event(
            workspace_id=workspace_id,
            cluster_id=cluster_id,
            observed_at=observed_at,
            event_type=event_type,
            resource=resource,
        )
        for event_type, resource in changes
    )


def is_timeline_inventory_resource(resource: Mapping[str, object]) -> bool:
    """Exclude derived health/usage rollups until they receive their own source contract."""
    return str(resource.get("resource_type") or "") not in {
        HEALTH_RESOURCE_TYPE,
        USAGE_RESOURCE_TYPE,
    }


def inventory_resource_changed(
    previous: Mapping[str, object], current: Mapping[str, object]
) -> bool:
    """Compare persisted resource facts without collection bookkeeping noise."""
    return any(
        inventory_timeline_semantic_value(field, previous.get(field))
        != inventory_timeline_semantic_value(field, current.get(field))
        for field in INVENTORY_TIMELINE_SEMANTIC_FIELDS
    )


def inventory_timeline_semantic_value(field: str, value: object) -> object:
    """Strip a known collection-only annotation before comparing source facts."""
    if field == "summary" and isinstance(value, Mapping):
        summary = dict(value)
        summary.pop("collected_at", None)
        return summary
    return value


def inventory_change_timeline_event(
    *,
    workspace_id: str,
    cluster_id: str,
    observed_at: datetime,
    event_type: InventoryTimelineChange,
    resource: Mapping[str, object],
) -> TimelineEvent:
    """Map one resource delta without exposing raw resource data or ledger position."""
    inventory_key = str(resource["inventory_key"])
    kind = str(resource.get("kind") or resource.get("resource_type") or "Resource")
    name = str(resource.get("name") or inventory_key)
    namespace_value = resource.get("namespace")
    namespace = str(namespace_value) if namespace_value is not None else None
    uid_value = resource.get("uid")
    uid = str(uid_value) if uid_value is not None else None
    source_key = inventory_timeline_source_key(event_type, resource)
    verb = {"add": "added", "update": "updated", "delete": "deleted"}[event_type]
    return inventory_timeline_event(
        event_id=source_key,
        source_key=source_key,
        native_id=inventory_key,
        occurred_at=observed_at,
        workspace_id=workspace_id,
        cluster_id=cluster_id,
        api_version=str(resource.get("api_version") or ""),
        resource_kind=kind,
        namespace=namespace,
        name=name,
        uid=uid,
        title=f"{kind} {name} {verb}",
        event_type=event_type,
    )


def inventory_timeline_source_key(
    event_type: InventoryTimelineChange,
    resource: Mapping[str, object],
) -> str:
    """Use a fact fingerprint, never a generated snapshot ID, for ledger idempotency."""
    inventory_key = str(resource["inventory_key"])
    fingerprint = hashlib.sha256(
        json.dumps(
            {
                field: inventory_timeline_semantic_value(field, resource.get(field))
                for field in INVENTORY_TIMELINE_SEMANTIC_FIELDS
            },
            ensure_ascii=True,
            sort_keys=True,
            separators=(",", ":"),
            default=str,
        ).encode()
    ).hexdigest()
    return f"inventory:{event_type}:{inventory_key}:{fingerprint}"


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
    def save_live_cluster_usage_sample(
        self,
        *,
        workspace_id: str,
        cluster_id: str,
        sampled_at: datetime,
        usage: JsonObject,
    ) -> bool:
        """Persist one real realtime-gateway sample against the current inventory cut.

        The browser live path used to terminate at the gateway's in-memory hub.  That made
        alert evaluation and replay depend on the much slower evidence snapshot cadence.
        Reusing the latest authoritative snapshot id keeps the existing temporal join and
        authorization boundary intact while storing only values the agent actually sent.
        """
        if not workspace_id or not cluster_id or not usage:
            return False
        snapshot = ClusterInventorySnapshotRecord.__table__
        samples = ClusterUsageSampleRecord.__table__
        with self.connection() as conn:
            snapshot_id = conn.execute(
                select(snapshot.c.snapshot_id)
                .where(
                    snapshot.c.workspace_id == workspace_id,
                    snapshot.c.cluster_id == cluster_id,
                    snapshot.c.status != "ignored_stale",
                )
                .order_by(snapshot.c.collected_at.desc(), snapshot.c.created_at.desc())
                .limit(1)
            ).scalar_one_or_none()
            if snapshot_id is None:
                return False
            conn.execute(
                pg_insert(samples).values(
                    snapshot_id=str(snapshot_id),
                    workspace_id=workspace_id,
                    cluster_id=cluster_id,
                    sampled_at=sampled_at,
                    usage=dict(usage),
                )
            )
        return True

    def save_inventory_snapshot(
        self,
        *,
        workspace_id: str,
        cluster_id: str,
        agent_id: str,
        payload: JsonObject,
    ) -> JsonObject:
        """Compatibility persistence entry point without exposing internal timeline facts.

        The delegated mutation retains the complete-cut replacement boundary
        (``snapshot_id != current snapshot``); callers of this legacy response-only method
        cannot observe its internal timeline facts.
        """
        return self.save_inventory_snapshot_mutation(
            workspace_id=workspace_id,
            cluster_id=cluster_id,
            agent_id=agent_id,
            payload=payload,
        ).result

    def save_inventory_snapshot_mutation(
        self,
        *,
        workspace_id: str,
        cluster_id: str,
        agent_id: str,
        payload: JsonObject,
    ) -> InventorySnapshotMutation:
        snapshot_id = str(uuid.uuid4())
        observed_at = parse_observed_at(payload.get("collected_at"))
        resources = snapshot_resources(payload)
        # 중복 inventory_key 는 upsert 전에 제거 — 배치 안 중복은 CardinalityViolation 을 유발.
        normalized = dedupe_inventory_rows(
            [
                normalize_inventory_resource(
                    resource,
                    workspace_id=workspace_id,
                    cluster_id=cluster_id,
                    snapshot_id=snapshot_id,
                    observed_at=observed_at,
                )
                for resource in resources
            ]
        )

        snapshot_table = ClusterInventorySnapshotRecord.__table__
        resource_table = ClusterInventoryResourceRecord.__table__
        usage_table = ClusterUsageSampleRecord.__table__
        summary = snapshot_summary(payload)
        seen_types = {resource["resource_type"] for resource in normalized}
        marked_deleted = 0
        source_summary = dict(summary.get("summary") or {})
        collection_limits = source_summary.get("collection_limits")
        source_truncated = (
            isinstance(collection_limits, dict) and collection_limits.get("truncated") is True
        )
        declared_resources_complete = source_summary.get("resources_complete") is True
        resources_complete = bool(payload.get("replace")) and declared_resources_complete
        resources_complete = resources_complete and not source_truncated
        labels_complete = resources_complete and source_summary.get("labels_complete") is True
        partial_reason_codes: list[str] = []
        if not labels_complete:
            partial_reason_codes.append("source_labels_truncated")
        if source_truncated:
            partial_reason_codes.append("source_resources_truncated")
        elif not resources_complete:
            partial_reason_codes.append("source_resources_incomplete")

        with self.connection() as conn:
            conn.execute(
                select(
                    func.pg_advisory_xact_lock(
                        inventory_snapshot_lock_key(workspace_id, cluster_id)
                    )
                )
            )
            latest_observed_at = conn.execute(
                select(func.max(snapshot_table.c.collected_at)).where(
                    snapshot_table.c.workspace_id == workspace_id,
                    snapshot_table.c.cluster_id == cluster_id,
                )
            ).scalar_one_or_none()
            if latest_observed_at is not None and observed_at < latest_observed_at:
                conn.execute(
                    pg_insert(snapshot_table).values(
                        snapshot_id=snapshot_id,
                        workspace_id=workspace_id,
                        cluster_id=cluster_id,
                        agent_id=agent_id,
                        source=str(payload.get("source") or "cluster-agent"),
                        status="ignored_stale",
                        collected_at=observed_at,
                        resource_count=len(normalized),
                        summary=summary,
                    )
                )
                return InventorySnapshotMutation(
                    result={
                        "accepted": False,
                        "snapshot_id": snapshot_id,
                        "cluster_id": cluster_id,
                        "resource_count": len(normalized),
                        "marked_deleted": 0,
                        "resource_types": sorted(seen_types),
                    }
                )
            # Read the prior live cut only after taking the same transaction-scoped advisory
            # lock used by all inventory writers. This makes concurrent collectors observe a
            # single ordered state transition before either one builds timeline facts.
            previous_rows = [
                dict(row)
                for row in conn.execute(
                    select(resource_table).where(
                        resource_table.c.workspace_id == workspace_id,
                        resource_table.c.cluster_id == cluster_id,
                        resource_table.c.deleted_at.is_(None),
                    )
                )
                .mappings()
                .all()
            ]
            timeline_events = inventory_timeline_events(
                workspace_id=workspace_id,
                cluster_id=cluster_id,
                observed_at=observed_at,
                previous_rows=previous_rows,
                current_rows=normalized,
                resources_complete=resources_complete,
            )
            missing_inventory_keys = sorted(
                {str(row["inventory_key"]) for row in previous_rows}
                - {str(row["inventory_key"]) for row in normalized}
            )
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
                        set_={
                            **update_columns,
                            "first_seen_at": func.least(
                                resource_table.c.first_seen_at,
                                insert.excluded.first_seen_at,
                            ),
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
            if resources_complete and missing_inventory_keys:
                result = conn.execute(
                    update(resource_table)
                    .where(
                        resource_table.c.workspace_id == workspace_id,
                        resource_table.c.cluster_id == cluster_id,
                        resource_table.c.snapshot_id != snapshot_id,
                        resource_table.c.inventory_key.in_(missing_inventory_keys),
                        resource_table.c.deleted_at.is_(None),
                    )
                    .values(deleted_at=func.now(), updated_at=func.now())
                )
                marked_deleted = int(result.rowcount or 0)

            sync_inventory_filter_projection(
                conn,
                workspace_id=workspace_id,
                cluster_id=cluster_id,
                snapshot_id=snapshot_id,
                observed_at=observed_at,
                labels_complete=labels_complete,
                resources_complete=resources_complete,
                partial_reason_codes=partial_reason_codes,
            )

        return InventorySnapshotMutation(
            result={
                "accepted": True,
                "snapshot_id": snapshot_id,
                "cluster_id": cluster_id,
                "resource_count": len(normalized),
                "marked_deleted": marked_deleted,
                "resource_types": sorted(seen_types),
            },
            timeline_events=timeline_events,
        )

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

    def get_inventory_resource(
        self,
        *,
        workspace_id: str,
        cluster_id: str,
        resource_type: str,
        kind: str,
        name: str,
        namespace: str | None = None,
    ) -> JsonObject | None:
        """단일 resource identity 조회 — 드릴다운은 list 결과 추론 대신 이 계약을 사용."""
        table = ClusterInventoryResourceRecord.__table__
        statement = (
            select(table)
            .where(
                table.c.workspace_id == workspace_id,
                table.c.cluster_id == cluster_id,
                table.c.resource_type == resource_type.strip().lower(),
                func.lower(table.c.kind) == kind.strip().lower(),
                table.c.name == name,
                table.c.deleted_at.is_(None),
            )
            .order_by(table.c.last_seen_at.desc())
            .limit(1)
        )
        if namespace is None:
            statement = statement.where(table.c.namespace.is_(None))
        else:
            statement = statement.where(table.c.namespace == namespace)
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return self.serialize_inventory_resource(dict(row)) if row else None

    def get_inventory_resource_by_key(
        self,
        *,
        workspace_id: str,
        inventory_key: str,
    ) -> JsonObject | None:
        """서버가 발급한 inventory_key를 세션 workspace 안에서 다시 물질화한다."""
        table = ClusterInventoryResourceRecord.__table__
        statement = (
            select(table)
            .where(
                table.c.workspace_id == workspace_id,
                table.c.inventory_key == inventory_key,
                table.c.deleted_at.is_(None),
            )
            .limit(1)
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return self.serialize_inventory_resource(dict(row)) if row else None

    def list_related_inventory_resources(
        self,
        *,
        workspace_id: str,
        cluster_id: str,
        resource: JsonObject,
        limit: int = 100,
    ) -> dict[str, list[JsonObject]]:
        """실제 inventory 필드로 계산한 1-hop 관계.

        - node -> scheduled pods(summary.node_name)
        - service -> selector 와 pod labels 매칭
        - workload -> selector 또는 pod owner 매칭
        """
        resource_type = str(resource.get("resource_type") or "").lower()
        namespace = resource.get("namespace")
        name = str(resource.get("name") or "")
        summary = dict(resource.get("summary") or {})
        related: dict[str, list[JsonObject]] = {}

        if resource_type == NODE_RESOURCE_TYPE:
            pods = self.list_inventory_resources(
                workspace_id=workspace_id,
                cluster_id=cluster_id,
                resource_type=POD_RESOURCE_TYPE,
                include_deleted=False,
                limit=1000,
            )
            related["pods"] = [
                pod for pod in pods if dict(pod.get("summary") or {}).get("node_name") == name
            ][: max(1, min(limit, 1000))]
            return related

        if resource_type == "service":
            selector = selector_labels(summary.get("selector"))
            if selector:
                pods = self.list_inventory_resources(
                    workspace_id=workspace_id,
                    cluster_id=cluster_id,
                    resource_type=POD_RESOURCE_TYPE,
                    namespace=str(namespace) if namespace is not None else None,
                    include_deleted=False,
                    limit=1000,
                )
                related["pods"] = [
                    pod for pod in pods if labels_match(selector, pod_summary_labels(pod))
                ][: max(1, min(limit, 1000))]
            return related

        if resource_type == WORKLOAD_RESOURCE_TYPE:
            selector = selector_labels(summary.get("selector"))
            kind = str(resource.get("kind") or "")
            pods = self.list_inventory_resources(
                workspace_id=workspace_id,
                cluster_id=cluster_id,
                resource_type=POD_RESOURCE_TYPE,
                namespace=str(namespace) if namespace is not None else None,
                include_deleted=False,
                limit=1000,
            )
            related["pods"] = [
                pod
                for pod in pods
                if (selector and labels_match(selector, pod_summary_labels(pod)))
                or pod_owner_matches(pod, kind=kind, name=name)
            ][: max(1, min(limit, 1000))]
            return related

        return related

    def list_resource_events(
        self,
        *,
        workspace_id: str,
        cluster_id: str,
        resource: JsonObject,
        limit: int = 50,
    ) -> list[JsonObject]:
        """Kubernetes Event 의 involvedObject 기준으로 단일 리소스 이벤트만 반환."""
        table = ClusterInventoryResourceRecord.__table__
        kind = str(resource.get("kind") or "")
        name = str(resource.get("name") or "")
        uid = resource.get("uid")
        summary_filters = [table.c.summary.contains({"involved_kind": kind, "involved_name": name})]
        if uid:
            summary_filters.append(table.c.summary.contains({"involved_uid": str(uid)}))
        statement = (
            select(table)
            .where(
                table.c.workspace_id == workspace_id,
                table.c.cluster_id == cluster_id,
                table.c.resource_type == EVENT_RESOURCE_TYPE,
                table.c.deleted_at.is_(None),
                or_(*summary_filters),
            )
            .order_by(table.c.observed_at.desc())
            .limit(max(1, min(limit, 200)))
        )
        namespace = resource.get("namespace")
        if namespace is not None:
            statement = statement.where(table.c.namespace == namespace)
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        matched = [
            self.serialize_inventory_resource(dict(row))
            for row in rows
            if event_involves_resource(dict(row), resource)
        ]
        return matched[: max(1, min(limit, 200))]

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

    def list_cluster_usage_samples(
        self,
        workspace_id: str,
        cluster_id: str,
        *,
        limit: int = 288,
    ) -> list[JsonObject]:
        """실측 usage 롤업 시계열 — 최신 limit 개를 시간 오름차순으로 반환(차트용)."""
        table = ClusterUsageSampleRecord.__table__
        newest_first = (
            select(table.c.sampled_at, table.c.usage)
            .where(table.c.workspace_id == workspace_id, table.c.cluster_id == cluster_id)
            .order_by(table.c.sampled_at.desc())
            .limit(max(1, min(limit, 2000)))
            .subquery()
        )
        statement = select(newest_first).order_by(newest_first.c.sampled_at.asc())
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        return [
            {"sampled_at": iso_or_none(row["sampled_at"]), "usage": dict(row["usage"] or {})}
            for row in rows
        ]

    def fleet_inventory_rollup(
        self,
        workspace_id: str,
        cluster_ids: set[str] | None = None,
    ) -> dict[str, JsonObject]:
        """fleet 화면용 클러스터별 pod/node/workload 상태 롤업(1 쿼리, GROUP BY).

        cluster_ids 는 None(전체 허용) 또는 허용 집합 — 빈 집합이면 즉시 {} (권한 0).
        반환: {cluster_id: {pods_running, pods_total, nodes_ready, nodes_total,
        workloads_degraded, workloads_total, last_seen_at}}.
        """
        if cluster_ids is not None and not cluster_ids:
            return {}
        table = ClusterInventoryResourceRecord.__table__
        statement = (
            select(
                table.c.cluster_id,
                table.c.resource_type,
                table.c.status,
                table.c.health,
                func.count().label("count"),
                func.max(table.c.last_seen_at).label("last_seen_at"),
            )
            .where(
                table.c.workspace_id == workspace_id,
                table.c.resource_type.in_(FLEET_ROLLUP_RESOURCE_TYPES),
                table.c.deleted_at.is_(None),
            )
            .group_by(table.c.cluster_id, table.c.resource_type, table.c.status, table.c.health)
        )
        if cluster_ids is not None:
            statement = statement.where(table.c.cluster_id.in_(cluster_ids))
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        rollup: dict[str, JsonObject] = {}
        for row in rows:
            entry = rollup.setdefault(
                str(row["cluster_id"]),
                {
                    "pods_running": 0,
                    "pods_total": 0,
                    "nodes_ready": 0,
                    "nodes_total": 0,
                    "workloads_degraded": 0,
                    "workloads_total": 0,
                    "last_seen_at": None,
                },
            )
            count = int(row["count"])
            resource_type = row["resource_type"]
            if resource_type == POD_RESOURCE_TYPE:
                entry["pods_total"] += count
                if row["status"] == POD_RUNNING_STATUS:
                    entry["pods_running"] += count
            elif resource_type == NODE_RESOURCE_TYPE:
                entry["nodes_total"] += count
                if row["status"] == NODE_READY_STATUS:
                    entry["nodes_ready"] += count
            elif resource_type == WORKLOAD_RESOURCE_TYPE:
                entry["workloads_total"] += count
                if row["health"] == DEGRADED_HEALTH:
                    entry["workloads_degraded"] += count
            seen = iso_or_none(row["last_seen_at"])
            if seen is not None and (entry["last_seen_at"] is None or seen > entry["last_seen_at"]):
                entry["last_seen_at"] = seen
        return rollup

    def latest_cluster_usage_rollups(
        self,
        workspace_id: str,
        cluster_ids: set[str] | None = None,
        *,
        samples_per_cluster: int = 2,
    ) -> dict[str, list[JsonObject]]:
        """클러스터별 최신 usage 샘플 N개(시간 오름차순) — restarts_recent 델타 계산용.

        빈 허용 집합이면 즉시 {}. window function(row_number)으로 클러스터당 최신 N개만 취함.
        """
        if cluster_ids is not None and not cluster_ids:
            return {}
        table = ClusterUsageSampleRecord.__table__
        ranked = select(
            table.c.cluster_id,
            table.c.sampled_at,
            table.c.usage,
            func.row_number()
            .over(partition_by=table.c.cluster_id, order_by=table.c.sampled_at.desc())
            .label("recency_rank"),
        ).where(table.c.workspace_id == workspace_id)
        if cluster_ids is not None:
            ranked = ranked.where(table.c.cluster_id.in_(cluster_ids))
        subquery = ranked.subquery()
        statement = (
            select(subquery.c.cluster_id, subquery.c.sampled_at, subquery.c.usage)
            .where(subquery.c.recency_rank <= max(1, min(samples_per_cluster, 10)))
            .order_by(subquery.c.cluster_id, subquery.c.sampled_at.asc())
        )
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        samples: dict[str, list[JsonObject]] = {}
        for row in rows:
            samples.setdefault(str(row["cluster_id"]), []).append(
                {"sampled_at": iso_or_none(row["sampled_at"]), "usage": dict(row["usage"] or {})}
            )
        return samples

    def list_recent_warning_events(
        self,
        workspace_id: str,
        cluster_id: str,
        *,
        limit: int = 10,
    ) -> list[JsonObject]:
        """드릴다운용 현재 경고 이벤트 — 최신 snapshot의 event-time 최신순."""
        table = ClusterInventoryResourceRecord.__table__
        snapshots = ClusterInventorySnapshotRecord.__table__
        latest_snapshot_id = (
            select(snapshots.c.snapshot_id)
            .where(
                snapshots.c.workspace_id == workspace_id,
                snapshots.c.cluster_id == cluster_id,
                snapshots.c.status != "ignored_stale",
                live_inventory_snapshot_clause(snapshots),
            )
            .order_by(snapshots.c.collected_at.desc(), snapshots.c.created_at.desc())
            .limit(1)
            .scalar_subquery()
        )
        statement = (
            select(table)
            .where(
                table.c.workspace_id == workspace_id,
                table.c.cluster_id == cluster_id,
                table.c.resource_type == EVENT_RESOURCE_TYPE,
                table.c.health == DEGRADED_HEALTH,
                table.c.deleted_at.is_(None),
                table.c.snapshot_id == latest_snapshot_id,
            )
            .order_by(table.c.observed_at.desc())
            .limit(max(1, min(limit, 100)))
        )
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
            .where(
                table.c.workspace_id == workspace_id,
                table.c.cluster_id == cluster_id,
                live_inventory_snapshot_clause(table),
            )
            .order_by(table.c.created_at.desc())
            .limit(1)
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return self.serialize_inventory_snapshot(dict(row)) if row else None

    def latest_inventory_snapshots(
        self,
        workspace_id: str,
        cluster_ids: set[str],
    ) -> dict[str, JsonObject]:
        """클러스터별 최신 snapshot을 한 번의 window query로 반환한다."""
        if not cluster_ids:
            return {}
        table = ClusterInventorySnapshotRecord.__table__
        ranked = (
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
                func.row_number()
                .over(
                    partition_by=table.c.cluster_id,
                    order_by=(table.c.created_at.desc(), table.c.snapshot_id.desc()),
                )
                .label("snapshot_rank"),
            )
            .where(
                table.c.workspace_id == workspace_id,
                table.c.cluster_id.in_(cluster_ids),
                live_inventory_snapshot_clause(table),
            )
            .subquery()
        )
        statement = select(ranked).where(ranked.c.snapshot_rank == 1)
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        return {
            str(row["cluster_id"]): self.serialize_inventory_snapshot(
                {key: value for key, value in dict(row).items() if key != "snapshot_rank"}
            )
            for row in rows
        }

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


def selector_labels(value: object) -> dict[str, str]:
    if not isinstance(value, dict):
        return {}
    labels = value.get("matchLabels") if isinstance(value.get("matchLabels"), dict) else value
    return {str(key): str(val) for key, val in labels.items() if isinstance(key, str)}


def pod_summary_labels(pod: JsonObject) -> dict[str, str]:
    summary = pod.get("summary") if isinstance(pod.get("summary"), dict) else {}
    labels = summary.get("labels") if isinstance(summary.get("labels"), dict) else {}
    return {str(key): str(val) for key, val in labels.items() if isinstance(key, str)}


def labels_match(selector: dict[str, str], labels: dict[str, str]) -> bool:
    return bool(selector) and all(labels.get(key) == value for key, value in selector.items())


def pod_owner_matches(pod: JsonObject, *, kind: str, name: str) -> bool:
    summary = pod.get("summary") if isinstance(pod.get("summary"), dict) else {}
    owner_kind = str(summary.get("owner_kind") or "")
    owner_name = str(summary.get("owner_name") or "")
    return owner_kind.lower() == kind.lower() and owner_name == name


def event_involves_resource(event: JsonObject, resource: JsonObject) -> bool:
    summary = event.get("summary") if isinstance(event.get("summary"), dict) else {}
    involved_kind = str(summary.get("involved_kind") or "")
    involved_name = str(summary.get("involved_name") or "")
    involved_uid = summary.get("involved_uid")
    resource_kind = str(resource.get("kind") or "")
    resource_name = str(resource.get("name") or "")
    resource_uid = resource.get("uid")
    if resource_uid and involved_uid and str(involved_uid) == str(resource_uid):
        return True
    return involved_kind.lower() == resource_kind.lower() and involved_name == resource_name

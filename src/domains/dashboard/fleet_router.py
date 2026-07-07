"""fleet HTTP API — 콘솔 루트 화면용 워크스페이스 전체 클러스터 롤업.

health 판정 규칙(결정적, 단위 테스트로 고정):
- critical: degraded workload 수 > FLEET_DEGRADED_WORKLOAD_THRESHOLD(0) 또는 not-ready node 존재
- warning : restarts_recent > 0 또는 open_incidents > 0
- healthy : 그 외

집계 원천:
- pod/node/workload 상태 — inventory read model(cluster_inventory_resources) 롤업.
  inventory 에 pod/node 행이 없으면 최신 usage 샘플(pod_running 등)로 대체.
- restarts_recent — 최신 usage 샘플 2개의 restart_total 델타(음수는 0, 샘플<2 이면 0).
- cpu_pct/mem_pct — usage 샘플에 실측 값이 있을 때만(없으면 None, 합성 금지).
- open_incidents — rca_timeline 에서 종결 전(status not in CLOSED_INCIDENT_STATUSES) row 수.
- last_seen_at — agent 상태 → inventory 최근 관측 → usage 샘플 순으로 첫 값.
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from domains.identity.dependencies import require_cluster_access, require_session
from domains.target.router import BLOCKED_TEST_CLUSTER_IDS, BLOCKED_TEST_CLUSTER_NAME_PARTS
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.responses import (
    ClusterOpenIncidentItem,
    ClusterSummaryDetailResponse,
    ClusterUsageSnapshot,
    ClusterWarningEventItem,
    ClusterWorkloadHealthItem,
    FleetClusterSummaryItem,
    FleetSummaryResponse,
    FleetTotals,
)
from packages.contracts.identity import DEFAULT_WORKSPACE_ID, AccessResourceType, Permission
from packages.runtime.dependencies import get_db

# health 롤업 상수 — degraded workload 가 이 값을 초과하면 critical(0 = 1개라도 있으면).
FLEET_DEGRADED_WORKLOAD_THRESHOLD = 0
HEALTH_HEALTHY = "healthy"
HEALTH_WARNING = "warning"
HEALTH_CRITICAL = "critical"
UNKNOWN_WORKLOAD_HEALTH = "unknown"

FLEET_CLUSTER_LIMIT = 200
WORKLOAD_LIMIT = 500
WARNING_EVENT_LIMIT = 10
OPEN_INCIDENT_LIMIT = 20
NOT_FOUND_CODE = 404

router = APIRouter()


@router.get(gateway_routes.FLEET_SUMMARY_PATH, response_model=FleetSummaryResponse)
async def fleet_summary(
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> FleetSummaryResponse:
    """워크스페이스 fleet 롤업 — 세션 사용자가 읽을 수 있는 클러스터만 포함."""
    workspace_id = _workspace_id(current)
    allowed_cluster_ids = await asyncio.to_thread(
        db.accessible_resource_ids,
        current.user_id,
        workspace_id,
        AccessResourceType.CLUSTER.value,
        Permission.CLUSTER_READ.value,
    )
    return await asyncio.to_thread(build_fleet_summary, db, workspace_id, allowed_cluster_ids)


@router.get(gateway_routes.CLUSTER_SUMMARY_PATH, response_model=ClusterSummaryDetailResponse)
async def cluster_summary_detail(
    cluster_id: str,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ClusterSummaryDetailResponse:
    """fleet 타일 클릭 드릴다운 — 기존 클러스터 라우트와 같은 cluster.read 가드."""
    workspace_id = _workspace_id(current)
    require_cluster_access(
        db,
        current,
        workspace_id,
        cluster_id,
        Permission.CLUSTER_READ.value,
    )
    detail = await asyncio.to_thread(build_cluster_summary_detail, db, workspace_id, cluster_id)
    if detail is None:
        raise HTTPException(status_code=NOT_FOUND_CODE, detail="cluster not found")
    return detail


def build_fleet_summary(
    db: Any,
    workspace_id: str,
    allowed_cluster_ids: set[str] | None,
) -> FleetSummaryResponse:
    registrations = [
        cluster
        for cluster in db.list_cluster_registrations(
            workspace_id, cluster_ids=allowed_cluster_ids, limit=FLEET_CLUSTER_LIMIT
        )
        if not _is_blocked_test_cluster(cluster)
    ]
    cluster_ids = {str(cluster["cluster_id"]) for cluster in registrations}
    inventory = db.fleet_inventory_rollup(workspace_id, cluster_ids) if cluster_ids else {}
    usage = db.latest_cluster_usage_rollups(workspace_id, cluster_ids) if cluster_ids else {}
    open_counts = db.count_open_rca_incidents(workspace_id, cluster_ids) if cluster_ids else {}
    agents = db.latest_cluster_agent_statuses(workspace_id, cluster_ids) if cluster_ids else {}

    items = [
        fleet_cluster_item(
            cluster,
            inventory.get(str(cluster["cluster_id"]), {}),
            usage.get(str(cluster["cluster_id"]), []),
            open_counts.get(str(cluster["cluster_id"]), 0),
            agents.get(str(cluster["cluster_id"])),
        )
        for cluster in registrations
    ]
    health_counts = {HEALTH_HEALTHY: 0, HEALTH_WARNING: 0, HEALTH_CRITICAL: 0}
    for item in items:
        health_counts[item.health] = health_counts.get(item.health, 0) + 1
    totals = FleetTotals(
        clusters=len(items),
        healthy=health_counts[HEALTH_HEALTHY],
        warning=health_counts[HEALTH_WARNING],
        critical=health_counts[HEALTH_CRITICAL],
        open_incidents=sum(item.open_incidents for item in items),
        pending_approvals=int(db.count_open_workflow_approvals(workspace_id)),
        running_workflows=int(db.count_running_workflow_runs(workspace_id)),
        # dead letter 는 워크스페이스 컬럼이 없는 플랫폼 전역 큐 — 개수만 노출(내용은 admin 전용).
        dead_letters=int(db.open_dead_letter_count()),
    )
    return FleetSummaryResponse(clusters=items, totals=totals)


def build_cluster_summary_detail(
    db: Any,
    workspace_id: str,
    cluster_id: str,
) -> ClusterSummaryDetailResponse | None:
    registration = db.get_cluster_registration(workspace_id, cluster_id)
    if registration is None:
        return None

    workloads: dict[str, list[ClusterWorkloadHealthItem]] = {}
    for row in db.list_inventory_resources(
        workspace_id=workspace_id,
        cluster_id=cluster_id,
        resource_type="workload",
        namespace=None,
        include_deleted=False,
        limit=WORKLOAD_LIMIT,
    ):
        health = str(row.get("health") or UNKNOWN_WORKLOAD_HEALTH)
        workloads.setdefault(health, []).append(workload_health_item(row))

    warning_events = [
        warning_event_item(row)
        for row in db.list_recent_warning_events(
            workspace_id, cluster_id, limit=WARNING_EVENT_LIMIT
        )
    ]
    open_incidents = [
        ClusterOpenIncidentItem(**row)
        for row in db.list_open_rca_incidents(workspace_id, cluster_id, limit=OPEN_INCIDENT_LIMIT)
    ]

    rollup = db.fleet_inventory_rollup(workspace_id, {cluster_id}).get(cluster_id, {})
    samples = db.latest_cluster_usage_rollups(workspace_id, {cluster_id}).get(cluster_id, [])
    restarts_recent = restarts_recent_from_samples(samples)
    nodes_ready, nodes_total = _node_counts(rollup, _latest_usage(samples))
    health = rollup_health(
        workloads_degraded=int(rollup.get("workloads_degraded") or 0),
        nodes_ready=nodes_ready,
        nodes_total=nodes_total,
        restarts_recent=restarts_recent,
        open_incidents=len(open_incidents),
    )
    return ClusterSummaryDetailResponse(
        cluster_id=cluster_id,
        name=str(registration.get("name") or cluster_id),
        health=health,
        workloads=workloads,
        warning_events=warning_events,
        open_incidents=open_incidents,
        usage=usage_snapshot(samples[-1] if samples else None),
    )


def rollup_health(
    *,
    workloads_degraded: int,
    nodes_ready: int,
    nodes_total: int,
    restarts_recent: int,
    open_incidents: int,
) -> str:
    """결정적 health 롤업 — 모듈 docstring 의 규칙 그대로(순서: critical → warning → healthy)."""
    if workloads_degraded > FLEET_DEGRADED_WORKLOAD_THRESHOLD:
        return HEALTH_CRITICAL
    if nodes_total > 0 and nodes_ready < nodes_total:
        return HEALTH_CRITICAL
    if restarts_recent > 0 or open_incidents > 0:
        return HEALTH_WARNING
    return HEALTH_HEALTHY


def restarts_recent_from_samples(samples: list[JsonObject]) -> int:
    """최신 usage 샘플 2개의 restart_total 델타 — 샘플이 2개 미만이면 0, 음수(재수집)도 0."""
    if len(samples) < 2:
        return 0
    latest = _int_or_zero((samples[-1].get("usage") or {}).get("restart_total"))
    previous = _int_or_zero((samples[-2].get("usage") or {}).get("restart_total"))
    return max(latest - previous, 0)


def fleet_cluster_item(
    cluster: JsonObject,
    rollup: JsonObject,
    samples: list[JsonObject],
    open_incidents: int,
    agent: JsonObject | None,
) -> FleetClusterSummaryItem:
    latest_usage = _latest_usage(samples)
    pods_running, pods_total = _pod_counts(rollup, latest_usage)
    nodes_ready, nodes_total = _node_counts(rollup, latest_usage)
    restarts_recent = restarts_recent_from_samples(samples)
    return FleetClusterSummaryItem(
        cluster_id=str(cluster["cluster_id"]),
        name=str(cluster.get("name") or cluster["cluster_id"]),
        health=rollup_health(
            workloads_degraded=int(rollup.get("workloads_degraded") or 0),
            nodes_ready=nodes_ready,
            nodes_total=nodes_total,
            restarts_recent=restarts_recent,
            open_incidents=open_incidents,
        ),
        pods_running=pods_running,
        pods_total=pods_total,
        nodes_ready=nodes_ready,
        nodes_total=nodes_total,
        open_incidents=open_incidents,
        restarts_recent=restarts_recent,
        cpu_pct=usage_pct(latest_usage, ("cpu_pct", "cpu_percent"), ("cpu_ratio",)),
        mem_pct=usage_pct(latest_usage, ("mem_pct", "memory_pct"), ("mem_ratio", "memory_ratio")),
        last_seen_at=_last_seen_at(rollup, samples, agent),
    )


def usage_snapshot(sample: JsonObject | None) -> ClusterUsageSnapshot | None:
    if not sample:
        return None
    usage = dict(sample.get("usage") or {})
    return ClusterUsageSnapshot(
        sampled_at=sample.get("sampled_at"),
        pods_running=_int_or_zero(usage.get("pod_running")),
        pods_total=_int_or_zero(usage.get("pod_total")),
        nodes_ready=_int_or_zero(usage.get("node_ready")),
        nodes_total=_int_or_zero(usage.get("node_total")),
        restart_total=_int_or_zero(usage.get("restart_total")),
        cpu_pct=usage_pct(usage, ("cpu_pct", "cpu_percent"), ("cpu_ratio",)),
        mem_pct=usage_pct(usage, ("mem_pct", "memory_pct"), ("mem_ratio", "memory_ratio")),
    )


def usage_pct(
    usage: JsonObject,
    pct_keys: tuple[str, ...],
    ratio_keys: tuple[str, ...],
) -> float | None:
    """usage 롤업에서 실측 활용률(%)만 추출 — pct 키 우선, ratio 키는 ×100. 없으면 None."""
    for key in pct_keys:
        value = _float_or_none(usage.get(key))
        if value is not None:
            return round(value, 1)
    for key in ratio_keys:
        value = _float_or_none(usage.get(key))
        if value is not None:
            return round(value * 100.0, 1)
    return None


def workload_health_item(row: JsonObject) -> ClusterWorkloadHealthItem:
    summary = row.get("summary") if isinstance(row.get("summary"), dict) else {}
    return ClusterWorkloadHealthItem(
        name=str(row.get("name") or ""),
        kind=str(row.get("kind") or ""),
        namespace=row.get("namespace"),
        health=str(row.get("health") or UNKNOWN_WORKLOAD_HEALTH),
        # inventory status 는 "ready/desired" 문자열(kubernetes_snapshot._workload_resource).
        ready=str(row.get("status") or ""),
        restarts=_int_or_zero(summary.get("restart_total")),
    )


def warning_event_item(row: JsonObject) -> ClusterWarningEventItem:
    summary = row.get("summary") if isinstance(row.get("summary"), dict) else {}
    return ClusterWarningEventItem(
        namespace=row.get("namespace"),
        name=str(row.get("name") or ""),
        reason=summary.get("reason"),
        message=summary.get("message"),
        involved_kind=summary.get("involved_kind"),
        involved_name=summary.get("involved_name"),
        count=_int_or_zero(summary.get("count")),
        last_seen_at=row.get("last_seen_at"),
    )


def _pod_counts(rollup: JsonObject, latest_usage: JsonObject) -> tuple[int, int]:
    """inventory 롤업 우선, pod 행이 하나도 없으면 usage 샘플 대체."""
    total = _int_or_zero(rollup.get("pods_total"))
    if total > 0:
        return _int_or_zero(rollup.get("pods_running")), total
    return _int_or_zero(latest_usage.get("pod_running")), _int_or_zero(
        latest_usage.get("pod_total")
    )


def _node_counts(rollup: JsonObject, latest_usage: JsonObject) -> tuple[int, int]:
    total = _int_or_zero(rollup.get("nodes_total"))
    if total > 0:
        return _int_or_zero(rollup.get("nodes_ready")), total
    return _int_or_zero(latest_usage.get("node_ready")), _int_or_zero(
        latest_usage.get("node_total")
    )


def _latest_usage(samples: list[JsonObject]) -> JsonObject:
    if not samples:
        return {}
    usage = samples[-1].get("usage")
    return dict(usage) if isinstance(usage, dict) else {}


def _last_seen_at(
    rollup: JsonObject,
    samples: list[JsonObject],
    agent: JsonObject | None,
) -> str | None:
    if agent and agent.get("last_seen_at"):
        return str(agent["last_seen_at"])
    if rollup.get("last_seen_at"):
        return str(rollup["last_seen_at"])
    if samples and samples[-1].get("sampled_at"):
        return str(samples[-1]["sampled_at"])
    return None


def _is_blocked_test_cluster(cluster: JsonObject) -> bool:
    """/clusters 목록과 같은 테스트 클러스터 숨김 기준(target 라우터와 단일 소스)."""
    if cluster.get("cluster_id") in BLOCKED_TEST_CLUSTER_IDS:
        return True
    name = str(cluster.get("name") or "").lower()
    return any(marker in name for marker in BLOCKED_TEST_CLUSTER_NAME_PARTS)


def _int_or_zero(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _float_or_none(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _workspace_id(current: Any) -> str:
    return getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)

"""fleet API — 인증 401·워크스페이스 범위·health 롤업 규칙·빈 상태 검증."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.testclient import TestClient

from domains.dashboard.fleet_router import (
    restarts_recent_from_samples,
    rollup_health,
    usage_pct,
)
from domains.dashboard.fleet_router import router as fleet_router

WORKSPACE_ID = "workspace-1"
CLUSTER_ID = "cluster-1"


class _SessionAuth:
    """require_session 이 쓰는 app.state.auth 대역 — 세션 없으면 401."""

    def __init__(self, session: Any | None) -> None:
        self.session = session

    async def require_session(self, request: Request) -> Any:
        if self.session is None:
            raise HTTPException(status_code=401, detail="authentication required")
        return self.session


def _session() -> SimpleNamespace:
    return SimpleNamespace(user_id="user-1", roles=("user",), workspace_id=WORKSPACE_ID)


def _registration(cluster_id: str = CLUSTER_ID, name: str = "prod-cluster") -> dict[str, Any]:
    return {
        "workspace_id": WORKSPACE_ID,
        "cluster_id": cluster_id,
        "name": name,
        "environment": "prod",
        "status": "registered",
        "settings": {},
    }


def _usage_sample(sampled_at: str, restart_total: int) -> dict[str, Any]:
    return {
        "sampled_at": sampled_at,
        "usage": {
            "pod_total": 10,
            "pod_running": 9,
            "pod_pending": 1,
            "pod_failed": 0,
            "restart_total": restart_total,
            "node_total": 3,
            "node_ready": 3,
        },
    }


class FleetApiDb:
    """호출 인자를 기록하고 대본 데이터를 돌려주는 테스트용 저장소."""

    def __init__(
        self,
        *,
        allowed: set[str] | None = None,
        has_access: bool = True,
        registrations: list[dict[str, Any]] | None = None,
        rollup: dict[str, dict[str, Any]] | None = None,
        usage: dict[str, list[dict[str, Any]]] | None = None,
        open_counts: dict[str, int] | None = None,
        agents: dict[str, dict[str, Any]] | None = None,
        workloads: list[dict[str, Any]] | None = None,
        nodes: list[dict[str, Any]] | None = None,
        pods: list[dict[str, Any]] | None = None,
        warning_events: list[dict[str, Any]] | None = None,
        open_incidents: list[dict[str, Any]] | None = None,
        incident_lookup: dict[tuple[str, str], str] | None = None,
        pending_approvals: int = 0,
        running_workflows: int = 0,
        dead_letters: int = 0,
    ) -> None:
        self.allowed = allowed
        self.has_access = has_access
        self.registrations = registrations or []
        self.rollup = rollup or {}
        self.usage = usage or {}
        self.open_counts = open_counts or {}
        self.agents = agents or {}
        self.workloads = workloads or []
        self.nodes = nodes or []
        self.pods = pods or []
        self.warning_events = warning_events or []
        self.open_incidents = open_incidents or []
        self.incident_lookup = incident_lookup or {}
        self.pending_approvals = pending_approvals
        self.running_workflows = running_workflows
        self.dead_letters = dead_letters
        self.calls: list[tuple[Any, ...]] = []

    def accessible_resource_ids(
        self, user_id: str, workspace_id: str, resource_type: str, action: str
    ) -> set[str] | None:
        self.calls.append(("accessible", user_id, workspace_id, resource_type, action))
        return self.allowed

    def user_has_resource_access(
        self, user_id: str, workspace_id: str, resource_type: str, resource_id: str, action: str
    ) -> bool:
        self.calls.append(("has_access", user_id, workspace_id, resource_type, resource_id, action))
        return self.has_access

    def list_cluster_registrations(
        self, workspace_id: str, *, cluster_ids: set[str] | None = None, limit: int = 100
    ) -> list[dict[str, Any]]:
        self.calls.append(("registrations", workspace_id, cluster_ids, limit))
        if cluster_ids is not None and not cluster_ids:
            return []
        return self.registrations

    def get_cluster_registration(self, workspace_id: str, cluster_id: str) -> dict[str, Any] | None:
        self.calls.append(("registration", workspace_id, cluster_id))
        for cluster in self.registrations:
            if cluster["cluster_id"] == cluster_id:
                return cluster
        return None

    def fleet_inventory_rollup(
        self, workspace_id: str, cluster_ids: set[str] | None = None
    ) -> dict[str, dict[str, Any]]:
        self.calls.append(("rollup", workspace_id, cluster_ids))
        return self.rollup

    def latest_cluster_usage_rollups(
        self, workspace_id: str, cluster_ids: set[str] | None = None, **_: Any
    ) -> dict[str, list[dict[str, Any]]]:
        self.calls.append(("usage", workspace_id, cluster_ids))
        return self.usage

    def count_open_rca_incidents(
        self, workspace_id: str, allowed_cluster_ids: set[str] | None = None
    ) -> dict[str, int]:
        self.calls.append(("open_counts", workspace_id, allowed_cluster_ids))
        return self.open_counts

    def latest_cluster_agent_statuses(
        self, workspace_id: str, cluster_ids: set[str]
    ) -> dict[str, dict[str, Any]]:
        self.calls.append(("agents", workspace_id, cluster_ids))
        return self.agents

    def count_open_workflow_approvals(self, workspace_id: str) -> int:
        self.calls.append(("approvals", workspace_id))
        return self.pending_approvals

    def count_running_workflow_runs(self, workspace_id: str) -> int:
        self.calls.append(("workflows", workspace_id))
        return self.running_workflows

    def open_dead_letter_count(self) -> int:
        self.calls.append(("dead_letters",))
        return self.dead_letters

    def list_inventory_resources(self, **kwargs: Any) -> list[dict[str, Any]]:
        resource_type = kwargs.get("resource_type")
        self.calls.append(("inventory", resource_type, kwargs))
        if resource_type == "node":
            return self.nodes
        if resource_type == "pod":
            return self.pods
        return self.workloads

    def get_inventory_resource(self, **kwargs: Any) -> dict[str, Any] | None:
        self.calls.append(("inventory_detail", kwargs))
        if kwargs.get("resource_type") != "node":
            return None
        for node in self.nodes:
            if node["name"] == kwargs["name"]:
                return node
        return None

    def list_recent_warning_events(
        self, workspace_id: str, cluster_id: str, *, limit: int = 10
    ) -> list[dict[str, Any]]:
        self.calls.append(("warning_events", workspace_id, cluster_id, limit))
        return self.warning_events

    def list_open_rca_incidents(
        self, workspace_id: str, cluster_id: str, *, limit: int = 20
    ) -> list[dict[str, Any]]:
        self.calls.append(("open_incidents", workspace_id, cluster_id, limit))
        return self.open_incidents

    def latest_open_incidents_by_resource(
        self,
        workspace_id: str,
        cluster_id: str,
        *,
        resource_kind: str,
        resources: set[tuple[str, str]],
    ) -> dict[tuple[str, str], str]:
        self.calls.append(("incident_lookup", workspace_id, cluster_id, resource_kind, resources))
        return {key: value for key, value in self.incident_lookup.items() if key in resources}


def make_client(db: FleetApiDb, *, session: Any | None = None) -> TestClient:
    app = FastAPI()
    app.include_router(fleet_router)
    app.state.db = db
    app.state.auth = _SessionAuth(session)
    return TestClient(app)


def test_fleet_endpoints_require_session() -> None:
    client = make_client(FleetApiDb(), session=None)
    assert client.get("/fleet/summary").status_code == 401
    assert client.get(f"/clusters/{CLUSTER_ID}/summary").status_code == 401


def test_fleet_summary_scopes_to_accessible_clusters() -> None:
    db = FleetApiDb(
        allowed={CLUSTER_ID},
        registrations=[_registration()],
        rollup={
            CLUSTER_ID: {
                "pods_running": 8,
                "pods_total": 10,
                "nodes_ready": 3,
                "nodes_total": 3,
                "workloads_degraded": 0,
                "workloads_total": 4,
                "last_seen_at": "2026-07-07T10:05:00+00:00",
            }
        },
        usage={
            CLUSTER_ID: [
                _usage_sample("2026-07-07T09:00:00+00:00", 5),
                _usage_sample("2026-07-07T10:00:00+00:00", 5),
            ]
        },
        open_counts={CLUSTER_ID: 0},
        agents={CLUSTER_ID: {"last_seen_at": datetime.now(UTC).isoformat()}},
        pending_approvals=2,
        running_workflows=1,
        dead_letters=3,
    )
    client = make_client(db, session=_session())

    response = client.get("/fleet/summary")

    assert response.status_code == 200
    body = response.json()
    assert db.calls[0] == ("accessible", "user-1", WORKSPACE_ID, "cluster", "cluster.read")
    # 워크스페이스는 쿼리 파라미터가 아니라 세션에서만 온다 + 허용 집합으로 목록을 조회한다.
    assert ("registrations", WORKSPACE_ID, {CLUSTER_ID}, 200) in db.calls
    assert ("rollup", WORKSPACE_ID, {CLUSTER_ID}) in db.calls

    assert len(body["clusters"]) == 1
    item = body["clusters"][0]
    assert item["cluster_id"] == CLUSTER_ID
    assert item["name"] == "prod-cluster"
    assert item["health"] == "healthy"
    assert (item["pods_running"], item["pods_total"]) == (8, 10)
    assert (item["nodes_ready"], item["nodes_total"]) == (3, 3)
    assert item["restarts_recent"] == 0
    assert item["open_incidents"] == 0
    # agent 상태가 있으면 last_seen_at 은 agent 기준.
    assert item["last_seen_at"] is not None
    # 현재 usage 롤업에 cpu/mem 실측이 없으므로 None(합성 금지).
    assert item["cpu_pct"] is None
    assert item["mem_pct"] is None

    assert body["totals"] == {
        "clusters": 1,
        "healthy": 1,
        "warning": 0,
        "critical": 0,
        "stale": 0,
        "unknown": 0,
        "open_incidents": 0,
        "pending_approvals": 2,
        "running_workflows": 1,
        "dead_letters": 3,
    }


def test_fleet_summary_marks_warning_and_critical_clusters() -> None:
    db = FleetApiDb(
        allowed=None,
        registrations=[
            _registration("cluster-warn", "warn-cluster"),
            _registration("cluster-crit", "crit-cluster"),
        ],
        rollup={
            "cluster-warn": {
                "pods_running": 5,
                "pods_total": 5,
                "nodes_ready": 2,
                "nodes_total": 2,
                "workloads_degraded": 0,
            },
            "cluster-crit": {
                "pods_running": 5,
                "pods_total": 5,
                "nodes_ready": 1,
                "nodes_total": 2,
                "workloads_degraded": 0,
            },
        },
        open_counts={"cluster-warn": 2},
    )
    client = make_client(db, session=_session())

    body = client.get("/fleet/summary").json()

    by_id = {item["cluster_id"]: item for item in body["clusters"]}
    assert by_id["cluster-warn"]["health"] == "warning"
    assert by_id["cluster-warn"]["open_incidents"] == 2
    assert by_id["cluster-crit"]["health"] == "critical"
    assert body["totals"]["healthy"] == 0
    assert body["totals"]["warning"] == 1
    assert body["totals"]["critical"] == 1
    assert body["totals"]["stale"] == 0
    assert body["totals"]["unknown"] == 0
    assert body["totals"]["open_incidents"] == 2


def test_fleet_summary_empty_state_returns_zero_totals() -> None:
    db = FleetApiDb(allowed=set(), registrations=[])
    client = make_client(db, session=_session())

    body = client.get("/fleet/summary").json()

    assert body["clusters"] == []
    assert body["totals"]["clusters"] == 0
    assert body["totals"]["healthy"] == 0
    # 클러스터가 없으면 클러스터 단위 집계 쿼리를 아예 부르지 않는다.
    assert not any(call[0] in {"rollup", "usage", "open_counts", "agents"} for call in db.calls)


def test_fleet_summary_falls_back_to_usage_sample_when_inventory_empty() -> None:
    db = FleetApiDb(
        allowed=None,
        registrations=[_registration()],
        rollup={},
        usage={CLUSTER_ID: [_usage_sample("2026-07-07T10:00:00+00:00", 4)]},
    )
    client = make_client(db, session=_session())

    item = client.get("/fleet/summary").json()["clusters"][0]

    assert (item["pods_running"], item["pods_total"]) == (9, 10)
    assert (item["nodes_ready"], item["nodes_total"]) == (3, 3)
    assert item["last_seen_at"] == "2026-07-07T10:00:00+00:00"


def test_rollup_health_rules_are_deterministic() -> None:
    healthy = {
        "workloads_degraded": 0,
        "nodes_ready": 3,
        "nodes_total": 3,
        "restarts_recent": 0,
        "open_incidents": 0,
    }
    assert rollup_health(**healthy) == "healthy"
    assert rollup_health(**{**healthy, "has_observations": False}) == "unknown"
    assert rollup_health(**{**healthy, "connection_status": "stale"}) == "stale"
    # warning: 최근 재시작 또는 열린 인시던트.
    assert rollup_health(**{**healthy, "restarts_recent": 1}) == "warning"
    assert rollup_health(**{**healthy, "open_incidents": 1}) == "warning"
    # critical: degraded workload 1개 이상 또는 not-ready node — warning 조건보다 우선.
    assert rollup_health(**{**healthy, "workloads_degraded": 1}) == "critical"
    assert rollup_health(**{**healthy, "nodes_ready": 2, "restarts_recent": 9}) == "critical"
    # node 관측이 아예 없으면(nodes_total=0) node 조건은 판정에서 제외되지만 관측값 존재 여부는 별도로 판단한다.
    assert (
        rollup_health(**{**healthy, "nodes_ready": 0, "nodes_total": 0, "has_observations": True})
        == "healthy"
    )


def test_fleet_summary_marks_unknown_when_cluster_has_no_observations() -> None:
    db = FleetApiDb(
        allowed=None,
        registrations=[_registration()],
        rollup={},
        usage={},
    )
    client = make_client(db, session=_session())

    body = client.get("/fleet/summary").json()

    assert body["clusters"][0]["health"] == "unknown"
    assert body["totals"]["unknown"] == 1
    assert body["totals"]["healthy"] == 0


def test_fleet_summary_marks_stale_when_agent_is_not_online() -> None:
    db = FleetApiDb(
        allowed=None,
        registrations=[_registration()],
        rollup={
            CLUSTER_ID: {
                "pods_running": 2,
                "pods_total": 2,
                "nodes_ready": 1,
                "nodes_total": 1,
            }
        },
        agents={CLUSTER_ID: {"last_seen_at": None}},
    )
    client = make_client(db, session=_session())

    body = client.get("/fleet/summary").json()

    assert body["clusters"][0]["health"] == "stale"
    assert body["totals"]["stale"] == 1


def test_restarts_recent_is_delta_of_last_two_samples() -> None:
    assert restarts_recent_from_samples([]) == 0
    assert restarts_recent_from_samples([_usage_sample("t1", 7)]) == 0
    assert restarts_recent_from_samples([_usage_sample("t1", 5), _usage_sample("t2", 8)]) == 3
    # 카운터 리셋(감소)은 0 — 음수 재시작 수 금지.
    assert restarts_recent_from_samples([_usage_sample("t1", 9), _usage_sample("t2", 2)]) == 0


def test_usage_pct_prefers_measured_values_only() -> None:
    assert usage_pct({}, ("cpu_pct",), ("cpu_ratio",)) is None
    assert usage_pct({"cpu_pct": 41.27}, ("cpu_pct",), ("cpu_ratio",)) == 41.3
    assert usage_pct({"cpu_ratio": 0.5}, ("cpu_pct",), ("cpu_ratio",)) == 50.0
    assert usage_pct({"cpu_pct": "bad"}, ("cpu_pct",), ("cpu_ratio",)) is None


def test_cluster_summary_requires_cluster_read_access() -> None:
    db = FleetApiDb(has_access=False, registrations=[_registration()])
    client = make_client(db, session=_session())

    response = client.get(f"/clusters/{CLUSTER_ID}/summary")

    assert response.status_code == 403
    assert response.json()["detail"] == "resource access denied"
    assert (
        "has_access",
        "user-1",
        WORKSPACE_ID,
        "cluster",
        CLUSTER_ID,
        "cluster.read",
    ) in db.calls


def test_cluster_summary_returns_404_for_unknown_cluster() -> None:
    db = FleetApiDb(registrations=[])
    client = make_client(db, session=_session())

    assert client.get("/clusters/missing/summary").status_code == 404


def test_cluster_summary_groups_workloads_and_lists_incidents() -> None:
    db = FleetApiDb(
        registrations=[_registration()],
        rollup={
            CLUSTER_ID: {
                "pods_running": 9,
                "pods_total": 10,
                "nodes_ready": 3,
                "nodes_total": 3,
                "workloads_degraded": 1,
            }
        },
        usage={CLUSTER_ID: [_usage_sample("2026-07-07T10:00:00+00:00", 4)]},
        workloads=[
            {
                "name": "api",
                "kind": "Deployment",
                "namespace": "default",
                "health": "healthy",
                "status": "3/3",
                "summary": {},
            },
            {
                "name": "worker",
                "kind": "StatefulSet",
                "namespace": "jobs",
                "health": "degraded",
                "status": "1/2",
                "summary": {"restart_total": 4},
            },
        ],
        warning_events=[
            {
                "namespace": "default",
                "name": "evt-1",
                "last_seen_at": "2026-07-07T09:59:00+00:00",
                "summary": {
                    "reason": "BackOff",
                    "message": "Back-off restarting failed container",
                    "involved_kind": "Pod",
                    "involved_name": "api-1",
                    "count": 7,
                },
            }
        ],
        open_incidents=[
            {
                "incident_id": "incident-1",
                "correlation_id": "corr-1",
                "symptom": "CrashLoopBackOff",
                "root_cause": "oom_killed",
                "status": "rca_completed",
                "namespace": "jobs",
                "resource_kind": "StatefulSet",
                "resource_name": "worker",
                "debug_payload": {"raw": "not public"},
                "created_at": "2026-07-07T09:50:00+00:00",
            }
        ],
    )
    client = make_client(db, session=_session())

    response = client.get(f"/clusters/{CLUSTER_ID}/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["cluster_id"] == CLUSTER_ID
    assert body["name"] == "prod-cluster"
    # degraded workload 존재 → critical (open incident 의 warning 보다 우선).
    assert body["health"] == "critical"

    assert set(body["workloads"]) == {"healthy", "degraded"}
    degraded = body["workloads"]["degraded"][0]
    assert degraded == {
        "name": "worker",
        "kind": "StatefulSet",
        "namespace": "jobs",
        "health": "degraded",
        "ready": "1/2",
        "restarts": 4,
    }

    assert body["warning_events"][0]["reason"] == "BackOff"
    assert body["warning_events"][0]["involved_name"] == "api-1"
    assert body["warning_events"][0]["count"] == 7

    assert body["open_incidents"][0]["incident_id"] == "incident-1"
    assert body["open_incidents"][0]["symptom"] == "CrashLoopBackOff"
    assert body["open_incidents"][0]["namespace"] == "jobs"
    assert body["open_incidents"][0]["resource_kind"] == "StatefulSet"
    assert body["open_incidents"][0]["resource_name"] == "worker"

    assert body["usage"] == {
        "sampled_at": "2026-07-07T10:00:00+00:00",
        "pods_running": 9,
        "pods_total": 10,
        "nodes_ready": 3,
        "nodes_total": 3,
        "restart_total": 4,
        "cpu_pct": None,
        "mem_pct": None,
    }
    assert ("warning_events", WORKSPACE_ID, CLUSTER_ID, 10) in db.calls
    assert ("open_incidents", WORKSPACE_ID, CLUSTER_ID, 20) in db.calls


def test_nodes_summary_aggregates_node_tiles_from_inventory() -> None:
    db = FleetApiDb(
        registrations=[_registration()],
        nodes=[
            {
                "name": "node-a",
                "status": "Ready",
                "health": "healthy",
                "summary": {
                    "ready": True,
                    "capacity": {"pods": "110"},
                    "conditions": [
                        {"type": "Ready", "status": "True"},
                        {"type": "MemoryPressure", "status": "True"},
                        {"type": "DiskPressure", "status": "False"},
                    ],
                },
            }
        ],
        pods=[
            {
                "name": "api-1",
                "namespace": "default",
                "status": "Running",
                "health": "healthy",
                "summary": {"node_name": "node-a", "restart_total": 2},
            },
            {
                "name": "api-2",
                "namespace": "default",
                "status": "Pending",
                "health": "degraded",
                "summary": {"node_name": "node-a", "restart_total": 1},
            },
        ],
        usage={
            CLUSTER_ID: [
                {
                    "sampled_at": "2026-07-07T10:00:00+00:00",
                    "usage": {
                        "nodes": {
                            "node-a": {"cpu_ratio": 0.42, "memory_pct": 73.4},
                        }
                    },
                }
            ]
        },
    )
    client = make_client(db, session=_session())

    response = client.get(f"/clusters/{CLUSTER_ID}/nodes/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["nodes"] == [
        {
            "name": "node-a",
            "ready": True,
            "health": "healthy",
            "pods_running": 1,
            "pods_capacity": 110,
            "cpu_pct": 42.0,
            "mem_pct": 73.4,
            "restarts_recent": 3,
            "conditions": ["MemoryPressure"],
        }
    ]


def test_node_pods_summary_filters_node_and_links_incident() -> None:
    db = FleetApiDb(
        registrations=[_registration()],
        nodes=[{"name": "node-a", "status": "Ready", "health": "healthy", "summary": {}}],
        pods=[
            {
                "name": "api-1",
                "namespace": "default",
                "status": "Running",
                "health": "healthy",
                "summary": {
                    "node_name": "node-a",
                    "phase": "Running",
                    "restart_total": 4,
                    "owner_kind": "ReplicaSet",
                    "owner_name": "api-abc",
                    "containers": [{"name": "api", "ready": True}],
                },
            },
            {
                "name": "api-other",
                "namespace": "default",
                "status": "Running",
                "health": "healthy",
                "summary": {"node_name": "node-b"},
            },
        ],
        usage={
            CLUSTER_ID: [
                {
                    "sampled_at": "2026-07-07T10:00:00+00:00",
                    "usage": {
                        "pods": {
                            "default/api-1": {"cpu_mcores": 120.5, "mem_mib": 256},
                        }
                    },
                }
            ]
        },
        incident_lookup={("default", "api-1"): "corr-incident-1"},
    )
    client = make_client(db, session=_session())

    response = client.get(f"/clusters/{CLUSTER_ID}/nodes/node-a/pods/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["node_name"] == "node-a"
    assert len(body["pods"]) == 1
    assert body["pods"][0] == {
        "name": "api-1",
        "namespace": "default",
        "phase": "Running",
        "health": "healthy",
        "ready": "1/1",
        "restarts": 4,
        "owner_kind": "ReplicaSet",
        "owner_name": "api-abc",
        "cpu_mcores": 120.5,
        "mem_mib": 256.0,
        "incident_correlation_id": "corr-incident-1",
    }


def test_node_pods_summary_lists_every_pod_while_home_summary_stays_workload_only() -> None:
    db = FleetApiDb(
        registrations=[_registration()],
        nodes=[{"name": "node-a", "status": "Ready", "health": "healthy", "summary": {}}],
        pods=[
            {
                "name": "orders-api-7c9d5",
                "namespace": "sandbox",
                "status": "Running",
                "health": "healthy",
                "summary": {"node_name": "node-a", "phase": "Running"},
            },
            {
                "name": "cluster-agent-6f8c9",
                "namespace": "target",
                "status": "Running",
                "health": "healthy",
                "summary": {"node_name": "node-a", "owner_name": "cluster-agent"},
            },
            {
                "name": "api-gateway-5c4d",
                "namespace": "management",
                "status": "Running",
                "health": "healthy",
                "summary": {"node_name": "node-a", "owner_name": "api-gateway"},
            },
            {
                "name": "coredns-abc",
                "namespace": "kube-system",
                "status": "Running",
                "health": "healthy",
                "summary": {"node_name": "node-a", "owner_name": "coredns"},
            },
        ],
    )
    client = make_client(db, session=_session())

    pods_response = client.get(f"/clusters/{CLUSTER_ID}/nodes/node-a/pods/summary")
    nodes_response = client.get(f"/clusters/{CLUSTER_ID}/nodes/summary")

    assert pods_response.status_code == 200
    assert [pod["namespace"] + "/" + pod["name"] for pod in pods_response.json()["pods"]] == [
        "sandbox/orders-api-7c9d5",
        "target/cluster-agent-6f8c9",
        "management/api-gateway-5c4d",
        "kube-system/coredns-abc",
    ]
    assert nodes_response.status_code == 200
    assert nodes_response.json()["nodes"][0]["pods_running"] == 1
    assert nodes_response.json()["nodes"][0]["restarts_recent"] == 0


def test_node_pods_summary_returns_empty_for_node_without_pods() -> None:
    db = FleetApiDb(
        registrations=[_registration()],
        nodes=[{"name": "node-empty", "status": "Ready", "health": "healthy", "summary": {}}],
        pods=[],
    )
    client = make_client(db, session=_session())

    response = client.get(f"/clusters/{CLUSTER_ID}/nodes/node-empty/pods/summary")

    assert response.status_code == 200
    assert response.json()["pods"] == []


def test_node_pods_summary_returns_404_for_missing_node() -> None:
    db = FleetApiDb(registrations=[_registration()], nodes=[])
    client = make_client(db, session=_session())

    response = client.get(f"/clusters/{CLUSTER_ID}/nodes/missing/pods/summary")

    assert response.status_code == 404
    assert response.json()["detail"] == "node not found"

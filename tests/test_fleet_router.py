"""fleet API — 인증 401·워크스페이스 범위·health 롤업 규칙·빈 상태 검증."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
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
        fleet_nodes: dict[str, list[dict[str, Any]]] | None = None,
        usage: dict[str, list[dict[str, Any]]] | None = None,
        open_counts: dict[str, int] | None = None,
        agents: dict[str, dict[str, Any]] | None = None,
        workloads: list[dict[str, Any]] | None = None,
        nodes: list[dict[str, Any]] | None = None,
        pods: list[dict[str, Any]] | None = None,
        warning_events: list[dict[str, Any]] | None = None,
        open_incidents: list[dict[str, Any]] | None = None,
        incident_lookup: dict[tuple[str, str], str] | None = None,
        latest_snapshot: dict[str, Any] | None = None,
        filter_contexts: dict[str, dict[str, Any]] | None = None,
        custom_resource_counts: dict[str, Any] | None = None,
        certificate_observations: dict[str, Any] | None = None,
        helm_contexts: dict[str, dict[str, Any]] | None = None,
        helm_storage: list[dict[str, Any]] | None = None,
        pending_approvals: int = 0,
        running_workflows: int = 0,
        dead_letters: int = 0,
    ) -> None:
        self.allowed = allowed
        self.has_access = has_access
        self.registrations = registrations or []
        self.rollup = rollup or {}
        self.fleet_nodes = fleet_nodes or {}
        self.usage = usage or {}
        self.open_counts = open_counts or {}
        self.agents = agents or {}
        self.workloads = workloads or []
        self.nodes = nodes or []
        self.pods = pods or []
        self.warning_events = warning_events or []
        self.open_incidents = open_incidents or []
        self.incident_lookup = incident_lookup or {}
        self.latest_snapshot = latest_snapshot or {
            "snapshot_id": "snapshot-current",
            "collected_at": "2026-07-07T10:00:00+00:00",
        }
        self.filter_contexts = filter_contexts or {}
        self.custom_resource_counts = custom_resource_counts or {
            "items": [],
            "total_kinds": 0,
            "total_resources": 0,
        }
        self.certificate_observations = certificate_observations or {
            "items": [],
            "has_more": False,
        }
        self.helm_contexts = helm_contexts or {}
        self.helm_storage = helm_storage or []
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

    def fleet_inventory_nodes(
        self, workspace_id: str, cluster_ids: set[str] | None = None
    ) -> dict[str, list[dict[str, Any]]]:
        self.calls.append(("fleet_nodes", workspace_id, cluster_ids))
        return self.fleet_nodes

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

    def latest_inventory_snapshot(
        self, workspace_id: str, cluster_id: str
    ) -> dict[str, Any] | None:
        self.calls.append(("latest_snapshot", workspace_id, cluster_id))
        return self.latest_snapshot

    def node_summary_read_model(
        self,
        workspace_id: str,
        cluster_id: str,
        *,
        limit: int = 1000,
    ) -> dict[str, Any]:
        self.calls.append(("node_summary_read_model", workspace_id, cluster_id, limit))
        return {"nodes": self.nodes[:limit], "snapshot": self.latest_snapshot}

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

    def filter_snapshot_contexts(
        self,
        workspace_id: str,
        cluster_ids: tuple[str, ...],
    ) -> dict[str, dict[str, Any]]:
        self.calls.append(("filter_contexts", workspace_id, cluster_ids))
        return {
            cluster_id: self.filter_contexts[cluster_id]
            for cluster_id in cluster_ids
            if cluster_id in self.filter_contexts
        }

    def list_home_custom_resource_counts(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("custom_resource_counts", kwargs))
        return self.custom_resource_counts

    def list_tls_secret_certificate_observations(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("certificate_observations", kwargs))
        return self.certificate_observations

    def helm_release_observation_contexts(
        self,
        *,
        workspace_id: str,
        cluster_ids: tuple[str, ...],
    ) -> dict[str, dict[str, Any]]:
        self.calls.append(("helm_contexts", workspace_id, cluster_ids))
        return {
            cluster_id: self.helm_contexts[cluster_id]
            for cluster_id in cluster_ids
            if cluster_id in self.helm_contexts
        }

    def list_helm_storage_observations(
        self,
        *,
        workspace_id: str,
        cluster_ids: tuple[str, ...],
        namespaces: tuple[str, ...],
    ) -> list[dict[str, Any]]:
        self.calls.append(("helm_storage", workspace_id, cluster_ids, namespaces))
        return [
            row
            for row in self.helm_storage
            if row.get("cluster_id") in cluster_ids
            and (not namespaces or row.get("namespace") in namespaces)
        ]


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
    assert client.get(f"/clusters/{CLUSTER_ID}/home/insights").status_code == 401


def test_home_insights_composes_revisioned_custom_resources_and_helm_summary() -> None:
    observed_at = "2026-07-16T09:00:00+00:00"
    db = FleetApiDb(
        registrations=[_registration()],
        agents={CLUSTER_ID: {"last_seen_at": datetime.now(UTC).isoformat()}},
        filter_contexts={
            CLUSTER_ID: {
                "snapshot_revision": 41,
                "observed_at": observed_at,
                "labels_complete": True,
                "resources_complete": True,
                "partial_reason_codes": [],
            }
        },
        custom_resource_counts={
            "items": [
                {
                    "api_version": "argoproj.io/v1alpha1",
                    "kind": "Application",
                    "count": 7,
                },
                {
                    "api_version": "monitoring.coreos.com/v1",
                    "kind": "ServiceMonitor",
                    "count": 3,
                },
            ],
            "total_kinds": 3,
            "total_resources": 12,
        },
        helm_contexts={
            CLUSTER_ID: {
                "snapshot_revision": 41,
                "observed_at": observed_at,
                "labels_complete": True,
                "resources_complete": True,
                "partial_reason_codes": [],
            }
        },
        helm_storage=[
            {
                "workspace_id": WORKSPACE_ID,
                "cluster_id": CLUSTER_ID,
                "inventory_key": "helm-checkout-v2",
                "api_version": "v1",
                "kind": "Secret",
                "namespace": "shop",
                "name": "sh.helm.release.v1.checkout.v2",
                "uid": "uid-checkout-v2",
                "labels": {
                    "owner": "helm",
                    "name": "checkout",
                    "version": "2",
                    "status": "deployed",
                },
                "observed_at": datetime(2026, 7, 16, 9, 0, tzinfo=UTC),
            }
        ],
    )

    response = make_client(db, session=_session()).get(f"/clusters/{CLUSTER_ID}/home/insights")

    assert response.status_code == 200
    body = response.json()
    assert body.pop("topology") == {
        "coverage": {
            "availability": "unavailable",
            "observed_at": observed_at,
            "reason_codes": ["topology_projection_unavailable"],
        },
        "node_count": None,
        "edge_count": None,
        "omitted_node_count": None,
        "omitted_edge_count": None,
        "relation_completeness": "unavailable",
    }
    assert body.pop("explore") == {
        "traffic": {
            "coverage": {
                "availability": "unavailable",
                "observed_at": None,
                "reason_codes": [f"traffic_evidence_window_unavailable:{CLUSTER_ID}"],
            }
        },
        "cost": {
            "coverage": {
                "availability": "unavailable",
                "observed_at": None,
                "reason_codes": ["cost_observation_unavailable"],
            }
        },
    }
    assert body.pop("posture") == {
        "network_policy": {
            "coverage": {
                "availability": "unavailable",
                "observed_at": None,
                "reason_codes": ["network_policy_coverage_not_reported"],
            },
            "total_policies": None,
            "covered_workloads": None,
            "total_workloads": None,
        },
        "gitops": {
            "coverage": {
                "availability": "unavailable",
                "observed_at": None,
                "reason_codes": ["gitops_overview_repository_unavailable"],
            },
            "controller_count": None,
            "provider_counts": {},
            "health_counts": {},
        },
        "audit": {
            "coverage": {
                "availability": "unavailable",
                "observed_at": observed_at,
                "reason_codes": [f"checks_observation_unavailable:{CLUSTER_ID}"],
            },
            "total_check_count": None,
            "total_finding_count": None,
            "severity_counts": {},
        },
    }
    assert body == {
        "cluster_id": CLUSTER_ID,
        "custom_resources": {
            "coverage": {
                "availability": "available",
                "observed_at": observed_at,
                "reason_codes": [],
            },
            "items": [
                {
                    "api_group": "argoproj.io",
                    "version": "v1alpha1",
                    "kind": "Application",
                    "count": 7,
                },
                {
                    "api_group": "monitoring.coreos.com",
                    "version": "v1",
                    "kind": "ServiceMonitor",
                    "count": 3,
                },
            ],
            "total_kinds": 3,
            "total_resources": 12,
            "has_more": True,
        },
        "helm": {
            "coverage": {
                "availability": "available",
                "observed_at": observed_at,
                "reason_codes": [],
            },
            "release_count": 1,
            "status_counts": {"deployed": 1},
        },
        "certificate_expiry": {
            "coverage": {
                "availability": "unavailable",
                "observed_at": observed_at,
                "reason_codes": ["tls_secret_observation_unavailable"],
            },
            "items": [],
            "tls_secret_count": None,
            "observed_expiry_count": None,
            "expiring_count": None,
            "expired_count": None,
            "earliest_expiry": None,
            "warning_before_seconds": 2_592_000,
            "has_more": False,
        },
        "refresh_after_seconds": 30,
    }
    assert (
        "has_access",
        "user-1",
        WORKSPACE_ID,
        "cluster",
        CLUSTER_ID,
        "inventory.read",
    ) in db.calls


def test_home_insights_never_turns_missing_inventory_into_zero_counts() -> None:
    db = FleetApiDb(registrations=[_registration()])

    response = make_client(db, session=_session()).get(f"/clusters/{CLUSTER_ID}/home/insights")

    assert response.status_code == 200
    body = response.json()
    assert body["custom_resources"] == {
        "coverage": {
            "availability": "unavailable",
            "observed_at": None,
            "reason_codes": [f"inventory_snapshot_unavailable:{CLUSTER_ID}"],
        },
        "items": [],
        "total_kinds": None,
        "total_resources": None,
        "has_more": False,
    }
    assert body["helm"]["coverage"]["availability"] == "unavailable"
    assert body["helm"]["release_count"] is None
    assert body["helm"]["status_counts"] == {}
    assert body["certificate_expiry"]["coverage"] == {
        "availability": "unavailable",
        "observed_at": None,
        "reason_codes": [f"inventory_snapshot_unavailable:{CLUSTER_ID}"],
    }
    assert body["certificate_expiry"]["tls_secret_count"] is None
    assert not any(call[0] == "custom_resource_counts" for call in db.calls)
    assert not any(call[0] == "certificate_observations" for call in db.calls)


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


def test_fleet_summary_does_not_hide_inventory_health_with_a_partial_usage_cut() -> None:
    db = FleetApiDb(
        allowed={CLUSTER_ID},
        registrations=[_registration()],
        rollup={
            CLUSTER_ID: {
                "pods_running": 41,
                "pods_total": 41,
                "nodes_ready": 2,
                "nodes_total": 3,
                "workloads_degraded": 0,
            }
        },
        usage={
            CLUSTER_ID: [
                {
                    "sampled_at": "2026-07-20T08:00:00+00:00",
                    "usage": {
                        "pod_running": 6,
                        "pod_total": 9,
                        "node_ready": 2,
                        "node_total": 2,
                        "restart_total": 0,
                    },
                }
            ]
        },
        agents={CLUSTER_ID: {"last_seen_at": datetime.now(UTC).isoformat()}},
    )

    response = make_client(db, session=_session()).get("/fleet/summary")

    assert response.status_code == 200
    item = response.json()["clusters"][0]
    assert (item["pods_running"], item["pods_total"]) == (41, 41)
    assert (item["nodes_ready"], item["nodes_total"]) == (2, 3)
    assert item["health"] == "critical"


def test_fleet_summary_falls_back_to_observed_inventory_node_usage() -> None:
    metrics_observed_at = datetime.now(UTC).isoformat()
    db = FleetApiDb(
        allowed={CLUSTER_ID},
        registrations=[_registration()],
        rollup={
            CLUSTER_ID: {
                "pods_running": 8,
                "pods_total": 10,
                "nodes_ready": 2,
                "nodes_total": 2,
                "workloads_degraded": 0,
            }
        },
        fleet_nodes={
            CLUSTER_ID: [
                {
                    "summary": {"cpu_ratio": 0.2, "mem_ratio": 0.4},
                    "metrics_observed_at": metrics_observed_at,
                },
                {
                    "summary": {
                        "cpu_ratio": 0.4,
                        "mem_ratio": 0.6,
                        "metrics_observed_at": metrics_observed_at,
                    }
                },
            ]
        },
        usage={CLUSTER_ID: [_usage_sample("2026-07-07T10:00:00+00:00", 4)]},
    )

    response = make_client(db, session=_session()).get("/fleet/summary")

    assert response.status_code == 200
    item = response.json()["clusters"][0]
    assert item["cpu_pct"] == 30.0
    assert item["mem_pct"] == 50.0
    assert ("fleet_nodes", WORKSPACE_ID, {CLUSTER_ID}) in db.calls


def test_fleet_summary_rejects_stale_inventory_node_usage() -> None:
    stale_observed_at = (datetime.now(UTC) - timedelta(hours=2)).isoformat()
    db = FleetApiDb(
        allowed={CLUSTER_ID},
        registrations=[_registration()],
        rollup={CLUSTER_ID: {"nodes_ready": 1, "nodes_total": 1}},
        fleet_nodes={
            CLUSTER_ID: [
                {
                    "summary": {
                        "cpu_ratio": 0.91,
                        "mem_ratio": 0.87,
                        "metrics_observed_at": stale_observed_at,
                    }
                }
            ]
        },
        usage={CLUSTER_ID: [_usage_sample("2026-07-07T10:00:00+00:00", 4)]},
    )

    response = make_client(db, session=_session()).get("/fleet/summary")

    assert response.status_code == 200
    item = response.json()["clusters"][0]
    assert item["cpu_pct"] is None
    assert item["mem_pct"] is None


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
        pods=[
            {
                "snapshot_id": "snapshot-current",
                "namespace": "default",
                "name": "api-1",
                "uid": "uid-api-1",
                "summary": {
                    "namespace": "default",
                    "owner_kind": "Deployment",
                    "owner_name": "api",
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
    assert body["warning_events"][0]["involved_kind"] == "Deployment"
    assert body["warning_events"][0]["involved_name"] == "api"
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
    assert ("warning_events", WORKSPACE_ID, CLUSTER_ID, 100) in db.calls
    assert ("open_incidents", WORKSPACE_ID, CLUSTER_ID, 20) in db.calls


def test_cluster_summary_keeps_only_current_warning_events_and_groups_same_owner_reason() -> None:
    db = FleetApiDb(
        registrations=[_registration()],
        latest_snapshot={
            "snapshot_id": "snapshot-current",
            "collected_at": "2026-07-15T03:20:00+00:00",
        },
        workloads=[
            {
                "snapshot_id": "snapshot-current",
                "namespace": "production",
                "kind": "ReplicaSet",
                "name": "checkout-api-7f8d9c",
                "health": "degraded",
                "status": "1/2",
                "summary": {
                    "owner_kind": "Deployment",
                    "owner_name": "checkout-api",
                },
            },
            {
                "snapshot_id": "snapshot-current",
                "namespace": "production",
                "kind": "Deployment",
                "name": "checkout-api",
                "health": "degraded",
                "status": "1/2",
                "summary": {},
            },
        ],
        pods=[
            {
                "snapshot_id": "snapshot-current",
                "namespace": "production",
                "name": pod_name,
                "uid": f"uid-{pod_name}",
                "summary": {
                    "namespace": "production",
                    "owner_kind": "ReplicaSet",
                    "owner_name": "checkout-api-7f8d9c",
                },
            }
            for pod_name in ("checkout-api-7f8d9c-a", "checkout-api-7f8d9c-b")
        ],
        warning_events=[
            {
                "snapshot_id": "snapshot-current",
                "namespace": "production",
                "name": "evt-a",
                "last_seen_at": "2026-07-15T03:20:00+00:00",
                "summary": {
                    "reason": "Unhealthy",
                    "message": "Readiness probe failed: status code 404",
                    "involved_kind": "Pod",
                    "involved_name": "checkout-api-7f8d9c-a",
                    "involved_uid": "uid-checkout-api-7f8d9c-a",
                    "count": 3,
                    "last_timestamp": "2026-07-15T03:01:00+00:00",
                },
            },
            {
                "snapshot_id": "snapshot-current",
                "namespace": "production",
                "name": "evt-b",
                "last_seen_at": "2026-07-15T03:20:00+00:00",
                "summary": {
                    "reason": "Unhealthy",
                    "message": "Readiness probe failed: status code 404",
                    "involved_kind": "Pod",
                    "involved_name": "checkout-api-7f8d9c-b",
                    "involved_uid": "uid-checkout-api-7f8d9c-b",
                    "count": 5,
                    "last_timestamp": "2026-07-15T03:02:00+00:00",
                },
            },
            {
                "snapshot_id": "snapshot-current",
                "namespace": "production",
                "name": "evt-old",
                "last_seen_at": "2026-07-15T03:20:00+00:00",
                "summary": {
                    "reason": "Unhealthy",
                    "message": "Readiness probe failed: connection refused",
                    "involved_kind": "Pod",
                    "involved_name": "checkout-api-old-1",
                    "involved_uid": "uid-checkout-api-old-1",
                    "count": 99,
                    "last_timestamp": "2026-07-15T02:50:00+00:00",
                },
            },
        ],
    )

    body = make_client(db, session=_session()).get(f"/clusters/{CLUSTER_ID}/summary").json()

    assert body["warning_events"] == [
        {
            "namespace": "production",
            "name": "production:Deployment:checkout-api:Unhealthy:readiness-probe",
            "reason": "Unhealthy",
            "message": "Readiness probe failed: status code 404",
            "involved_kind": "Deployment",
            "involved_name": "checkout-api",
            "count": 8,
            "last_seen_at": "2026-07-15T03:02:00+00:00",
        }
    ]


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
                    "node_info": {"kubeletVersion": "v1.30.7"},
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
            "metrics_observed_at": None,
            "metrics_stale": False,
            "restarts_recent": 3,
            "conditions": ["MemoryPressure"],
            "kubernetes_version": "v1.30.7",
        }
    ]


def test_nodes_summary_uses_inventory_usage_without_relabeling_scheduled_pods() -> None:
    metrics_observed_at = datetime.now(UTC).isoformat()
    db = FleetApiDb(
        registrations=[_registration()],
        nodes=[
            {
                "name": "node-a",
                "status": "Ready",
                "health": "healthy",
                "summary": {
                    "ready": True,
                    "pod_count": 17,
                    "cpu_ratio": 0.425,
                    "mem_ratio": 0.613,
                    "metrics_observed_at": metrics_observed_at,
                },
            }
        ],
        pods=[],
        usage={},
    )

    response = make_client(db, session=_session()).get(f"/clusters/{CLUSTER_ID}/nodes/summary")

    assert response.status_code == 200
    node = response.json()["nodes"][0]
    # node summary pod_count is scheduled non-terminal Pods, not the Running phase count.
    assert node["pods_running"] == 0
    assert node["cpu_pct"] == 42.5
    assert node["mem_pct"] == 61.3


def test_nodes_summary_falls_back_to_fresh_snapshot_usage() -> None:
    metrics_observed_at = datetime.now(UTC).isoformat()
    db = FleetApiDb(
        registrations=[_registration()],
        nodes=[
            {
                "name": "node-a",
                "status": "Ready",
                "health": "healthy",
                "summary": {"ready": True},
            }
        ],
        usage={},
        latest_snapshot={
            "snapshot_id": "snapshot-current",
            "collected_at": metrics_observed_at,
            "summary": {
                "usage": {
                    "nodes": {
                        "node-a": {
                            "cpu_ratio": 0.526,
                            "mem_ratio": 0.299,
                            "metrics_observed_at": metrics_observed_at,
                        }
                    }
                },
                "summary": {
                    "live_inventory": True,
                    "nodes": [{"name": "node-a", "ready": True}],
                },
            },
        },
    )

    response = make_client(db, session=_session()).get(f"/clusters/{CLUSTER_ID}/nodes/summary")

    assert response.status_code == 200
    node = response.json()["nodes"][0]
    assert node["cpu_pct"] == 52.6
    assert node["mem_pct"] == 29.9


def test_nodes_summary_uses_compact_snapshot_without_loading_pod_manifests() -> None:
    metrics_observed_at = datetime.now(UTC).isoformat()
    db = FleetApiDb(
        registrations=[_registration()],
        nodes=[
            {
                "name": "node-a",
                "status": "Ready",
                "health": "healthy",
                "summary": {"ready": True, "capacity": {"pods": "40"}},
            }
        ],
        pods=[
            {
                "name": "stale-retained-pod",
                "namespace": "default",
                "status": "Running",
                "health": "healthy",
                "summary": {"node_name": "node-a"},
            }
        ],
        usage={},
        latest_snapshot={
            "snapshot_id": "snapshot-current",
            "collected_at": metrics_observed_at,
            "summary": {
                "usage": {
                    "nodes": {
                        "node-a": {
                            "cpu_pct": 18.2,
                            "mem_pct": 34.1,
                            "metrics_observed_at": metrics_observed_at,
                        }
                    }
                },
                "summary": {
                    "live_inventory": True,
                    "nodes": [{"name": "node-a", "ready": True, "pod_count": 7}],
                },
            },
        },
    )

    response = make_client(db, session=_session()).get(f"/clusters/{CLUSTER_ID}/nodes/summary")

    assert response.status_code == 200
    assert response.json()["nodes"][0] == {
        "name": "node-a",
        "ready": True,
        "health": "healthy",
        "kubernetes_version": None,
        "pods_running": 7,
        "pods_capacity": 40,
        "cpu_pct": 18.2,
        "mem_pct": 34.1,
        "metrics_observed_at": None,
        "metrics_stale": False,
        "restarts_recent": 0,
        "conditions": [],
    }
    assert not any(call[:2] == ("inventory", "pod") for call in db.calls)
    assert not any(call[0] == "usage" for call in db.calls)


def test_nodes_summary_rejects_stale_snapshot_usage() -> None:
    stale_observed_at = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    db = FleetApiDb(
        registrations=[_registration()],
        nodes=[
            {
                "name": "node-a",
                "status": "Ready",
                "health": "healthy",
                "summary": {"ready": True},
            }
        ],
        usage={},
        latest_snapshot={
            "snapshot_id": "snapshot-current",
            "collected_at": stale_observed_at,
            "summary": {
                "usage": {
                    "nodes": {
                        "node-a": {
                            "cpu_ratio": 0.9,
                            "mem_ratio": 0.9,
                            "metrics_observed_at": stale_observed_at,
                        }
                    }
                },
                "summary": {
                    "live_inventory": True,
                    "nodes": [{"name": "node-a", "ready": True}],
                },
            },
        },
    )

    response = make_client(db, session=_session()).get(f"/clusters/{CLUSTER_ID}/nodes/summary")

    assert response.status_code == 200
    node = response.json()["nodes"][0]
    assert node["cpu_pct"] is None
    assert node["mem_pct"] is None


def test_nodes_summary_keeps_management_workloads_from_latest_usage_only() -> None:
    db = FleetApiDb(
        registrations=[
            {
                **_registration(),
                "environment": "management",
                "settings": {"cluster_role": "management"},
            }
        ],
        nodes=[
            {
                "name": "node-a",
                "status": "Ready",
                "health": "healthy",
                "summary": {"ready": True},
            }
        ],
        pods=[
            {
                "name": "api-current",
                "namespace": "management",
                "status": "Running",
                "health": "healthy",
                "summary": {"node_name": "node-a"},
            },
            {
                "name": "api-stale",
                "namespace": "management",
                "status": "Running",
                "health": "healthy",
                "summary": {"node_name": "node-a"},
            },
            {
                "name": "cluster-agent-current",
                "namespace": "management",
                "status": "Running",
                "health": "healthy",
                "summary": {"node_name": "node-a"},
            },
        ],
        usage={
            CLUSTER_ID: [
                {
                    "sampled_at": "2026-07-21T16:30:00+00:00",
                    "usage": {
                        "pod_total": 2,
                        "pods": {
                            "management/api-current": {"mem_mib": 128.0},
                            "management/cluster-agent-current": {"mem_mib": 64.0},
                        },
                    },
                }
            ]
        },
    )

    response = make_client(db, session=_session()).get(f"/clusters/{CLUSTER_ID}/nodes/summary")

    assert response.status_code == 200
    # The management namespace contains product workloads.  Agent-name filtering
    # still applies, and the latest usage cut prevents stale rows from leaking in.
    assert response.json()["nodes"][0]["pods_running"] == 1


def test_nodes_summary_rejects_inventory_usage_without_freshness_evidence() -> None:
    db = FleetApiDb(
        registrations=[_registration()],
        nodes=[
            {
                "name": "node-a",
                "status": "Ready",
                "health": "healthy",
                "summary": {
                    "ready": True,
                    "cpu_ratio": 0.425,
                    "mem_ratio": 0.613,
                },
            }
        ],
        pods=[],
        usage={},
    )

    response = make_client(db, session=_session()).get(f"/clusters/{CLUSTER_ID}/nodes/summary")

    assert response.status_code == 200
    node = response.json()["nodes"][0]
    assert node["cpu_pct"] is None
    assert node["mem_pct"] is None


def test_nodes_summary_excludes_nodes_absent_from_latest_live_snapshot() -> None:
    db = FleetApiDb(
        registrations=[_registration()],
        nodes=[
            {
                "name": "node-current",
                "status": "Ready",
                "health": "healthy",
                "summary": {"ready": True},
            },
            {
                "name": "node-terminated",
                "status": "NotReady",
                "health": "degraded",
                "summary": {"ready": False},
            },
        ],
        pods=[
            {
                "name": "current-pod",
                "namespace": "default",
                "status": "Running",
                "health": "healthy",
                "summary": {"node_name": "node-current"},
            },
            {
                "name": "stale-pod",
                "namespace": "default",
                "status": "Running",
                "health": "degraded",
                "summary": {"node_name": "node-terminated"},
            },
        ],
        latest_snapshot={
            "snapshot_id": "snapshot-current",
            "collected_at": "2026-07-21T14:58:43+00:00",
            "summary": {
                "usage": {"nodes": {"node-current": {"cpu_ratio": 0.2}}},
                "summary": {
                    "live_inventory": True,
                    "nodes": [{"name": "node-current", "ready": True}],
                },
            },
        },
    )

    response = make_client(db, session=_session()).get(f"/clusters/{CLUSTER_ID}/nodes/summary")

    assert response.status_code == 200
    assert [node["name"] for node in response.json()["nodes"]] == ["node-current"]
    assert response.json()["nodes"][0]["pods_running"] == 1


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


def test_node_summary_keeps_last_real_metrics_beyond_freshness_window_as_stale() -> None:
    """freshness 창(20s)을 넘긴 실측은 null 로 지우지 않고 값+stale=true 로 정직 노출한다.

    첫 손실 재현: metrics.k8s.io 원천 타임스탬프 granularity(실측 34~37s)가 창보다 커
    management 노드 CPU/MEM 이 실측이 있는데도 '관측 안 됨'으로 오표시되던 P0.
    """
    from datetime import UTC, datetime, timedelta

    from domains.dashboard.fleet_router import node_summary_item

    old_observed = (datetime.now(UTC) - timedelta(seconds=35)).isoformat()
    node = {
        "name": "ip-192-168-91-21.internal",
        "status": "Ready",
        "health": "healthy",
        "summary": {
            "ready": True,
            "cpu_ratio": 0.75,
            "mem_ratio": 0.74,
            "metrics_observed_at": old_observed,
            "allocatable": {"pods": "58"},
        },
    }

    item = node_summary_item(node, [], {})

    assert item.cpu_pct == 75.0
    assert item.mem_pct == 74.0
    assert item.metrics_stale is True
    assert item.metrics_observed_at == old_observed

    # 실측 자체가 없으면 그대로 null(합성 금지) + stale 아님.
    empty = node_summary_item(
        {"name": "n2", "status": "Ready", "health": "unknown", "summary": {"ready": True}},
        [],
        {},
    )
    assert empty.cpu_pct is None
    assert empty.metrics_observed_at is None
    assert empty.metrics_stale is False

    # 창 안(신선) 실측은 기존 경로 그대로 stale=False.
    fresh_observed = datetime.now(UTC).isoformat()
    fresh = node_summary_item(
        {
            "name": "n3",
            "status": "Ready",
            "health": "healthy",
            "summary": {
                "ready": True,
                "cpu_ratio": 0.1,
                "mem_ratio": 0.2,
                "metrics_observed_at": fresh_observed,
            },
        },
        [],
        {},
    )
    assert fresh.cpu_pct == 10.0
    assert fresh.metrics_stale is False

from __future__ import annotations

from datetime import UTC, datetime

from domains.traffic.observation_projection import traffic_overview

NOW = datetime(2026, 7, 18, 1, 0, tzinfo=UTC)


def test_traffic_projection_exposes_scope_but_never_invents_a_zero_flow_result() -> None:
    body = traffic_overview(
        workspace_id="workspace-a",
        selected_cluster_ids=("cluster-a",),
        namespace_refs=(("cluster-a", "storefront"),),
        contexts={
            "cluster-a": {
                "snapshot_revision": 8,
                "observed_at": "2026-07-16T09:00:00Z",
                "resources_complete": True,
                "labels_complete": True,
                "partial_reason_codes": [],
            }
        },
    )

    assert body.scope_coverage.availability == "available"
    assert body.scope_coverage.scopes[0].model_dump() == {
        "workspace_id": "workspace-a",
        "cluster_id": "cluster-a",
        "namespaces": ("storefront",),
        "freshness": "live",
    }
    assert body.observation.observed_at is None
    assert body.observation.reason_codes == ("traffic_evidence_window_unavailable:cluster-a",)
    assert body.summary.total_flow_count is None
    assert body.summary.denied_flow_count is None
    assert body.relationships.edges is None
    assert body.refresh_after_seconds == 60


def test_traffic_projection_projects_active_agent_flow_evidence_and_server_filters() -> None:
    body = traffic_overview(
        workspace_id="workspace-a",
        selected_cluster_ids=("cluster-a",),
        namespace_refs=(("cluster-a", "storefront"),),
        contexts={"cluster-a": context()},
        agent_statuses={"cluster-a": agent_status("caretta")},
        evidence_windows=(
            window(
                "cluster-a",
                [
                    caretta_sample("web", "storefront", "api", "storefront", 42),
                    caretta_sample("batch", "jobs", "database.example", "", 8),
                ],
            ),
        ),
        since="5m",
        protocols=("tcp",),
        verdicts=("forwarded",),
        now=NOW,
    )

    assert body.observation.availability == "available"
    assert body.observation.source_keys == ("caretta",)
    assert body.summary.model_dump() == {
        "availability": "available",
        "total_flow_count": 1,
        "denied_flow_count": 0,
        "external_flow_count": 0,
        "reason_codes": (),
    }
    assert body.relationships.total_count == 1
    edge = body.relationships.edges[0]
    assert edge.source.cluster_id == "cluster-a"
    assert edge.source.namespace == "storefront"
    assert edge.target.name == "api"
    assert edge.connections == 42


def test_traffic_projection_distinguishes_observed_empty_from_missing_evidence() -> None:
    body = traffic_overview(
        workspace_id="workspace-a",
        selected_cluster_ids=("cluster-a",),
        namespace_refs=(),
        contexts={"cluster-a": context()},
        agent_statuses={"cluster-a": agent_status("caretta")},
        evidence_windows=(window("cluster-a", []),),
        now=NOW,
    )

    assert body.observation.availability == "available"
    assert body.summary.total_flow_count == 0
    assert body.relationships.edges == ()
    assert body.relationships.has_more is False


def test_traffic_projection_pages_sorted_flows_and_requires_opaque_continuation() -> None:
    body = traffic_overview(
        workspace_id="workspace-a",
        selected_cluster_ids=("cluster-a",),
        namespace_refs=(),
        contexts={"cluster-a": context()},
        agent_statuses={"cluster-a": agent_status("caretta")},
        evidence_windows=(
            window(
                "cluster-a",
                [
                    caretta_sample("web", "storefront", "api", "storefront", 42),
                    caretta_sample("worker", "jobs", "queue", "jobs", 7),
                ],
            ),
        ),
        limit=1,
        next_cursor="signed-next",
        now=NOW,
    )

    assert body.relationships.total_count == 2
    assert body.relationships.edges[0].connections == 42
    assert body.relationships.has_more is True
    assert body.relationships.next_cursor == "signed-next"


def test_traffic_projection_keeps_partial_and_disconnected_clusters_distinct() -> None:
    body = traffic_overview(
        workspace_id="workspace-a",
        selected_cluster_ids=("cluster-a", "cluster-b", "cluster-c"),
        namespace_refs=(),
        contexts={
            "cluster-a": {
                "snapshot_revision": 8,
                "observed_at": "2026-07-16T09:00:00Z",
                "resources_complete": True,
                "labels_complete": True,
                "partial_reason_codes": [],
            },
            "cluster-b": {
                "snapshot_revision": 9,
                "observed_at": "2026-07-16T09:01:00Z",
                "resources_complete": False,
                "labels_complete": True,
                "partial_reason_codes": ["agent_snapshot_truncated"],
            },
        },
    )

    assert body.scope_coverage.availability == "unavailable"
    assert [scope.freshness for scope in body.scope_coverage.scopes] == [
        "live",
        "partial",
        "disconnected",
    ]
    assert body.scope_coverage.reason_codes == (
        "agent_snapshot_truncated",
        "inventory_snapshot_incomplete:cluster-b",
        "inventory_snapshot_unavailable:cluster-c",
    )


def context() -> dict[str, object]:
    return {
        "snapshot_revision": 8,
        "observed_at": NOW.isoformat(),
        "resources_complete": True,
        "labels_complete": True,
        "partial_reason_codes": [],
    }


def agent_status(source: str) -> dict[str, object]:
    return {"details": {"traffic_sources": {"active_source": source}}}


def window(cluster_id: str, samples: list[dict[str, object]]) -> dict[str, object]:
    return {
        "cluster_id": cluster_id,
        "window_start": NOW.isoformat(),
        "payload": {
            "window_start": NOW.isoformat(),
            "metrics": {"results": {"traffic_caretta_flows": {"samples": samples}}},
        },
    }


def caretta_sample(
    source: str,
    source_namespace: str,
    target: str,
    target_namespace: str,
    connections: int,
) -> dict[str, object]:
    return {
        "metric": {
            "client_name": source,
            "client_namespace": source_namespace,
            "client_kind": "Deployment",
            "server_name": target,
            "server_namespace": target_namespace,
            "server_kind": "Service" if target_namespace else "External",
            "server_port": "8080",
        },
        "timestamp": NOW.timestamp(),
        "value": connections,
    }

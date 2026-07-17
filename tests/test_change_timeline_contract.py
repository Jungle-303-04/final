from __future__ import annotations

from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from domains.changes.repository import (
    MAX_CHANGE_EVENTS,
    ChangeTimelineRepository,
    _deployment_events_statement,
    _incident_events_statement,
    _inventory_events_statement,
    _observations_statement,
    normalize_change_severity,
)
from domains.changes.timeline import build_change_timeline
from domains.inventory.change_correlation import INVENTORY_CHANGE_LEDGER_EPOCH
from domains.inventory_filter.query import parse_resource_filters
from packages.contracts.gateway.responses import ChangeTimelineResponse


def _filters():
    return parse_resource_filters(
        clusters="cluster-a",
        namespaces="cluster-a/shop",
        applications="app-a",
        resource_types="pod",
        health="degraded",
        labels="team=checkout",
        query="checkout",
        include_deleted=False,
    )


def test_change_evidence_statements_select_only_allowlisted_columns() -> None:
    start = datetime(2026, 7, 14, tzinfo=UTC)
    end = datetime(2026, 7, 15, tzinfo=UTC)
    common = {
        "workspace_id": "workspace-a",
        "cluster_ids": {"cluster-a"},
        "filters": _filters(),
        "start": start,
        "end": end,
        "limit": 101,
    }

    inventory = _inventory_events_statement(
        **common,
        allowed_application_ids={"app-a"},
    )
    incident = _incident_events_statement(
        **common,
        allowed_application_ids={"app-a"},
    )
    deployment = _deployment_events_statement(
        **common,
        application_ids={"app-a"},
    )

    assert set(inventory.selected_columns.keys()) == {
        "event_id",
        "title",
        "health",
        "occurred_at",
    }
    assert set(incident.selected_columns.keys()) == {
        "id",
        "incident_id",
        "correlation_id",
        "incident_resource_kind",
        "incident_resource_name",
        "incident_symptom",
        "root_cause",
        "severity",
        "created_at",
    }
    assert set(deployment.selected_columns.keys()) == {
        "workflow_run_id",
        "application_id",
        "status",
        "summary",
        "updated_at",
    }
    selected = " ".join(
        [
            *inventory.selected_columns.keys(),
            *incident.selected_columns.keys(),
            *deployment.selected_columns.keys(),
        ]
    )
    assert "raw" not in selected
    assert "payload" not in selected
    assert "metadata" not in selected
    assert "credential" not in selected


def test_inventory_change_query_reuses_real_delta_ledger_with_temporal_filters() -> None:
    statement = _inventory_events_statement(
        workspace_id="workspace-a",
        cluster_ids={"cluster-a"},
        allowed_application_ids={"app-a"},
        filters=_filters(),
        start=datetime(2026, 7, 14, tzinfo=UTC),
        end=datetime(2026, 7, 15, tzinfo=UTC),
        limit=MAX_CHANGE_EVENTS + 1,
    )
    sql = " ".join(
        str(
            statement.compile(
                dialect=postgresql.dialect(),
                compile_kwargs={"literal_binds": True},
            )
        )
        .casefold()
        .split()
    )

    assert "from timeline_events" in sql
    assert "join lateral" not in sql
    assert "timeline_events.workspace_id = 'workspace-a'" in sql
    assert "timeline_events.cluster_id in ('cluster-a')" in sql
    assert "timeline_events.source = 'inventory'" in sql
    assert "timeline_events.activity = 'change'" in sql
    assert "timeline_events.event_type in ('add', 'update', 'delete')" in sql
    assert "inventory_resource_versions.inventory_key = timeline_events.native_id" in sql
    assert "inventory_filter_revisions.snapshot_id" in sql
    assert "source_snapshot_id" in sql
    assert "revision_id" in sql
    assert "version_id" in sql
    assert "jsonb_typeof" in sql
    assert "inventory_resource_label_versions" in sql
    assert "inventory_resource_application_versions" in sql
    assert "inventory_resource_versions.health" in sql
    assert "inventory_resource_versions.resource_type" in sql
    assert "inventory_resource_versions.search_text" in sql
    assert " lag(" not in sql
    assert "order by timeline_events.occurred_at, timeline_events.event_id" in sql
    assert f"limit {MAX_CHANGE_EVENTS + 1}" in sql


def test_unfiltered_inventory_change_query_bounds_event_candidates_before_projection_joins() -> (
    None
):
    statement = _inventory_events_statement(
        workspace_id="workspace-a",
        cluster_ids={"cluster-a"},
        allowed_application_ids=set(),
        filters=parse_resource_filters(
            clusters="cluster-a",
            namespaces=None,
            applications=None,
            resource_types=None,
            health=None,
            labels=None,
            query=None,
            include_deleted=False,
        ),
        start=datetime(2026, 7, 14, tzinfo=UTC),
        end=datetime(2026, 7, 15, tzinfo=UTC),
        limit=MAX_CHANGE_EVENTS + 1,
    )
    sql = " ".join(
        str(
            statement.compile(
                dialect=postgresql.dialect(),
                compile_kwargs={"literal_binds": True},
            )
        )
        .casefold()
        .split()
    )

    assert "bounded_inventory_change_events" in sql
    assert sql.index(f"limit {MAX_CHANGE_EVENTS + 1}") < sql.index(
        ") as bounded_inventory_change_events"
    )
    assert "order by bounded_inventory_change_events.occurred_at" in sql


def test_multi_cluster_change_query_bounds_each_cluster_before_global_merge() -> None:
    statement = _inventory_events_statement(
        workspace_id="workspace-a",
        cluster_ids={"cluster-a", "cluster-b"},
        allowed_application_ids=set(),
        filters=parse_resource_filters(
            clusters="cluster-a,cluster-b",
            namespaces=None,
            applications=None,
            resource_types=None,
            health=None,
            labels=None,
            query=None,
            include_deleted=False,
        ),
        start=datetime(2026, 7, 14, tzinfo=UTC),
        end=datetime(2026, 7, 15, tzinfo=UTC),
        limit=MAX_CHANGE_EVENTS + 1,
    )
    sql = " ".join(
        str(
            statement.compile(
                dialect=postgresql.dialect(),
                compile_kwargs={"literal_binds": True},
            )
        )
        .casefold()
        .split()
    )

    assert "per_cluster_inventory_change_events" in sql
    assert "union all" in sql
    assert "timeline_events.cluster_id = 'cluster-a'" in sql
    assert "timeline_events.cluster_id = 'cluster-b'" in sql
    assert sql.count(f"limit {MAX_CHANGE_EVENTS + 1}") == 3
    assert "order by bounded_inventory_change_events.occurred_at" in sql


def test_change_coverage_excludes_baseline_and_incomplete_revisions() -> None:
    start = datetime(2026, 7, 14, tzinfo=UTC)
    end = datetime(2026, 7, 15, tzinfo=UTC)
    filtered = _observations_statement(
        workspace_id="workspace-a",
        cluster_ids={"cluster-a"},
        filters=_filters(),
        start=start,
        end=end,
        limit=101,
    )
    filtered_sql = " ".join(
        str(
            filtered.compile(
                dialect=postgresql.dialect(),
                compile_kwargs={"literal_binds": True},
            )
        )
        .casefold()
        .split()
    )

    assert f"change_ledger_epoch = '{INVENTORY_CHANGE_LEDGER_EPOCH}'" in filtered_sql
    assert "resources_complete is true" in filtered_sql
    assert "labels_complete is true" in filtered_sql
    assert "application_bindings_complete is true" in filtered_sql

    unfiltered = _observations_statement(
        workspace_id="workspace-a",
        cluster_ids={"cluster-a"},
        filters=parse_resource_filters(
            clusters="cluster-a",
            namespaces=None,
            applications=None,
            resource_types=None,
            health=None,
            labels=None,
            query=None,
            include_deleted=False,
        ),
        start=start,
        end=end,
        limit=101,
    )
    unfiltered_sql = " ".join(
        str(
            unfiltered.compile(
                dialect=postgresql.dialect(),
                compile_kwargs={"literal_binds": True},
            )
        )
        .casefold()
        .split()
    )
    assert "resources_complete is true" in unfiltered_sql
    assert "labels_complete is true" not in unfiltered_sql
    assert "application_bindings_complete is true" not in unfiltered_sql


class _Rows:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows

    def mappings(self) -> _Rows:
        return self

    def all(self) -> list[dict[str, Any]]:
        return self.rows


class _LargeChangeReadConnection:
    def __init__(self) -> None:
        self.statements: list[Any] = []

    def execute(self, statement: Any) -> _Rows:
        self.statements.append(statement)
        sql = str(statement.compile(dialect=postgresql.dialect())).casefold()
        if "from timeline_events" in sql:
            observed_at = datetime(2026, 7, 15, tzinfo=UTC)
            return _Rows(
                [
                    {
                        "event_id": f"inventory:update:pod-{index}:fingerprint",
                        "title": f"Pod pod-{index} updated",
                        "health": "healthy",
                        "occurred_at": observed_at + timedelta(milliseconds=index),
                    }
                    for index in range(MAX_CHANGE_EVENTS + 1)
                ]
            )
        return _Rows([])


def test_change_evidence_large_read_is_capped_after_real_ledger_events() -> None:
    connection = _LargeChangeReadConnection()

    @contextmanager
    def connect():
        yield connection

    repository = object.__new__(ChangeTimelineRepository)
    repository.connection = connect
    evidence = repository.list_change_timeline_evidence(
        workspace_id="workspace-a",
        allowed_cluster_ids={"cluster-a"},
        allowed_application_ids=set(),
        allowed_incident_cluster_ids=set(),
        allowed_deployment_application_ids=set(),
        filters=parse_resource_filters(
            clusters="cluster-a",
            namespaces=None,
            applications=None,
            resource_types=None,
            health=None,
            labels=None,
            query=None,
            include_deleted=False,
        ),
        from_ms=1_752_537_600_000,
        to_ms=1_752_624_000_000,
        limit=MAX_CHANGE_EVENTS,
    )

    assert evidence["event_overflow"] is True
    assert len(evidence["events"]) == MAX_CHANGE_EVENTS
    assert [event["id"] for event in evidence["events"][:2]] == [
        "inventory:update:pod-0:fingerprint",
        "inventory:update:pod-1:fingerprint",
    ]
    inventory_statement = next(
        statement
        for statement in connection.statements
        if "from timeline_events" in str(statement.compile(dialect=postgresql.dialect())).casefold()
    )
    sql = str(
        inventory_statement.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    ).casefold()
    assert f"limit {MAX_CHANGE_EVENTS + 1}" in sql


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        ("healthy", "info"),
        ("low", "info"),
        ("degraded", "warning"),
        ("medium", "warning"),
        ("failed", "critical"),
        ("high", "critical"),
        (None, "unknown"),
    ],
)
def test_change_severity_is_a_closed_allowlist(source: object, expected: str) -> None:
    assert normalize_change_severity(source) == expected


def test_change_timeline_tie_break_and_gap_merge_are_deterministic() -> None:
    result = build_change_timeline(
        from_ms=0,
        to_ms=180_000,
        bucket_ms=60_000,
        required_cluster_ids={"cluster-a"},
        observations=[{"cluster_id": "cluster-a", "observed_ms": 10_000}],
        events=[
            {
                "id": "z",
                "kind": "incident",
                "occurredMs": 20_000,
                "title": "incident",
                "severity": "warning",
            },
            {
                "id": "a",
                "kind": "inventory_event",
                "occurredMs": 20_000,
                "title": "resource",
                "severity": "info",
            },
        ],
    )

    assert [event["id"] for event in result["events"]] == ["z", "a"]
    assert result["buckets"][0]["total"] == 2
    assert result["buckets"][0]["warnings"] == 1
    assert result["gaps"] == [{"from": 60_000, "to": 180_000}]


def test_change_timeline_schema_forbids_extra_fields() -> None:
    with pytest.raises(ValidationError):
        ChangeTimelineResponse.model_validate(
            {
                "buckets": [],
                "events": [
                    {
                        "id": "event-a",
                        "kind": "incident",
                        "occurredMs": 1,
                        "title": "incident",
                        "severity": "critical",
                        "raw": {"secret": True},
                    }
                ],
                "gaps": [],
            }
        )

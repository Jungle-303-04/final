from __future__ import annotations

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from domains.changes.repository import (
    _deployment_events_statement,
    _incident_events_statement,
    _inventory_events_statement,
    normalize_change_severity,
)
from domains.changes.timeline import build_change_timeline
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
        "version_id",
        "resource_type",
        "kind",
        "name",
        "status",
        "health",
        "observed_at",
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

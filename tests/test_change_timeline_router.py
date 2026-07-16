from __future__ import annotations

import importlib
from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from domains.identity.dependencies import require_session
from packages.runtime.dependencies import get_db

FROM_MS = 1_720_000_000_000
BUCKET_MS = 60_000
TO_MS = FROM_MS + 3 * BUCKET_MS


class ChangeTimelineApiDb:
    def __init__(self, *, overflow: bool = False) -> None:
        self.overflow = overflow
        self.calls: list[dict[str, Any]] = []
        self.authorization_calls: list[tuple[str, str]] = []

    def accessible_resource_ids(
        self,
        _user_id: str,
        _workspace_id: str,
        resource_type: str,
        permission: str,
    ) -> set[str]:
        self.authorization_calls.append((resource_type, permission))
        if resource_type == "cluster":
            return {"cluster-a", "cluster-b"}
        if resource_type == "application":
            return {"app-a"}
        return set()

    def list_change_timeline_evidence(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(dict(kwargs))
        if self.overflow:
            all_events = [
                {
                    "id": f"inventory:{index}",
                    "kind": "inventory_event",
                    "occurredMs": FROM_MS + index,
                    "title": f"Pod checkout change {index}",
                    "severity": "warning" if index % 10 == 0 else "info",
                }
                for index in range(1_503)
            ]
            selected_events = [
                event
                for event in all_events
                if int(kwargs["from_ms"]) <= event["occurredMs"] < int(kwargs["to_ms"])
            ]
            return {
                "events": selected_events[:1_000],
                "observations": [
                    observation
                    for observation in (
                        {"cluster_id": "cluster-a", "observed_ms": FROM_MS + 10_000},
                        {"cluster_id": "cluster-b", "observed_ms": FROM_MS + 11_000},
                        {"cluster_id": "cluster-a", "observed_ms": FROM_MS + 130_000},
                        {"cluster_id": "cluster-b", "observed_ms": FROM_MS + 131_000},
                    )
                    if int(kwargs["from_ms"]) <= observation["observed_ms"] < int(kwargs["to_ms"])
                ],
                "event_overflow": len(selected_events) > 1_000,
                "observation_overflow": False,
            }
        evidence = {
            "events": [
                {
                    "id": "incident:incident-a",
                    "kind": "incident",
                    "occurredMs": FROM_MS + 125_000,
                    "title": "checkout unavailable",
                    "severity": "critical",
                },
                {
                    "id": "inventory:42",
                    "kind": "inventory_event",
                    "occurredMs": FROM_MS + 20_000,
                    "title": "Pod checkout observed as Running",
                    "severity": "info",
                },
            ],
            "observations": [
                {"cluster_id": "cluster-a", "observed_ms": FROM_MS + 10_000},
                {"cluster_id": "cluster-b", "observed_ms": FROM_MS + 11_000},
                {"cluster_id": "cluster-a", "observed_ms": FROM_MS + 130_000},
                {"cluster_id": "cluster-b", "observed_ms": FROM_MS + 131_000},
            ],
            "event_overflow": self.overflow,
            "observation_overflow": False,
        }
        return evidence


def _client(db: ChangeTimelineApiDb) -> TestClient:
    module = importlib.import_module("domains.changes.router")
    app = FastAPI()
    app.include_router(module.router)
    app.dependency_overrides[require_session] = lambda: SimpleNamespace(
        user_id="user-a",
        workspace_id="workspace-a",
        roles=("user",),
    )
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app)


def _params(**extra: str | int) -> dict[str, str | int]:
    return {
        "from": FROM_MS,
        "to": TO_MS,
        "bucket": BUCKET_MS,
        **extra,
    }


def test_change_timeline_is_strict_sorted_bucketed_and_gap_explicit() -> None:
    db = ChangeTimelineApiDb()
    response = _client(db).get(
        "/changes",
        params=_params(
            clusters="cluster-a,cluster-b",
            applications="app-a",
            **{
                "resources.types": "Pod,workload",
                "resources.health": "healthy,degraded",
                "resources.q": "checkout",
                "labels": "team=checkout",
            },
        ),
    )

    assert response.status_code == 200
    assert response.json() == {
        "buckets": [
            {
                "startMs": FROM_MS,
                "endMs": FROM_MS + BUCKET_MS,
                "total": 1,
                "warnings": 0,
            },
            {
                "startMs": FROM_MS + BUCKET_MS,
                "endMs": FROM_MS + 2 * BUCKET_MS,
                "total": 0,
                "warnings": 0,
            },
            {
                "startMs": FROM_MS + 2 * BUCKET_MS,
                "endMs": TO_MS,
                "total": 1,
                "warnings": 1,
            },
        ],
        "events": [
            {
                "id": "inventory:42",
                "kind": "inventory_event",
                "occurredMs": FROM_MS + 20_000,
                "title": "Pod checkout observed as Running",
                "severity": "info",
            },
            {
                "id": "incident:incident-a",
                "kind": "incident",
                "occurredMs": FROM_MS + 125_000,
                "title": "checkout unavailable",
                "severity": "critical",
            },
        ],
        "gaps": [{"from": FROM_MS + BUCKET_MS, "to": FROM_MS + 2 * BUCKET_MS}],
    }
    call = db.calls[0]
    assert call["allowed_cluster_ids"] == {"cluster-a", "cluster-b"}
    assert call["allowed_application_ids"] == {"app-a"}
    assert call["allowed_incident_cluster_ids"] == {"cluster-a", "cluster-b"}
    assert call["allowed_deployment_application_ids"] == {"app-a"}
    assert call["filters"].resource_types == ("pod", "workload")
    assert call["filters"].health == ("degraded", "healthy")
    assert call["filters"].labels == (("team", "checkout"),)
    assert call["filters"].query == "checkout"
    assert ("cluster", "inventory.read") in db.authorization_calls
    assert ("cluster", "rca.read") in db.authorization_calls
    assert ("application", "application.read") in db.authorization_calls
    assert ("application", "deployment.read") in db.authorization_calls


def test_change_timeline_rejects_unauthorized_filter_before_query() -> None:
    db = ChangeTimelineApiDb()
    response = _client(db).get(
        "/changes",
        params=_params(clusters="cluster-secret"),
    )

    assert response.status_code == 404
    assert "cluster-secret" not in response.text
    assert db.calls == []


def test_change_timeline_rejects_unbounded_reads_but_serves_capped_overflow_details() -> None:
    db = ChangeTimelineApiDb(overflow=True)
    client = _client(db)

    reversed_window = client.get(
        "/changes",
        params={"from": TO_MS, "to": FROM_MS, "bucket": BUCKET_MS},
    )
    too_wide = client.get(
        "/changes",
        params={
            "from": FROM_MS,
            "to": FROM_MS + 24 * 60 * 60 * 1_000 + 1,
            "bucket": BUCKET_MS,
        },
    )
    invalid_epoch = client.get(
        "/changes",
        params={
            "from": 253_402_300_799_001,
            "to": 253_402_300_799_002,
            "bucket": 1_000,
        },
    )
    overflow = client.get("/changes", params=_params())

    assert reversed_window.status_code == 422
    assert too_wide.status_code == 422
    assert invalid_epoch.status_code == 422
    assert overflow.status_code == 200
    assert len(overflow.json()["events"]) == 1_503
    assert overflow.json()["buckets"][0] == {
        "startMs": FROM_MS,
        "endMs": FROM_MS + BUCKET_MS,
        "total": 1_503,
        "warnings": 151,
    }
    assert len(db.calls) > 1
    assert all(call["from_ms"] < call["to_ms"] for call in db.calls)


def test_change_timeline_openapi_owns_the_exact_bq057_contract() -> None:
    schema = _client(ChangeTimelineApiDb()).app.openapi()
    operation = schema["paths"]["/changes"]["get"]

    assert {parameter["name"] for parameter in operation["parameters"]} >= {
        "from",
        "to",
        "bucket",
        "clusters",
        "namespaces",
        "applications",
        "resources.types",
        "resources.health",
        "labels",
        "resources.q",
    }
    response_schema = operation["responses"]["200"]["content"]["application/json"]["schema"]
    assert response_schema["$ref"].endswith("ChangeTimelineResponse")

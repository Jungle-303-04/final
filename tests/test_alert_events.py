"""알림 사건 목록, 확인, 인시던트 승격, SSE 계약."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from domains.alert.router import router as alert_router
from domains.alert.schemas import AlertEventResponse
from domains.identity.dependencies import require_admin_session
from packages.runtime.dependencies import get_db, get_events

FIRED_AT = datetime(2026, 7, 15, 2, 0, tzinfo=UTC)


def alert_event(**overrides: Any) -> dict[str, Any]:
    row = {
        "event_id": "ale-1",
        "workspace_id": "workspace-1",
        "rule_id": "alr-1",
        "rule_name": "파드 CPU 과부하",
        "source": "opsia",
        "severity": "high",
        "subject_key": "subject-1",
        "subject": {
            "cluster": "cluster-1",
            "namespace": "shop",
            "kind": "Pod",
            "name": "checkout-0",
        },
        "fired_at": FIRED_AT,
        "resolved_at": None,
        "status": "firing",
        "observed_value": 91.0,
        "threshold": 80.0,
        "evidence": [
            {
                "type": "metric_sample",
                "metric": "cpu_pct",
                "observed_at": FIRED_AT,
                "subject": {
                    "cluster": "cluster-1",
                    "namespace": "shop",
                    "kind": "Pod",
                    "name": "checkout-0",
                },
                "value": 91.0,
            }
        ],
        "incident_id": None,
        "acknowledged_at": None,
        "acknowledged_by": None,
        "promoted_at": None,
        "promoted_by": None,
        "created_at": FIRED_AT,
        "updated_at": FIRED_AT,
    }
    row.update(overrides)
    return row


def alert_event_contract(**overrides: Any) -> dict[str, Any]:
    row = alert_event(**overrides)
    return {key: row.get(key) for key in AlertEventResponse.model_fields}


class StubAlertEventDb:
    def __init__(self) -> None:
        self.rows = {
            "ale-1": alert_event(),
            "ale-resolved": alert_event(
                event_id="ale-resolved",
                status="resolved",
                resolved_at=FIRED_AT,
            ),
            "ale-other": alert_event(event_id="ale-other", workspace_id="workspace-2"),
        }
        self.list_calls: list[dict[str, Any]] = []
        self.ack_calls: list[tuple[str, str, str]] = []
        self.promote_calls: list[tuple[str, str, str, str]] = []

    def create_alert_event(self, payload: dict[str, Any]) -> dict[str, Any]:
        row = {
            **payload,
            "acknowledged_at": None,
            "acknowledged_by": None,
            "promoted_at": None,
            "promoted_by": None,
            "created_at": payload["fired_at"],
            "updated_at": payload["fired_at"],
        }
        self.rows[str(row["event_id"])] = row
        return dict(row)

    def list_alert_events(self, workspace_id: str, **filters: Any) -> list[dict[str, Any]]:
        self.list_calls.append({"workspace_id": workspace_id, **filters})
        rows = [row for row in self.rows.values() if row["workspace_id"] == workspace_id]
        for key in ("rule_id", "severity", "status"):
            if filters.get(key):
                rows = [row for row in rows if row[key] == filters[key]]
        return [dict(row) for row in rows[: filters["limit"]]]

    def acknowledge_alert_event(
        self,
        workspace_id: str,
        event_id: str,
        actor_id: str,
    ) -> dict[str, Any] | None:
        self.ack_calls.append((workspace_id, event_id, actor_id))
        row = self.rows.get(event_id)
        if row is None or row["workspace_id"] != workspace_id:
            return None
        if row["status"] == "resolved":
            raise ValueError("resolved alert event cannot be acknowledged")
        row.update(status="acked", acknowledged_at=FIRED_AT, acknowledged_by=actor_id)
        return dict(row)

    def promote_alert_event(
        self,
        workspace_id: str,
        event_id: str,
        incident_id: str,
        actor_id: str,
    ) -> tuple[dict[str, Any], bool] | None:
        self.promote_calls.append((workspace_id, event_id, incident_id, actor_id))
        row = self.rows.get(event_id)
        if row is None or row["workspace_id"] != workspace_id:
            return None
        if row["incident_id"]:
            return dict(row), False
        row.update(
            incident_id=incident_id,
            promoted_at=FIRED_AT,
            promoted_by=actor_id,
        )
        return dict(row), True


class StubEvents:
    def __init__(self) -> None:
        self.accepted: list[tuple[Any, str | None, Any]] = []

    async def accept_body(
        self,
        body: Any,
        correlation_id: str | None = None,
        actor: Any = None,
    ) -> Any:
        self.accepted.append((body, correlation_id, actor))
        return SimpleNamespace(
            event=SimpleNamespace(event_id="evt-incident", correlation_id=correlation_id)
        )


ADMIN = SimpleNamespace(
    user_id="admin-1",
    workspace_id="workspace-1",
    roles=("service_admin",),
)


def alert_app(db: StubAlertEventDb, events: StubEvents | None = None) -> FastAPI:
    app = FastAPI()
    app.include_router(alert_router)
    app.dependency_overrides[require_admin_session] = lambda: ADMIN
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_events] = lambda: events or StubEvents()
    return app


def test_alert_event_contract_requires_known_source_and_material_evidence() -> None:
    with pytest.raises(ValidationError, match="evidence"):
        AlertEventResponse.model_validate(alert_event_contract(evidence=[]))
    with pytest.raises(ValidationError):
        AlertEventResponse.model_validate(alert_event_contract(source="synthetic"))

    external = AlertEventResponse.model_validate(
        alert_event_contract(
            source="alertmanager",
            severity="warning",
            rule_id=None,
            rule_name=None,
            observed_value=None,
            threshold=None,
            evidence=[{"type": "webhook", "summary": "Alertmanager firing alert"}],
        )
    )
    assert external.source == "alertmanager"
    assert external.evidence[0].summary == "Alertmanager firing alert"


def test_list_alert_events_preserves_resolved_and_applies_workspace_filters() -> None:
    db = StubAlertEventDb()
    response = TestClient(alert_app(db)).get(
        "/alert-events",
        params={"severity": "high", "status": "resolved", "limit": 20},
    )

    assert response.status_code == 200
    assert [item["event_id"] for item in response.json()] == ["ale-resolved"]
    assert response.json()[0]["status"] == "resolved"
    assert response.json()[0]["evidence"]
    assert db.list_calls == [
        {
            "workspace_id": "workspace-1",
            "from_time": None,
            "to_time": None,
            "rule_id": None,
            "severity": "high",
            "status": "resolved",
            "limit": 20,
        }
    ]


def test_list_alert_events_rejects_reversed_time_window() -> None:
    db = StubAlertEventDb()
    response = TestClient(alert_app(db)).get(
        "/alert-events",
        params={
            "from": "2026-07-15T02:01:00Z",
            "to": "2026-07-15T02:00:00Z",
        },
    )

    assert response.status_code == 422
    assert db.list_calls == []


def test_create_test_alert_event_is_hidden_unless_capability_is_enabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = StubAlertEventDb()
    client = TestClient(alert_app(db))
    monkeypatch.setenv("ALERT_TEST_EVENTS_ENABLED", "0")

    assert client.post("/alert-events/test").status_code == 404

    monkeypatch.setenv("ALERT_TEST_EVENTS_ENABLED", "1")
    response = client.post("/alert-events/test")

    assert response.status_code == 201
    assert response.json()["event_id"].startswith("ale-test-")
    assert response.json()["rule_name"] == "실시간 알림 테스트"
    assert response.json()["status"] == "firing"
    assert response.json()["subject"]["cluster"] == "cluster-1"


def test_ack_alert_event_records_actor_and_hides_other_workspace() -> None:
    db = StubAlertEventDb()
    client = TestClient(alert_app(db))

    response = client.post("/alert-events/ale-1/ack")

    assert response.status_code == 200
    assert response.json()["status"] == "acked"
    assert response.json()["acknowledged_by"] == "admin-1"
    assert db.ack_calls == [("workspace-1", "ale-1", "admin-1")]
    assert client.post("/alert-events/ale-other/ack").status_code == 404
    assert client.post("/alert-events/ale-resolved/ack").status_code == 409


def test_promote_alert_event_emits_one_evidence_backed_incident_with_actor() -> None:
    db = StubAlertEventDb()
    events = StubEvents()
    client = TestClient(alert_app(db, events))

    first = client.post("/alert-events/ale-1/promote-incident")
    second = client.post("/alert-events/ale-1/promote-incident")

    assert first.status_code == 200
    assert first.json()["incident_id"].startswith("inc-alert-")
    assert second.json() == first.json()
    assert len(events.accepted) == 1
    body, correlation_id, actor = events.accepted[0]
    assert type(body).__name__ == "IncidentDetectedBody"
    assert body.evidence is not None
    assert body.evidence.metrics["alert_event"]["observed_value"] == 91.0
    assert body.evidence.metrics["alert_event"]["evidence"]
    assert body.incident is not None
    assert body.incident.incident_id == first.json()["incident_id"]
    assert correlation_id == first.json()["incident_id"]
    assert actor.user_id == "admin-1"
    assert db.promote_calls[0][0:2] == ("workspace-1", "ale-1")
    assert db.promote_calls[0][3] == "admin-1"


def test_promote_alert_event_hides_other_workspace() -> None:
    client = TestClient(alert_app(StubAlertEventDb(), StubEvents()))
    assert client.post("/alert-events/ale-other/promote-incident").status_code == 404


def test_alert_event_routes_publish_openapi() -> None:
    schema = alert_app(StubAlertEventDb()).openapi()

    assert {
        "/alert-events",
        "/alert-events/test",
        "/alert-events/{event_id}/ack",
        "/alert-events/{event_id}/promote-incident",
    } <= set(schema["paths"])

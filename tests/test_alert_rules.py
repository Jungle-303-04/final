"""Opsia 알림 규칙 생성 계약과 워크스페이스 저장 경계."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from domains.alert.router import router as alert_router
from domains.alert.schemas import AlertRuleCreateRequest, AlertRulePatchRequest, AlertRuleScope
from domains.identity.dependencies import require_admin_session
from packages.runtime.dependencies import get_db

VALID_RULE = {
    "name": "파드 CPU 과부하",
    "scope": {
        "clusters": ["cluster-b", "cluster-a", "cluster-a"],
        "namespaces": ["cluster-a/shop"],
        "applications": ["checkout"],
        "labels": ["team=payments", "team=checkout"],
    },
    "metric": "cpu_pct",
    "comparator": ">",
    "threshold": 80,
    "for_seconds": 20,
    "severity": "high",
    "channels": ["chan-ops"],
    "enabled": True,
}


class StubAlertRuleDb:
    def __init__(self, *, channel_workspace: str = "workspace-1") -> None:
        self.channel_workspace = channel_workspace
        self.channel_reads: list[tuple[str, str]] = []
        self.created: list[dict[str, Any]] = []
        self.rules: dict[str, dict[str, Any]] = {}
        self.updates: list[tuple[str, str, dict[str, Any]]] = []

    def get_alert_channel(self, workspace_id: str, channel_id: str) -> dict[str, Any] | None:
        self.channel_reads.append((workspace_id, channel_id))
        if channel_id != "chan-ops" or workspace_id != self.channel_workspace:
            return None
        return {
            "channel_id": channel_id,
            "workspace_id": workspace_id,
            "enabled": True,
        }

    def create_alert_rule(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.created.append(dict(payload))
        row = stored_rule(**payload)
        self.rules[str(payload["rule_id"])] = row
        return dict(row)

    def list_alert_rules(self, workspace_id: str) -> list[dict[str, Any]]:
        return [dict(row) for row in self.rules.values() if row["workspace_id"] == workspace_id]

    def update_alert_rule(
        self,
        workspace_id: str,
        rule_id: str,
        changes: dict[str, Any],
    ) -> dict[str, Any] | None:
        self.updates.append((workspace_id, rule_id, dict(changes)))
        row = self.rules.get(rule_id)
        if row is None or row["workspace_id"] != workspace_id:
            return None
        row.update(changes)
        row["updated_at"] = "2026-07-15T01:00:00Z"
        return dict(row)

    def delete_alert_rule(self, workspace_id: str, rule_id: str) -> bool:
        row = self.rules.get(rule_id)
        if row is None or row["workspace_id"] != workspace_id:
            return False
        del self.rules[rule_id]
        return True


ADMIN = SimpleNamespace(
    user_id="admin-1",
    workspace_id="workspace-1",
    roles=("service_admin",),
)


def alert_app(db: StubAlertRuleDb) -> FastAPI:
    app = FastAPI()
    app.include_router(alert_router)
    app.dependency_overrides[require_admin_session] = lambda: ADMIN
    app.dependency_overrides[get_db] = lambda: db
    return app


def stored_rule(**overrides: Any) -> dict[str, Any]:
    row = {
        "rule_id": "alr-1",
        "workspace_id": "workspace-1",
        "created_by": "admin-1",
        **VALID_RULE,
        "scope": {
            "clusters": ["cluster-a"],
            "namespaces": ["cluster-a/shop"],
            "applications": ["checkout"],
            "labels": ["team=checkout"],
        },
        "last_fired_at": None,
        "occurrence_count": 0,
        "created_at": "2026-07-15T00:00:00Z",
        "updated_at": "2026-07-15T00:00:00Z",
    }
    row.update(overrides)
    return row


def test_alert_rule_scope_reuses_canonical_resource_filter_shape() -> None:
    scope = AlertRuleScope.model_validate(VALID_RULE["scope"])

    assert scope.model_dump() == {
        "clusters": ["cluster-a", "cluster-b"],
        "namespaces": ["cluster-a/shop"],
        "applications": ["checkout"],
        "labels": ["team=checkout", "team=payments"],
    }


@pytest.mark.parametrize(
    "mutation",
    (
        {"remove": "for_seconds"},
        {"for_seconds": 0},
        {"metric": "PrometheusRule"},
        {"scope": {**VALID_RULE["scope"], "labels": ["missing-equals"]}},
        {"scope": {**VALID_RULE["scope"], "namespaces": ["missing-cluster"]}},
        {"unexpected": "field"},
    ),
)
def test_alert_rule_contract_rejects_flapping_or_noncanonical_input(
    mutation: dict[str, Any],
) -> None:
    payload = dict(VALID_RULE)
    removed = mutation.pop("remove", None)
    if removed is not None:
        payload.pop(removed)
    payload.update(mutation)

    with pytest.raises(ValidationError):
        AlertRuleCreateRequest.model_validate(payload)


def test_post_alert_rule_persists_opsia_setting_with_actor_and_canonical_scope() -> None:
    db = StubAlertRuleDb()
    response = TestClient(alert_app(db)).post("/alert-rules", json=VALID_RULE)

    assert response.status_code == 201
    assert set(response.json()) == {"rule_id"}
    assert response.json()["rule_id"].startswith("alr-")
    assert response.headers["location"] == f"/alert-rules/{response.json()['rule_id']}"
    assert db.channel_reads == [("workspace-1", "chan-ops")]
    assert db.created == [
        {
            "rule_id": response.json()["rule_id"],
            "workspace_id": "workspace-1",
            "created_by": "admin-1",
            "name": "파드 CPU 과부하",
            "scope": {
                "clusters": ["cluster-a", "cluster-b"],
                "namespaces": ["cluster-a/shop"],
                "applications": ["checkout"],
                "labels": ["team=checkout", "team=payments"],
            },
            "metric": "cpu_pct",
            "comparator": ">",
            "threshold": 80.0,
            "for_seconds": 20,
            "severity": "high",
            "channels": ["chan-ops"],
            "enabled": True,
        }
    ]


def test_post_alert_rule_rejects_channel_outside_workspace() -> None:
    db = StubAlertRuleDb(channel_workspace="workspace-2")
    response = TestClient(alert_app(db)).post("/alert-rules", json=VALID_RULE)

    assert response.status_code == 422
    assert response.json()["detail"] == {
        "code": "alert_channel_not_found",
        "detail": "선택한 알림 채널을 찾을 수 없습니다.",
    }
    assert db.channel_reads == [("workspace-1", "chan-ops")]
    assert db.created == []


def test_alert_rule_create_contract_is_published_in_openapi() -> None:
    operation = alert_app(StubAlertRuleDb()).openapi()["paths"]["/alert-rules"]["post"]

    assert operation["requestBody"]["content"]["application/json"]["schema"]["$ref"].endswith(
        "/AlertRuleCreateRequest"
    )
    assert operation["responses"]["201"]["content"]["application/json"]["schema"]["$ref"].endswith(
        "/AlertRuleCreatedResponse"
    )


def test_list_alert_rules_returns_only_current_workspace_with_occurrence_summary() -> None:
    db = StubAlertRuleDb()
    db.rules = {
        "alr-own": stored_rule(
            rule_id="alr-own",
            last_fired_at="2026-07-15T00:30:00Z",
            occurrence_count=3,
        ),
        "alr-other": stored_rule(rule_id="alr-other", workspace_id="workspace-2"),
    }

    response = TestClient(alert_app(db)).get("/alert-rules")

    assert response.status_code == 200
    assert [rule["rule_id"] for rule in response.json()["rules"]] == ["alr-own"]
    assert response.json()["rules"][0]["last_fired_at"] == "2026-07-15T00:30:00Z"
    assert response.json()["rules"][0]["occurrence_count"] == 3


def test_patch_alert_rule_updates_only_supplied_fields_and_revalidates_channels() -> None:
    db = StubAlertRuleDb()
    db.rules = {"alr-1": stored_rule()}
    client = TestClient(alert_app(db))

    response = client.patch(
        "/alert-rules/alr-1",
        json={"threshold": 85, "for_seconds": 30, "channels": ["chan-ops"]},
    )

    assert response.status_code == 200
    assert response.json()["threshold"] == 85.0
    assert response.json()["for_seconds"] == 30
    assert db.channel_reads == [("workspace-1", "chan-ops")]
    assert db.updates == [
        (
            "workspace-1",
            "alr-1",
            {"threshold": 85.0, "for_seconds": 30, "channels": ["chan-ops"]},
        )
    ]


@pytest.mark.parametrize(
    "payload",
    (
        {},
        {"for_seconds": 0},
        {"metric": "PrometheusRule"},
        {"scope": {"labels": ["missing-equals"]}},
    ),
)
def test_patch_alert_rule_rejects_empty_flapping_or_noncanonical_changes(
    payload: dict[str, Any],
) -> None:
    with pytest.raises(ValidationError):
        AlertRulePatchRequest.model_validate(payload)


def test_patch_alert_rule_rejects_missing_workspace_channel_before_update() -> None:
    db = StubAlertRuleDb(channel_workspace="workspace-2")
    db.rules = {"alr-1": stored_rule()}

    response = TestClient(alert_app(db)).patch(
        "/alert-rules/alr-1",
        json={"channels": ["chan-ops"]},
    )

    assert response.status_code == 422
    assert db.updates == []


def test_patch_and_delete_alert_rule_hide_other_workspace_rows_as_not_found() -> None:
    db = StubAlertRuleDb()
    db.rules = {"alr-other": stored_rule(rule_id="alr-other", workspace_id="workspace-2")}
    client = TestClient(alert_app(db))

    assert client.patch("/alert-rules/alr-other", json={"enabled": False}).status_code == 404
    assert client.delete("/alert-rules/alr-other").status_code == 404
    assert db.rules["alr-other"]["enabled"] is True


def test_delete_alert_rule_returns_no_content() -> None:
    db = StubAlertRuleDb()
    db.rules = {"alr-1": stored_rule()}

    response = TestClient(alert_app(db)).delete("/alert-rules/alr-1")

    assert response.status_code == 204
    assert response.content == b""
    assert db.rules == {}

"""Opsia 알림 규칙 생성 계약과 워크스페이스 저장 경계."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from domains.alert.router import router as alert_router
from domains.alert.schemas import AlertRuleCreateRequest, AlertRuleScope
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
        return dict(payload)


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

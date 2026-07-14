from __future__ import annotations

import json
from copy import deepcopy
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from domains.ai.alert_actions import DEFAULT_ALERT_RULE_FOR_SECONDS
from domains.ai.router import router as ai_router
from domains.identity.dependencies import require_session
from packages.contracts.gateway.responses import (
    AI_NO_DATA_ANSWER,
    AiChatResponse,
    AiEvidenceLink,
)
from packages.runtime.dependencies import get_db

CONTEXT = {
    "screen": "resources",
    "filters": {
        "clusters": ["cluster-1"],
        "namespaces": ["cluster-1/shop"],
        "applications": [],
        "labels": [],
        "resource_types": ["pod"],
        "health": [],
        "query": "checkout",
    },
    "selection": {"type": "resource", "identity": "Pod/shop/checkout-api-0"},
    "time": None,
}


def inventory_row(**overrides: Any) -> dict[str, Any]:
    row: dict[str, Any] = {
        "inventory_key": "inventory-pod-1",
        "snapshot_id": "snapshot-1",
        "workspace_id": "ws-1",
        "cluster_id": "cluster-1",
        "resource_type": "pod",
        "api_version": "v1",
        "kind": "Pod",
        "namespace": "shop",
        "name": "checkout-api-0",
        "uid": "uid-1",
        "resource_version": "17",
        "status": "Running",
        "health": "healthy",
        "labels": {"token": "must-not-leak"},
        "annotations": {"credential": "must-not-leak"},
        "summary": {"container_env": "must-not-leak"},
        "raw": {"data": "must-not-leak"},
        "observed_at": "2026-07-14T08:00:00+00:00",
    }
    row.update(overrides)
    return row


class StubAiDb:
    def __init__(self, rows: list[dict[str, Any]] | None = None) -> None:
        self.rows = rows or [inventory_row()]
        self.allowed = {"cluster-1"}
        self.access_calls: list[tuple[str, str, str, str]] = []
        self.alert_rule_create_calls: list[dict[str, Any]] = []

    def accessible_resource_ids(
        self,
        user_id: str,
        workspace_id: str,
        resource_type: str,
        permission: str,
    ) -> set[str]:
        self.access_calls.append((user_id, workspace_id, resource_type, permission))
        return set(self.allowed)

    def list_inventory_resources(self, **kwargs: Any) -> list[dict[str, Any]]:
        return [
            row
            for row in self.rows
            if row["workspace_id"] == kwargs["workspace_id"]
            and row["cluster_id"] == kwargs["cluster_id"]
            and row["resource_type"] == kwargs["resource_type"]
            and (kwargs["namespace"] is None or row["namespace"] == kwargs["namespace"])
        ][: kwargs["limit"]]

    def create_alert_rule(self, payload: dict[str, Any]) -> None:
        self.alert_rule_create_calls.append(payload)
        raise AssertionError("AI action proposals must never execute alert rules")


def current_session() -> SimpleNamespace:
    return SimpleNamespace(user_id="user-1", roles=("user",), workspace_id="ws-1")


def ai_app(db: StubAiDb, *, authenticated: bool = True) -> FastAPI:
    app = FastAPI()
    app.include_router(ai_router)
    app.dependency_overrides[get_db] = lambda: db
    if authenticated:
        app.dependency_overrides[require_session] = current_session
    else:

        class RejectingAuth:
            async def require_session(self, _request: Any) -> None:
                raise HTTPException(status_code=401, detail="authentication required")

        app.state.auth = RejectingAuth()
    return app


def test_context_chat_returns_only_authorized_sanitized_evidence() -> None:
    db = StubAiDb()
    response = TestClient(ai_app(db)).post(
        "/ai/chat",
        json={"context": CONTEXT, "message": "Why is it restarting?"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["evidence"] == [
        {
            "type": "inventory-resource",
            "id": "inventory-pod-1",
            "label": "Pod shop/checkout-api-0",
            "link": (
                "/resources?clusters=cluster-1&resources.types=pod&"
                "detail=Pod%2Fshop%2Fcheckout-api-0"
            ),
        }
    ]
    assert "status Running, health healthy" in body["answer"]
    assert "must-not-leak" not in response.text
    assert db.access_calls == [("user-1", "ws-1", "cluster", "inventory.read")]
    assert db.alert_rule_create_calls == []


def test_context_chat_does_not_treat_general_korean_question_as_alert_intent() -> None:
    response = TestClient(ai_app(StubAiDb())).post(
        "/ai/chat",
        json={"context": CONTEXT, "message": "선택한 파드 상태를 알려줘"},
    )

    assert response.status_code == 200
    assert "현재 관측된 근거" in response.json()["answer"]
    assert "action" not in response.json()


@pytest.mark.parametrize(
    ("message", "metric", "threshold", "comparator", "expected_name"),
    [
        (
            "이 클러스터에서 파드 CPU가 70% 넘으면 알람 걸어줘",
            "cpu_pct",
            70.0,
            ">",
            "파드 CPU 70% 알림",
        ),
        ("메모리 사용률이 82.5% 이상이면 알려줘", "mem_pct", 82.5, ">=", "파드 메모리 82.5% 알림"),
    ],
)
def test_context_chat_proposes_only_allowlisted_alert_action_from_current_filters(
    message: str,
    metric: str,
    threshold: float,
    comparator: str,
    expected_name: str,
) -> None:
    db = StubAiDb()

    response = TestClient(ai_app(db)).post(
        "/ai/chat",
        json={"context": CONTEXT, "message": message},
    )

    assert response.status_code == 200
    action = response.json()["action"]
    assert action["type"] == "create_alert_rule"
    assert action["payload"] == {
        "name": expected_name,
        "scope": {
            "clusters": ["cluster-1"],
            "namespaces": ["cluster-1/shop"],
            "applications": [],
            "labels": [],
        },
        "metric": metric,
        "comparator": comparator,
        "threshold": threshold,
        "for_seconds": DEFAULT_ALERT_RULE_FOR_SECONDS,
        "severity": "high",
        "channels": [],
        "enabled": True,
    }
    assert str(DEFAULT_ALERT_RULE_FOR_SECONDS) in action["rationale"]
    assert db.alert_rule_create_calls == []


@pytest.mark.parametrize(
    ("message", "question"),
    [
        ("CPU가 높으면 알람 걸어줘", "몇 %"),
        ("CPU나 메모리가 80%면 알려줘", "CPU와 메모리 중"),
        ("CPU가 70% 또는 80%면 알려줘", "하나의 %"),
    ],
)
def test_context_chat_asks_for_missing_or_ambiguous_alert_condition_without_action(
    message: str,
    question: str,
) -> None:
    db = StubAiDb()

    response = TestClient(ai_app(db)).post(
        "/ai/chat",
        json={"context": CONTEXT, "message": message},
    )

    assert response.status_code == 200
    assert question in response.json()["answer"]
    assert "action" not in response.json()
    assert response.json()["evidence"]
    assert db.alert_rule_create_calls == []


def test_context_chat_never_guesses_alert_scope_outside_current_filters() -> None:
    db = StubAiDb()
    unscoped = deepcopy(CONTEXT)
    unscoped["filters"]["clusters"] = []
    unscoped["filters"]["namespaces"] = []
    unscoped["filters"]["applications"] = []
    unscoped["filters"]["labels"] = []

    response = TestClient(ai_app(db)).post(
        "/ai/chat",
        json={"context": unscoped, "message": "CPU가 70% 넘으면 알려줘"},
    )

    assert response.status_code == 200
    assert "클러스터나 네임스페이스를 먼저 선택" in response.json()["answer"]
    assert "action" not in response.json()
    assert db.alert_rule_create_calls == []


def test_context_chat_uses_canonical_no_data_for_unmaterialized_context() -> None:
    db = StubAiDb()
    historical = deepcopy(CONTEXT)
    historical["time"] = "2026-07-13T08:00:00+09:00"

    response = TestClient(ai_app(db)).post(
        "/ai/chat",
        json={"context": historical, "message": "What was the status?"},
    )

    assert response.status_code == 200
    assert response.json() == {"answer": AI_NO_DATA_ANSWER, "evidence": []}


def test_context_chat_rejects_extra_fields_and_naive_time() -> None:
    client = TestClient(ai_app(StubAiDb()))
    extra = deepcopy(CONTEXT)
    extra["selection"] = {"type": "resource", "identity": "Pod/shop/p", "raw": {}}
    naive = deepcopy(CONTEXT)
    naive["time"] = "2026-07-14T08:00:00"

    assert client.post("/ai/chat", json={"context": extra, "message": "status"}).status_code == 422
    assert client.post("/ai/chat", json={"context": naive, "message": "status"}).status_code == 422


def test_context_suggestions_parse_same_strict_query_context() -> None:
    client = TestClient(ai_app(StubAiDb()))
    response = client.get("/ai/suggestions", params={"context": json.dumps(CONTEXT)})

    assert response.status_code == 200
    assert [item["id"] for item in response.json()["suggestions"]] == [
        "selected-resource-status",
        "resource-health",
        "resource-status",
    ]

    malformed = deepcopy(CONTEXT)
    malformed["unexpected"] = True
    assert (
        client.get("/ai/suggestions", params={"context": json.dumps(malformed)}).status_code == 422
    )

    unsupported = deepcopy(CONTEXT)
    unsupported["screen"] = "issues"
    unsupported["selection"] = None
    unsupported["filters"]["resource_types"] = []
    no_suggestions = client.get("/ai/suggestions", params={"context": json.dumps(unsupported)})
    assert no_suggestions.json() == {"suggestions": []}


def test_ai_resource_routes_are_kind_allowlisted_scoped_and_token_bounded() -> None:
    rows = [
        inventory_row(
            inventory_key="deployment-1",
            resource_type="workload",
            kind="Deployment",
            name="checkout-api",
        ),
        inventory_row(
            inventory_key="statefulset-1",
            resource_type="workload",
            kind="StatefulSet",
            name="checkout-db",
        ),
        inventory_row(
            inventory_key="node-1",
            resource_type="node",
            kind="Node",
            namespace=None,
            name="worker-a",
        ),
    ]
    client = TestClient(ai_app(StubAiDb(rows)))

    listed = client.get("/ai/resources/deployments", params={"cluster_id": "cluster-1"})
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == ["deployment-1"]
    assert set(listed.json()[0]) == {
        "id",
        "cluster_id",
        "resource_type",
        "kind",
        "namespace",
        "name",
        "status",
        "health",
        "observed_at",
        "link",
    }

    detail = client.get(
        "/ai/resources/deployments/shop/checkout-api",
        params={"cluster_id": "cluster-1"},
    )
    assert detail.status_code == 200
    assert detail.json()["id"] == "deployment-1"
    cluster_scoped = client.get(
        "/ai/resources/nodes/_/worker-a",
        params={"cluster_id": "cluster-1"},
    )
    assert cluster_scoped.status_code == 200
    assert cluster_scoped.json()["link"].endswith("&detail=Node%2F~%2Fworker-a")
    assert client.get("/ai/resources/secrets").status_code == 422


def test_explicit_unauthorized_ai_resource_is_forbidden_and_auth_fails_closed() -> None:
    db = StubAiDb()
    client = TestClient(ai_app(db))
    assert client.get("/ai/resources/pods", params={"cluster_id": "cluster-2"}).status_code == 403

    unauthenticated = TestClient(ai_app(db, authenticated=False))
    response = unauthenticated.get("/ai/suggestions", params={"context": json.dumps(CONTEXT)})
    assert response.status_code == 401


def test_ai_response_contract_rejects_evidence_free_claims_and_unsafe_links() -> None:
    with pytest.raises(ValidationError, match="canonical no-data"):
        AiChatResponse(answer="unsupported claim", evidence=[])
    with pytest.raises(ValidationError, match="safe product-internal"):
        AiEvidenceLink(
            type="inventory-resource",
            id="resource-1",
            label="resource",
            link="https://example.invalid/resource-1",
        )


def test_ai_context_facade_is_present_in_openapi() -> None:
    schema = ai_app(StubAiDb()).openapi()

    assert {
        "/ai/chat",
        "/ai/suggestions",
        "/ai/resources/{kind}",
        "/ai/resources/{kind}/{namespace}/{name}",
    } <= set(schema["paths"])
    chat_schema = schema["paths"]["/ai/chat"]["post"]
    assert chat_schema["requestBody"]["content"]["application/json"]["schema"]["$ref"].endswith(
        "/AiChatRequest"
    )
    assert chat_schema["responses"]["200"]["content"]["application/json"]["schema"][
        "$ref"
    ].endswith("/AiChatResponse")

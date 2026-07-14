from __future__ import annotations

import asyncio
import json
from copy import deepcopy
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from domains.ai.router import router as ai_router
from domains.identity.dependencies import require_session
from domains.log_stream.router import router as log_stream_router
from domains.log_stream.service import (
    LOG_QUERY_RANGE_SECONDS,
    LOG_STREAM_PROTOCOL,
    LogStreamTarget,
    queue_log_query,
    safe_logql,
    stream_log_events,
)
from packages.config.constants import CommandStatus
from packages.contracts.gateway.responses import AI_NO_DATA_ANSWER
from packages.contracts.log_stream import LogStreamLog, parse_log_stream_envelope
from packages.runtime.dependencies import get_db
from packages.security.log_lines import MAX_LOG_LINE_LENGTH

WORKSPACE_ID = "ws-1"
CLUSTER_ID = "cluster-1"
NAMESPACE = "shop"
POD_NAME = "checkout-api-0"
CONTAINER = "app"


def current_session(user_id: str = "user-1") -> SimpleNamespace:
    return SimpleNamespace(user_id=user_id, roles=("user",), workspace_id=WORKSPACE_ID)


def pod_resource(name: str = POD_NAME) -> dict[str, Any]:
    return {
        "inventory_key": f"pod-{name}",
        "workspace_id": WORKSPACE_ID,
        "cluster_id": CLUSTER_ID,
        "resource_type": "pod",
        "kind": "Pod",
        "namespace": NAMESPACE,
        "name": name,
        "summary": {"containers": [{"name": CONTAINER}]},
    }


def workload_resource() -> dict[str, Any]:
    return {
        "inventory_key": "deployment-checkout-api",
        "workspace_id": WORKSPACE_ID,
        "cluster_id": CLUSTER_ID,
        "resource_type": "workload",
        "kind": "Deployment",
        "namespace": NAMESPACE,
        "name": "checkout-api",
        "summary": {},
    }


class StubLogDb:
    def __init__(self, *, allowed: bool = True, include_pod: bool = True) -> None:
        self.allowed = allowed
        self.resources = [workload_resource()]
        if include_pod:
            self.resources.append(pod_resource())
        self.access_calls: list[tuple[str, str]] = []
        self.queued: dict[str, dict[str, Any]] = {}
        self.correlations: dict[str, str] = {}
        self.command_results: dict[str, tuple[str, str]] = {}
        self.correlation_rows_override: list[dict[str, Any]] | None = None
        self.result_line = "password=top-secret " + "x" * (MAX_LOG_LINE_LENGTH + 100)
        self.redaction_applied = True
        self.get_command_calls = 0

    def user_has_resource_access(
        self,
        user_id: str,
        workspace_id: str,
        resource_type: str,
        resource_id: str,
        action: str,
    ) -> bool:
        del user_id, resource_type
        self.access_calls.append((resource_id, action))
        return self.allowed and workspace_id == WORKSPACE_ID and resource_id == CLUSTER_ID

    def get_inventory_resource(self, **identity: Any) -> dict[str, Any] | None:
        for resource in self.resources:
            if all(resource.get(key) == value for key, value in identity.items()):
                return deepcopy(resource)
        return None

    def list_related_inventory_resources(self, **identity: Any) -> dict[str, Any]:
        del identity
        return {"pods": [deepcopy(item) for item in self.resources if item["kind"] == "Pod"]}

    def queue_agent_command(
        self,
        correlation_id: str,
        plan: dict[str, Any],
        status: str,
    ) -> bool:
        assert status == CommandStatus.QUEUED
        command_id = str(plan["command_id"])
        self.queued[command_id] = deepcopy(plan)
        self.correlations[command_id] = correlation_id
        return True

    async def get_agent_command(
        self,
        command_id: str,
        workspace_id: str,
    ) -> dict[str, Any] | None:
        self.get_command_calls += 1
        plan = self.queued.get(command_id)
        if plan is None or workspace_id != WORKSPACE_ID:
            return None
        return self._command_row(command_id, plan)

    async def list_agent_commands_by_correlation(
        self,
        workspace_id: str,
        correlation_id: str,
        *,
        limit: int,
    ) -> list[dict[str, Any]]:
        if workspace_id != WORKSPACE_ID:
            return []
        if self.correlation_rows_override is not None:
            return deepcopy(self.correlation_rows_override[:limit])
        matching = [
            (command_id, plan)
            for command_id, plan in self.queued.items()
            if self.correlations.get(command_id) == correlation_id
        ]
        return [
            self._command_row(command_id, plan) for command_id, plan in reversed(matching[-limit:])
        ]

    def _command_row(self, command_id: str, plan: dict[str, Any]) -> dict[str, Any]:
        query = plan["payload"]["query"]
        target = query["log_stream"]
        pods = target.get("pods") if isinstance(target.get("pods"), list) else []
        timestamp, line = self.command_results.get(
            command_id,
            ("1784000000000000000", self.result_line),
        )
        return {
            "command_id": command_id,
            "correlation_id": self.correlations[command_id],
            "cluster_id": plan["cluster_id"],
            "action": plan["action"],
            "payload": deepcopy(plan),
            "status": CommandStatus.COMPLETED,
            "result": {
                "result": [
                    {
                        "source": "loki",
                        "query_name": query["name"],
                        "query": query["query"],
                        "redaction_summary": {"applied": self.redaction_applied},
                        "streams": [
                            {
                                "stream": {
                                    "k8s_namespace_name": target["namespace"],
                                    "k8s_pod_name": pods[0] if pods else "__opsia_no_pod__",
                                    "k8s_container_name": target["container"] or CONTAINER,
                                },
                                "values": [
                                    {
                                        "timestamp": timestamp,
                                        "line": line,
                                    },
                                    {
                                        "timestamp": timestamp,
                                        "line": line,
                                    },
                                ],
                            }
                        ],
                    }
                ]
            },
        }


def app_for(db: StubLogDb, *, user_id: str = "user-1") -> FastAPI:
    app = FastAPI()
    app.include_router(log_stream_router)
    app.include_router(ai_router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[require_session] = lambda: current_session(user_id)
    return app


def data_envelopes(body: str) -> list[dict[str, Any]]:
    assert "event:" not in body
    return [
        json.loads(line.removeprefix("data: "))
        for line in body.splitlines()
        if line.startswith("data: ")
    ]


def test_pod_sse_is_default_message_strict_redacted_bounded_and_deduped(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("domains.log_stream.service.LOG_STREAM_BATCH_LIMIT", 1)
    db = StubLogDb()

    response = TestClient(app_for(db)).get(
        f"/pods/{NAMESPACE}/{POD_NAME}/logs/stream",
        params={"cluster_id": CLUSTER_ID, "container": CONTAINER},
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    messages = data_envelopes(response.text)
    assert [message["type"] for message in messages] == [
        "connected",
        "pod_added",
        "log",
        "end",
    ]
    assert messages[0]["stream_id"] in db.queued
    logs = [message for message in messages if message["type"] == "log"]
    assert len(logs) == 1
    assert "top-secret" not in logs[0]["line"]
    assert "[REDACTED]" in logs[0]["line"]
    assert len(logs[0]["line"]) == MAX_LOG_LINE_LENGTH
    assert logs[0]["line_truncated"] is True
    for message in messages:
        parse_log_stream_envelope(message)
    assert db.access_calls == [
        (CLUSTER_ID, "inventory.read"),
        (CLUSTER_ID, "evidence.read"),
        (CLUSTER_ID, "inventory.read"),
        (CLUSTER_ID, "evidence.read"),
    ]


def test_followup_batches_keep_first_handle_and_share_one_correlation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("domains.log_stream.service.LOG_STREAM_BATCH_LIMIT", 2)
    monkeypatch.setattr("domains.log_stream.service.LOG_STREAM_BATCH_INTERVAL_SECONDS", 0)
    db = StubLogDb()

    response = TestClient(app_for(db)).get(
        f"/pods/{NAMESPACE}/{POD_NAME}/logs/stream",
        params={"cluster_id": CLUSTER_ID},
    )

    messages = data_envelopes(response.text)
    command_ids = list(db.queued)
    assert len(command_ids) == 2
    assert command_ids[0] != command_ids[1]
    assert messages[0] == {"type": "connected", "stream_id": command_ids[0]}
    assert {db.correlations[command_id] for command_id in command_ids} == {
        db.correlations[command_ids[0]]
    }


def test_unauthorized_and_missing_exact_target_are_both_not_found() -> None:
    unauthorized = TestClient(app_for(StubLogDb(allowed=False))).get(
        f"/pods/{NAMESPACE}/{POD_NAME}/logs/stream",
        params={"cluster_id": CLUSTER_ID},
    )
    missing = TestClient(app_for(StubLogDb(include_pod=False))).get(
        f"/pods/{NAMESPACE}/{POD_NAME}/logs/stream",
        params={"cluster_id": CLUSTER_ID},
    )

    assert unauthorized.status_code == missing.status_code == 404
    assert unauthorized.json() == missing.json()


def test_workload_selector_is_server_built_and_no_user_logql_is_accepted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("domains.log_stream.service.LOG_STREAM_BATCH_LIMIT", 1)
    target = LogStreamTarget(
        target_type="workload",
        cluster_id=CLUSTER_ID,
        namespace=NAMESPACE,
        name="checkout-api",
        kind="Deployment",
        resource_type="workload",
        pods=("checkout-api-0", "checkout-api-1"),
        container=CONTAINER,
    )
    selector = safe_logql(target)

    assert selector == (
        '{k8s_namespace_name="shop",'
        'k8s_pod_name=~"^(?:checkout-api-0|checkout-api-1)$",'
        'k8s_container_name="app"}'
    )
    schema = app_for(StubLogDb()).openapi()
    parameters = schema["paths"]["/workloads/{kind}/{namespace}/{name}/logs/stream"]["get"][
        "parameters"
    ]
    assert {item["name"] for item in parameters} == {
        "kind",
        "namespace",
        "name",
        "cluster_id",
    }
    db = StubLogDb()
    response = TestClient(app_for(db)).get(
        f"/workloads/deployments/{NAMESPACE}/checkout-api/logs/stream",
        params={"cluster_id": CLUSTER_ID, "query": '{namespace=~".*"}'},
    )
    assert response.status_code == 200
    plan = next(iter(db.queued.values()))
    persisted_query = plan["payload"]["query"]["query"]
    assert persisted_query == '{k8s_namespace_name="shop",k8s_pod_name="checkout-api-0"}'
    assert 'namespace=~".*"' not in persisted_query


def test_unredacted_agent_result_never_crosses_browser_boundary(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("domains.log_stream.service.LOG_STREAM_BATCH_LIMIT", 1)
    db = StubLogDb()
    db.redaction_applied = False
    response = TestClient(app_for(db)).get(
        f"/pods/{NAMESPACE}/{POD_NAME}/logs/stream",
        params={"cluster_id": CLUSTER_ID},
    )
    messages = data_envelopes(response.text)
    assert [message["type"] for message in messages] == [
        "connected",
        "pod_added",
        "end",
    ]
    assert "top-secret" not in response.text


def test_disconnected_stream_stops_before_polling_persisted_command() -> None:
    class DisconnectedRequest:
        async def is_disconnected(self) -> bool:
            return True

    db = StubLogDb()
    target = LogStreamTarget(
        target_type="pod",
        cluster_id=CLUSTER_ID,
        namespace=NAMESPACE,
        name=POD_NAME,
        kind="Pod",
        resource_type="pod",
        pods=(POD_NAME,),
        container=None,
    )
    queued = queue_log_query(
        db,
        workspace_id=WORKSPACE_ID,
        user_id="user-1",
        target=target,
    )

    async def collect() -> list[Any]:
        return [
            event
            async for event in stream_log_events(
                DisconnectedRequest(),
                db,
                current=current_session(),
                workspace_id=WORKSPACE_ID,
                initial_target=target,
                initial_query=queued,
            )
        ]

    events = asyncio.run(collect())
    assert [event.type for event in events] == ["connected", "pod_added"]
    assert db.get_command_calls == 0


def test_ai_context_rehydrates_only_owned_authorized_persisted_log_evidence() -> None:
    db = StubLogDb()
    target = LogStreamTarget(
        target_type="pod",
        cluster_id=CLUSTER_ID,
        namespace=NAMESPACE,
        name=POD_NAME,
        kind="Pod",
        resource_type="pod",
        pods=(POD_NAME,),
        container=CONTAINER,
    )
    queued = queue_log_query(
        db,
        workspace_id=WORKSPACE_ID,
        user_id="user-1",
        target=target,
    )
    second = queue_log_query(
        db,
        workspace_id=WORKSPACE_ID,
        user_id="user-1",
        target=target,
        correlation_id=queued.correlation_id,
    )
    db.command_results[queued.command_id] = (
        "1784000000000000000",
        "batch-one password=first-secret",
    )
    db.command_results[second.command_id] = (
        "1784000001000000000",
        "batch-two password=second-secret",
    )
    context = {
        "screen": "resources",
        "filters": {
            "clusters": [CLUSTER_ID],
            "namespaces": [f"{CLUSTER_ID}/{NAMESPACE}"],
            "applications": [],
            "labels": [],
            "resource_types": ["pod"],
            "health": [],
            "query": "",
        },
        "selection": None,
        "time": None,
        "log_stream_id": queued.command_id,
    }

    authorized = TestClient(app_for(db)).post(
        "/ai/chat", json={"context": context, "message": "summarize"}
    )
    cross_user = TestClient(app_for(db, user_id="user-2")).post(
        "/ai/chat", json={"context": context, "message": "summarize"}
    )
    valid_rows = asyncio.run(
        db.list_agent_commands_by_correlation(
            WORKSPACE_ID,
            queued.correlation_id,
            limit=20,
        )
    )
    forged_rows = deepcopy(valid_rows)
    forged_rows[0]["correlation_id"] = "corr-forged"
    db.correlation_rows_override = forged_rows
    forged = TestClient(app_for(db)).post(
        "/ai/chat", json={"context": context, "message": "summarize"}
    )
    db.correlation_rows_override = None

    other_pod = "payments-api-0"
    db.resources.append(pod_resource(other_pod))
    other_target = LogStreamTarget(
        target_type="pod",
        cluster_id=CLUSTER_ID,
        namespace=NAMESPACE,
        name=other_pod,
        kind="Pod",
        resource_type="pod",
        pods=(other_pod,),
        container=CONTAINER,
    )
    queue_log_query(
        db,
        workspace_id=WORKSPACE_ID,
        user_id="user-1",
        target=other_target,
        correlation_id=queued.correlation_id,
    )
    mixed_target = TestClient(app_for(db)).post(
        "/ai/chat", json={"context": context, "message": "summarize"}
    )
    db.allowed = False
    denied = TestClient(app_for(db)).post(
        "/ai/chat", json={"context": context, "message": "summarize"}
    )

    assert authorized.status_code == 200
    assert [item["type"] for item in authorized.json()["evidence"]] == [
        "log-stream",
        "log-stream",
    ]
    assert "batch-two" in authorized.text
    assert "batch-one" in authorized.text
    assert "first-secret" not in authorized.text
    assert "second-secret" not in authorized.text
    assert queued.correlation_id == second.correlation_id
    assert queued.command_id != second.command_id
    assert cross_user.json() == {"answer": AI_NO_DATA_ANSWER, "evidence": []}
    assert forged.json() == {"answer": AI_NO_DATA_ANSWER, "evidence": []}
    assert mixed_target.json() == {"answer": AI_NO_DATA_ANSWER, "evidence": []}
    assert denied.json() == {"answer": AI_NO_DATA_ANSWER, "evidence": []}
    assert "line" not in context


def test_log_stream_contract_is_strict_and_openapi_is_sse() -> None:
    with pytest.raises(ValidationError):
        LogStreamLog(
            id="log-1",
            observed_at=datetime.now(UTC),
            pod=POD_NAME,
            container=CONTAINER,
            line="ok",
            unexpected=True,
        )
    with pytest.raises(ValidationError, match="UTC offset"):
        LogStreamLog(
            id="log-1",
            observed_at=datetime(2026, 7, 14),
            pod=POD_NAME,
            container=CONTAINER,
            line="ok",
        )
    with pytest.raises(ValidationError):
        LogStreamLog(
            id="log-1",
            observed_at=datetime.now(UTC),
            pod=POD_NAME,
            container=CONTAINER,
            line="x" * (MAX_LOG_LINE_LENGTH + 1),
        )

    schema = app_for(StubLogDb()).openapi()
    for path in (
        "/pods/{namespace}/{name}/logs/stream",
        "/workloads/{kind}/{namespace}/{name}/logs/stream",
    ):
        assert "text/event-stream" in schema["paths"][path]["get"]["responses"]["200"]["content"]
    assert LOG_STREAM_PROTOCOL == "log-stream.v1"
    assert LOG_QUERY_RANGE_SECONDS == 30

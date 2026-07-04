"""realtime-gateway WebSocket 검증 — agent ingest → browser fan-out 골든 패스와 fail-closed."""

from __future__ import annotations

from typing import Any

import pytest
from conftest import ROOT, load_file
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

CLUSTER = "target-cluster-01"
WORKSPACE = "ws-1"
GOOD_TOKEN = "good-token"


def load_gateway_module() -> Any:
    return load_file(
        ROOT / "src" / "services" / "realtime" / "realtime-gateway" / "app.py",
        "test_realtime_gateway_module",
    )


def fake_authenticator(token: str) -> dict[str, str] | None:
    if token == GOOD_TOKEN:
        return {"workspace_id": WORKSPACE, "cluster_id": CLUSTER}
    return None


def make_client() -> tuple[Any, TestClient]:
    module = load_gateway_module()
    app = module.create_app(authenticate_agent=fake_authenticator)
    return module, TestClient(app)


def summary_payload(**overrides: Any) -> dict[str, Any]:
    payload = {
        "type": "live.summary",
        "cluster_id": CLUSTER,
        "summary": {
            "cluster_id": CLUSTER,
            "window_ms": 500,
            "pods_ready": 12,
            "pods_total": 13,
            "rollout_phase": "progressing",
        },
    }
    payload.update(overrides)
    return payload


def test_health_endpoints() -> None:
    _, client = make_client()
    assert client.get("/healthz").text == "ok"
    assert client.get("/readyz").text == "ok"


def test_browser_receives_hello_then_snapshot() -> None:
    _, client = make_client()
    with client.websocket_connect(f"/live/browser?workspace_id={WORKSPACE}") as browser:
        hello = browser.receive_json()
        snapshot = browser.receive_json()
    assert hello == {"type": "hello", "protocol": "realtime.v1"}
    assert snapshot["type"] == "snapshot"
    assert snapshot["state"] == {"clusters": {}, "resources": {}}


def test_agent_summary_fans_out_to_browser() -> None:
    _, client = make_client()
    with client.websocket_connect(f"/live/browser?workspace_id={WORKSPACE}") as browser:
        browser.receive_json()  # hello
        browser.receive_json()  # snapshot
        with client.websocket_connect(
            f"/live/agent?cluster_id={CLUSTER}", headers={"x-agent-token": GOOD_TOKEN}
        ) as agent:
            assert agent.receive_json()["type"] == "hello"
            agent.send_json(summary_payload())
            received = browser.receive_json()

    assert received["type"] == "live.summary"
    assert received["seq"] == 1
    assert received["cluster_id"] == CLUSTER
    assert received["summary"]["pods_ready"] == 12


def test_late_browser_gets_state_via_snapshot() -> None:
    _, client = make_client()
    with client.websocket_connect(f"/live/browser?workspace_id={WORKSPACE}") as first_browser:
        first_browser.receive_json()  # hello
        first_browser.receive_json()  # snapshot(빈 상태)
        with client.websocket_connect(
            f"/live/agent?cluster_id={CLUSTER}", headers={"x-agent-token": GOOD_TOKEN}
        ) as agent:
            agent.receive_json()  # hello
            agent.send_json(summary_payload())
            agent.send_json(
                {
                    "type": "resource.delta",
                    "op": "replace",
                    "key": f"{CLUSTER}/sandbox/pod/checkout-abc",
                    "value": {"app": "checkout", "ready": True},
                }
            )
            # 먼저 접속한 browser 가 2건을 수신했다는 것 = hub 반영 완료(늦은 접속 race 제거).
            assert first_browser.receive_json()["type"] == "live.summary"
            assert first_browser.receive_json()["type"] == "resource.delta"
            with client.websocket_connect(
                f"/live/browser?workspace_id={WORKSPACE}"
            ) as late_browser:
                late_browser.receive_json()  # hello
                snapshot = late_browser.receive_json()

    assert snapshot["seq"] == 2
    assert snapshot["state"]["clusters"][CLUSTER]["pods_total"] == 13
    assert snapshot["state"]["resources"][f"{CLUSTER}/sandbox/pod/checkout-abc"] == {
        "app": "checkout",
        "ready": True,
    }


def test_agent_rejected_with_bad_token() -> None:
    _, client = make_client()
    with client.websocket_connect(
        f"/live/agent?cluster_id={CLUSTER}", headers={"x-agent-token": "wrong"}
    ) as agent:
        with pytest.raises(WebSocketDisconnect) as excinfo:
            agent.receive_json()
    assert excinfo.value.code == 4401


def test_agent_rejected_for_foreign_cluster_query() -> None:
    _, client = make_client()
    with client.websocket_connect(
        "/live/agent?cluster_id=other-cluster", headers={"x-agent-token": GOOD_TOKEN}
    ) as agent:
        with pytest.raises(WebSocketDisconnect) as excinfo:
            agent.receive_json()
    assert excinfo.value.code == 4401


def test_agent_cannot_publish_for_foreign_cluster() -> None:
    _, client = make_client()
    with client.websocket_connect(
        f"/live/agent?cluster_id={CLUSTER}", headers={"x-agent-token": GOOD_TOKEN}
    ) as agent:
        agent.receive_json()  # hello
        foreign = summary_payload(cluster_id="other-cluster")
        foreign["summary"]["cluster_id"] = "other-cluster"
        agent.send_json(foreign)
        with pytest.raises(WebSocketDisconnect) as excinfo:
            agent.receive_json()
    assert excinfo.value.code == 1008


def test_agent_raw_payload_violates_contract_and_closes() -> None:
    _, client = make_client()
    with client.websocket_connect(
        f"/live/agent?cluster_id={CLUSTER}", headers={"x-agent-token": GOOD_TOKEN}
    ) as agent:
        agent.receive_json()  # hello
        agent.send_json({"type": "live.summary", "cluster_id": CLUSTER, "summary": {"raw": []}})
        with pytest.raises(WebSocketDisconnect) as excinfo:
            agent.receive_json()
    assert excinfo.value.code == 1008


def test_browser_requires_workspace_id() -> None:
    _, client = make_client()
    with client.websocket_connect("/live/browser") as browser:
        with pytest.raises(WebSocketDisconnect) as excinfo:
            browser.receive_json()
    assert excinfo.value.code == 4400

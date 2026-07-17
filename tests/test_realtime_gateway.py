"""realtime-gateway WebSocket 검증 — agent ingest → browser fan-out 골든 패스와 fail-closed."""

from __future__ import annotations

import asyncio
import hashlib
from types import SimpleNamespace
from typing import Any

import pytest
from conftest import ROOT, load_file
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from packages.contracts.port_forward import (
    PortForwardDataFrame,
    decode_port_forward_data,
    encode_port_forward_data,
)
from packages.contracts.realtime import RealtimeIngressLimits
from packages.contracts.service_access import PORT_FORWARD_AGENT_CAPABILITY

CLUSTER = "target-cluster-01"
WORKSPACE = "ws-1"
GOOD_TOKEN = "good-token"
GOOD_SESSION = "session-token"


def load_gateway_module() -> Any:
    return load_file(
        ROOT / "src" / "services" / "realtime" / "realtime-gateway" / "app.py",
        "test_realtime_gateway_module",
    )


def stub_authenticator(token: str) -> dict[str, str] | None:
    if token == GOOD_TOKEN:
        return {"workspace_id": WORKSPACE, "cluster_id": CLUSTER}
    return None


async def stub_browser_session(token: str | None) -> dict[str, str] | None:
    if token == GOOD_SESSION:
        return {"workspace_id": WORKSPACE, "user_id": "user-1"}
    return None


async def stub_cluster_authorizer(_session: object, _workspace_id: str, cluster_id: str) -> bool:
    return cluster_id == CLUSTER


def browser_headers() -> dict[str, str]:
    return {"x-session-token": GOOD_SESSION}


def make_client() -> tuple[Any, TestClient]:
    module = load_gateway_module()
    app = module.create_app(
        authenticate_agent=stub_authenticator,
        authenticate_browser=stub_browser_session,
        authorize_browser_cluster=stub_cluster_authorizer,
    )
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
    with client.websocket_connect(
        f"/live/browser?workspace_id={WORKSPACE}&cluster_id={CLUSTER}",
        headers=browser_headers(),
    ) as browser:
        hello = browser.receive_json()
        snapshot = browser.receive_json()
    assert hello == {
        "type": "hello",
        "protocol": "realtime.v1",
        "stream_policy": {
            "revision": 1,
            "max_frames_per_second": 60,
            "hidden_tab": "coalesce",
            "max_pending_messages": 32,
        },
    }
    assert snapshot["type"] == "snapshot"
    assert snapshot["state"] == {"clusters": {}, "resources": {}}


def test_agent_summary_fans_out_to_browser() -> None:
    _, client = make_client()
    with client.websocket_connect(
        f"/live/browser?workspace_id={WORKSPACE}&cluster_id={CLUSTER}",
        headers=browser_headers(),
    ) as browser:
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
    with client.websocket_connect(
        f"/live/browser?workspace_id={WORKSPACE}&cluster_id={CLUSTER}",
        headers=browser_headers(),
    ) as first_browser:
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
                f"/live/browser?workspace_id={WORKSPACE}&cluster_id={CLUSTER}",
                headers=browser_headers(),
            ) as late_browser:
                late_browser.receive_json()  # hello
                snapshot = late_browser.receive_json()

    assert snapshot["seq"] == 2
    assert snapshot["state"]["clusters"][CLUSTER]["pods_total"] == 13
    assert snapshot["state"]["resources"][f"{CLUSTER}/sandbox/pod/checkout-abc"] == {
        "app": "checkout",
        "ready": True,
    }


def test_live_summary_persists_agent_observed_pod_metrics() -> None:
    module = load_gateway_module()
    persisted: list[tuple[str, str, dict[str, Any]]] = []

    def persist_live_usage(
        workspace_id: str,
        cluster_id: str,
        _sampled_at: object,
        usage: dict[str, Any],
    ) -> bool:
        persisted.append((workspace_id, cluster_id, usage))
        return True

    app = module.create_app(
        authenticate_agent=stub_authenticator,
        authenticate_browser=stub_browser_session,
        authorize_browser_cluster=stub_cluster_authorizer,
        persist_live_usage=persist_live_usage,
    )
    client = TestClient(app)
    with client.websocket_connect(
        f"/live/browser?workspace_id={WORKSPACE}&cluster_id={CLUSTER}",
        headers=browser_headers(),
    ) as browser:
        browser.receive_json()
        browser.receive_json()
        with client.websocket_connect(
            f"/live/agent?cluster_id={CLUSTER}",
            headers={"x-agent-token": GOOD_TOKEN},
        ) as agent:
            agent.receive_json()
            agent.send_json(
                {
                    "type": "resource.delta",
                    "op": "replace",
                    "key": f"{CLUSTER}/sandbox/pod/game-0",
                    "value": {
                        "ready": "1/1",
                        "phase": "Running",
                        "restarts": 2,
                        "node": "node-a",
                        "cpu_mcores": 530,
                        "cpu_request_mcores": 500,
                        "cpu_request_pct": 106,
                        "mem_mib": 48,
                        "mem_request_mib": 64,
                        "mem_request_pct": 75,
                    },
                }
            )
            agent.send_json(summary_payload())
            assert [browser.receive_json()["type"] for _ in range(2)] == [
                "resource.delta",
                "live.summary",
            ]

    assert len(persisted) == 1
    workspace_id, cluster_id, usage = persisted[0]
    assert (workspace_id, cluster_id) == (WORKSPACE, CLUSTER)
    assert usage["restart_total"] == 2
    assert usage["pods"]["sandbox/game-0"] == {
        "cpu_mcores": 530,
        "cpu_request_mcores": 500,
        "cpu_request_pct": 106,
        "mem_mib": 48,
        "mem_request_mib": 64,
        "mem_request_pct": 75,
        "ready": "1/1",
        "phase": "Running",
        "restarts": 2,
        "node": "node-a",
    }


def test_agent_rejected_with_bad_token() -> None:
    _, client = make_client()
    with client.websocket_connect(
        f"/live/agent?cluster_id={CLUSTER}", headers={"x-agent-token": "wrong"}
    ) as agent:
        with pytest.raises(WebSocketDisconnect) as excinfo:
            agent.receive_json()
    assert excinfo.value.code == 4401


def test_mtls_proxy_authenticates_browser_but_never_agent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def deny_browser(_token: str | None) -> None:
        return None

    proxy_secret = "a" * 64
    monkeypatch.setenv("TRUSTED_PROXY_AUTH_SECRET", proxy_secret)
    monkeypatch.setenv("TRUSTED_PROXY_AUTH_USER_ID", "operator-dev")
    monkeypatch.setenv("TRUSTED_PROXY_AUTH_WORKSPACE_ID", WORKSPACE)
    module = load_gateway_module()
    app = module.create_app(
        authenticate_agent=lambda _token: None,
        authenticate_browser=deny_browser,
        authorize_browser_cluster=stub_cluster_authorizer,
    )
    client = TestClient(app)

    with client.websocket_connect(
        f"/live/browser?workspace_id={WORKSPACE}&cluster_id={CLUSTER}",
        headers={"x-kubeheal-internal-auth": proxy_secret},
    ) as browser:
        assert browser.receive_json()["type"] == "hello"
        browser.receive_json()
        with client.websocket_connect(f"/live/agent?cluster_id={CLUSTER}") as agent:
            with pytest.raises(WebSocketDisconnect) as excinfo:
                agent.receive_json()
            assert excinfo.value.code == 4401


def test_valid_cookie_session_precedes_proxy_workspace_for_realtime(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    proxy_secret = "a" * 64
    monkeypatch.setenv("TRUSTED_PROXY_AUTH_SECRET", proxy_secret)
    monkeypatch.setenv("TRUSTED_PROXY_AUTH_USER_ID", "operator-dev")
    monkeypatch.setenv("TRUSTED_PROXY_AUTH_WORKSPACE_ID", "proxy-workspace")
    module = load_gateway_module()
    app = module.create_app(
        authenticate_agent=stub_authenticator,
        authenticate_browser=stub_browser_session,
        authorize_browser_cluster=stub_cluster_authorizer,
    )
    client = TestClient(app)

    with client.websocket_connect(
        f"/live/browser?workspace_id={WORKSPACE}&cluster_id={CLUSTER}",
        headers={
            "cookie": f"service_session={GOOD_SESSION}",
            "x-session-token": "invalid-explicit-token",
            "x-kubeheal-internal-auth": proxy_secret,
        },
    ) as browser:
        assert browser.receive_json()["type"] == "hello"
        assert browser.receive_json()["type"] == "snapshot"


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


def test_agent_over_budget_delta_closes_before_cache_growth() -> None:
    module = load_gateway_module()
    limits = RealtimeIngressLimits(delta_value_max_bytes=32)
    app = module.create_app(
        authenticate_agent=stub_authenticator,
        authenticate_browser=stub_browser_session,
        authorize_browser_cluster=stub_cluster_authorizer,
        realtime_limits=limits,
    )
    client = TestClient(app)

    with client.websocket_connect(
        f"/live/agent?cluster_id={CLUSTER}", headers={"x-agent-token": GOOD_TOKEN}
    ) as agent:
        agent.receive_json()
        agent.send_json(
            {
                "type": "resource.delta",
                "op": "replace",
                "key": f"{CLUSTER}/sandbox/pod/checkout",
                "value": {"payload": "x" * 64},
            }
        )
        with pytest.raises(WebSocketDisconnect) as excinfo:
            agent.receive_json()
    assert excinfo.value.code == 1008
    assert (
        app.state.hub.snapshot_for(
            module.Subscription(workspace_id=WORKSPACE, cluster_id=CLUSTER)
        ).state["resources"]
        == {}
    )


def test_agent_rate_budget_closes_the_producer_connection() -> None:
    module = load_gateway_module()
    limits = RealtimeIngressLimits(agent_messages_per_window=1)
    app = module.create_app(
        authenticate_agent=stub_authenticator,
        authenticate_browser=stub_browser_session,
        authorize_browser_cluster=stub_cluster_authorizer,
        realtime_limits=limits,
    )
    client = TestClient(app)

    with client.websocket_connect(
        f"/live/agent?cluster_id={CLUSTER}", headers={"x-agent-token": GOOD_TOKEN}
    ) as agent:
        agent.receive_json()
        agent.send_json(summary_payload())
        agent.send_json(summary_payload())
        with pytest.raises(WebSocketDisconnect) as excinfo:
            agent.receive_json()
    assert excinfo.value.code == 1008


def test_browser_gets_explicit_resync_before_oversized_snapshot_disconnect() -> None:
    module = load_gateway_module()
    limits = RealtimeIngressLimits(cluster_retained_resources=2, snapshot_max_resources=1)
    app = module.create_app(
        authenticate_agent=stub_authenticator,
        authenticate_browser=stub_browser_session,
        authorize_browser_cluster=stub_cluster_authorizer,
        realtime_limits=limits,
    )
    app.state.hub.publish_delta(
        module.ResourceDelta(
            op="replace", key=f"{CLUSTER}/sandbox/pod/checkout", value={"ready": True}
        )
    )
    app.state.hub.publish_delta(
        module.ResourceDelta(
            op="replace", key=f"{CLUSTER}/sandbox/pod/payments", value={"ready": True}
        )
    )
    client = TestClient(app)

    with client.websocket_connect(
        f"/live/browser?workspace_id={WORKSPACE}&cluster_id={CLUSTER}", headers=browser_headers()
    ) as browser:
        assert browser.receive_json()["type"] == "hello"
        assert browser.receive_json() == {
            "type": "resync.required",
            "code": "snapshot_limit_exceeded",
            "retryable": True,
        }
        with pytest.raises(WebSocketDisconnect) as excinfo:
            browser.receive_json()
    assert excinfo.value.code == 1013


def test_browser_requires_workspace_id() -> None:
    _, client = make_client()
    with client.websocket_connect("/live/browser") as browser:
        with pytest.raises(WebSocketDisconnect) as excinfo:
            browser.receive_json()
    assert excinfo.value.code == 4400


def test_browser_requires_session() -> None:
    _, client = make_client()
    with client.websocket_connect(
        f"/live/browser?workspace_id={WORKSPACE}&cluster_id={CLUSTER}"
    ) as browser:
        with pytest.raises(WebSocketDisconnect) as excinfo:
            browser.receive_json()
    assert excinfo.value.code == 4401


def test_browser_cannot_subscribe_to_foreign_workspace() -> None:
    _, client = make_client()
    with client.websocket_connect(
        f"/live/browser?workspace_id=other-workspace&cluster_id={CLUSTER}",
        headers=browser_headers(),
    ) as browser:
        with pytest.raises(WebSocketDisconnect) as excinfo:
            browser.receive_json()
    assert excinfo.value.code == 4401


def test_browser_cannot_subscribe_to_cluster_without_grant() -> None:
    _, client = make_client()
    with client.websocket_connect(
        f"/live/browser?workspace_id={WORKSPACE}&cluster_id=forbidden-cluster",
        headers=browser_headers(),
    ) as browser:
        with pytest.raises(WebSocketDisconnect) as excinfo:
            browser.receive_json()
    assert excinfo.value.code == 4401


def test_browser_cluster_authorization_error_fails_closed() -> None:
    module = load_gateway_module()

    async def failed_authorizer(_session: object, _workspace_id: str, _cluster_id: str) -> bool:
        raise RuntimeError("authorization backend unavailable")

    app = module.create_app(
        authenticate_agent=stub_authenticator,
        authenticate_browser=stub_browser_session,
        authorize_browser_cluster=failed_authorizer,
    )
    client = TestClient(app)

    with client.websocket_connect(
        f"/live/browser?workspace_id={WORKSPACE}&cluster_id={CLUSTER}",
        headers=browser_headers(),
    ) as browser:
        with pytest.raises(WebSocketDisconnect) as excinfo:
            browser.receive_json()
    assert excinfo.value.code == 4401


def test_browser_rejects_cluster_wildcard() -> None:
    _, client = make_client()
    with client.websocket_connect(
        f"/live/browser?workspace_id={WORKSPACE}", headers=browser_headers()
    ) as browser:
        with pytest.raises(WebSocketDisconnect) as excinfo:
            browser.receive_json()
    assert excinfo.value.code == 4400


def test_database_cluster_authorizer_uses_session_identity_and_cluster_read() -> None:
    module = load_gateway_module()

    class ScopedDb:
        def __init__(self) -> None:
            self.checks: list[tuple[str, str, str, str, str]] = []

        def get_cluster_registration(
            self, workspace_id: str, cluster_id: str
        ) -> dict[str, str] | None:
            if (workspace_id, cluster_id) == (WORKSPACE, CLUSTER):
                return {"workspace_id": workspace_id, "cluster_id": cluster_id}
            return None

        def can_access(
            self,
            user_id: str,
            workspace_id: str,
            resource_type: str,
            resource_id: str,
            permission: str,
        ) -> bool:
            self.checks.append((user_id, workspace_id, resource_type, resource_id, permission))
            return True

    db = ScopedDb()
    authorize = module.database_browser_cluster_authorizer(db)

    allowed = asyncio.run(
        authorize({"user_id": "user-1", "workspace_id": WORKSPACE}, WORKSPACE, CLUSTER)
    )
    missing = asyncio.run(
        authorize(
            {"user_id": "user-1", "workspace_id": WORKSPACE},
            WORKSPACE,
            "missing-cluster",
        )
    )

    assert allowed is True
    assert missing is False
    assert db.checks == [
        ("user-1", WORKSPACE, "cluster", CLUSTER, "cluster.read"),
    ]


def test_database_cluster_authorizer_fails_closed_without_user() -> None:
    module = load_gateway_module()

    class UnexpectedDb:
        def get_cluster_registration(self, *_args: object) -> None:
            raise AssertionError("missing user must not reach the database")

    authorize = module.database_browser_cluster_authorizer(UnexpectedDb())

    assert asyncio.run(authorize({}, WORKSPACE, CLUSTER)) is False


def test_database_cluster_authorizer_allows_authenticated_service_admin() -> None:
    module = load_gateway_module()

    class AdminDb:
        def get_cluster_registration(self, workspace_id: str, cluster_id: str) -> dict[str, str]:
            return {"workspace_id": workspace_id, "cluster_id": cluster_id}

        def can_access(self, *_args: object) -> bool:
            raise AssertionError("service admin role should use the authenticated role")

    authorize = module.database_browser_cluster_authorizer(AdminDb())

    assert (
        asyncio.run(
            authorize(
                {
                    "user_id": "proxy-admin",
                    "workspace_id": WORKSPACE,
                    "roles": ["service_admin"],
                },
                WORKSPACE,
                CLUSTER,
            )
        )
        is True
    )


def test_database_terminal_authorizer_requires_permission_exact_pod_and_container() -> None:
    module = load_gateway_module()

    class TerminalDb:
        def __init__(self) -> None:
            self.allowed = True
            self.lookups: list[dict[str, str]] = []

        def get_cluster_registration(self, workspace_id: str, cluster_id: str) -> dict[str, Any]:
            return {
                "workspace_id": workspace_id,
                "cluster_id": cluster_id,
                "settings": {"cluster_role": "target"},
            }

        def get_cluster_policy(self, _workspace_id: str, _cluster_id: str) -> dict[str, str]:
            return {"cluster_role": "target"}

        def can_access(self, *args: str) -> bool:
            assert args == ("user-1", WORKSPACE, "cluster", CLUSTER, "pod.exec")
            return self.allowed

        def get_inventory_resource(self, **identity: str) -> dict[str, Any] | None:
            self.lookups.append(identity)
            if identity != {
                "workspace_id": WORKSPACE,
                "cluster_id": CLUSTER,
                "resource_type": "pod",
                "kind": "Pod",
                "namespace": "sandbox",
                "name": "api-0",
            }:
                return None
            return {"summary": {"containers": [{"name": "app"}]}}

    db = TerminalDb()
    authorize = module.database_terminal_authorizer(db)
    session = {"user_id": "user-1", "workspace_id": WORKSPACE, "roles": ["user"]}

    assert asyncio.run(authorize(session, WORKSPACE, CLUSTER, "sandbox", "api-0", "app"))
    assert not asyncio.run(
        authorize(session, WORKSPACE, CLUSTER, "sandbox", "api-0", "missing-container")
    )
    db.allowed = False
    assert not asyncio.run(authorize(session, WORKSPACE, CLUSTER, "sandbox", "api-0", "app"))
    assert len(db.lookups) == 2


def test_database_terminal_authorizer_allows_service_admin_but_keeps_namespace_guard() -> None:
    module = load_gateway_module()

    class AdminDb:
        def get_cluster_registration(self, workspace_id: str, cluster_id: str) -> dict[str, Any]:
            return {
                "workspace_id": workspace_id,
                "cluster_id": cluster_id,
                "settings": {"cluster_role": "target"},
            }

        def get_cluster_policy(self, _workspace_id: str, _cluster_id: str) -> dict[str, str]:
            return {"cluster_role": "target"}

        def can_access(self, *_args: str) -> bool:
            raise AssertionError("service admin must not need an explicit access row")

        def get_inventory_resource(self, **_identity: str) -> dict[str, Any]:
            return {"summary": {"containers": [{"name": "app"}]}}

    authorize = module.database_terminal_authorizer(AdminDb())
    admin = {
        "user_id": "admin-1",
        "workspace_id": WORKSPACE,
        "roles": ["service_admin"],
    }

    assert asyncio.run(authorize(admin, WORKSPACE, CLUSTER, "sandbox", "api-0", "app"))
    assert not asyncio.run(authorize(admin, WORKSPACE, CLUSTER, "kube-system", "api-0", "app"))


def test_pod_terminal_bridges_real_agent_frames_redacts_and_audits() -> None:
    module = load_gateway_module()
    audits: list[tuple[str, str, dict[str, Any]]] = []

    async def authorize_terminal(
        _session: object,
        workspace_id: str,
        cluster_id: str,
        namespace: str,
        pod: str,
        container: str,
    ) -> bool:
        return (workspace_id, cluster_id, namespace, pod, container) == (
            WORKSPACE,
            CLUSTER,
            "sandbox",
            "api-0",
            "app",
        )

    async def audit(subject: str, workspace_id: str, payload: dict[str, Any]) -> None:
        audits.append((subject, workspace_id, payload))

    app = module.create_app(
        authenticate_agent=stub_authenticator,
        authenticate_browser=stub_browser_session,
        authorize_browser_cluster=stub_cluster_authorizer,
        authorize_browser_terminal=authorize_terminal,
        audit_terminal=audit,
    )
    command = "printf 'password=top-secret\\n'; exit 7"

    # One TestClient context owns one ASGI portal. The agent and terminal sockets
    # must share it because the broker forwards frames directly between them.
    with TestClient(app) as client:
        with client.websocket_connect(
            f"/live/agent?cluster_id={CLUSTER}", headers={"x-agent-token": GOOD_TOKEN}
        ) as agent:
            agent.receive_json()
            with client.websocket_connect(
                f"/live/terminal?workspace_id={WORKSPACE}&cluster_id={CLUSTER}"
                "&namespace=sandbox&pod=api-0&container=app",
                headers=browser_headers(),
            ) as browser:
                browser.send_json({"type": "terminal.start", "command": command})
                execute = agent.receive_json()
                session_id = execute["session_id"]
                assert execute == {
                    "type": "terminal.exec",
                    "session_id": session_id,
                    "namespace": "sandbox",
                    "pod": "api-0",
                    "container": "app",
                    "command": command,
                    "timeout_seconds": 300,
                    "tty": False,
                }
                agent.send_json({"type": "terminal.connected", "session_id": session_id})
                assert browser.receive_json() == {
                    "type": "terminal.connected",
                    "session_id": session_id,
                }
                agent.send_json(
                    {
                        "type": "terminal.output",
                        "session_id": session_id,
                        "stream": "stdout",
                        "data": "password=top-secret\n",
                    }
                )
                output = browser.receive_json()
                assert output["type"] == "terminal.output"
                assert "top-secret" not in output["data"]
                assert "[REDACTED]" in output["data"]
                browser.send_json(
                    {"type": "terminal.input", "session_id": session_id, "data": "confirm\n"}
                )
                assert agent.receive_json() == {
                    "type": "terminal.input",
                    "session_id": session_id,
                    "data": "confirm\n",
                }
                agent.send_json(
                    {
                        "type": "terminal.end",
                        "session_id": session_id,
                        "exit_code": 7,
                        "reason": "completed",
                    }
                )
                assert browser.receive_json() == {
                    "type": "terminal.end",
                    "session_id": session_id,
                    "exit_code": 7,
                    "reason": "completed",
                }

    assert [item[0] for item in audits] == [
        "terminal.session.started",
        "terminal.session.finished",
    ]
    started = audits[0][2]
    assert started["command_sha256"] == hashlib.sha256(command.encode()).hexdigest()
    assert started["command_length"] == len(command)
    assert command not in str(audits)
    assert "top-secret" not in str(audits)
    assert audits[1][2]["exit_code"] == 7


def test_pod_terminal_agent_disconnect_finishes_once_without_command_leakage() -> None:
    module = load_gateway_module()
    audits: list[tuple[str, str, dict[str, Any]]] = []

    async def authorize_terminal(
        _session: object,
        workspace_id: str,
        cluster_id: str,
        namespace: str,
        pod: str,
        container: str,
    ) -> bool:
        return (workspace_id, cluster_id, namespace, pod, container) == (
            WORKSPACE,
            CLUSTER,
            "sandbox",
            "api-0",
            "app",
        )

    async def audit(subject: str, workspace_id: str, payload: dict[str, Any]) -> None:
        audits.append((subject, workspace_id, payload))

    app = module.create_app(
        authenticate_agent=stub_authenticator,
        authenticate_browser=stub_browser_session,
        authorize_browser_cluster=stub_cluster_authorizer,
        authorize_browser_terminal=authorize_terminal,
        audit_terminal=audit,
    )
    command = "printf 'token=agent-secret\\n'"

    with TestClient(app) as client:
        with client.websocket_connect(
            f"/live/agent?cluster_id={CLUSTER}", headers={"x-agent-token": GOOD_TOKEN}
        ) as agent:
            agent.receive_json()
            with client.websocket_connect(
                f"/live/terminal?workspace_id={WORKSPACE}&cluster_id={CLUSTER}"
                "&namespace=sandbox&pod=api-0&container=app",
                headers=browser_headers(),
            ) as browser:
                browser.send_json({"type": "terminal.start", "command": command})
                session_id = agent.receive_json()["session_id"]
                agent.close()
                assert browser.receive_json() == {
                    "type": "terminal.error",
                    "session_id": session_id,
                    "code": "agent_unavailable",
                    "message": "Target agent disconnected.",
                    "retryable": True,
                }

    assert [subject for subject, _workspace_id, _payload in audits] == [
        "terminal.session.started",
        "terminal.session.finished",
    ]
    assert audits[1][2]["reason"] == "error"
    assert audits[1][2]["error_code"] == "agent_unavailable"
    assert command not in str(audits)
    assert "agent-secret" not in str(audits)


def test_pod_terminal_fails_closed_without_exact_authorization_or_agent() -> None:
    module = load_gateway_module()

    async def deny(*_args: object) -> bool:
        return False

    async def audit(*_args: object) -> None:
        return None

    denied_app = module.create_app(
        authenticate_agent=stub_authenticator,
        authenticate_browser=stub_browser_session,
        authorize_browser_cluster=stub_cluster_authorizer,
        authorize_browser_terminal=deny,
        audit_terminal=audit,
    )
    with TestClient(denied_app).websocket_connect(
        f"/live/terminal?workspace_id={WORKSPACE}&cluster_id={CLUSTER}"
        "&namespace=sandbox&pod=api-0&container=app",
        headers=browser_headers(),
    ) as browser:
        with pytest.raises(WebSocketDisconnect) as excinfo:
            browser.receive_json()
    assert excinfo.value.code == 4401

    async def allow(*_args: object) -> bool:
        return True

    offline_app = module.create_app(
        authenticate_agent=stub_authenticator,
        authenticate_browser=stub_browser_session,
        authorize_browser_cluster=stub_cluster_authorizer,
        authorize_browser_terminal=allow,
        audit_terminal=audit,
    )
    with TestClient(offline_app).websocket_connect(
        f"/live/terminal?workspace_id={WORKSPACE}&cluster_id={CLUSTER}"
        "&namespace=sandbox&pod=api-0&container=app",
        headers=browser_headers(),
    ) as browser:
        error = browser.receive_json()
    assert error["type"] == "terminal.error"
    assert error["code"] == "agent_unavailable"


def test_slow_terminal_browser_does_not_block_agent_ingress_and_preserves_order() -> None:
    gateway_module = load_gateway_module()
    terminal_symbols = gateway_module.TerminalSessionBroker.__init__.__globals__
    audits: list[tuple[str, dict[str, Any]]] = []

    async def scenario() -> None:
        async def authorize(*_args: object) -> bool:
            return True

        async def audit(subject: str, _workspace_id: str, payload: dict[str, Any]) -> None:
            audits.append((subject, payload))

        class AgentSocket:
            def __init__(self) -> None:
                self.sent: list[dict[str, Any]] = []

            async def send_json(self, payload: dict[str, Any]) -> None:
                self.sent.append(payload)

        class SlowBrowser:
            def __init__(self) -> None:
                self.started = asyncio.Event()
                self.release = asyncio.Event()
                self.sent: list[dict[str, Any]] = []

            async def send_json(self, payload: dict[str, Any]) -> None:
                self.started.set()
                await self.release.wait()
                self.sent.append(payload)

        registry = gateway_module.AgentConnectionRegistry()
        agent_socket = AgentSocket()
        connection, _previous = registry.register(CLUSTER, agent_socket)
        broker = gateway_module.TerminalSessionBroker(
            authorize=authorize,
            audit=audit,
            connections=registry,
        )
        browser = SlowBrowser()
        terminal = terminal_symbols["BrowserTerminalSession"](
            session_id="terminal-session-1",
            workspace_id=WORKSPACE,
            cluster_id=CLUSTER,
            namespace="sandbox",
            pod="api-0",
            container="app",
            user_id="user-1",
            command_hash="a" * 64,
            command_length=2,
            browser=browser,
            agent=connection,
        )
        broker.sessions[terminal.session_id] = terminal
        await broker._audit_started(terminal)
        sender = asyncio.create_task(broker._browser_sender(terminal))

        assert (
            await broker.handle_agent_payload(
                CLUSTER,
                connection,
                {"type": "terminal.connected", "session_id": terminal.session_id},
            )
            is True
        )
        await asyncio.wait_for(browser.started.wait(), timeout=0.1)
        await asyncio.wait_for(
            broker.handle_agent_payload(
                CLUSTER,
                connection,
                {
                    "type": "terminal.output",
                    "session_id": terminal.session_id,
                    "stream": "stdout",
                    "data": "ready",
                },
            ),
            timeout=0.1,
        )
        await asyncio.wait_for(
            broker.handle_agent_payload(
                CLUSTER,
                connection,
                {
                    "type": "terminal.end",
                    "session_id": terminal.session_id,
                    "exit_code": 0,
                    "reason": "completed",
                },
            ),
            timeout=0.1,
        )
        browser.release.set()
        await asyncio.wait_for(sender, timeout=0.1)
        assert [message["type"] for message in browser.sent] == [
            "terminal.connected",
            "terminal.output",
            "terminal.end",
        ]
        assert browser.sent[1]["data"] == "ready"

        # A duplicate receipt after collection is ignored and cannot duplicate audit.
        assert (
            await broker.handle_agent_payload(
                CLUSTER,
                connection,
                {
                    "type": "terminal.end",
                    "session_id": terminal.session_id,
                    "exit_code": 0,
                    "reason": "completed",
                },
            )
            is True
        )

    asyncio.run(scenario())
    assert [subject for subject, _payload in audits] == [
        "terminal.session.started",
        "terminal.session.finished",
    ]
    assert audits[-1][1]["reason"] == "completed"
    assert audits[-1][1]["output_bytes"] == len("ready")


def test_terminal_queue_overflow_ends_only_the_slow_session() -> None:
    gateway_module = load_gateway_module()
    terminal_symbols = gateway_module.TerminalSessionBroker.__init__.__globals__

    async def scenario() -> None:
        async def authorize(*_args: object) -> bool:
            return True

        async def audit(*_args: object) -> None:
            return None

        class AgentSocket:
            def __init__(self) -> None:
                self.sent: list[dict[str, Any]] = []

            async def send_json(self, payload: dict[str, Any]) -> None:
                self.sent.append(payload)

        registry = gateway_module.AgentConnectionRegistry()
        agent_socket = AgentSocket()
        connection, _previous = registry.register(CLUSTER, agent_socket)
        broker = gateway_module.TerminalSessionBroker(
            authorize=authorize,
            audit=audit,
            connections=registry,
        )

        def make_session(session_id: str) -> Any:
            return terminal_symbols["BrowserTerminalSession"](
                session_id=session_id,
                workspace_id=WORKSPACE,
                cluster_id=CLUSTER,
                namespace="sandbox",
                pod="api-0",
                container="app",
                user_id="user-1",
                command_hash="a" * 64,
                command_length=2,
                browser=object(),
                agent=connection,
            )

        slow = make_session("terminal-session-slow")
        slow.outbound = asyncio.Queue(maxsize=1)
        healthy = make_session("terminal-session-healthy")
        broker.sessions = {slow.session_id: slow, healthy.session_id: healthy}
        assert slow.offer_browser(
            terminal_symbols["parse_agent_terminal_event"](
                {"type": "terminal.connected", "session_id": slow.session_id}
            )
        )

        await asyncio.wait_for(
            broker.handle_agent_payload(
                CLUSTER,
                connection,
                {
                    "type": "terminal.output",
                    "session_id": slow.session_id,
                    "stream": "stdout",
                    "data": "overflow",
                },
            ),
            timeout=0.1,
        )
        assert slow.session_id not in broker.sessions
        assert healthy.session_id in broker.sessions
        assert registry.current(CLUSTER) is connection
        assert agent_socket.sent[-1] == {
            "type": "terminal.close",
            "session_id": slow.session_id,
        }
        terminal_receipt = slow.outbound.get_nowait()
        assert terminal_receipt.type == "terminal.end"
        assert terminal_receipt.reason == "output_limit"

    asyncio.run(scenario())


def port_forward_start_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "type": "port_forward.start",
        "capability_revision": "a" * 64,
        "resource": {
            "api_group": "",
            "version": "v1",
            "kind": "Pod",
            "namespace": "sandbox",
            "name": "api-0",
            "uid": "uid-pod-1",
        },
        "remote_port": 8080,
        "confirmation": True,
    }
    payload.update(overrides)
    return payload


def test_port_forward_reuses_agent_channel_for_bounded_bidirectional_frames() -> None:
    module = load_gateway_module()
    audits: list[tuple[str, str, dict[str, Any]]] = []

    async def authorize(
        _session: object,
        workspace_id: str,
        cluster_id: str,
        _start: object,
    ) -> bool:
        return (workspace_id, cluster_id) == (WORKSPACE, CLUSTER)

    async def audit(subject: str, workspace_id: str, payload: dict[str, Any]) -> None:
        audits.append((subject, workspace_id, payload))

    app = module.create_app(
        authenticate_agent=stub_authenticator,
        authenticate_browser=stub_browser_session,
        authorize_browser_cluster=stub_cluster_authorizer,
        authorize_browser_port_forward=authorize,
        audit_port_forward=audit,
    )

    with TestClient(app) as client:
        with client.websocket_connect(
            f"/live/agent?cluster_id={CLUSTER}", headers={"x-agent-token": GOOD_TOKEN}
        ) as agent:
            agent.receive_json()
            with client.websocket_connect(
                f"/live/port-forward?workspace_id={WORKSPACE}&cluster_id={CLUSTER}",
                headers=browser_headers(),
            ) as desktop:
                desktop.send_json(port_forward_start_payload())
                opened_request = agent.receive_json()
                session_id = opened_request["session_id"]
                assert opened_request == {
                    "type": "port_forward.open",
                    "session_id": session_id,
                    "generation": 1,
                    "capability_revision": "a" * 64,
                    "resource": port_forward_start_payload()["resource"],
                    "remote_port": 8080,
                    "initial_credit_bytes": 262_144,
                }
                agent.send_json(
                    {
                        "type": "port_forward.opened",
                        "session_id": session_id,
                        "generation": 1,
                        "target_kind": "Pod",
                        "target_name": "api-0",
                        "target_uid": "uid-pod-1",
                        "target_port": 8080,
                    }
                )
                assert desktop.receive_json()["type"] == "port_forward.opened"

                desktop.send_json(
                    {
                        "type": "port_forward.connection.open",
                        "session_id": session_id,
                        "generation": 1,
                        "connection_id": 1,
                    }
                )
                assert agent.receive_json()["type"] == "port_forward.connection.open"
                agent.send_json(
                    {
                        "type": "port_forward.connection.opened",
                        "session_id": session_id,
                        "generation": 1,
                        "connection_id": 1,
                    }
                )
                assert desktop.receive_json()["type"] == "port_forward.connection.opened"

                agent.send_json(
                    {
                        "type": "port_forward.window",
                        "session_id": session_id,
                        "generation": 1,
                        "connection_id": 1,
                        "direction": "desktop_to_target",
                        "credit_bytes": 4096,
                    }
                )
                assert desktop.receive_json()["credit_bytes"] == 4096
                desktop_payload = b"request\x00bytes"
                desktop.send_bytes(
                    encode_port_forward_data(
                        PortForwardDataFrame(
                            session_id=session_id,
                            generation=1,
                            connection_id=1,
                            sequence=0,
                            direction="desktop_to_target",
                            payload=desktop_payload,
                        )
                    )
                )
                assert decode_port_forward_data(agent.receive_bytes()).payload == desktop_payload

                target_payload = b"response\xffbytes"
                agent.send_bytes(
                    encode_port_forward_data(
                        PortForwardDataFrame(
                            session_id=session_id,
                            generation=1,
                            connection_id=1,
                            sequence=0,
                            direction="target_to_desktop",
                            payload=target_payload,
                        )
                    )
                )
                assert decode_port_forward_data(desktop.receive_bytes()).payload == target_payload
                desktop.send_json(
                    {
                        "type": "port_forward.window",
                        "session_id": session_id,
                        "generation": 1,
                        "connection_id": 1,
                        "direction": "target_to_desktop",
                        "credit_bytes": len(target_payload),
                    }
                )
                assert agent.receive_json()["credit_bytes"] == len(target_payload)

                agent.send_json(
                    {
                        "type": "port_forward.connection.end",
                        "session_id": session_id,
                        "generation": 1,
                        "connection_id": 1,
                        "reason": "target_closed",
                        "desktop_to_target_bytes": len(desktop_payload),
                        "target_to_desktop_bytes": len(target_payload),
                    }
                )
                assert desktop.receive_json()["type"] == "port_forward.connection.end"
                agent.send_json(
                    {
                        "type": "port_forward.end",
                        "session_id": session_id,
                        "generation": 1,
                        "reason": "target_closed",
                        "desktop_to_target_bytes": len(desktop_payload),
                        "target_to_desktop_bytes": len(target_payload),
                    }
                )
                assert desktop.receive_json()["type"] == "port_forward.end"

    assert app.state.terminal_broker.connections is app.state.port_forward_broker.connections
    assert [subject for subject, _workspace, _payload in audits] == [
        "port_forward.session.started",
        "port_forward.session.finished",
    ]
    assert audits[-1][2]["desktop_to_target_bytes"] == len(desktop_payload)
    assert audits[-1][2]["target_to_desktop_bytes"] == len(target_payload)


def test_malformed_port_forward_session_does_not_close_shared_agent_stream() -> None:
    module = load_gateway_module()

    async def authorize(*_args: object) -> bool:
        return True

    async def audit(*_args: object) -> None:
        return None

    app = module.create_app(
        authenticate_agent=stub_authenticator,
        authenticate_browser=stub_browser_session,
        authorize_browser_cluster=stub_cluster_authorizer,
        authorize_browser_port_forward=authorize,
        audit_port_forward=audit,
    )

    with TestClient(app) as client:
        with client.websocket_connect(
            f"/live/browser?workspace_id={WORKSPACE}&cluster_id={CLUSTER}",
            headers=browser_headers(),
        ) as live_browser:
            live_browser.receive_json()
            live_browser.receive_json()
            with client.websocket_connect(
                f"/live/agent?cluster_id={CLUSTER}", headers={"x-agent-token": GOOD_TOKEN}
            ) as agent:
                agent.receive_json()
                agent.send_bytes(b"not-a-port-forward-frame")
                with client.websocket_connect(
                    f"/live/port-forward?workspace_id={WORKSPACE}&cluster_id={CLUSTER}",
                    headers=browser_headers(),
                ) as desktop:
                    desktop.send_json(port_forward_start_payload())
                    opened_request = agent.receive_json()
                    session_id = opened_request["session_id"]
                    agent.send_json(
                        {
                            "type": "port_forward.opened",
                            "session_id": session_id,
                            "generation": 1,
                        }
                    )
                    failure = desktop.receive_json()
                    assert failure["type"] == "port_forward.error"
                    assert failure["code"] == "protocol_violation"

                agent.send_json(summary_payload())
                assert live_browser.receive_json()["type"] == "live.summary"


def test_port_forward_start_fails_closed_when_audit_is_unavailable() -> None:
    module = load_gateway_module()

    async def authorize(*_args: object) -> bool:
        return True

    async def unavailable_audit(*_args: object) -> None:
        raise RuntimeError("audit unavailable")

    app = module.create_app(
        authenticate_agent=stub_authenticator,
        authenticate_browser=stub_browser_session,
        authorize_browser_cluster=stub_cluster_authorizer,
        authorize_browser_port_forward=authorize,
        audit_port_forward=unavailable_audit,
    )
    with TestClient(app) as client:
        with client.websocket_connect(
            f"/live/agent?cluster_id={CLUSTER}", headers={"x-agent-token": GOOD_TOKEN}
        ) as agent:
            agent.receive_json()
            with client.websocket_connect(
                f"/live/port-forward?workspace_id={WORKSPACE}&cluster_id={CLUSTER}",
                headers=browser_headers(),
            ) as desktop:
                desktop.send_json(port_forward_start_payload())
                failure = desktop.receive_json()
                assert failure["type"] == "port_forward.error"
                assert failure["code"] == "audit_unavailable"
            assert app.state.port_forward_broker.sessions == {}


def test_database_port_forward_authorizer_rechecks_exact_revision_uid_and_port(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = load_gateway_module()
    monkeypatch.setenv("POD_EXEC_ALLOWED_NAMESPACES", "sandbox")
    row: dict[str, Any] = {
        "inventory_key": "inventory-pod-1",
        "snapshot_id": "snapshot-pod-1",
        "workspace_id": WORKSPACE,
        "cluster_id": CLUSTER,
        "resource_type": "pod",
        "api_version": "v1",
        "kind": "Pod",
        "namespace": "sandbox",
        "name": "api-0",
        "uid": "uid-pod-1",
        "resource_version": "42",
        "deleted_at": None,
        "summary": {
            "phase": "Running",
            "container_ports_complete": True,
            "containers": [
                {
                    "name": "app",
                    "ports": [{"container_port": 8080, "protocol": "TCP"}],
                }
            ],
        },
    }

    class PortForwardDb:
        def user_has_resource_access(self, *_args: object) -> bool:
            return True

        def get_cluster_registration(self, workspace_id: str, cluster_id: str) -> dict[str, Any]:
            return {
                "workspace_id": workspace_id,
                "cluster_id": cluster_id,
                "settings": {"cluster_role": "target"},
            }

        def get_cluster_policy(self, _workspace_id: str, _cluster_id: str) -> dict[str, str]:
            return {"cluster_role": "target"}

        def get_inventory_resource_by_api_version(
            self, **identity: object
        ) -> dict[str, Any] | None:
            expected = {
                "workspace_id": WORKSPACE,
                "cluster_id": CLUSTER,
                "resource_type": "pod",
                "api_version": "v1",
                "kind": "Pod",
                "namespace": "sandbox",
                "name": "api-0",
            }
            return row if identity == expected else None

        def list_cluster_agent_statuses(
            self, _workspace: str, _cluster: str
        ) -> list[dict[str, Any]]:
            return [{"status": "connected", "capabilities": [PORT_FORWARD_AGENT_CAPABILITY]}]

    db = PortForwardDb()
    current = SimpleNamespace(
        user_id="user-1",
        roles=("cluster_steward",),
        workspace_id=WORKSPACE,
    )
    scope, resource = module.port_forward_scope_and_resource(WORKSPACE, row)
    ports, discovery, discovery_reason = module.port_forward_resource_ports(row)
    availability, reason = "unavailable", "pod_service_request_unsupported"
    local_forward, local_reason = module.port_forward_local_availability(
        db, WORKSPACE, CLUSTER, row, ports
    )
    revision = module.port_forward_capability_revision(
        current=current,
        scope=scope,
        resource=resource,
        inventory=row,
        ports=ports,
        availability=availability,
        reason=reason,
        local_port_forward=local_forward,
        local_port_forward_reason=local_reason,
        port_discovery=discovery,
        port_discovery_reason=discovery_reason,
    )
    authorize = module.database_port_forward_authorizer(db)
    start = module.PortForwardStart(
        capability_revision=revision,
        resource=resource,
        remote_port=8080,
        confirmation=True,
    )

    assert asyncio.run(authorize(current, WORKSPACE, CLUSTER, start)) is True
    assert (
        asyncio.run(
            authorize(
                current,
                WORKSPACE,
                CLUSTER,
                start.model_copy(update={"resource": resource.model_copy(update={"uid": "stale"})}),
            )
        )
        is False
    )
    assert (
        asyncio.run(
            authorize(
                current,
                WORKSPACE,
                CLUSTER,
                start.model_copy(update={"capability_revision": "0" * 64}),
            )
        )
        is False
    )
    assert (
        asyncio.run(
            authorize(current, WORKSPACE, CLUSTER, start.model_copy(update={"remote_port": 9999}))
        )
        is False
    )

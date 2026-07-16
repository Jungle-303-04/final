"""realtime-gateway WebSocket 검증 — agent ingest → browser fan-out 골든 패스와 fail-closed."""

from __future__ import annotations

import asyncio
import hashlib
from typing import Any

import pytest
from conftest import ROOT, load_file
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

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

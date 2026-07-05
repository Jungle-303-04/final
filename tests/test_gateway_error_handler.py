from __future__ import annotations

from typing import Any

from conftest import ROOT, load_file
from fastapi.testclient import TestClient


def load_gateway_module() -> Any:
    return load_file(
        ROOT / "src" / "services" / "gateway" / "api-gateway" / "gateway.py",
        "test_api_gateway_error_handler_module",
    )


def test_gateway_unhandled_error_response_does_not_leak_exception_detail(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@postgresql:5432/service")
    gateway = load_gateway_module()
    app = gateway.create_app()

    @app.get("/boom")
    async def boom() -> None:
        raise RuntimeError("secret database password leaked")

    client = TestClient(app, raise_server_exceptions=False)
    response = client.get("/boom")

    assert response.status_code == 500
    assert response.json() == {"error": "internal server error"}
    assert "secret" not in response.text


def test_gateway_healthz_returns_service_status_without_db(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@postgresql:5432/service")
    gateway = load_gateway_module()

    class ReadyDb:
        def check_ready(self) -> None:
            raise AssertionError("healthz must not touch database readiness")

    monkeypatch.setattr(gateway, "Database", ReadyDb)
    app = gateway.create_app()
    response = TestClient(app).get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "api-gateway"}


def test_gateway_readyz_checks_database_readiness(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@postgresql:5432/service")
    gateway = load_gateway_module()

    class ReadyDb:
        def __init__(self) -> None:
            self.ready_checks = 0

        def check_ready(self) -> None:
            self.ready_checks += 1

    monkeypatch.setattr(gateway, "Database", ReadyDb)
    app = gateway.create_app()
    response = TestClient(app).get("/readyz")

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}
    assert app.state.db.ready_checks == 1


def test_agent_connect_event_uses_identity_cluster_id() -> None:
    gateway = load_gateway_module()

    body = gateway.agent_connected_body_from_request(
        gateway.AgentConnectRequest(
            cluster_id="body-cluster",
            agent_id="agent-1",
            capabilities=["kubernetes"],
        ),
        gateway.ClusterAgentIdentity(
            workspace_id="workspace-1",
            cluster_id="identity-cluster",
        ),
    )

    assert body.cluster_id == "identity-cluster"
    assert body.workspace_id == "workspace-1"
    assert body.agent_id == "agent-1"
    assert body.capabilities == ["kubernetes"]

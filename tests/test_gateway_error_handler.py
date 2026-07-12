from __future__ import annotations

import asyncio
import logging
from typing import Any

import pytest
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


def test_gateway_docs_use_configured_external_api_root_path(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@postgresql:5432/service")
    monkeypatch.setenv("API_ROOT_PATH", "/api")
    gateway = load_gateway_module()
    app = gateway.create_app()

    response = TestClient(app).get("/docs")

    assert response.status_code == 200
    assert "url: '/api/openapi.json'" in response.text


def test_gateway_lifespan_validates_rca_scenario_adapters_before_external_connections(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@postgresql:5432/service")
    gateway = load_gateway_module()
    service = gateway.ApiGateway()
    external_calls: list[str] = []

    def invalid_catalog() -> None:
        raise RuntimeError("RCA scenario adapter contract invalid")

    async def must_not_wait(_db: Any) -> None:
        external_calls.append("database")

    monkeypatch.setattr(gateway, "validate_test_scenario_catalog", invalid_catalog)
    monkeypatch.setattr(gateway, "wait_for_database", must_not_wait)

    async def start() -> None:
        async with service.lifespan(service.app):
            raise AssertionError("invalid RCA scenario catalog must fail startup")

    with pytest.raises(RuntimeError, match="adapter contract invalid"):
        asyncio.run(start())
    assert external_calls == []


def test_gateway_request_logging_records_status_and_path(monkeypatch, caplog) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@postgresql:5432/service")
    gateway = load_gateway_module()

    class ReadyDb:
        def check_ready(self) -> None:
            raise AssertionError("healthz must not touch database readiness")

    monkeypatch.setattr(gateway, "Database", ReadyDb)
    app = gateway.create_app()
    caplog.set_level(logging.INFO)

    response = TestClient(app).get("/healthz", headers={"correlation_id": "corr-http"})

    assert response.status_code == 200
    contexts = [
        record.context
        for record in caplog.records
        if record.getMessage() == "gateway_request_completed"
        and isinstance(getattr(record, "context", None), dict)
    ]
    assert contexts
    context = contexts[-1]
    assert context["method"] == "GET"
    assert context["path"] == "/healthz"
    assert context["status_code"] == 200
    assert context["request_correlation_id"] == "corr-http"
    assert context["duration_ms"] >= 0


@pytest.mark.parametrize(
    ("fail_request", "expected_status", "expected_log_message"),
    [
        (False, 404, "gateway_request_completed"),
        (True, 500, "gateway_request_failed"),
    ],
)
def test_gateway_request_logging_redacts_install_token(
    monkeypatch,
    caplog,
    fail_request: bool,
    expected_status: int,
    expected_log_message: str,
) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@postgresql:5432/service")
    gateway = load_gateway_module()
    agent_token = "install-super-secret-token"

    class UnknownInstallTokenDb:
        def authenticate_cluster_agent(self, _token_hash: str) -> None:
            if fail_request:
                raise RuntimeError("install token lookup failed")
            return None

    monkeypatch.setattr(gateway, "Database", UnknownInstallTokenDb)
    app = gateway.create_app()
    caplog.set_level(logging.INFO)

    response = TestClient(app, raise_server_exceptions=False).get(f"/install/{agent_token}")

    assert response.status_code == expected_status
    contexts = [
        record.context
        for record in caplog.records
        if record.getMessage() == expected_log_message
        and isinstance(getattr(record, "context", None), dict)
    ]
    assert contexts
    assert contexts[-1]["path"] == "/install/[REDACTED]"
    assert agent_token not in repr(contexts)


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


def test_gateway_metrics_uses_bearer_token_guard(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@postgresql:5432/service")
    monkeypatch.setenv("METRICS_TOKEN", "metrics-secret")
    gateway = load_gateway_module()

    class MetricsDb:
        def open_dead_letter_count(self) -> int:
            return 0

        def outbox_pending_count(self) -> int:
            return 0

        def outbox_oldest_age_seconds(self) -> float:
            return 42.5

        def oldest_command_age_seconds(self, _status: str) -> float:
            return 0.0

        def oldest_evidence_job_age_seconds(self, _status: str) -> float:
            return 0.0

        def event_processing_status_counts(self) -> dict[str, int]:
            return {}

        def event_processing_duration_avg_ms_by_consumer(self) -> dict[str, float]:
            return {"command-worker": 12.5}

        def event_processing_duration_max_ms_by_consumer(self) -> dict[str, int]:
            return {"command-worker": 30}

        def event_consumer_pending_by_consumer_subject(self) -> dict[tuple[str, str], int]:
            return {("command-worker", "command.requested"): 4}

        def event_consumer_ack_pending_by_consumer_subject(self) -> dict[tuple[str, str], int]:
            return {("command-worker", "command.requested"): 1}

        def event_consumer_redelivered_by_consumer_subject(self) -> dict[tuple[str, str], int]:
            return {("command-worker", "command.requested"): 2}

        def llm_invocation_latency_avg_ms_by_provider_model_operation_status(
            self,
        ) -> dict[tuple[str, str, str, str], float]:
            return {("openai", "gpt-test", "complete", "succeeded"): 25.5}

        def llm_invocation_latency_max_ms_by_provider_model_operation_status(
            self,
        ) -> dict[tuple[str, str, str, str], int]:
            return {("openai", "gpt-test", "complete", "succeeded"): 40}

        def llm_invocation_total_tokens_by_provider_model_operation_status(
            self,
        ) -> dict[tuple[str, str, str, str], int]:
            return {("openai", "gpt-test", "complete", "succeeded"): 123}

        def llm_invocation_estimated_cost_micros_by_provider_model_operation_status(
            self,
        ) -> dict[tuple[str, str, str, str], int]:
            return {("openai", "gpt-test", "complete", "succeeded"): 17}

        def command_status_counts(self) -> dict[str, int]:
            return {}

        def evidence_job_status_counts(self) -> dict[str, int]:
            return {}

        def count_running_workflow_runs(self, _workspace_id: str) -> int:
            return 2

        def count_open_workflow_approvals(self, _workspace_id: str) -> int:
            return 1

        def workflow_run_status_counts(self, _workspace_id: str) -> dict[str, int]:
            return {"applying": 1, "waiting_for_approval": 1}

        def workflow_run_current_step_counts(self, _workspace_id: str) -> dict[str, int]:
            return {"apply": 1, "approval": 1}

    monkeypatch.setattr(gateway, "Database", MetricsDb)
    app = gateway.create_app()
    client = TestClient(app)

    assert client.get("/metrics").status_code == 401
    assert client.get("/metrics", headers={"authorization": "Bearer wrong"}).status_code == 401
    response = client.get("/metrics", headers={"authorization": "Bearer metrics-secret"})

    assert response.status_code == 200
    assert "event_dead_letters_open_total 0" in response.text
    assert "outbox_oldest_age_seconds 42.5" in response.text
    assert 'event_processing_duration_avg_ms{consumer="command-worker"} 12.5' in response.text
    assert 'event_processing_duration_max_ms{consumer="command-worker"} 30' in response.text
    assert (
        'nats_consumer_pending_events{consumer="command-worker",subject="command.requested"} 4'
        in response.text
    )
    assert (
        'nats_consumer_ack_pending_events{consumer="command-worker",subject="command.requested"} 1'
        in response.text
    )
    assert (
        'nats_consumer_redelivered_events{consumer="command-worker",subject="command.requested"} 2'
        in response.text
    )
    assert (
        'llm_invocation_latency_avg_ms{provider="openai",model="gpt-test",operation="complete",status="succeeded"} 25.5'
        in response.text
    )
    assert (
        'llm_invocation_estimated_cost_micros{provider="openai",model="gpt-test",operation="complete",status="succeeded"} 17'
        in response.text
    )
    assert "gitops_workflow_running_total 2" in response.text
    assert "gitops_approvals_open_total 1" in response.text
    assert 'gitops_workflow_status_total{status="applying"} 1' in response.text
    assert 'gitops_workflow_current_step_total{step="approval"} 1' in response.text


def test_gateway_metrics_requires_token_configuration_in_protected_environment(
    monkeypatch,
) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@postgresql:5432/service")
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("METRICS_TOKEN", raising=False)
    gateway = load_gateway_module()

    class MetricsDb:
        pass

    monkeypatch.setattr(gateway, "Database", MetricsDb)
    client = TestClient(gateway.create_app())

    response = client.get("/metrics")

    assert response.status_code == 503
    assert response.json() == {"detail": "metrics token is not configured"}


def test_dead_letter_replay_rejects_archived_status(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@postgresql:5432/service")
    gateway = load_gateway_module()

    async def allow_admin(_request: Any) -> None:
        return None

    class DeadLetterDb:
        def get_dead_letter(self, dead_letter_id: int) -> dict[str, Any]:
            assert dead_letter_id == 7
            return {
                "id": 7,
                "status": "archived",
                "original_subject": "rca.ai_fallback.requested",
                "payload": {},
                "correlation_id": "corr-1",
                "original_event_id": "event-1",
            }

        def mark_dead_letter_replayed(self, *_args: Any) -> bool:
            raise AssertionError("archived dead letters must not be marked replayed")

    class NoopBus:
        pass

    class NoopEvents:
        def __init__(self, *_args: Any) -> None:
            pass

        async def accept(self, *_args: Any) -> Any:
            raise AssertionError("archived dead letters must not be re-emitted")

    monkeypatch.setattr(gateway, "require_admin_session", allow_admin)
    monkeypatch.setattr(gateway, "Database", DeadLetterDb)
    monkeypatch.setattr(gateway, "NatsEventBus", NoopBus)
    monkeypatch.setattr(gateway, "ApiEventGateway", NoopEvents)

    response = TestClient(gateway.create_app()).post("/dead-letters/7/replay")

    assert response.status_code == 409
    assert response.json() == {"detail": "dead letter is not open"}


def test_session_cookie_state_changes_require_same_origin_intent(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@postgresql:5432/service")
    gateway = load_gateway_module()
    app = gateway.create_app()

    @app.post("/protected")
    async def protected() -> dict[str, bool]:
        return {"ok": True}

    client = TestClient(app)
    client.cookies.set(gateway.Auth.SESSION_COOKIE_NAME, "session-token")

    missing = client.post("/protected")
    assert missing.status_code == 403
    assert missing.json() == {"detail": "same-origin session request required"}

    with_header = client.post(
        "/protected",
        headers={"x-service-csrf": "same-origin"},
    )
    assert with_header.status_code == 200

    with_origin = client.post(
        "/protected",
        headers={"origin": "http://testserver"},
    )
    assert with_origin.status_code == 200

    cross_site = client.post(
        "/protected",
        headers={"origin": "https://evil.example.test"},
    )
    assert cross_site.status_code == 403


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

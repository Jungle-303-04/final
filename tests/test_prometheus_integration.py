from __future__ import annotations

import json
from contextlib import contextmanager
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from pydantic import ValidationError

from domains.identity.dependencies import ClusterAgentIdentity, require_cluster_agent
from domains.integrations.prometheus import router
from packages.contracts.integrations import PrometheusIntegrationUpdateRequest
from packages.contracts.parity import OperationEvent
from packages.runtime.dependencies import get_db, get_events, get_operation_events
from packages.security.credentials import (
    CredentialEncryptionError,
    agent_envelope_context,
    decrypt_credential,
    generate_agent_envelope_keypair,
    open_agent_payload,
    seal_agent_payload,
)


@pytest.fixture(autouse=True)
def _credential_encryption_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CREDENTIAL_ENCRYPTION_KEY", "prometheus-integration-test-key")


class SessionAuth:
    async def require_session(self, _request: Request) -> Any:
        return SimpleNamespace(
            workspace_id="workspace-a",
            user_id="user-a",
            roles=("user",),
        )


class IntegrationDb:
    def __init__(self) -> None:
        self.agent_envelope_public_key, self.agent_envelope_private_key = (
            generate_agent_envelope_keypair()
        )
        self.credential: dict[str, Any] | None = None
        self.policy: dict[str, Any] | None = None
        self.metadata_updates: list[dict[str, Any]] = []
        self.staged: list[OperationEvent] = []
        self.policy_locks: list[tuple[str, str]] = []
        self.credential_locks: list[tuple[str, str, str]] = []

    @contextmanager
    def connection(self):
        yield object()

    def can_access(self, *_args: Any) -> bool:
        return True

    def get_cluster_registration(self, workspace_id: str, cluster_id: str) -> dict[str, Any]:
        assert (workspace_id, cluster_id) == ("workspace-a", "cluster-a")
        return {
            "workspace_id": workspace_id,
            "cluster_id": cluster_id,
            "agent_envelope_public_key": self.agent_envelope_public_key,
        }

    def lock_cluster_policy_for_update(
        self,
        workspace_id: str,
        cluster_id: str,
        *,
        conn: Any,
    ) -> None:
        assert conn is not None
        self.policy_locks.append((workspace_id, cluster_id))

    def lock_workspace_credential_scope(
        self,
        workspace_id: str,
        provider: str,
        scope: str,
        *,
        conn: Any,
    ) -> None:
        assert conn is not None
        self.credential_locks.append((workspace_id, provider, scope))

    def get_cluster_policy(
        self,
        workspace_id: str,
        cluster_id: str,
        *,
        conn: Any | None = None,
    ) -> dict[str, Any] | None:
        assert (workspace_id, cluster_id) == ("workspace-a", "cluster-a")
        assert conn is not None
        return self.policy

    def upsert_cluster_policy(
        self,
        workspace_id: str,
        cluster_id: str,
        policy: dict[str, Any],
        *,
        conn: Any | None = None,
    ) -> dict[str, Any]:
        assert (workspace_id, cluster_id) == ("workspace-a", "cluster-a")
        assert conn is not None
        self.policy = policy
        return policy

    def upsert_workspace_credential(
        self,
        payload: dict[str, Any],
        *,
        conn: Any | None = None,
    ) -> dict[str, Any]:
        assert conn is not None
        self.credential = {
            "credential_id": "cred-a",
            "status": "active",
            **payload,
        }
        return self.credential

    def get_workspace_credential(
        self,
        workspace_id: str,
        provider: str,
        scope: str,
        *,
        conn: Any | None = None,
    ) -> dict[str, Any] | None:
        assert (workspace_id, provider, scope) == (
            "workspace-a",
            "prometheus",
            "cluster:cluster-a",
        )
        return self.credential

    def update_workspace_credential_metadata(
        self,
        *,
        workspace_id: str,
        provider: str,
        scope: str,
        expected_revision: str,
        metadata: dict[str, Any],
        expected_state: str | None = None,
        conn: Any | None = None,
    ) -> dict[str, Any] | None:
        assert conn is not None
        assert self.credential is not None
        assert (workspace_id, provider, scope) == (
            "workspace-a",
            "prometheus",
            "cluster:cluster-a",
        )
        if self.credential["metadata"]["revision"] != expected_revision:
            return None
        if (
            expected_state is not None
            and self.credential["metadata"].get("state") != expected_state
        ):
            return None
        self.credential["metadata"] = {**self.credential["metadata"], **metadata}
        self.metadata_updates.append(metadata)
        return self.credential

    def stage_integration_operation_event(
        self,
        conn: Any,
        *,
        workspace_id: str,
        operation_id: str,
        cluster_id: str,
        payload: dict[str, object],
        kind: str = "progress",
    ) -> OperationEvent:
        assert conn is not None
        event = OperationEvent(
            command_id=operation_id,
            sequence=len(self.staged) + 1,
            kind=kind,
            payload={"cluster_id": cluster_id, **payload},
        )
        self.staged.append(event)
        return event


class IntegrationEvents:
    def __init__(self) -> None:
        self.bodies: list[Any] = []

    async def accept_body(self, body: Any, **kwargs: Any) -> Any:
        self.bodies.append(body)
        event = SimpleNamespace(event_id="event-a", correlation_id="correlation-a")
        kwargs["transactional_stage"](object(), event)
        return SimpleNamespace(event=event)


class IntegrationOperations:
    def __init__(self) -> None:
        self.announced: list[OperationEvent] = []
        self.published: list[dict[str, Any]] = []

    async def announce(self, event: OperationEvent, **_kwargs: Any) -> None:
        self.announced.append(event)

    async def publish(self, **kwargs: Any) -> OperationEvent:
        self.published.append(kwargs)
        return OperationEvent(
            command_id=kwargs["command_id"],
            sequence=2,
            kind=kwargs["kind"],
            payload=kwargs["payload"],
        )


def test_prometheus_integration_request_normalizes_and_bounds_sensitive_headers() -> None:
    request = PrometheusIntegrationUpdateRequest(
        cluster_id="cluster-a",
        prometheus_url="https://prometheus.example.test/",
        headers={"X-Scope-OrgID": "tenant-a", "Authorization": "Bearer secret"},
    )

    assert request.prometheus_url == "https://prometheus.example.test"
    assert tuple(request.headers) == ("Authorization", "X-Scope-OrgID")

    for invalid in (
        "https://user:pass@prometheus.example.test",
        "https://prometheus.example.test/api?token=secret",
        "file:///tmp/prometheus",
        "http://127.0.0.1:9090",
        "http://169.254.169.254/latest/meta-data",
        "http://[::1]:9090",
        "http://localhost:9090",
    ):
        with pytest.raises(ValidationError):
            PrometheusIntegrationUpdateRequest(
                cluster_id="cluster-a",
                prometheus_url=invalid,
            )
    with pytest.raises(ValidationError):
        PrometheusIntegrationUpdateRequest(
            cluster_id="cluster-a",
            prometheus_url="https://prometheus.example.test",
            headers={"Connection": "keep-alive"},
        )
    with pytest.raises(ValidationError):
        PrometheusIntegrationUpdateRequest(
            cluster_id="cluster-a",
            prometheus_url="https://prometheus.example.test",
            headers={"Authorization": "Bearer secret\nX-Leak: yes"},
        )
    with pytest.raises(ValidationError):
        PrometheusIntegrationUpdateRequest(
            cluster_id="cluster-a",
            prometheus_url="https://prometheus.example.test",
            headers={"Authorization": "Bearer one", "authorization": "Bearer two"},
        )
    with pytest.raises(ValidationError):
        PrometheusIntegrationUpdateRequest(
            cluster_id="cluster-a",
            prometheus_url="http://prometheus.example.test",
            headers={"Authorization": "Bearer secret"},
        )


def test_agent_envelope_is_bound_to_recipient_and_complete_operation_context() -> None:
    public_key, private_key = generate_agent_envelope_keypair()
    _other_public_key, other_private_key = generate_agent_envelope_keypair()
    context = agent_envelope_context(
        "workspace-a",
        "cluster-a",
        "revision-a",
        "operation-a",
        "https://prometheus.example.test",
    )
    sealed = seal_agent_payload(
        {"headers": {"Authorization": "Bearer secret-value"}},
        public_key,
        context,
    )

    assert "secret-value" not in sealed
    assert open_agent_payload(sealed, private_key, context)["headers"] == {
        "Authorization": "Bearer secret-value"
    }
    with pytest.raises(CredentialEncryptionError):
        open_agent_payload(sealed, other_private_key, context)
    with pytest.raises(CredentialEncryptionError):
        open_agent_payload(
            sealed,
            private_key,
            agent_envelope_context(
                "workspace-a",
                "cluster-a",
                "revision-a",
                "operation-b",
                "https://prometheus.example.test",
            ),
        )


def test_update_encrypts_headers_advances_policy_and_returns_durable_receipt() -> None:
    db = IntegrationDb()
    events = IntegrationEvents()
    operations = IntegrationOperations()
    client = _client(db, events, operations)

    response = client.put(
        "/integrations/prometheus",
        json={
            "cluster_id": "cluster-a",
            "prometheus_url": "https://prometheus.example.test/",
            "headers": {
                "Authorization": "Bearer secret-value",
                "X-Scope-OrgID": "tenant-a",
            },
        },
    )

    assert response.status_code == 202
    body = response.json()
    assert body["state"] == "pending"
    assert body["address"] == "https://prometheus.example.test"
    assert body["header_keys"] == ["Authorization", "X-Scope-OrgID"]
    assert body["receipt"] == {
        "accepted": True,
        "command_id": body["operation_id"],
        "event_id": "event-a",
        "audit_event_id": "event-a",
        "correlation_id": "correlation-a",
        "status": "queued",
        "audit_id": None,
    }
    serialized = json.dumps(body, sort_keys=True)
    assert "secret-value" not in serialized
    assert db.credential is not None
    assert "secret-value" not in db.credential["encrypted_value"]
    assert json.loads(decrypt_credential(db.credential["encrypted_value"])) == {
        "headers": {
            "Authorization": "Bearer secret-value",
            "X-Scope-OrgID": "tenant-a",
        }
    }
    assert db.policy is not None
    provider = db.policy["evidence"]["providers"]["metrics"]
    assert provider["configuration_revision"] == body["revision"]
    assert provider["configuration_operation_id"] == body["operation_id"]
    assert len(db.staged) == 1
    assert operations.announced == db.staged
    assert db.policy_locks == [("workspace-a", "cluster-a")]
    assert db.credential_locks == [("workspace-a", "prometheus", "cluster:cluster-a")]
    assert events.bodies[0].submitted_header_keys == ["Authorization", "X-Scope-OrgID"]
    assert events.bodies[0].preserve_stored_headers is False
    assert "secret-value" not in repr(events.bodies[0])


def test_update_fails_closed_when_credential_encryption_is_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("CREDENTIAL_ENCRYPTION_KEY", raising=False)
    client = _client(IntegrationDb(), IntegrationEvents(), IntegrationOperations())

    response = client.put(
        "/integrations/prometheus",
        json={"cluster_id": "cluster-a", "prometheus_url": "https://prometheus.test"},
    )

    assert response.status_code == 503
    assert response.json() == {"detail": "prometheus credential encryption unavailable"}


def test_omitted_headers_preserve_only_on_same_origin_and_explicit_empty_clears_it() -> None:
    db = IntegrationDb()
    client = _client(db, IntegrationEvents(), IntegrationOperations())
    client.put(
        "/integrations/prometheus",
        json={
            "cluster_id": "cluster-a",
            "prometheus_url": "https://prometheus.test/old",
            "headers": {"Authorization": "Bearer secret-value"},
        },
    )

    preserved = client.put(
        "/integrations/prometheus",
        json={
            "cluster_id": "cluster-a",
            "prometheus_url": "https://prometheus.test/new",
        },
    )
    assert preserved.status_code == 202
    assert preserved.json()["header_keys"] == ["Authorization"]
    assert db.credential is not None
    assert json.loads(decrypt_credential(db.credential["encrypted_value"]))["headers"] == {
        "Authorization": "Bearer secret-value"
    }

    rejected = client.put(
        "/integrations/prometheus",
        json={
            "cluster_id": "cluster-a",
            "prometheus_url": "https://other.prometheus.test",
        },
    )
    assert rejected.status_code == 409
    assert rejected.json() == {
        "detail": "prometheus headers must be re-entered when the URL origin changes"
    }
    assert json.loads(decrypt_credential(db.credential["encrypted_value"]))["headers"] == {
        "Authorization": "Bearer secret-value"
    }

    cleared = client.put(
        "/integrations/prometheus",
        json={
            "cluster_id": "cluster-a",
            "prometheus_url": "https://other.prometheus.test",
            "headers": {},
        },
    )
    assert cleared.status_code == 202
    assert cleared.json()["header_keys"] == []
    assert json.loads(decrypt_credential(db.credential["encrypted_value"])) == {"headers": {}}


def test_browser_status_redacts_values_and_agent_fetch_is_revision_bound() -> None:
    db = IntegrationDb()
    events = IntegrationEvents()
    operations = IntegrationOperations()
    client = _client(db, events, operations)
    created = client.put(
        "/integrations/prometheus",
        json={
            "cluster_id": "cluster-a",
            "prometheus_url": "https://prometheus.example.test",
            "headers": {"Authorization": "Bearer secret-value"},
        },
    ).json()

    browser = client.get(
        "/integrations/prometheus",
        params={"cluster_id": "cluster-a"},
    )
    assert browser.status_code == 200
    assert browser.json()["header_keys"] == ["Authorization"]
    assert "headers" not in browser.json()
    assert "secret-value" not in browser.text

    stale = client.get(
        "/agent/integrations/prometheus",
        params={"revision": "stale-revision"},
        headers={"Authorization": "Bearer agent"},
    )
    assert stale.status_code == 409
    agent = client.get(
        "/agent/integrations/prometheus",
        params={"revision": created["revision"]},
        headers={"x-agent-token": "agent-test-token"},
    )
    assert agent.status_code == 200
    assert "headers" not in agent.json()
    assert "secret-value" not in agent.text
    context = agent_envelope_context(
        "workspace-a",
        "cluster-a",
        created["revision"],
        created["operation_id"],
        "https://prometheus.example.test",
    )
    assert open_agent_payload(
        agent.json()["sealed_headers"],
        db.agent_envelope_private_key,
        context,
    )["headers"] == {"Authorization": "Bearer secret-value"}
    with pytest.raises(CredentialEncryptionError):
        open_agent_payload(agent.json()["sealed_headers"], "agent-test-token", context)
    assert agent.json()["operation_id"] == created["operation_id"]


def test_agent_fetch_fails_closed_when_registration_has_no_pinned_envelope_key() -> None:
    db = IntegrationDb()
    db.agent_envelope_public_key = ""
    events = IntegrationEvents()
    operations = IntegrationOperations()
    client = _client(db, events, operations)
    created = client.put(
        "/integrations/prometheus",
        json={
            "cluster_id": "cluster-a",
            "prometheus_url": "https://prometheus.example.test",
            "headers": {"Authorization": "Bearer secret-value"},
        },
    ).json()

    response = client.get(
        "/agent/integrations/prometheus",
        params={"revision": created["revision"]},
        headers={"x-agent-token": "agent-test-token"},
    )

    assert response.status_code == 409
    assert "sealed_headers" not in response.text
    assert "secret-value" not in response.text


def test_agent_probe_status_is_exactly_bound_and_closes_operation_stream() -> None:
    db = IntegrationDb()
    events = IntegrationEvents()
    operations = IntegrationOperations()
    client = _client(db, events, operations)
    created = client.put(
        "/integrations/prometheus",
        json={
            "cluster_id": "cluster-a",
            "prometheus_url": "https://prometheus.example.test",
        },
    ).json()

    mismatched = client.post(
        "/agent/integrations/prometheus/status",
        json={
            "revision": "different",
            "operation_id": created["operation_id"],
            "state": "connected",
        },
        headers={"Authorization": "Bearer agent"},
    )
    assert mismatched.status_code == 409

    accepted = client.post(
        "/agent/integrations/prometheus/status",
        json={
            "revision": created["revision"],
            "operation_id": created["operation_id"],
            "state": "connected",
        },
        headers={"Authorization": "Bearer agent"},
    )
    assert accepted.status_code == 200
    assert accepted.json() == {"accepted": True}
    assert db.metadata_updates[-1]["state"] == "connected"
    assert operations.published == []
    assert operations.announced[-1].kind == "completed"
    assert operations.announced[-1].command_id == created["operation_id"]
    assert operations.announced[-1].payload == {
        "cluster_id": "cluster-a",
        "status": "completed",
        "state": "connected",
        "revision": created["revision"],
        "address": "https://prometheus.example.test",
        "error_code": None,
    }

    repeated = client.post(
        "/agent/integrations/prometheus/status",
        json={
            "revision": created["revision"],
            "operation_id": created["operation_id"],
            "state": "connected",
        },
    )
    assert repeated.status_code == 200
    assert len([event for event in db.staged if event.kind == "completed"]) == 1

    conflicting = client.post(
        "/agent/integrations/prometheus/status",
        json={
            "revision": created["revision"],
            "operation_id": created["operation_id"],
            "state": "failed",
            "error_code": "prometheus_probe_http_error",
        },
    )
    assert conflicting.status_code == 409
    assert db.credential is not None
    assert db.credential["metadata"]["state"] == "connected"


def test_new_configuration_cancels_the_previous_pending_operation() -> None:
    db = IntegrationDb()
    operations = IntegrationOperations()
    client = _client(db, IntegrationEvents(), operations)
    first = client.put(
        "/integrations/prometheus",
        json={"cluster_id": "cluster-a", "prometheus_url": "https://prometheus.test"},
    ).json()

    second = client.put(
        "/integrations/prometheus",
        json={"cluster_id": "cluster-a", "prometheus_url": "https://prometheus.test/v2"},
    ).json()

    cancelled = [event for event in db.staged if event.kind == "cancelled"]
    assert len(cancelled) == 1
    assert cancelled[0].command_id == first["operation_id"]
    assert cancelled[0].payload["superseded_by"] == second["operation_id"]
    assert operations.announced == db.staged


def test_retrying_probe_keeps_operation_open_and_commits_progress_with_status() -> None:
    db = IntegrationDb()
    operations = IntegrationOperations()
    client = _client(db, IntegrationEvents(), operations)
    created = client.put(
        "/integrations/prometheus",
        json={"cluster_id": "cluster-a", "prometheus_url": "https://prometheus.test"},
    ).json()

    response = client.post(
        "/agent/integrations/prometheus/status",
        json={
            "revision": created["revision"],
            "operation_id": created["operation_id"],
            "state": "retrying",
            "error_code": "prometheus_probe_http_error",
        },
    )

    assert response.status_code == 200
    assert db.credential is not None
    assert db.credential["metadata"]["state"] == "pending"
    assert operations.announced[-1].kind == "progress"
    assert operations.announced[-1].payload["state"] == "retrying"


def _client(
    db: IntegrationDb,
    events: IntegrationEvents,
    operations: IntegrationOperations,
) -> TestClient:
    app = FastAPI()
    app.state.auth = SessionAuth()
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_events] = lambda: events
    app.dependency_overrides[get_operation_events] = lambda: operations
    app.dependency_overrides[require_cluster_agent] = lambda: ClusterAgentIdentity(
        workspace_id="workspace-a",
        cluster_id="cluster-a",
    )
    app.include_router(router)
    return TestClient(app)

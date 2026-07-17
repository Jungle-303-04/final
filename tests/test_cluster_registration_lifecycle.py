from __future__ import annotations

import asyncio
from contextlib import contextmanager
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

from sqlalchemy.dialects import postgresql

from domains.identity.repository import WorkspaceAccessRepository
from domains.target.router import connect_cluster, unregister_cluster
from packages.contracts.gateway.requests import ClusterConnectRequest
from packages.contracts.identity import ClusterRegistrationStatus


class _Result:
    def first(self) -> tuple[str] | None:
        return ("cluster-2",)


class _CaptureConnection:
    def __init__(self) -> None:
        self.statements: list[Any] = []

    def execute(self, statement: Any) -> _Result:
        self.statements.append(statement)
        return _Result()


def test_repository_disconnect_uses_distinct_terminal_status() -> None:
    connection = _CaptureConnection()
    repository = object.__new__(WorkspaceAccessRepository)

    @contextmanager
    def use_connection():
        yield connection

    repository.connection = use_connection  # type: ignore[method-assign]

    assert repository.unregister_target_cluster("default", "cluster-2") is True

    compiled = connection.statements[0].compile(dialect=postgresql.dialect())
    assert ClusterRegistrationStatus.DISCONNECTED.value in compiled.params.values()


def test_agent_reconnect_does_not_overwrite_uninstall_pending_status() -> None:
    connection = _CaptureConnection()
    repository = object.__new__(WorkspaceAccessRepository)

    @contextmanager
    def use_connection():
        yield connection

    repository.connection = use_connection  # type: ignore[method-assign]

    assert repository.mark_cluster_registration_connected("default", "cluster-2") is True

    compiled = connection.statements[0].compile(dialect=postgresql.dialect())
    assert ClusterRegistrationStatus.REGISTERED.value in compiled.params.values()
    allowed_statuses = next(value for value in compiled.params.values() if isinstance(value, list))
    assert ClusterRegistrationStatus.PENDING_INSTALL.value in allowed_statuses
    assert ClusterRegistrationStatus.UNINSTALL_REQUESTED.value not in allowed_statuses


class _LifecycleDb:
    def __init__(self) -> None:
        self.registrations: list[dict[str, Any]] = [
            {
                "workspace_id": "default",
                "cluster_id": "cluster-2-old",
                "name": "Game cluster",
                "environment": "development",
                "status": ClusterRegistrationStatus.REGISTERED.value,
                "settings": {"cluster_role": "target"},
            }
        ]
        self.status_updates: list[str] = []
        self.queued: list[dict[str, Any]] = []

    def list_cluster_registrations(
        self,
        workspace_id: str,
        *,
        cluster_ids: set[str] | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        assert workspace_id == "default"
        rows = self.registrations
        if cluster_ids is not None:
            rows = [row for row in rows if row["cluster_id"] in cluster_ids]
        return rows[:limit]

    def get_cluster_registration(self, workspace_id: str, cluster_id: str) -> dict[str, Any] | None:
        return next(
            (
                row
                for row in self.registrations
                if row["workspace_id"] == workspace_id and row["cluster_id"] == cluster_id
            ),
            None,
        )

    def list_cluster_agent_statuses(
        self, workspace_id: str, cluster_id: str
    ) -> list[dict[str, Any]]:
        assert (workspace_id, cluster_id) == ("default", "cluster-2-old")
        return [
            {
                "workspace_id": workspace_id,
                "cluster_id": cluster_id,
                "agent_id": "agent-1",
                "last_seen_at": datetime.now(UTC).isoformat(),
            }
        ]

    def queue_agent_command(self, correlation_id: str, plan: dict[str, Any], status: str) -> bool:
        self.queued.append({"correlation_id": correlation_id, "plan": plan, "status": status})
        return True

    def update_cluster_registration_status(
        self, workspace_id: str, cluster_id: str, status: str
    ) -> None:
        registration = self.get_cluster_registration(workspace_id, cluster_id)
        assert registration is not None
        registration["status"] = status
        self.status_updates.append(status)

    def unregister_target_cluster(self, workspace_id: str, cluster_id: str) -> bool:
        self.update_cluster_registration_status(
            workspace_id,
            cluster_id,
            ClusterRegistrationStatus.DISCONNECTED.value,
        )
        return True

    def register_target_cluster(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.registrations.append(payload)
        return payload

    def get_cluster_policy(self, _workspace_id: str, _cluster_id: str) -> None:
        return None

    def upsert_cluster_policy(
        self, _workspace_id: str, _cluster_id: str, policy: dict[str, Any]
    ) -> dict[str, Any]:
        return policy

    def upsert_target_desired_states(
        self,
        _workspace_id: str,
        _cluster_id: str,
        components: list[dict[str, Any]],
        _updated_by: str,
    ) -> list[dict[str, Any]]:
        return components


class _Events:
    async def accept_body(self, _body: Any, *_args: Any) -> object:
        return object()


def test_online_disconnect_marks_uninstall_requested_until_agent_ack() -> None:
    db = _LifecycleDb()

    response = asyncio.run(
        unregister_cluster(
            "cluster-2-old",
            current=SimpleNamespace(workspace_id="default", user_id="admin"),
            db=db,
        )
    )

    assert response.status == "uninstalling"
    assert db.status_updates == [ClusterRegistrationStatus.UNINSTALL_REQUESTED.value]


def test_disconnected_display_name_can_be_registered_again_with_new_token(
    monkeypatch,
) -> None:
    monkeypatch.setenv("CREDENTIAL_ENCRYPTION_KEY", "cluster-lifecycle-test-key")
    monkeypatch.setenv("PUBLIC_MANAGEMENT_BASE_URL", "https://opsia.example.com/api")
    monkeypatch.setenv("TARGET_AGENT_IMAGE", "ghcr.io/acme/kubeheal-agent:test")
    db = _LifecycleDb()
    assert db.unregister_target_cluster("default", "cluster-2-old") is True

    response = asyncio.run(
        connect_cluster(
            ClusterConnectRequest(name="  GAME CLUSTER  ", provider="aws"),
            current=SimpleNamespace(user_id="admin", workspace_id="default"),
            db=db,
            events=_Events(),
        )
    )

    assert response.cluster_id != "cluster-2-old"
    assert response.install_command
    assert db.registrations[-1]["status"] == ClusterRegistrationStatus.PENDING_INSTALL.value

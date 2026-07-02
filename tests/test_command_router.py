from __future__ import annotations

import asyncio
from types import SimpleNamespace

from fastapi import HTTPException

from domains.command.router import (
    RESOURCE_ACCESS_DENIED,
    command_heartbeat,
    command_start,
    commands,
)
from domains.identity.dependencies import ClusterAgentIdentity
from packages.contracts.gateway.requests import (
    CommandHeartbeatRequest,
    CommandRequest,
    CommandStartRequest,
)

AGENT_IDENTITY = ClusterAgentIdentity(
    workspace_id="trusted-workspace",
    cluster_id="trusted-cluster",
)


class SpyAccessDb:
    def __init__(self, allowed: bool) -> None:
        self.allowed = allowed
        self.calls: list[tuple[str, str, str, str, str]] = []

    def user_has_resource_access(
        self,
        user_id: str,
        workspace_id: str,
        resource_type: str,
        resource_id: str,
        action: str,
    ) -> bool:
        self.calls.append((user_id, workspace_id, resource_type, resource_id, action))
        return self.allowed


class SpyEvents:
    def __init__(self) -> None:
        self.body: object | None = None
        self.actor: object | None = None

    async def accept_body(self, body: object, actor: object) -> object:
        self.body = body
        self.actor = actor
        event = SimpleNamespace(event_id="evt-1", correlation_id="corr-1")
        return SimpleNamespace(event=event)


def current_session() -> SimpleNamespace:
    return SimpleNamespace(user_id="user-1", roles=("member",), workspace_id="workspace-1")


class SpyCommandLeaseDb:
    def __init__(self, correlation_id: str | None) -> None:
        self.correlation_id = correlation_id
        self.calls: list[tuple[str, str, str, str, str, int]] = []

    async def start_agent_command(
        self,
        command_id: str,
        workspace_id: str,
        cluster_id: str,
        lease_id: str,
        agent_id: str,
        running_status: str,
        lease_seconds: int,
    ) -> str | None:
        self.calls.append((command_id, workspace_id, cluster_id, lease_id, agent_id, lease_seconds))
        return self.correlation_id

    async def heartbeat_agent_command(
        self,
        command_id: str,
        workspace_id: str,
        cluster_id: str,
        lease_id: str,
        agent_id: str,
        lease_seconds: int,
    ) -> str | None:
        self.calls.append((command_id, workspace_id, cluster_id, lease_id, agent_id, lease_seconds))
        return self.correlation_id


def test_command_request_requires_cluster_deploy_access() -> None:
    async def run() -> None:
        db = SpyAccessDb(allowed=True)
        events = SpyEvents()
        response = await commands(
            CommandRequest(cluster_id="cluster-1", action="apply_manifest"),
            current_session(),
            db,
            events,
        )

        assert response.accepted is True
        assert db.calls == [("user-1", "workspace-1", "cluster", "cluster-1", "deploy")]
        assert events.body is not None
        assert events.body.workspace_id == "workspace-1"
        assert events.body.diff.cluster_id == "cluster-1"

    asyncio.run(run())


def test_command_request_denies_without_cluster_access() -> None:
    async def run() -> None:
        db = SpyAccessDb(allowed=False)
        events = SpyEvents()
        try:
            await commands(
                CommandRequest(cluster_id="cluster-1", action="apply_manifest"),
                current_session(),
                db,
                events,
            )
        except HTTPException as exc:
            assert exc.status_code == 403
            assert exc.detail == RESOURCE_ACCESS_DENIED
        else:
            raise AssertionError("expected HTTPException")

        assert events.body is None

    asyncio.run(run())


def test_command_start_uses_trusted_agent_cluster_boundary() -> None:
    async def run() -> None:
        db = SpyCommandLeaseDb(correlation_id="corr-1")
        response = await command_start(
            "cmd-1",
            CommandStartRequest(
                workspace_id="spoofed-workspace",
                cluster_id="spoofed-cluster",
                agent_id="agent-1",
                lease_id="lease-1",
            ),
            identity=AGENT_IDENTITY,
            db=db,
        )

        assert response.accepted is True
        assert response.correlation_id == "corr-1"
        assert db.calls == [
            ("cmd-1", "trusted-workspace", "trusted-cluster", "lease-1", "agent-1", 60)
        ]

    asyncio.run(run())


def test_command_heartbeat_extends_current_lease() -> None:
    async def run() -> None:
        db = SpyCommandLeaseDb(correlation_id="corr-1")
        response = await command_heartbeat(
            "cmd-1",
            CommandHeartbeatRequest(
                workspace_id="workspace-1",
                agent_id="agent-1",
                lease_id="lease-1",
            ),
            identity=AGENT_IDENTITY,
            db=db,
        )

        assert response.accepted is True
        assert response.correlation_id == "corr-1"
        assert db.calls == [
            ("cmd-1", "trusted-workspace", "trusted-cluster", "lease-1", "agent-1", 60)
        ]

    asyncio.run(run())


def test_command_heartbeat_rejects_stale_lease() -> None:
    async def run() -> None:
        try:
            await command_heartbeat(
                "cmd-1",
                CommandHeartbeatRequest(
                    workspace_id="workspace-1",
                    agent_id="agent-1",
                    lease_id="old-lease",
                ),
                identity=AGENT_IDENTITY,
                db=SpyCommandLeaseDb(correlation_id=None),
            )
        except HTTPException as exc:
            assert exc.status_code == 404
        else:
            raise AssertionError("expected HTTPException")

    asyncio.run(run())

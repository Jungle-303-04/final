from __future__ import annotations

import asyncio
from types import SimpleNamespace

from fastapi import HTTPException

from domains.command.router import RESOURCE_ACCESS_DENIED, commands
from packages.contracts.gateway.requests import CommandRequest


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

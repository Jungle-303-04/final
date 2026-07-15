from __future__ import annotations

import asyncio
from typing import Any

from conftest import load_service

from packages.events.context import current_event_workspace


class StubDb:
    def __init__(self) -> None:
        self.swept = 0
        self.queue_ttl_seconds: int | None = None
        self.operation_events: list[tuple[str, str, str, dict[str, object]]] = []

    async def fail_expired_agent_commands(
        self, *, queue_ttl_seconds: int
    ) -> list[dict[str, object]]:
        self.swept += 1
        self.queue_ttl_seconds = queue_ttl_seconds
        return [
            {
                "command_id": "cmd-1",
                "workspace_id": "workspace-1",
                "cluster_id": "cluster-1",
                "correlation_id": "corr-original",
                "result": {
                    "status": "failed",
                    "applied": False,
                    "message": "command lease expired",
                },
            }
        ]

    async def append_command_operation_event(
        self,
        workspace_id: str,
        command_id: str,
        kind: str,
        payload: dict[str, object],
    ) -> object:
        self.operation_events.append((workspace_id, command_id, kind, payload))
        return object()


class StubEvents:
    def __init__(self) -> None:
        self.emitted: list[tuple[str, str, dict[str, Any], str | None, str | None]] = []

    async def emit(
        self,
        subject: str,
        source: str,
        payload: dict[str, Any],
        correlation_id: str | None = None,
        causation_id: str | None = None,
    ) -> None:
        self.emitted.append((subject, source, payload, correlation_id, current_event_workspace()))


class FailingRetentionDb:
    async def delete_sent_outbox_older_than(self, *args: Any, **kwargs: Any) -> int:
        raise RuntimeError("db busy")


class FailingExpiredCommandDb:
    async def fail_expired_agent_commands(self, **_kwargs: object) -> list[dict[str, object]]:
        raise RuntimeError("command table locked")


def test_command_janitor_emits_completion_for_expired_commands(monkeypatch) -> None:
    janitor = load_service("command/command-janitor")
    monkeypatch.setenv("COMMAND_QUEUE_TTL_SECONDS", "900")
    db = StubDb()
    events = StubEvents()

    count = asyncio.run(janitor.emit_expired_command_completions(db, events))

    assert count == 1
    assert db.swept == 1
    assert db.queue_ttl_seconds == 900
    assert db.operation_events == [
        (
            "workspace-1",
            "cmd-1",
            "failed",
            {
                "cluster_id": "cluster-1",
                "status": "failed",
                "result": {
                    "status": "failed",
                    "applied": False,
                    "message": "command lease expired",
                },
            },
        )
    ]
    assert events.emitted == [
        (
            "command.completed",
            "command-janitor",
            {
                "command_id": "cmd-1",
                "result": {
                    "status": "failed",
                    "applied": False,
                    "message": "command lease expired",
                },
            },
            "corr-original",
            "workspace-1",
        )
    ]


def test_command_janitor_retention_failure_does_not_stop_loop() -> None:
    janitor = load_service("command/command-janitor")

    assert asyncio.run(janitor.sweep_database_retention(FailingRetentionDb())) == 0


def test_command_janitor_command_lock_failure_does_not_stop_loop() -> None:
    janitor = load_service("command/command-janitor")

    assert (
        asyncio.run(
            janitor.emit_expired_command_completions(
                FailingExpiredCommandDb(),
                StubEvents(),
            )
        )
        == 0
    )

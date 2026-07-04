from __future__ import annotations

import asyncio
from typing import Any

from conftest import load_service


class FakeDb:
    def __init__(self) -> None:
        self.swept = 0

    async def fail_expired_agent_commands(self) -> list[dict[str, object]]:
        self.swept += 1
        return [
            {
                "command_id": "cmd-1",
                "result": {
                    "status": "failed",
                    "applied": False,
                    "message": "command lease expired",
                },
            }
        ]


class FakeEvents:
    def __init__(self) -> None:
        self.emitted: list[tuple[str, str, dict[str, Any], str | None]] = []

    async def emit(
        self,
        subject: str,
        source: str,
        payload: dict[str, Any],
        correlation_id: str | None = None,
        causation_id: str | None = None,
    ) -> None:
        self.emitted.append((subject, source, payload, correlation_id))


def test_command_janitor_emits_completion_for_expired_commands() -> None:
    janitor = load_service("command/command-janitor")
    db = FakeDb()
    events = FakeEvents()

    count = asyncio.run(janitor.emit_expired_command_completions(db, events))

    assert count == 1
    assert db.swept == 1
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
            "command-janitor:cmd-1",
        )
    ]

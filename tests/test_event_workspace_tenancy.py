"""이벤트 봉투의 신뢰 workspace 귀속과 전파 회귀."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from dataclasses import dataclass
from types import SimpleNamespace
from typing import Any

from conftest import load_service
from fastapi import Request
from sqlalchemy.dialects import postgresql

from domains.audit.repository import audit_log_row
from domains.command.repository import AgentCommandRepository
from domains.identity.dependencies import require_cluster_agent, require_session
from packages.contracts.event_bus.interfaces import EventEnvelope
from packages.events.bus import DeadLetterSink, event_causation, event_context
from packages.events.context import event_workspace
from packages.events.envelope import event
from packages.runtime.dispatch import EventContext, _collect
from packages.storage.repositories.outbox import OutboxRepository


@dataclass(frozen=True)
class _Body:
    __subject__ = "child.created"
    value: str = "ok"

    def to_body(self) -> dict[str, str]:
        return {"value": self.value}


def _envelope(*, workspace_id: str | None) -> EventEnvelope:
    return EventEnvelope(
        event_id="event-parent",
        subject="parent.created",
        source="parent-worker",
        correlation_id="corr-1",
        causation_id=None,
        created_at="2026-07-13T00:00:00+00:00",
        payload={"workspace_id": "payload-must-not-win"},
        workspace_id=workspace_id,
    )


def test_event_workspace_prefers_explicit_then_context_and_never_payload() -> None:
    with event_workspace("workspace-context"):
        explicit = event(
            "test.explicit",
            "test",
            {"workspace_id": "workspace-payload"},
            workspace_id="workspace-explicit",
        )
        contextual = event(
            "test.context",
            "test",
            {"workspace_id": "workspace-payload"},
        )

    untrusted_payload = event(
        "test.payload",
        "test",
        {"workspace_id": "workspace-payload"},
    )

    assert explicit.workspace_id == "workspace-explicit"
    assert contextual.workspace_id == "workspace-context"
    assert untrusted_payload.workspace_id is None


def test_legacy_envelope_without_workspace_is_backward_compatible() -> None:
    legacy = {
        "event_id": "event-legacy",
        "subject": "legacy.created",
        "source": "legacy",
        "correlation_id": "corr-legacy",
        "causation_id": None,
        "created_at": "2026-07-13T00:00:00+00:00",
        "payload": {},
        "schema_version": 1,
    }

    restored = EventEnvelope.from_mapping(legacy)

    assert restored.workspace_id is None
    assert restored.schema_version == 1


def test_legacy_positional_schema_version_keeps_its_original_slot() -> None:
    legacy = EventEnvelope(
        "event-positional",
        "legacy.created",
        "legacy",
        "corr-legacy",
        None,
        "2026-07-13T00:00:00+00:00",
        {},
        9,
    )

    assert legacy.schema_version == 9
    assert legacy.workspace_id is None


def test_dispatch_child_inherits_parent_workspace_and_allows_null() -> None:
    async def result() -> _Body:
        return _Body()

    inherited = asyncio.run(
        _collect("child-worker", _envelope(workspace_id="workspace-a"), result())
    )
    unowned = asyncio.run(_collect("child-worker", _envelope(workspace_id=None), result()))

    assert inherited[0].workspace_id == "workspace-a"
    assert inherited[0].causation_id == "event-parent"
    assert unowned[0].workspace_id is None


def test_event_context_preserves_workspace_for_direct_reconstruction() -> None:
    context = EventContext.of(_envelope(workspace_id="workspace-a"), object())

    assert context.workspace_id == "workspace-a"

    release_flow = load_service("projection/release-flow-worker")
    rebuilt = release_flow.envelope_from_body(_Body(), context)
    assert rebuilt.workspace_id == "workspace-a"


def test_outbox_stage_persists_workspace_and_audit_row_preserves_it() -> None:
    statements: list[Any] = []

    class Connection:
        def execute(self, statement: Any) -> None:
            statements.append(statement)

    envelope = _envelope(workspace_id="workspace-a")
    repository = object.__new__(OutboxRepository)

    repository.stage_events(Connection(), [envelope])

    compiled = statements[0].compile(dialect=postgresql.dialect())
    assert compiled.params["workspace_id"] == "workspace-a"
    assert audit_log_row(envelope)["workspace_id"] == "workspace-a"


def test_event_context_default_remains_additive() -> None:
    context = EventContext(
        event_id="event-1",
        subject="test.created",
        correlation_id="corr-1",
        causation_id=None,
        db=SimpleNamespace(),
    )

    assert context.workspace_id is None


def test_session_and_agent_authentication_seed_workspace_context() -> None:
    class Auth:
        async def require_session(self, _request: object) -> object:
            return SimpleNamespace(workspace_id="workspace-session", user_id="user-1", roles=())

    class AgentDb:
        def authenticate_cluster_agent(self, _token_hash: str) -> dict[str, str]:
            return {"workspace_id": "workspace-agent", "cluster_id": "cluster-1"}

    async def session_event() -> EventEnvelope:
        request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(auth=Auth())))
        await require_session(request)
        return event("session.created", "api-gateway", {})

    async def agent_event() -> EventEnvelope:
        request = Request(
            {
                "type": "http",
                "headers": [(b"x-agent-token", b"trusted-token")],
                "app": SimpleNamespace(state=SimpleNamespace(db=AgentDb())),
            }
        )
        identity = await require_cluster_agent(request)
        assert identity.workspace_id == "workspace-agent"
        return event("agent.created", "api-gateway", {"workspace_id": "forged"})

    assert asyncio.run(session_event()).workspace_id == "workspace-session"
    assert asyncio.run(agent_event()).workspace_id == "workspace-agent"


def test_outbox_reader_restores_workspace_for_relay() -> None:
    class Result:
        def mappings(self) -> Result:
            return self

        def all(self) -> list[dict[str, object]]:
            return [
                {
                    "id": 1,
                    "event_id": "event-1",
                    "subject": "test.created",
                    "source": "api-gateway",
                    "correlation_id": "corr-1",
                    "causation_id": None,
                    "workspace_id": "workspace-a",
                    "occurred_at": "2026-07-13T00:00:00+00:00",
                    "payload": {},
                    "schema_version": 1,
                    "lease_id": "lease-1",
                    "leased_until": None,
                    "sent_at": None,
                }
            ]

    class Connection:
        async def execute(self, _statement: Any) -> Result:
            return Result()

    @asynccontextmanager
    async def connection():
        yield Connection()

    repository = object.__new__(OutboxRepository)
    repository.async_connection = connection  # type: ignore[method-assign]

    restored = asyncio.run(repository.unsent_events(1, None))

    assert restored[0].workspace_id == "workspace-a"


def test_command_completion_uses_authoritative_workspace_for_manual_outbox() -> None:
    statements: list[Any] = []

    class Result:
        def __init__(
            self,
            row: dict[str, object] | None = None,
            scalar: int | None = None,
        ) -> None:
            self.row = row
            self.scalar = scalar

        def mappings(self) -> Result:
            return self

        def first(self) -> dict[str, object] | None:
            return self.row

        def one(self) -> dict[str, object]:
            assert self.row is not None
            return self.row

        def scalar_one_or_none(self) -> int | None:
            return self.scalar

    class Connection:
        async def execute(self, statement: Any) -> Result:
            statements.append(statement)
            if len(statements) == 1:
                return Result({"correlation_id": "corr-1"})
            if len(statements) == 3:
                return Result(scalar=1)
            if len(statements) == 4:
                return Result(
                    {
                        "command_id": "command-1",
                        "sequence": 1,
                        "kind": "completed",
                        "payload": {"cluster_id": "cluster-1", "status": "completed"},
                        "occurred_at": "2026-07-16T00:00:00+00:00",
                    }
                )
            return Result()

    class Begin:
        async def __aenter__(self) -> Connection:
            return Connection()

        async def __aexit__(self, *_args: object) -> None:
            return None

    repository = object.__new__(AgentCommandRepository)
    repository.async_engine = SimpleNamespace(begin=lambda: Begin())

    completed = asyncio.run(
        repository.complete_agent_command_and_stage_event(
            "command-1",
            "workspace-authority",
            "cluster-1",
            {"status": "completed", "applied": True},
            "lease-1",
            "agent-1",
            "api-gateway",
        )
    )

    assert completed is not None
    assert completed.event.workspace_id == "workspace-authority"
    assert completed.operation_event is not None
    assert completed.operation_event.command_id == "command-1"
    assert completed.operation_event.sequence == 1
    assert completed.operation_event.kind == "completed"
    assert len(statements) == 7

    compiled = [statement.compile(dialect=postgresql.dialect()) for statement in statements]
    # Command completion, cursor/event, terminal marker, and outbox all use the authority.
    for statement in (compiled[0], compiled[1], compiled[2], compiled[3], compiled[4], compiled[6]):
        assert "workspace-authority" in statement.params.values()

    outbox = compiled[6]
    assert outbox.params["workspace_id"] == "workspace-authority"


def test_dead_letter_child_inherits_failed_event_workspace() -> None:
    class Events:
        async def emit(
            self,
            subject: str,
            source: str,
            payload: dict[str, Any],
            correlation_id: str | None = None,
            causation_id: str | None = None,
        ) -> EventEnvelope:
            return event(subject, source, payload, correlation_id, causation_id)

    class Store:
        def record_dead_letter(
            self,
            evt: EventEnvelope,
            consumer: str,
            error: str,
            attempts: int,
        ) -> dict[str, object]:
            return {
                "dead_letter_id": 1,
                "original_event_id": evt.event_id,
                "original_subject": evt.subject,
                "consumer": consumer,
                "correlation_id": evt.correlation_id,
                "attempts": attempts,
                "error": error,
                "created_at": "2026-07-13T00:00:00+00:00",
                "status": "open",
            }

    captured = asyncio.run(
        DeadLetterSink(Events(), Store(), "runtime").capture(
            _envelope(workspace_id="workspace-a"),
            "consumer-1",
            RuntimeError("failed"),
            3,
        )
    )

    assert captured.workspace_id == "workspace-a"


def test_worker_event_context_seeds_direct_emit_workspace() -> None:
    parent = _envelope(workspace_id="workspace-a")

    event_context(parent)
    with event_causation(parent.event_id):
        child = event("direct.child", "worker", {})

    assert child.workspace_id == "workspace-a"
    assert event("after.child", "worker", {}).workspace_id is None

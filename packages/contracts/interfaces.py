from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from packages.contracts.event_bus.interfaces import EventEnvelope, EventRecorder, JsonObject

CommandRecord = dict[str, Any]


@dataclass(frozen=True)
class EventProcessingRecord:
    status: str
    attempts: int


class InitializableStore(Protocol):
    def init(self) -> None: ...


class EventProcessingStore(EventRecorder, Protocol):
    def begin_event_processing(
        self, evt: EventEnvelope, consumer: str
    ) -> EventProcessingRecord: ...

    def finish_event_processing(self, evt: EventEnvelope, consumer: str) -> None: ...

    def fail_event_processing(
        self, evt: EventEnvelope, consumer: str, error: str, status: str
    ) -> None: ...


class DeadLetterStore(Protocol):
    def record_dead_letter(
        self, evt: EventEnvelope, consumer: str, error: str, attempts: int
    ) -> JsonObject: ...

    def list_dead_letters(self, limit: int) -> list[JsonObject]: ...

    def get_dead_letter(self, dead_letter_id: int) -> JsonObject | None: ...

    def mark_dead_letter_replayed(self, dead_letter_id: int, replay_event_id: str) -> None: ...


class OAuthAccountStore(Protocol):
    def save_oauth_account(self, payload: JsonObject) -> JsonObject: ...

    def latest_github_token_ref(self) -> str | None: ...


class SessionStore(Protocol):
    async def create_session(self, user_id: str, roles: list[str] | None = None) -> Any: ...

    async def get_session(self, token: str | None) -> Any | None: ...

    async def save_oauth_state(self, state: str, payload: JsonObject) -> None: ...

    async def consume_oauth_state(self, state: str | None) -> JsonObject | None: ...

    async def check_rate_limit(self, key: str) -> None: ...


class ManagementPlaneClient(Protocol):
    async def register_agent(
        self, cluster_id: str, agent_id: str, capabilities: list[str]
    ) -> None: ...

    async def ship_evidence(self, evidence: JsonObject) -> int: ...

    async def poll_command(self, cluster_id: str, timeout_seconds: int) -> CommandRecord | None: ...

    async def complete_command(self, command_id: str, result: JsonObject) -> None: ...


class OutboxReader(Protocol):
    async def unsent_events(self, limit: int) -> list[EventEnvelope]: ...

    async def mark_events_sent(self, event_ids: list[str]) -> None: ...

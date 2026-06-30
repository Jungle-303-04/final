from __future__ import annotations

from contextlib import AbstractContextManager
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

    def unit_of_work(self) -> AbstractContextManager[Any]: ...  # 트랜잭션 컨텍스트

    def stage_events(self, conn: Any, events: list[EventEnvelope]) -> None: ...  # outbox 적재


class DeadLetterStore(Protocol):
    def record_dead_letter(
        self, evt: EventEnvelope, consumer: str, error: str, attempts: int
    ) -> JsonObject: ...

    def record_raw_dead_letter(self, raw: bytes, consumer: str, error: str) -> JsonObject: ...

    def list_dead_letters(self, limit: int) -> list[JsonObject]: ...

    def get_dead_letter(self, dead_letter_id: int) -> JsonObject | None: ...

    def mark_dead_letter_replayed(self, dead_letter_id: int, replay_event_id: str) -> None: ...


class UserStore(Protocol):
    def get_user_by_email(self, email: str) -> JsonObject | None: ...

    def create_user(
        self,
        user_id: str,
        email: str,
        password_hash: str,
        display_name: str,
        status: str,
        role: str,
    ) -> JsonObject | None: ...

    def complete_email_verification(self, user_id: str) -> JsonObject | None: ...

    def approve_user(self, user_id: str, workspace_id: str) -> JsonObject | None: ...

    def get_default_workspace_id_for_user(self, user_id: str) -> str | None: ...

    def grant_resource_access(self, payload: JsonObject) -> JsonObject: ...

    def user_has_resource_access(
        self,
        user_id: str,
        workspace_id: str,
        resource_type: str,
        resource_id: str,
        action: str,
    ) -> bool: ...


class SessionStore(Protocol):
    async def create_session(
        self,
        user_id: str,
        roles: list[str] | None = None,
        workspace_id: str | None = None,
    ) -> Any: ...

    async def get_session(self, token: str | None) -> Any | None: ...

    async def delete_session(self, token: str) -> None: ...

    async def check_rate_limit(
        self,
        key: str,
        limit: int | None = None,
        window_seconds: int | None = None,
    ) -> None: ...

    async def check_escalating_rate_limit(
        self,
        key: str,
        limit: int,
        window_seconds: int,
        lock_steps_seconds: tuple[int, ...],
        strike_ttl_seconds: int,
    ) -> None: ...

    async def create_email_verification_token(self, user_id: str, email: str) -> str: ...

    async def consume_email_verification_token(self, token: str | None) -> JsonObject | None: ...


class ManagementPlaneClient(Protocol):
    async def register_agent(
        self, cluster_id: str, agent_id: str, capabilities: list[str]
    ) -> None: ...

    async def ship_evidence(self, evidence: JsonObject) -> int: ...

    async def poll_command(
        self, cluster_id: str, workspace_id: str, agent_id: str, timeout_seconds: int
    ) -> CommandRecord | None: ...

    async def start_command(
        self, command_id: str, cluster_id: str, workspace_id: str, lease_id: str, agent_id: str
    ) -> None: ...

    async def complete_command(
        self,
        command_id: str,
        workspace_id: str,
        lease_id: str,
        agent_id: str,
        result: JsonObject,
    ) -> None: ...


class OutboxReader(Protocol):
    async def unsent_events(self, limit: int, source: str) -> list[EventEnvelope]: ...

    async def mark_events_sent(self, event_ids: list[str]) -> None: ...

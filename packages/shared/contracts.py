from __future__ import annotations

from collections.abc import Awaitable, Callable, Sequence
from typing import Any, Protocol

Event = dict[str, Any]
JsonObject = dict[str, Any]
CommandRecord = dict[str, Any]
EventProcessingRecord = dict[str, Any]
EventHandler = Callable[[Event], Awaitable[None]]


class HandlesEvent(Protocol):
    async def handle(self, evt: Event) -> None: ...


class EventMessage(Protocol):
    data: bytes

    async def ack(self) -> None: ...

    async def nak(self, delay: int = 0) -> None: ...


class EventSubscription(Protocol):
    async def fetch(self, batch: int, timeout: float | None = None) -> Sequence[EventMessage]: ...


class EventPublisher(Protocol):
    async def publish(
        self,
        subject: str,
        source: str,
        payload: JsonObject,
        correlation_id: str | None = None,
    ) -> Event: ...


class EventRecorder(Protocol):
    def record_event(self, evt: Event) -> None: ...


class EventClient(Protocol):
    async def publish(
        self,
        subject: str,
        source: str,
        payload: JsonObject,
        correlation_id: str | None = None,
    ) -> Event: ...


class EventConsumerBus(EventPublisher, Protocol):
    async def connect(self) -> None: ...

    async def subscribe(self, subject: str, durable: str) -> EventSubscription: ...

    async def close(self) -> None: ...


class InitializableStore(Protocol):
    def init(self) -> None: ...


class EventProcessingStore(EventRecorder, Protocol):
    def begin_event_processing(self, evt: Event, consumer: str) -> EventProcessingRecord: ...

    def finish_event_processing(self, evt: Event, consumer: str) -> None: ...

    def fail_event_processing(self, evt: Event, consumer: str, error: str, status: str) -> None: ...


class DeadLetterStore(Protocol):
    def record_dead_letter(
        self, evt: Event, consumer: str, error: str, attempts: int
    ) -> JsonObject: ...


class OAuthAccountStore(Protocol):
    def save_oauth_account(self, payload: JsonObject) -> JsonObject: ...

    def latest_github_token_ref(self) -> str | None: ...


class SessionStore(Protocol):
    async def create_session(self, user_id: str, roles: list[str] | None = None) -> Any: ...

    async def get_session(self, token: str | None) -> Any | None: ...

    async def save_oauth_state(self, state: str, payload: JsonObject) -> None: ...

    async def consume_oauth_state(self, state: str | None) -> JsonObject | None: ...

    async def check_rate_limit(self, key: str) -> None: ...


class RepoChangeStore(Protocol):
    def save_repo_change(
        self, correlation_id: str, commit_sha: str, manifest: JsonObject
    ) -> None: ...


class AgentCommandQueue(Protocol):
    def queue_agent_command(self, correlation_id: str, plan: JsonObject, status: str) -> None: ...

    def lease_agent_command(
        self, cluster_id: str, queued_status: str, leased_status: str
    ) -> CommandRecord | None: ...

    def complete_agent_command(self, command_id: str, result: JsonObject) -> str | None: ...


class RcaStore(Protocol):
    def save_evidence(self, correlation_id: str, kind: str, payload: JsonObject) -> None: ...

    def save_rca_report(
        self, correlation_id: str, root_cause: str, action: str, payload: JsonObject
    ) -> None: ...

    def save_pull_request(
        self, correlation_id: str, pr_url: str, title: str, body: str, status: str
    ) -> None: ...


class DashboardReadModel(Protocol):
    def upsert_dashboard(self, evt: Event, status: str, summary: str) -> None: ...

    def list_dashboard(self) -> list[JsonObject]: ...


class AuditLogStore(Protocol):
    def append_audit_log(self, evt: Event) -> None: ...


class ManagementPlaneClient(Protocol):
    async def register_agent(
        self, cluster_id: str, agent_id: str, capabilities: list[str]
    ) -> None: ...

    async def ship_evidence(self, evidence: JsonObject) -> int: ...

    async def poll_command(self, cluster_id: str, timeout_seconds: int) -> CommandRecord | None: ...

    async def complete_command(self, command_id: str, result: JsonObject) -> None: ...

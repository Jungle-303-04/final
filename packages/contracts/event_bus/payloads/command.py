"""command-worker 이벤트 payload."""

from __future__ import annotations

from dataclasses import dataclass

from packages.contracts.event_bus.payloads.base import EventPayload, JsonObject
from packages.contracts.event_bus.payloads.gitops import Diff
from packages.contracts.event_bus.registry import events
from packages.contracts.event_bus.subjects import EventSubject


@events.reg(EventSubject.COMMAND_REQUESTED)
@dataclass(frozen=True)
class CommandRequestedPayload(EventPayload):
    """command.requested — 이 diff를 sandbox에 적용해 달라."""

    cluster_id: str
    action: str
    namespace: str
    reason: str
    diff: Diff
    requested_by: str | None = None


@dataclass(frozen=True)
class Plan(EventPayload):
    """에이전트가 실행할 명령 계획(값 객체)."""

    command_id: str
    cluster_id: str
    action: str
    namespace: str
    steps: list[str]


@dataclass(frozen=True)
class Route(EventPayload):
    """명령을 보낼 경로(채널/클러스터, 값 객체)."""

    channel: str
    cluster_id: str


@events.reg(EventSubject.COMMAND_DISPATCH_READY)
@dataclass(frozen=True)
class CommandDispatchReadyPayload(EventPayload):
    """command.dispatch.ready — 정책 통과, 실행 계획 수립."""

    plan: Plan


@events.reg(EventSubject.COMMAND_DISPATCHED)
@dataclass(frozen=True)
class CommandDispatchedPayload(EventPayload):
    """command.dispatched — 대상 클러스터로 라우팅했다."""

    plan: Plan
    route: Route


@events.reg(EventSubject.COMMAND_QUEUED_FOR_AGENT)
@dataclass(frozen=True)
class CommandQueuedForAgentPayload(EventPayload):
    """command.queued_for_agent — 에이전트 폴링 큐에 적재."""

    command_id: str
    cluster_id: str


@events.reg(EventSubject.COMMAND_REJECTED)
@dataclass(frozen=True)
class CommandRejectedPayload(EventPayload):
    """command.rejected — 정책 위반으로 거부(원요청 첨부)."""

    reason: str
    requested: JsonObject

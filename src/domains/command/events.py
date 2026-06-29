"""command-worker 이벤트 body."""

from __future__ import annotations

from dataclasses import dataclass

from domains.gitops.events import Diff
from packages.contracts.event_bus.bodies.base import EventBody, JsonObject
from packages.contracts.event_bus.registry import event
from packages.contracts.event_bus.subjects import EventSubject


@event(EventSubject.COMMAND_REQUESTED)
@dataclass(frozen=True)
class CommandRequestedBody(EventBody):
    """command.requested — 이 diff를 sandbox에 적용해 달라."""

    cluster_id: str
    action: str
    namespace: str
    reason: str
    diff: Diff
    requested_by: str | None = None
    actor: JsonObject | None = None


@dataclass(frozen=True)
class Plan(EventBody):
    """에이전트가 실행할 명령 계획(값 객체)."""

    command_id: str
    idempotency_key: str
    cluster_id: str
    action: str
    namespace: str
    steps: list[str]


@dataclass(frozen=True)
class Route(EventBody):
    """명령을 보낼 경로(채널/클러스터, 값 객체)."""

    channel: str
    cluster_id: str


@event(EventSubject.COMMAND_DISPATCH_READY)
@dataclass(frozen=True)
class CommandDispatchReadyBody(EventBody):
    """command.dispatch.ready — 정책 통과, 실행 계획 수립."""

    plan: Plan


@event(EventSubject.COMMAND_DISPATCHED)
@dataclass(frozen=True)
class CommandDispatchedBody(EventBody):
    """command.dispatched — 대상 클러스터로 라우팅했다."""

    plan: Plan
    route: Route


@event(EventSubject.COMMAND_QUEUED_FOR_AGENT)
@dataclass(frozen=True)
class CommandQueuedForAgentBody(EventBody):
    """command.queued_for_agent — 에이전트 폴링 큐에 적재."""

    command_id: str
    cluster_id: str


@event(EventSubject.COMMAND_REJECTED)
@dataclass(frozen=True)
class CommandRejectedBody(EventBody):
    """command.rejected — 정책 위반으로 거부(원요청 첨부)."""

    reason: str
    requested: JsonObject


@event(EventSubject.COMMAND_COMPLETED)
@dataclass(frozen=True)
class CommandCompletedBody(EventBody):
    """command.completed — 에이전트가 명령 실행 결과를 보고."""

    command_id: str
    result: JsonObject

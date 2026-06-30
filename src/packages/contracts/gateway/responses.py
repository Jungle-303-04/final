from __future__ import annotations

from typing import Any

from packages.contracts.gateway.base import StrictModel

JsonMap = dict[str, Any]


class HealthResponse(StrictModel):
    status: str
    service: str | None = None


class AcceptedResponse(StrictModel):
    accepted: bool
    event_id: str
    correlation_id: str


class AcceptedEventResponse(AcceptedResponse):
    event: JsonMap


class EventIdAcceptedResponse(StrictModel):
    accepted: bool
    event_id: str


class AuthSessionResponse(StrictModel):
    authenticated: bool
    user_id: str
    roles: list[str]


class EmailVerificationResponse(StrictModel):
    accepted: bool
    verification_required: bool
    email: str | None = None


class LogoutResponse(StrictModel):
    authenticated: bool


class AgentCommandPollResponse(StrictModel):
    command: JsonMap | None


class CommandStartedResponse(StrictModel):
    accepted: bool
    correlation_id: str


class DashboardResponse(StrictModel):
    cards: list[JsonMap]


class FakeTelemetryResponse(StrictModel):
    status: str
    data: Any | None = None
    telemetry: str | None = None
    path: str | None = None


class TargetInstallResponse(StrictModel):
    registered: bool
    cluster_id: str
    status: str
    applied: bool
    apply_output: str | None
    install_manifest: str


class DeadLettersResponse(StrictModel):
    dead_letters: list[JsonMap]


class DeadLetterReplayResponse(StrictModel):
    accepted: bool
    dead_letter_id: int
    replay_event: JsonMap

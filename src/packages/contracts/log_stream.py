"""Strict browser wire contract for bounded log Server-Sent Events."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import Field, RootModel, TypeAdapter, model_validator

from packages.contracts.gateway.base import StrictModel
from packages.contracts.parity import ClusterScope, ResourceRef
from packages.security.log_lines import MAX_LOG_LINE_LENGTH

LogStreamErrorCode = Literal[
    "agent_timeout",
    "agent_failed",
    "target_unavailable",
    "stream_unavailable",
]
LogStreamDiagnosticCode = Literal["no_matching_pods", "no_log_lines"]


class LogStreamRecoveryCommand(StrictModel):
    """Server-built, copy-only diagnostic command for the authorized target.

    The browser may copy this value, but never executes it.  ``cluster_id`` is
    carried separately because a local kubectl context cannot be inferred from
    an Opsia cluster identity.
    """

    kind: Literal["copy_command"] = "copy_command"
    command: str = Field(min_length=1, max_length=1024)
    cluster_id: str = Field(min_length=1, max_length=512)
    read_only: Literal[True] = True


class LogStreamDiagnostic(StrictModel):
    code: LogStreamDiagnosticCode
    recovery: LogStreamRecoveryCommand | None = None


class LogStreamConnected(StrictModel):
    type: Literal["connected"] = "connected"
    stream_id: str = Field(min_length=1, max_length=255)


class LogStreamLog(StrictModel):
    type: Literal["log"] = "log"
    id: str = Field(min_length=1, max_length=255)
    observed_at: datetime
    pod: str = Field(min_length=1, max_length=253)
    container: str = Field(min_length=1, max_length=253)
    line: str = Field(max_length=MAX_LOG_LINE_LENGTH)
    line_truncated: bool = False

    @model_validator(mode="after")
    def require_offset_observed_at(self) -> Self:
        if self.observed_at.utcoffset() is None:
            raise ValueError("log observed_at must include a UTC offset")
        return self


class LogStreamPodAdded(StrictModel):
    type: Literal["pod_added"] = "pod_added"
    pod: str = Field(min_length=1, max_length=253)


class LogStreamPodRemoved(StrictModel):
    type: Literal["pod_removed"] = "pod_removed"
    pod: str = Field(min_length=1, max_length=253)


class LogStreamEnd(StrictModel):
    type: Literal["end"] = "end"
    reason: str = Field(min_length=1, max_length=120)
    diagnostic: LogStreamDiagnostic | None = None


class LogStreamError(StrictModel):
    type: Literal["error"] = "error"
    code: LogStreamErrorCode
    retryable: bool


LogStreamEnvelope = Annotated[
    LogStreamConnected
    | LogStreamLog
    | LogStreamPodAdded
    | LogStreamPodRemoved
    | LogStreamEnd
    | LogStreamError,
    Field(discriminator="type"),
]
LogStreamEnvelopeAdapter: TypeAdapter[LogStreamEnvelope] = TypeAdapter(LogStreamEnvelope)


class LogStreamSseMessage(RootModel[LogStreamEnvelope]):
    """OpenAPI representation of one default-message SSE data payload."""


ScheduledRunPhase = Literal["pending", "running", "succeeded", "failed", "unknown"]


class ScheduledWorkloadRun(StrictModel):
    run_key: str = Field(min_length=1, max_length=255)
    resource: ResourceRef
    phase: ScheduledRunPhase
    active: bool
    scheduled_at: datetime | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    desired: int | None = Field(default=None, ge=0)
    succeeded: int | None = Field(default=None, ge=0)
    failed: int | None = Field(default=None, ge=0)
    pod_total: int = Field(ge=0)
    pod_succeeded: int = Field(ge=0)
    pod_failed: int = Field(ge=0)
    observed_at: datetime | None = None


class ScheduledWorkloadRunCatalog(StrictModel):
    scope: ClusterScope
    owner: ResourceRef
    runs: tuple[ScheduledWorkloadRun, ...]
    default_run_key: str | None = None
    complete: bool
    reason_codes: tuple[str, ...] = ()

    @model_validator(mode="after")
    def catalog_is_consistent(self) -> Self:
        keys = tuple(run.run_key for run in self.runs)
        if len(keys) != len(set(keys)):
            raise ValueError("scheduled run keys must be unique")
        if self.default_run_key is not None and self.default_run_key not in keys:
            raise ValueError("default scheduled run must belong to the catalog")
        if not self.complete and not self.reason_codes:
            raise ValueError("partial scheduled run catalog requires a reason")
        return self


def parse_log_stream_envelope(payload: object) -> LogStreamEnvelope:
    return LogStreamEnvelopeAdapter.validate_python(payload)


def encode_log_stream_sse(payload: LogStreamEnvelope) -> bytes:
    """Use only the default SSE message channel; never emit a named `error` event."""
    encoded = LogStreamEnvelopeAdapter.dump_json(payload)
    return b"data: " + encoded + b"\n\n"

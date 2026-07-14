"""Strict browser wire contract for bounded log Server-Sent Events."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import Field, RootModel, TypeAdapter, model_validator

from packages.contracts.gateway.base import StrictModel
from packages.security.log_lines import MAX_LOG_LINE_LENGTH

LogStreamErrorCode = Literal[
    "agent_timeout",
    "agent_failed",
    "target_unavailable",
    "stream_unavailable",
]


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


def parse_log_stream_envelope(payload: object) -> LogStreamEnvelope:
    return LogStreamEnvelopeAdapter.validate_python(payload)


def encode_log_stream_sse(payload: LogStreamEnvelope) -> bytes:
    """Use only the default SSE message channel; never emit a named `error` event."""
    encoded = LogStreamEnvelopeAdapter.dump_json(payload)
    return b"data: " + encoded + b"\n\n"

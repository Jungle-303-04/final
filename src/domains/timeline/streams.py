"""Canonical NDJSON/SSE encoding for timeline replay frames.

Keeping protocol validation at the server boundary prevents an adapter from
accidentally ending a truncated historical window with a successful response.
Both transports therefore expose the exact same ordered records.
"""

from __future__ import annotations

from collections.abc import Iterable

from packages.contracts.timeline import TimelineStreamFrame


class TimelineStreamProtocolError(ValueError):
    """Raised before an invalid replay can be written to a client."""


def encode_ndjson(frames: Iterable[TimelineStreamFrame]) -> str:
    """Return one strict frame per line, including its required terminal record."""
    return "\n".join(_encoded_frames(frames)) + "\n"


def encode_sse(frames: Iterable[TimelineStreamFrame]) -> str:
    """Return the same records as SSE, with cursor values as Last-Event-ID ids."""
    encoded: list[str] = []
    for frame in _validated(frames):
        data = _encode(frame)
        encoded.append(f"id: {frame.cursor}\nevent: {frame.kind}\ndata: {data}")
    return "\n\n".join(encoded) + "\n\n"


def _encoded_frames(frames: Iterable[TimelineStreamFrame]) -> tuple[str, ...]:
    return tuple(_encode(frame) for frame in _validated(frames))


def _encode(frame: TimelineStreamFrame) -> str:
    return frame.model_dump_json(exclude_defaults=True, exclude_none=True)


def _validated(frames: Iterable[TimelineStreamFrame]) -> tuple[TimelineStreamFrame, ...]:
    records = tuple(frames)
    if not records:
        raise TimelineStreamProtocolError("timeline stream requires snapshot and terminal frame")
    if records[0].kind != "snapshot":
        raise TimelineStreamProtocolError("timeline stream must begin with snapshot frame")

    terminal_indices = [index for index, frame in enumerate(records) if frame.is_terminal]
    if not terminal_indices:
        raise TimelineStreamProtocolError("timeline stream terminal frame is required")
    if len(terminal_indices) != 1 or terminal_indices[0] != len(records) - 1:
        raise TimelineStreamProtocolError("timeline stream terminal frame must be last")

    last_cursor = records[0].cursor
    for index, frame in enumerate(records[1:], start=1):
        if frame.kind == "snapshot":
            raise TimelineStreamProtocolError("timeline stream may contain one snapshot frame")
        if frame.kind == "event":
            if frame.cursor <= last_cursor:
                raise TimelineStreamProtocolError("timeline event cursor must strictly advance")
            last_cursor = frame.cursor
            continue
        if frame.cursor < last_cursor:
            raise TimelineStreamProtocolError(f"timeline frame cursor regressed at index {index}")
        last_cursor = frame.cursor
    return records

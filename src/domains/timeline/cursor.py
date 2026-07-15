"""Timeline replay cursors built on the shared signed cursor boundary.

The ledger keeps a numeric sequence internally for transactional ordering.  It
is never sent to a browser directly: the public contract only contains the
opaque ``TimelineCursor`` token issued here.
"""

from __future__ import annotations

import hashlib
import json

from domains.inventory_filter.cursor import CursorScope, FilterCursorCodec
from packages.contracts.gateway.base import StrictModel
from packages.contracts.timeline import TimelineCursor, TimelineQuery

TIMELINE_CURSOR_SURFACE = "timeline-replay"
TIMELINE_SEQUENCE_POSITION = "timeline_sequence"


class TimelineCursorBinding(StrictModel):
    """Server-resolved authority that must remain unchanged during replay."""

    user_id: str
    authorization_revision: str
    query: TimelineQuery
    snapshot_revision: int = 0

    def as_filter_scope(self) -> CursorScope:
        return CursorScope(
            workspace_id=self.query.scopes[0].workspace_id,
            user_id=self.user_id,
            authorization_revision=self.authorization_revision,
            surface=TIMELINE_CURSOR_SURFACE,
            filter_fingerprint=timeline_query_fingerprint(self.query),
            snapshot_revision=self.snapshot_revision,
            facet_query=None,
        )


class TimelineReplayCursorCodec:
    """Typed facade preventing a caller from exposing a raw ledger sequence."""

    def __init__(self, codec: FilterCursorCodec) -> None:
        self._codec = codec

    def encode(self, binding: TimelineCursorBinding, *, sequence: int) -> TimelineCursor:
        if isinstance(sequence, bool) or sequence < 0:
            raise ValueError("timeline sequence must be non-negative")
        return TimelineCursor(
            token=self._codec.encode(
                binding.as_filter_scope(),
                position={TIMELINE_SEQUENCE_POSITION: sequence},
            )
        )

    def decode(self, cursor: TimelineCursor, *, binding: TimelineCursorBinding) -> int:
        decoded = self._codec.decode(cursor.token, expected=binding.as_filter_scope())
        sequence = decoded.position.get(TIMELINE_SEQUENCE_POSITION)
        if isinstance(sequence, bool) or not isinstance(sequence, int) or sequence < 0:
            raise ValueError("timeline cursor position is invalid")
        return sequence


def timeline_query_fingerprint(query: TimelineQuery) -> str:
    """Canonical query identity used by the shared user/scope-bound cursor codec."""
    encoded = json.dumps(
        query.model_dump(mode="json"),
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    )
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()

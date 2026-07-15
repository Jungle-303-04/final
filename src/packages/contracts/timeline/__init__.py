"""Versioned contracts for retained and live timeline consumers.

The contracts deliberately describe product behaviour instead of mirroring an
upstream implementation or transport-specific payload.  A browser can receive
the same frames through an initial NDJSON snapshot and a resumable SSE stream.
"""

from packages.contracts.timeline.models import (
    RealtimePolicy,
    TimelineCoverage,
    TimelineEvent,
    TimelineFilters,
    TimelineQuery,
    TimelineStreamFrame,
    TimelineWindow,
)

__all__ = [
    "RealtimePolicy",
    "TimelineCoverage",
    "TimelineEvent",
    "TimelineFilters",
    "TimelineQuery",
    "TimelineStreamFrame",
    "TimelineWindow",
]

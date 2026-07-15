"""Versioned contracts for retained and live timeline consumers.

The contracts deliberately describe product behaviour instead of mirroring an
upstream implementation or transport-specific payload.  A browser can receive
the same frames through an initial NDJSON snapshot and a resumable SSE stream.
"""

from packages.contracts.timeline.models import (
    RealtimePolicy,
    TimelineApplicationWorkflowSubject,
    TimelineCoverage,
    TimelineCursor,
    TimelineEvent,
    TimelineFilters,
    TimelineIncidentSubject,
    TimelineInventoryLocatorSubject,
    TimelineLiveSessionPolicy,
    TimelineQuery,
    TimelineReconnectPolicy,
    TimelineResourceSubject,
    TimelineSource,
    TimelineStreamFrame,
    TimelineSubject,
    TimelineWindow,
)
from packages.contracts.timeline.requests import TimelineSnapshotRequest, TimelineStreamRequest

__all__ = [
    "RealtimePolicy",
    "TimelineReconnectPolicy",
    "TimelineLiveSessionPolicy",
    "TimelineCoverage",
    "TimelineCursor",
    "TimelineEvent",
    "TimelineFilters",
    "TimelineApplicationWorkflowSubject",
    "TimelineIncidentSubject",
    "TimelineInventoryLocatorSubject",
    "TimelineQuery",
    "TimelineResourceSubject",
    "TimelineSource",
    "TimelineSnapshotRequest",
    "TimelineStreamRequest",
    "TimelineStreamFrame",
    "TimelineSubject",
    "TimelineWindow",
]

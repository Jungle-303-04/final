"""Server-owned Timeline transport policy.

Browser surfaces receive this policy in their snapshot frame and must not
invent batch, frame-rate, or retention values locally.
"""

from __future__ import annotations

from packages.config.settings import env
from packages.contracts.timeline import RealtimePolicy

TIMELINE_MAX_BATCH_EVENTS_ENV = "TIMELINE_MAX_BATCH_EVENTS"
TIMELINE_MAX_FRAMES_PER_SECOND_ENV = "TIMELINE_MAX_FRAMES_PER_SECOND"
TIMELINE_RETENTION_SECONDS_ENV = "TIMELINE_RETENTION_SECONDS"
TIMELINE_MAX_WINDOW_SECONDS_ENV = "TIMELINE_MAX_WINDOW_SECONDS"

DEFAULT_MAX_BATCH_EVENTS = 1_000
DEFAULT_MAX_FRAMES_PER_SECOND = 60
DEFAULT_RETENTION_SECONDS = 86_400
DEFAULT_MAX_WINDOW_SECONDS = 2_592_000


def timeline_realtime_policy() -> RealtimePolicy:
    """Read and validate one server policy shared by snapshot and SSE adapters."""
    return RealtimePolicy(
        max_batch_events=_positive_int(
            TIMELINE_MAX_BATCH_EVENTS_ENV,
            default=DEFAULT_MAX_BATCH_EVENTS,
            maximum=10_000,
        ),
        max_frames_per_second=_positive_int(
            TIMELINE_MAX_FRAMES_PER_SECOND_ENV,
            default=DEFAULT_MAX_FRAMES_PER_SECOND,
            maximum=60,
        ),
        retention_seconds=_positive_int(
            TIMELINE_RETENTION_SECONDS_ENV,
            default=DEFAULT_RETENTION_SECONDS,
            maximum=31_536_000,
        ),
        resume="cursor",
        hidden_tab="coalesce",
    )


def timeline_max_window_ms() -> int:
    """Return the server-side retained-history read ceiling in milliseconds."""
    return (
        _positive_int(
            TIMELINE_MAX_WINDOW_SECONDS_ENV,
            default=DEFAULT_MAX_WINDOW_SECONDS,
            maximum=31_536_000,
        )
        * 1_000
    )


def _positive_int(name: str, *, default: int, maximum: int) -> int:
    value = int(env(name, str(default)))
    if not 1 <= value <= maximum:
        raise ValueError(f"{name} must be between 1 and {maximum}")
    return value

"""Canonical Timeline facts for fully captured Kubernetes Event observations.

Inventory keeps Event resources for product reads, but Timeline reads those rows
only as persistence input to this dedicated fact contract. It never delegates an
Event to the generic inventory change mapper or infers deletion from its absence.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime

from packages.contracts.parity import ClusterScope, ResourceRef
from packages.contracts.timeline import TimelineEvent, TimelineResourceSubject

EVENT_CAPTURE_SUMMARY_KEY = "kubernetes_event_capture"
EVENT_RESOURCE_TYPE = "event"


@dataclass(frozen=True)
class KubernetesEventCapture:
    """Collection proof required before Event observations can enter Timeline."""

    complete: bool
    truncated: bool

    @property
    def authoritative(self) -> bool:
        return self.complete and not self.truncated

    @classmethod
    def from_snapshot_summary(cls, summary: Mapping[str, object]) -> KubernetesEventCapture:
        """Fail closed unless a dedicated Event collector supplied both proof bits."""
        capture = summary.get(EVENT_CAPTURE_SUMMARY_KEY)
        if not isinstance(capture, Mapping):
            return cls(complete=False, truncated=False)
        complete = capture.get("complete")
        truncated = capture.get("truncated")
        if not isinstance(complete, bool) or not isinstance(truncated, bool):
            return cls(complete=False, truncated=False)
        return cls(
            complete=complete,
            truncated=truncated,
        )


@dataclass(frozen=True)
class KubernetesEventObservation:
    """The minimal monotonic Event state safe to retain and compare."""

    uid: str
    api_version: str
    namespace: str | None
    name: str
    event_type: str
    count: int
    last_occurrence_at: datetime


def kubernetes_event_timeline_events(
    *,
    workspace_id: str,
    cluster_id: str,
    previous_rows: Sequence[Mapping[str, object]],
    current_rows: Sequence[Mapping[str, object]],
    capture: KubernetesEventCapture,
) -> tuple[TimelineEvent, ...]:
    """Emit only new monotonic Event observations from a complete capture.

    Kubernetes Events expire naturally. Their absence never denotes a delete,
    even when the capture itself is complete.
    """
    if not capture.authoritative:
        return ()
    previous = event_observations_by_uid(previous_rows)
    current = event_observations_by_uid(current_rows)
    return tuple(
        kubernetes_event_timeline_event(
            workspace_id=workspace_id,
            cluster_id=cluster_id,
            observation=observation,
        )
        for uid, observation in sorted(current.items())
        if event_observation_advanced(previous.get(uid), observation)
    )


def event_observations_by_uid(
    rows: Sequence[Mapping[str, object]],
) -> dict[str, KubernetesEventObservation]:
    """Keep the newest valid observation for each actual Kubernetes Event UID."""
    observations: dict[str, KubernetesEventObservation] = {}
    for row in rows:
        observation = kubernetes_event_observation(row)
        if observation is None:
            continue
        existing = observations.get(observation.uid)
        if existing is None or observation_sort_key(observation) > observation_sort_key(existing):
            observations[observation.uid] = observation
    return observations


def kubernetes_event_observation(
    row: Mapping[str, object],
) -> KubernetesEventObservation | None:
    """Decode persisted Event state into a fact; never map the inventory row directly."""
    if str(row.get("resource_type") or "").lower() != EVENT_RESOURCE_TYPE:
        return None
    summary = row.get("summary")
    if not isinstance(summary, Mapping):
        return None
    uid = normalized_text(summary.get("uid")) or normalized_text(row.get("uid"))
    name = normalized_text(summary.get("name")) or normalized_text(row.get("name"))
    count = positive_int(summary.get("count"))
    last_occurrence_at = event_last_occurrence(summary)
    if not uid or not name or count is None or last_occurrence_at is None:
        return None
    namespace = normalized_text(summary.get("namespace")) or nullable_text(row.get("namespace"))
    return KubernetesEventObservation(
        uid=uid,
        api_version=normalized_text(row.get("api_version")),
        namespace=namespace,
        name=name,
        event_type=normalized_text(summary.get("type")) or normalized_text(row.get("status")),
        count=count,
        last_occurrence_at=last_occurrence_at,
    )


def event_observation_advanced(
    previous: KubernetesEventObservation | None,
    current: KubernetesEventObservation,
) -> bool:
    """A count increase or later occurrence is the only allowed Event change."""
    return previous is None or (
        current.count > previous.count or current.last_occurrence_at > previous.last_occurrence_at
    )


def kubernetes_event_timeline_event(
    *,
    workspace_id: str,
    cluster_id: str,
    observation: KubernetesEventObservation,
) -> TimelineEvent:
    """Map one complete Event observation without its message, manifest, or log."""
    api_group, version = split_api_version(observation.api_version)
    resource = ResourceRef(
        api_group=api_group,
        version=version,
        kind="Event",
        namespace=observation.namespace,
        name=observation.name,
        uid=observation.uid,
    )
    source_key = kubernetes_event_source_key(observation)
    return TimelineEvent(
        event_id=source_key,
        source="kubernetes_event",
        source_key=source_key,
        native_id=observation.uid,
        activity="k8s_event",
        occurred_at=observation.last_occurrence_at,
        scope=ClusterScope(workspace_id=workspace_id, cluster_id=cluster_id),
        subject=TimelineResourceSubject(resource=resource),
        resource=resource,
        event_type="k8s_event",
        severity="warning" if observation.event_type.casefold() == "warning" else "info",
        title="Kubernetes event observed",
        metadata={
            "count": observation.count,
            "last_occurrence_at": timestamp_wire_value(observation.last_occurrence_at),
            "collection_complete": True,
            "collection_truncated": False,
        },
    )


def kubernetes_event_source_key(observation: KubernetesEventObservation) -> str:
    """Canonical idempotency key for exactly one Event count/time observation."""
    return ":".join(
        (
            "kubernetes_event",
            observation.uid,
            str(observation.count),
            timestamp_wire_value(observation.last_occurrence_at),
        )
    )


def event_last_occurrence(summary: Mapping[str, object]) -> datetime | None:
    for field in ("last_occurrence_at", "last_timestamp"):
        value = parse_timestamp(summary.get(field))
        if value is not None:
            return value
    return None


def observation_sort_key(observation: KubernetesEventObservation) -> tuple[int, datetime]:
    return observation.count, observation.last_occurrence_at


def parse_timestamp(value: object) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=UTC)


def timestamp_wire_value(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def positive_int(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value >= 1 else None
    if not isinstance(value, str):
        return None
    try:
        parsed = int(value)
    except ValueError:
        return None
    return parsed if parsed >= 1 else None


def normalized_text(value: object) -> str:
    return str(value).strip() if value is not None else ""


def nullable_text(value: object) -> str | None:
    normalized = normalized_text(value)
    return normalized or None


def split_api_version(api_version: str) -> tuple[str, str]:
    if "/" not in api_version:
        return "", api_version
    api_group, version = api_version.rsplit("/", 1)
    return api_group, version

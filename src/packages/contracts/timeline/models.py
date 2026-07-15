"""Strict, transport-neutral timeline contracts.

The model is used by retained-history reads, live subscriptions, and desktop
replay.  A client never supplies an arbitrary workspace: scopes are validated
as one authenticated workspace and then authorized by the adapter.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator, model_validator

from packages.contracts.gateway.base import StrictModel
from packages.contracts.parity import ClusterScope, ResourceRef

TimelineActivity = Literal["change", "k8s_event", "warning", "unhealthy"]
TimelineEventType = Literal[
    "add",
    "update",
    "delete",
    "k8s_event",
    "incident",
    "deployment",
    "gitops_change",
]
TimelineSeverity = Literal["info", "warning", "critical", "unknown"]
TimelineGrouping = Literal["app", "owner", "flat"]
TimelineSort = Literal["importance", "recent", "name"]
TimelineFrameKind = Literal[
    "snapshot",
    "event",
    "coverage",
    "resync_required",
    "end",
    "error",
]


class TimelineWindow(StrictModel):
    from_ms: int = Field(ge=0)
    to_ms: int = Field(gt=0)

    @model_validator(mode="after")
    def validate_bounds(self) -> TimelineWindow:
        if self.from_ms >= self.to_ms:
            raise ValueError("timeline window must have positive width")
        return self


class TimelineFilters(StrictModel):
    """Source-independent filters shared by list and swimlane representations."""

    activity: tuple[TimelineActivity, ...] = ()
    kinds: tuple[str, ...] = ()
    include_deleted: bool = True
    pinned_only: bool = False
    query: str = Field(default="", max_length=1_000)

    @field_validator("activity")
    @classmethod
    def canonicalize_activity(
        cls, activity: tuple[TimelineActivity, ...]
    ) -> tuple[TimelineActivity, ...]:
        return tuple(sorted(set(activity)))

    @field_validator("kinds")
    @classmethod
    def canonicalize_kinds(cls, kinds: tuple[str, ...]) -> tuple[str, ...]:
        normalized = {kind.strip() for kind in kinds if kind.strip()}
        return tuple(sorted(normalized))


class TimelineQuery(StrictModel):
    scopes: tuple[ClusterScope, ...] = Field(min_length=1, max_length=100)
    window: TimelineWindow
    filters: TimelineFilters = Field(default_factory=TimelineFilters)
    grouping: TimelineGrouping = "app"
    sort: TimelineSort = "importance"

    @model_validator(mode="after")
    def canonicalize_scopes(self) -> TimelineQuery:
        workspace_ids = {scope.workspace_id for scope in self.scopes}
        if len(workspace_ids) != 1:
            raise ValueError("timeline scopes must use same workspace")
        by_key: dict[tuple[str, str, tuple[str, ...], str], ClusterScope] = {}
        for scope in self.scopes:
            key = (scope.workspace_id, scope.cluster_id, scope.namespaces, scope.freshness)
            by_key[key] = scope
        self.scopes = tuple(
            by_key[key]
            for key in sorted(
                by_key,
                key=lambda item: (item[1], item[2], item[3]),
            )
        )
        return self


class RealtimePolicy(StrictModel):
    """Server-negotiated limits; clients must not invent refresh budgets."""

    max_batch_events: int = Field(ge=1, le=10_000)
    max_frames_per_second: int = Field(ge=1, le=60)
    retention_seconds: int = Field(ge=1, le=31_536_000)
    resume: Literal["cursor"]
    hidden_tab: Literal["coalesce"]


class TimelineCoverage(StrictModel):
    from_ms: int = Field(ge=0)
    to_ms: int = Field(gt=0)
    reason: Literal["collection_gap", "retention_boundary", "partial_scope"]

    @model_validator(mode="after")
    def validate_bounds(self) -> TimelineCoverage:
        if self.from_ms >= self.to_ms:
            raise ValueError("timeline coverage must have positive width")
        return self


class TimelineEvent(StrictModel):
    event_id: str = Field(min_length=1, max_length=512)
    cursor: int = Field(ge=1)
    occurred_at: datetime
    scope: ClusterScope
    resource: ResourceRef
    event_type: TimelineEventType
    severity: TimelineSeverity
    title: str = Field(min_length=1, max_length=1_000)
    owner: ResourceRef | None = None
    metadata: dict[str, object] = Field(default_factory=dict)


class TimelineStreamFrame(StrictModel):
    """One immutable record in NDJSON or SSE replay order."""

    kind: TimelineFrameKind
    cursor: int = Field(ge=0)
    event: TimelineEvent | None = None
    events: tuple[TimelineEvent, ...] = ()
    coverage: tuple[TimelineCoverage, ...] = ()
    reason: str | None = Field(default=None, min_length=1, max_length=500)

    @model_validator(mode="after")
    def validate_shape(self) -> TimelineStreamFrame:
        if self.kind == "snapshot":
            if self.event is not None or self.reason is not None:
                raise ValueError("snapshot frame may only carry events and coverage")
            return self
        if self.kind == "event":
            if self.event is None:
                raise ValueError("event frame requires event")
            if self.events or self.coverage or self.reason is not None:
                raise ValueError("event frame may only carry one event")
            if self.event.cursor != self.cursor:
                raise ValueError("event frame cursor must match event cursor")
            return self
        if self.kind == "coverage":
            if (
                not self.coverage
                or self.event is not None
                or self.events
                or self.reason is not None
            ):
                raise ValueError("coverage frame requires coverage only")
            return self
        if self.kind == "resync_required":
            if not self.reason or self.event is not None or self.events or self.coverage:
                raise ValueError("resync frame requires reason only")
            return self
        if self.event is not None or self.events or self.coverage:
            raise ValueError("terminal frame must not carry timeline records")
        if self.kind == "error" and not self.reason:
            raise ValueError("error frame requires reason")
        if self.kind == "end" and self.reason is not None:
            raise ValueError("terminal frame must not carry reason")
        return self

    @property
    def is_terminal(self) -> bool:
        return self.kind in {"end", "error", "resync_required"}

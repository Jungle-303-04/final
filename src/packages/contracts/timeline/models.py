"""Strict, transport-neutral timeline contracts.

The model is used by retained-history reads, live subscriptions, and desktop
replay.  A client never supplies an arbitrary workspace: scopes are validated
as one authenticated workspace and then authorized by the adapter.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator

from packages.contracts.gateway.base import StrictModel
from packages.contracts.parity import ClusterScope, ResourceRef

TimelineActivity = Literal["change", "k8s_event", "warning", "unhealthy"]
TimelineSource = Literal[
    "inventory",
    "incident",
    "application_workflow",
    "kubernetes_event",
    "gitops",
]
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
    """A requested timeline identity; freshness is derived by the gateway, not selected by clients."""

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
        by_key: dict[tuple[str, str, tuple[str, ...]], ClusterScope] = {}
        for scope in self.scopes:
            key = (scope.workspace_id, scope.cluster_id, scope.namespaces)
            # ``ClusterScope`` remains wire-compatible with common scope inputs,
            # but collection freshness is evidence output.  Gateway adapters
            # replace this deterministic placeholder with server-observed state.
            by_key[key] = scope.model_copy(update={"freshness": "live"})
        self.scopes = tuple(
            by_key[key]
            for key in sorted(
                by_key,
                key=lambda item: (item[1], item[2]),
            )
        )
        return self


class TimelineReconnectPolicy(StrictModel):
    """Server-owned retry budget for one durable Timeline subscription.

    A browser may retry an interrupted SSE response only with this policy.  The
    cursor itself remains opaque, and a client never supplies a refresh or
    reconnect cadence of its own.
    """

    min_delay_ms: int = Field(ge=100, le=60_000)
    max_delay_ms: int = Field(ge=100, le=300_000)
    strategy: Literal["full_jitter_exponential"]

    @model_validator(mode="after")
    def validate_bounds(self) -> TimelineReconnectPolicy:
        if self.min_delay_ms > self.max_delay_ms:
            raise ValueError("timeline reconnect minimum must not exceed maximum")
        return self


class TimelineLiveSessionPolicy(StrictModel):
    """Server-owned maximum lifetime for one moving live-window session.

    A live query must periodically replace both its bounded snapshot window and
    opaque cursor together.  This is not browser polling: the server declares
    when the current session is no longer authoritative for a moving window.
    """

    max_age_ms: int = Field(ge=1_000, le=300_000)
    strategy: Literal["replace_with_snapshot"]


class RealtimePolicy(StrictModel):
    """Server-negotiated limits; clients must not invent refresh budgets."""

    max_batch_events: int = Field(ge=1, le=10_000)
    max_frames_per_second: int = Field(ge=1, le=60)
    retention_seconds: int = Field(ge=1, le=31_536_000)
    resume: Literal["cursor"]
    hidden_tab: Literal["coalesce"]
    reconnect: TimelineReconnectPolicy
    live_session: TimelineLiveSessionPolicy


class TimelineCursor(StrictModel):
    """Opaque, authorization-bound resume position for one timeline query."""

    token: str = Field(min_length=1, max_length=8_192)

    @field_validator("token")
    @classmethod
    def reject_non_opaque_token(cls, token: str) -> str:
        if token != token.strip() or any(character.isspace() for character in token):
            raise ValueError("timeline cursor token must be opaque")
        return token


class TimelineCoverage(StrictModel):
    scope: ClusterScope
    source: TimelineSource
    from_ms: int = Field(ge=0)
    to_ms: int = Field(gt=0)
    reason: Literal["collection_gap", "retention_boundary", "partial_scope"]

    @model_validator(mode="after")
    def validate_bounds(self) -> TimelineCoverage:
        if self.from_ms >= self.to_ms:
            raise ValueError("timeline coverage must have positive width")
        return self


class TimelineResourceSubject(StrictModel):
    """A subject backed by an inventory record that has a real Kubernetes UID."""

    kind: Literal["resource"] = "resource"
    resource: ResourceRef


class TimelineInventoryLocatorSubject(StrictModel):
    """Inventory evidence without a UID; it must not masquerade as a ResourceRef."""

    kind: Literal["inventory_locator"] = "inventory_locator"
    inventory_key: str = Field(min_length=1, max_length=512)
    api_group: str = ""
    version: str = ""
    resource_kind: str = Field(min_length=1, max_length=253)
    namespace: str | None = Field(default=None, max_length=253)
    name: str = Field(min_length=1, max_length=253)


class TimelineIncidentSubject(StrictModel):
    """An RCA incident can optionally relate to a resource, but is never one itself."""

    kind: Literal["incident"] = "incident"
    incident_id: str = Field(min_length=1, max_length=512)
    correlation_id: str | None = Field(default=None, min_length=1, max_length=512)


class TimelineApplicationWorkflowSubject(StrictModel):
    """A deployment workflow identity independent from an inventory resource UID."""

    kind: Literal["application_workflow"] = "application_workflow"
    application_id: str = Field(min_length=1, max_length=512)
    binding_id: str = Field(min_length=1, max_length=512)
    workflow_run_id: str = Field(min_length=1, max_length=512)


TimelineSubject = Annotated[
    TimelineResourceSubject
    | TimelineInventoryLocatorSubject
    | TimelineIncidentSubject
    | TimelineApplicationWorkflowSubject,
    Field(discriminator="kind"),
]


class TimelineEvent(StrictModel):
    event_id: str = Field(min_length=1, max_length=512)
    source: TimelineSource
    source_key: str = Field(min_length=1, max_length=1_024)
    native_id: str = Field(min_length=1, max_length=1_024)
    activity: TimelineActivity
    occurred_at: datetime
    scope: ClusterScope
    subject: TimelineSubject
    resource: ResourceRef | None = None
    event_type: TimelineEventType
    severity: TimelineSeverity
    title: str = Field(min_length=1, max_length=1_000)
    owner: ResourceRef | None = None
    metadata: dict[str, object] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_exact_resource_relation(self) -> TimelineEvent:
        if self.source in {"application_workflow", "gitops"} and not isinstance(
            self.subject, TimelineApplicationWorkflowSubject
        ):
            raise ValueError("application timeline source requires an application workflow subject")
        if isinstance(self.subject, TimelineResourceSubject):
            if self.resource is None:
                raise ValueError("resource subject requires an exact resource relation")
            if self.resource != self.subject.resource:
                raise ValueError("resource subject relation must match its exact resource")
        if isinstance(self.subject, TimelineInventoryLocatorSubject) and self.resource is not None:
            raise ValueError("uid-less inventory subject cannot carry a resource relation")
        return self


class TimelineStreamFrame(StrictModel):
    """One immutable record in NDJSON or SSE replay order."""

    kind: TimelineFrameKind
    cursor: TimelineCursor
    scopes: tuple[ClusterScope, ...] = ()
    policy: RealtimePolicy | None = None
    event: TimelineEvent | None = None
    events: tuple[TimelineEvent, ...] = ()
    coverage: tuple[TimelineCoverage, ...] = ()
    reason: str | None = Field(default=None, min_length=1, max_length=500)

    @model_validator(mode="after")
    def validate_shape(self) -> TimelineStreamFrame:
        if self.kind == "snapshot":
            if not self.scopes:
                raise ValueError("snapshot frame requires scopes")
            if self.policy is None:
                raise ValueError("snapshot frame requires policy")
            if self.event is not None or self.reason is not None:
                raise ValueError(
                    "snapshot frame may only carry scopes, policy, events, and coverage"
                )
            return self
        if self.kind == "event":
            if self.event is None:
                raise ValueError("event frame requires event")
            if (
                self.scopes
                or self.policy is not None
                or self.events
                or self.coverage
                or self.reason is not None
            ):
                raise ValueError("event frame may only carry one event")
            return self
        if self.kind == "coverage":
            if (
                not self.coverage
                or self.scopes
                or self.policy is not None
                or self.event is not None
                or self.events
                or self.reason is not None
            ):
                raise ValueError("coverage frame requires coverage only")
            return self
        if self.kind == "resync_required":
            if (
                not self.reason
                or self.scopes
                or self.policy is not None
                or self.event is not None
                or self.events
                or self.coverage
            ):
                raise ValueError("resync frame requires reason only")
            return self
        if (
            self.scopes
            or self.policy is not None
            or self.event is not None
            or self.events
            or self.coverage
        ):
            raise ValueError("terminal frame must not carry timeline records")
        if self.kind == "error" and not self.reason:
            raise ValueError("error frame requires reason")
        if self.kind == "end" and self.reason is not None:
            raise ValueError("terminal frame must not carry reason")
        return self

    @property
    def is_terminal(self) -> bool:
        return self.kind in {"end", "error", "resync_required"}

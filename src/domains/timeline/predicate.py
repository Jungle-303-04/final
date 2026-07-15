"""One canonical evidence predicate for Timeline snapshots and live replay.

The durable ledger is the source of truth for timeline membership.  This
module keeps its Python guard and PostgreSQL predicate side by side so router
fan-out never exposes an event that the retained read would reject.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any, Literal

from sqlalchemy import and_, false, func, or_

from domains.timeline.cursor import TimelineReplayIdentity
from packages.contracts.parity import ClusterScope
from packages.contracts.timeline import (
    TimelineApplicationWorkflowSubject,
    TimelineEvent,
    TimelineFilters,
    TimelineInventoryLocatorSubject,
    TimelineResourceSubject,
    TimelineWindow,
)


class TimelineEvidencePredicate:
    """Authorized scope plus server-owned durable evidence selection."""

    def __init__(
        self,
        *,
        read_scope: Any,
        replay_identity: TimelineReplayIdentity,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        self.read_scope = read_scope
        self.replay_identity = replay_identity
        self._now = now or (lambda: datetime.now(UTC))

    @classmethod
    def from_query(
        cls,
        read_scope: Any,
        query: Any,
        *,
        now: Callable[[], datetime] | None = None,
    ) -> TimelineEvidencePredicate:
        return cls(
            read_scope=read_scope,
            replay_identity=TimelineReplayIdentity.from_query(query),
            now=now,
        )

    def matches_snapshot(self, event: TimelineEvent) -> bool:
        """Fail closed unless one durable event matches every evidence boundary."""
        return (
            _scope_matches(event, self.read_scope.scopes)
            and _source_is_authorized(event, self.read_scope)
            and _is_within_snapshot_window(event, self.replay_identity)
            and _matches_filters(event, self.replay_identity)
        )

    def matches_stream(self, event: TimelineEvent) -> bool:
        """Apply the live or frozen stream window without changing filters."""
        return (
            _scope_matches(event, self.read_scope.scopes)
            and _source_is_authorized(event, self.read_scope)
            and _is_within_stream_window(event, self.replay_identity, self._now())
            and _matches_filters(event, self.replay_identity)
        )

    def matches(self, event: TimelineEvent) -> bool:
        """Compatibility alias for retained snapshot membership."""
        return self.matches_snapshot(event)

    def with_filters(self, filters: TimelineFilters) -> TimelineEvidencePredicate:
        """Reuse scope/RBAC/window while independently aggregating one facet axis."""
        return TimelineEvidencePredicate(
            read_scope=self.read_scope,
            replay_identity=self.replay_identity.model_copy(
                update={
                    "filters": self.replay_identity.filters.model_copy(
                        update={
                            "activity": filters.activity,
                            "kinds": filters.kinds,
                            "include_deleted": filters.include_deleted,
                            "search": filters.query.strip(),
                        }
                    )
                }
            ),
            now=self._now,
        )

    def after_frozen_window(self) -> TimelineEvidencePredicate | None:
        """Count later facts without relaxing the current scope, grants, or filters."""
        identity = self.replay_identity
        if identity.mode != "frozen":
            return None
        return TimelineEvidencePredicate(
            read_scope=self.read_scope,
            replay_identity=identity.model_copy(
                update={
                    # ``stream`` membership of a live identity uses this lower
                    # bound and PostgreSQL's clock; its synthetic upper bound is
                    # intentionally never observed in that branch.
                    "window": TimelineWindow(
                        from_ms=identity.window.to_ms,
                        to_ms=identity.window.to_ms + 1,
                    ),
                    "mode": "live",
                }
            ),
            now=self._now,
        )


def timeline_evidence_sql_predicate(
    ledger: Any,
    predicate: TimelineEvidencePredicate,
    *,
    phase: Literal["snapshot", "stream"],
) -> Any:
    """Build the SQL equivalent of the retained or stream membership predicate."""
    identity = predicate.replay_identity
    filters = identity.filters
    conditions: list[Any] = [
        _scope_sql_predicate(ledger, predicate.read_scope.scopes),
        _source_authorization_sql_predicate(ledger, predicate.read_scope),
        ledger.c.occurred_at >= _from_datetime(identity.window.from_ms),
    ]
    if phase == "snapshot" or identity.mode == "frozen":
        conditions.append(ledger.c.occurred_at < _from_datetime(identity.window.to_ms))
    else:
        # A live session advances after its snapshot. PostgreSQL's own clock
        # is the authority that rejects future-dated source facts.
        conditions.append(ledger.c.occurred_at <= func.now())
    if filters.activity:
        conditions.append(ledger.c.activity.in_(filters.activity))
    if filters.kinds:
        conditions.append(_resource_kind_sql(ledger).in_(filters.kinds))
    if not filters.include_deleted:
        conditions.append(ledger.c.event_type != "delete")
    if filters.search:
        pattern = _escaped_contains_pattern(filters.search)
        conditions.append(
            or_(*(column.ilike(pattern, escape="\\") for column in _search_columns(ledger)))
        )
    return and_(*conditions)


def _scope_matches(event: TimelineEvent, scopes: tuple[ClusterScope, ...]) -> bool:
    namespace = _event_namespace(event)
    return any(
        event.scope.workspace_id == scope.workspace_id
        and event.scope.cluster_id == scope.cluster_id
        and (not scope.namespaces or namespace in scope.namespaces)
        for scope in scopes
    )


def _source_is_authorized(event: TimelineEvent, read_scope: Any) -> bool:
    if event.source == "inventory":
        return event.scope.cluster_id in read_scope.inventory_cluster_ids
    if event.source == "kubernetes_event":
        return event.scope.cluster_id in read_scope.kubernetes_event_cluster_ids
    if event.source == "incident":
        return event.scope.cluster_id in read_scope.incident_cluster_ids
    if event.source == "application_workflow":
        return isinstance(event.subject, TimelineApplicationWorkflowSubject) and (
            event.subject.application_id in read_scope.application_workflow_ids
        )
    if event.source == "gitops":
        return isinstance(event.subject, TimelineApplicationWorkflowSubject) and (
            event.subject.application_id in read_scope.gitops_application_ids
        )
    return False


def _is_within_snapshot_window(event: TimelineEvent, identity: TimelineReplayIdentity) -> bool:
    occurred_at = event.occurred_at
    if occurred_at.tzinfo is None:
        return False
    return (
        _from_datetime(identity.window.from_ms)
        <= occurred_at
        < _from_datetime(identity.window.to_ms)
    )


def _is_within_stream_window(
    event: TimelineEvent,
    identity: TimelineReplayIdentity,
    now: datetime,
) -> bool:
    occurred_at = event.occurred_at
    if occurred_at.tzinfo is None or occurred_at < _from_datetime(identity.window.from_ms):
        return False
    if identity.mode == "frozen":
        return occurred_at < _from_datetime(identity.window.to_ms)
    return occurred_at <= now


def _matches_filters(event: TimelineEvent, identity: TimelineReplayIdentity) -> bool:
    filters = identity.filters
    if filters.activity and event.activity not in filters.activity:
        return False
    if filters.kinds and _resource_kind(event) not in filters.kinds:
        return False
    if not filters.include_deleted and event.event_type == "delete":
        return False
    return not filters.search or _search_matches(event, filters.search)


def _resource_kind(event: TimelineEvent) -> str | None:
    if event.resource is not None:
        return event.resource.kind
    if isinstance(event.subject, TimelineResourceSubject):
        return event.subject.resource.kind
    if isinstance(event.subject, TimelineInventoryLocatorSubject):
        return event.subject.resource_kind
    return None


def _event_namespace(event: TimelineEvent) -> str | None:
    if event.resource is not None:
        return event.resource.namespace
    if isinstance(event.subject, TimelineResourceSubject):
        return event.subject.resource.namespace
    if isinstance(event.subject, TimelineInventoryLocatorSubject):
        return event.subject.namespace
    return None


def _search_matches(event: TimelineEvent, search: str) -> bool:
    needle = search.casefold()
    return any(needle in value.casefold() for value in _search_values(event))


def _search_values(event: TimelineEvent) -> tuple[str, ...]:
    values = [event.event_id, event.source_key, event.native_id, event.title]
    if event.resource is not None:
        values.extend((event.resource.kind, event.resource.name, event.resource.uid))
    subject = event.subject
    if isinstance(subject, TimelineResourceSubject):
        values.extend((subject.resource.kind, subject.resource.name, subject.resource.uid))
    elif isinstance(subject, TimelineInventoryLocatorSubject):
        values.extend((subject.resource_kind, subject.name, subject.inventory_key))
    elif isinstance(subject, TimelineApplicationWorkflowSubject):
        values.extend((subject.application_id, subject.binding_id, subject.workflow_run_id))
    else:
        values.append(subject.incident_id)
        if subject.correlation_id is not None:
            values.append(subject.correlation_id)
    return tuple(values)


def _scope_sql_predicate(ledger: Any, scopes: tuple[ClusterScope, ...]) -> Any:
    predicates: list[Any] = []
    for scope in scopes:
        predicate = ledger.c.cluster_id == scope.cluster_id
        if scope.namespaces:
            predicate = and_(predicate, ledger.c.namespace.in_(scope.namespaces))
        predicates.append(predicate)
    return or_(*predicates)


def _source_authorization_sql_predicate(ledger: Any, read_scope: Any) -> Any:
    predicates: list[Any] = []
    if read_scope.inventory_cluster_ids:
        predicates.append(
            and_(
                ledger.c.source == "inventory",
                ledger.c.cluster_id.in_(tuple(sorted(read_scope.inventory_cluster_ids))),
            )
        )
    if read_scope.kubernetes_event_cluster_ids:
        predicates.append(
            and_(
                ledger.c.source == "kubernetes_event",
                ledger.c.cluster_id.in_(tuple(sorted(read_scope.kubernetes_event_cluster_ids))),
            )
        )
    if read_scope.incident_cluster_ids:
        predicates.append(
            and_(
                ledger.c.source == "incident",
                ledger.c.cluster_id.in_(tuple(sorted(read_scope.incident_cluster_ids))),
            )
        )
    if read_scope.application_workflow_ids:
        predicates.append(
            and_(
                ledger.c.source == "application_workflow",
                ledger.c.subject["application_id"].astext.in_(
                    tuple(sorted(read_scope.application_workflow_ids))
                ),
            )
        )
    if read_scope.gitops_application_ids:
        predicates.append(
            and_(
                ledger.c.source == "gitops",
                ledger.c.subject["application_id"].astext.in_(
                    tuple(sorted(read_scope.gitops_application_ids))
                ),
            )
        )
    return or_(*predicates) if predicates else false()


def timeline_resource_kind_sql(ledger: Any) -> Any:
    return func.coalesce(
        ledger.c.resource["kind"].astext,
        ledger.c.subject["resource"]["kind"].astext,
        ledger.c.subject["resource_kind"].astext,
    )


def _resource_kind_sql(ledger: Any) -> Any:
    """Compatibility alias for source-local predicate construction."""
    return timeline_resource_kind_sql(ledger)


def _search_columns(ledger: Any) -> tuple[Any, ...]:
    return (
        ledger.c.event_id,
        ledger.c.source_key,
        ledger.c.native_id,
        ledger.c.title,
        ledger.c.resource["kind"].astext,
        ledger.c.resource["name"].astext,
        ledger.c.resource["uid"].astext,
        ledger.c.subject["resource"]["kind"].astext,
        ledger.c.subject["resource"]["name"].astext,
        ledger.c.subject["resource"]["uid"].astext,
        ledger.c.subject["resource_kind"].astext,
        ledger.c.subject["name"].astext,
        ledger.c.subject["inventory_key"].astext,
        ledger.c.subject["application_id"].astext,
        ledger.c.subject["binding_id"].astext,
        ledger.c.subject["workflow_run_id"].astext,
        ledger.c.subject["incident_id"].astext,
        ledger.c.subject["correlation_id"].astext,
    )


def _escaped_contains_pattern(search: str) -> str:
    escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _from_datetime(milliseconds: int) -> datetime:
    return datetime.fromtimestamp(milliseconds / 1_000, tz=UTC)

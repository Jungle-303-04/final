"""Append-only timeline ledger repository.

PostgreSQL is the replay authority.  A later broker integration receives only
facts returned after this repository's transaction has committed.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal, Protocol

from sqlalchemy import and_, false, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from domains.timeline.models import TimelineLedgerCursor, TimelineLedgerEvent
from packages.contracts.parity import ClusterScope
from packages.contracts.timeline import RealtimePolicy, TimelineEvent, TimelineWindow
from packages.storage.engine import DatabaseConnection

TimelineReplayStatus = Literal["available", "resync_required"]
TimelineResyncReason = Literal["retention_boundary"]
MAX_TIMELINE_EVENTS = 10_000


class TimelineSnapshotLimitExceeded(ValueError):
    """A snapshot cannot be represented safely within the negotiated event limit."""

    def __init__(self, limit: int) -> None:
        self.limit = limit
        super().__init__(f"timeline snapshot limit exceeded ({limit}); narrow the window")


@dataclass(frozen=True)
class TimelineLedgerReadScope:
    """An already-authorized read boundary; HTTP authorization is intentionally external.

    Every source has an independent grant set.  Empty sets are deny-by-default
    rather than a fallback to the selected cluster scope.
    """

    workspace_id: str
    scopes: tuple[ClusterScope, ...]
    inventory_cluster_ids: frozenset[str] = frozenset()
    kubernetes_event_cluster_ids: frozenset[str] = frozenset()
    incident_cluster_ids: frozenset[str] = frozenset()
    application_workflow_ids: frozenset[str] = frozenset()
    gitops_application_ids: frozenset[str] = frozenset()

    def __post_init__(self) -> None:
        if not self.workspace_id:
            raise ValueError("timeline ledger scope requires a workspace")
        if not self.scopes:
            raise ValueError("timeline ledger scope requires at least one cluster scope")
        if any(scope.workspace_id != self.workspace_id for scope in self.scopes):
            raise ValueError("timeline ledger scopes must use the authorized workspace")
        for attribute in (
            "inventory_cluster_ids",
            "kubernetes_event_cluster_ids",
            "incident_cluster_ids",
            "application_workflow_ids",
            "gitops_application_ids",
        ):
            values = getattr(self, attribute)
            if any(not isinstance(value, str) for value in values):
                raise ValueError(f"timeline {attribute} must contain text identities")
            normalized = frozenset(value.strip() for value in values if value.strip())
            if len(normalized) != len(values):
                raise ValueError(f"timeline {attribute} must contain non-empty identities")
            object.__setattr__(self, attribute, normalized)


@dataclass(frozen=True)
class TimelineLedgerAppend:
    event: TimelineEvent
    sequence: int
    inserted: bool

    @property
    def record(self) -> TimelineLedgerRecord:
        return TimelineLedgerRecord(sequence=self.sequence, event=self.event)


@dataclass(frozen=True)
class TimelineLedgerRecord:
    """One internal replay position paired with its immutable timeline event.

    The sequence is deliberately a domain-storage value, never a transport
    field.  A gateway converts it to a user/scope-bound opaque cursor.
    """

    sequence: int
    event: TimelineEvent

    def __post_init__(self) -> None:
        if isinstance(self.sequence, bool) or self.sequence < 1:
            raise ValueError("timeline ledger record sequence must be positive")


@dataclass(frozen=True)
class TimelineLedgerSnapshot:
    records: tuple[TimelineLedgerRecord, ...]
    high_water_sequence: int
    retained_from_sequence: int

    @property
    def events(self) -> tuple[TimelineEvent, ...]:
        """Compatibility convenience; cursor issuance must use ``records``."""
        return tuple(record.event for record in self.records)


@dataclass(frozen=True)
class TimelineReplayResult:
    status: TimelineReplayStatus
    records: tuple[TimelineLedgerRecord, ...]
    high_water_sequence: int
    retained_from_sequence: int
    reason: TimelineResyncReason | None = None

    @property
    def events(self) -> tuple[TimelineEvent, ...]:
        """Compatibility convenience; cursor issuance must use ``records``."""
        return tuple(record.event for record in self.records)


class TimelinePolicyProvider(Protocol):
    """Supplies server policy; clients never choose their own stream budgets."""

    def policy_for(self, scope: TimelineLedgerReadScope) -> RealtimePolicy: ...


class TimelineEventFanout(Protocol):
    """Optional post-commit announcement boundary; no broker is implemented here."""

    def publish(self, append: TimelineLedgerAppend) -> None: ...


class TimelineLedgerRepository(DatabaseConnection):
    """Persist and replay immutable source evidence in workspace-local sequence order."""

    def append_timeline_event(self, event: TimelineEvent) -> TimelineLedgerAppend:
        """Append once by immutable ``source_key`` under a workspace cursor row lock."""
        cursor = TimelineLedgerCursor.__table__
        ledger = TimelineLedgerEvent.__table__
        workspace_id = event.scope.workspace_id
        with self.connection() as conn:
            conn.execute(
                pg_insert(cursor)
                .values(workspace_id=workspace_id, last_sequence=0, retained_from_sequence=1)
                .on_conflict_do_nothing(index_elements=[cursor.c.workspace_id])
            )
            cursor_row = (
                conn.execute(
                    select(cursor.c.last_sequence, cursor.c.retained_from_sequence)
                    .where(cursor.c.workspace_id == workspace_id)
                    .with_for_update()
                )
                .mappings()
                .one()
            )
            existing = (
                conn.execute(
                    select(ledger).where(
                        ledger.c.workspace_id == workspace_id,
                        ledger.c.source_key == event.source_key,
                    )
                )
                .mappings()
                .one_or_none()
            )
            if existing is not None:
                return TimelineLedgerAppend(
                    event=_event_from_row(existing),
                    sequence=int(existing["sequence"]),
                    inserted=False,
                )

            sequence = conn.execute(
                update(cursor)
                .where(cursor.c.workspace_id == workspace_id)
                .values(last_sequence=int(cursor_row["last_sequence"]) + 1)
                .returning(cursor.c.last_sequence)
            ).scalar_one()
            row = (
                conn.execute(
                    pg_insert(ledger)
                    .values(**_event_values(event, sequence=int(sequence)))
                    .returning(*ledger.c)
                )
                .mappings()
                .one()
            )
        return TimelineLedgerAppend(
            event=_event_from_row(row),
            sequence=int(row["sequence"]),
            inserted=True,
        )

    def snapshot_timeline_events(
        self,
        read_scope: TimelineLedgerReadScope,
        *,
        window: TimelineWindow,
        limit: int = 1_000,
    ) -> TimelineLedgerSnapshot:
        """Read one scoped history snapshot in stable evidence order."""
        _validate_requested_limit(limit)
        cursor_state = self._cursor_state(read_scope.workspace_id)
        records = self._read_records(
            read_scope,
            after_sequence=cursor_state[1] - 1,
            through_sequence=cursor_state[0],
            window=window,
            limit=limit + 1,
            replay_order=False,
        )
        if len(records) > limit:
            raise TimelineSnapshotLimitExceeded(limit)
        return TimelineLedgerSnapshot(
            records=records,
            high_water_sequence=cursor_state[0],
            retained_from_sequence=cursor_state[1],
        )

    def replay_timeline_events(
        self,
        read_scope: TimelineLedgerReadScope,
        *,
        after_sequence: int,
        limit: int = 1_000,
    ) -> TimelineReplayResult:
        """Return a scoped suffix, or an explicit resync result after retention expiry."""
        if isinstance(after_sequence, bool) or after_sequence < 0:
            raise ValueError("timeline replay sequence must be non-negative")
        _validate_requested_limit(limit)
        high_water, retained_from = self._cursor_state(read_scope.workspace_id)
        if after_sequence < retained_from - 1:
            return TimelineReplayResult(
                status="resync_required",
                records=(),
                high_water_sequence=high_water,
                retained_from_sequence=retained_from,
                reason="retention_boundary",
            )
        return TimelineReplayResult(
            status="available",
            records=self._read_records(
                read_scope,
                after_sequence=after_sequence,
                through_sequence=high_water,
                window=None,
                limit=limit,
                replay_order=True,
            ),
            high_water_sequence=high_water,
            retained_from_sequence=retained_from,
        )

    def advance_timeline_retention(self, workspace_id: str, *, retained_from_sequence: int) -> int:
        """Advance the replay boundary without rewriting any ledger event."""
        if not workspace_id or retained_from_sequence < 1:
            raise ValueError("timeline retention boundary is invalid")
        cursor = TimelineLedgerCursor.__table__
        with self.connection() as conn:
            conn.execute(
                pg_insert(cursor)
                .values(
                    workspace_id=workspace_id,
                    last_sequence=0,
                    retained_from_sequence=retained_from_sequence,
                )
                .on_conflict_do_nothing(index_elements=[cursor.c.workspace_id])
            )
            return int(
                conn.execute(
                    update(cursor)
                    .where(
                        cursor.c.workspace_id == workspace_id,
                        cursor.c.retained_from_sequence < retained_from_sequence,
                    )
                    .values(retained_from_sequence=retained_from_sequence)
                    .returning(cursor.c.retained_from_sequence)
                ).scalar_one_or_none()
                or conn.execute(
                    select(cursor.c.retained_from_sequence).where(
                        cursor.c.workspace_id == workspace_id
                    )
                ).scalar_one()
            )

    def _cursor_state(self, workspace_id: str) -> tuple[int, int]:
        cursor = TimelineLedgerCursor.__table__
        with self.connection() as conn:
            row = (
                conn.execute(
                    select(cursor.c.last_sequence, cursor.c.retained_from_sequence).where(
                        cursor.c.workspace_id == workspace_id
                    )
                )
                .mappings()
                .one_or_none()
            )
        return (
            (0, 1)
            if row is None
            else (int(row["last_sequence"]), int(row["retained_from_sequence"]))
        )

    def _read_records(
        self,
        read_scope: TimelineLedgerReadScope,
        *,
        after_sequence: int,
        through_sequence: int,
        window: TimelineWindow | None,
        limit: int,
        replay_order: bool,
    ) -> tuple[TimelineLedgerRecord, ...]:
        statement = _timeline_events_statement(
            read_scope,
            after_sequence=after_sequence,
            through_sequence=through_sequence,
            window=window,
            limit=limit,
            replay_order=replay_order,
        )
        with self.connection() as conn:
            rows = conn.execute(statement).mappings()
            return tuple(_record_from_row(row) for row in rows)


def _timeline_events_statement(
    read_scope: TimelineLedgerReadScope,
    *,
    after_sequence: int,
    through_sequence: int,
    window: TimelineWindow | None,
    limit: int,
    replay_order: bool,
) -> Any:
    """Build the one bounded SQL read used for snapshots and sequence replay."""
    if limit < 1 or limit > MAX_TIMELINE_EVENTS + 1:
        raise ValueError("timeline ledger internal limit is invalid")
    ledger = TimelineLedgerEvent.__table__
    conditions: list[Any] = [
        ledger.c.workspace_id == read_scope.workspace_id,
        ledger.c.sequence > after_sequence,
        ledger.c.sequence <= through_sequence,
        _read_scope_predicate(ledger, read_scope.scopes),
        _source_authorization_predicate(ledger, read_scope),
    ]
    if window is not None:
        conditions.extend(
            (
                ledger.c.occurred_at >= _from_datetime(window.from_ms),
                ledger.c.occurred_at < _to_datetime(window.to_ms),
            )
        )
    order_by = (
        (ledger.c.sequence.asc(),)
        if replay_order
        else (ledger.c.occurred_at.asc(), ledger.c.sequence.asc())
    )
    return select(ledger).where(and_(*conditions)).order_by(*order_by).limit(limit)


def fanout_committed_timeline_append(
    append: TimelineLedgerAppend,
    fanout: TimelineEventFanout | None = None,
) -> None:
    """Announce only from an outer transaction's after-commit callback.

    ``append_timeline_event`` may participate in a larger unit of work, so this
    function intentionally accepts an already committed append result instead
    of publishing from inside repository persistence.
    """
    if append.inserted and fanout is not None:
        fanout.publish(append)


def replay_result(
    *,
    after_sequence: int,
    retained_from_sequence: int,
    high_water_sequence: int,
    events: Iterable[TimelineLedgerRecord | TimelineEvent | tuple[int, TimelineEvent]],
) -> TimelineReplayResult:
    """Pure replay folding used by storage adapters and deterministic contract tests."""
    if after_sequence < 0 or retained_from_sequence < 1 or high_water_sequence < 0:
        raise ValueError("timeline replay bounds are invalid")
    if after_sequence < retained_from_sequence - 1:
        return TimelineReplayResult(
            status="resync_required",
            records=(),
            high_water_sequence=high_water_sequence,
            retained_from_sequence=retained_from_sequence,
            reason="retention_boundary",
        )
    ordered: list[TimelineLedgerRecord] = []
    for index, item in enumerate(events, start=1):
        if isinstance(item, TimelineLedgerRecord):
            record = item
        elif isinstance(item, tuple):
            record = TimelineLedgerRecord(sequence=item[0], event=item[1])
        else:
            record = TimelineLedgerRecord(sequence=index, event=item)
        if record.sequence > after_sequence:
            ordered.append(record)
    deduped: list[TimelineLedgerRecord] = []
    seen_source_keys: set[str] = set()
    for record in sorted(ordered, key=lambda item: item.sequence):
        if record.event.source_key not in seen_source_keys:
            seen_source_keys.add(record.event.source_key)
            deduped.append(record)
    return TimelineReplayResult(
        status="available",
        records=tuple(deduped),
        high_water_sequence=high_water_sequence,
        retained_from_sequence=retained_from_sequence,
    )


def _event_values(event: TimelineEvent, *, sequence: int) -> dict[str, object]:
    return {
        "workspace_id": event.scope.workspace_id,
        "sequence": sequence,
        "source_key": event.source_key,
        "event_id": event.event_id,
        "source": event.source,
        "native_id": event.native_id,
        "activity": event.activity,
        "cluster_id": event.scope.cluster_id,
        "namespace": _event_namespace(event),
        "freshness": event.scope.freshness,
        "event_type": event.event_type,
        "severity": event.severity,
        "title": event.title,
        "subject": event.subject.model_dump(mode="json"),
        "resource": event.resource.model_dump(mode="json") if event.resource else None,
        "owner": event.owner.model_dump(mode="json") if event.owner else None,
        "metadata": event.metadata,
        "occurred_at": event.occurred_at,
    }


def _event_namespace(event: TimelineEvent) -> str | None:
    if event.resource is not None:
        return event.resource.namespace
    subject = event.subject
    return getattr(subject, "namespace", None)


def _event_from_row(row: Any) -> TimelineEvent:
    return TimelineEvent.model_validate(
        {
            "event_id": row["event_id"],
            "source": row["source"],
            "source_key": row["source_key"],
            "native_id": row["native_id"],
            "activity": row["activity"],
            "occurred_at": row["occurred_at"],
            "scope": {
                "workspace_id": row["workspace_id"],
                "cluster_id": row["cluster_id"],
                "freshness": row["freshness"],
            },
            "subject": row["subject"],
            "resource": row["resource"],
            "event_type": row["event_type"],
            "severity": row["severity"],
            "title": row["title"],
            "owner": row["owner"],
            "metadata": row["metadata"],
        }
    )


def _record_from_row(row: Any) -> TimelineLedgerRecord:
    return TimelineLedgerRecord(sequence=int(row["sequence"]), event=_event_from_row(row))


def _read_scope_predicate(ledger: Any, scopes: Sequence[ClusterScope]) -> Any:
    predicates: list[Any] = []
    for scope in scopes:
        predicate = ledger.c.cluster_id == scope.cluster_id
        if scope.namespaces:
            predicate = and_(predicate, ledger.c.namespace.in_(scope.namespaces))
        predicates.append(predicate)
    return or_(*predicates)


def _source_authorization_predicate(ledger: Any, read_scope: TimelineLedgerReadScope) -> Any:
    """Require source-native grants in addition to requested cluster/namespace scope."""
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


def _from_datetime(milliseconds: int) -> datetime:
    return datetime.fromtimestamp(milliseconds / 1_000, tz=UTC)


def _to_datetime(milliseconds: int) -> datetime:
    return datetime.fromtimestamp(milliseconds / 1_000, tz=UTC)


def _validate_requested_limit(limit: int) -> None:
    if isinstance(limit, bool) or limit < 1 or limit > MAX_TIMELINE_EVENTS:
        raise ValueError(f"timeline ledger limit must be between 1 and {MAX_TIMELINE_EVENTS}")

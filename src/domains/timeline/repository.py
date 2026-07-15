"""Append-only timeline ledger repository.

PostgreSQL is the replay authority.  A later broker integration receives only
facts returned after this repository's transaction has committed.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal, Protocol

from sqlalchemy import and_, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from domains.timeline.models import TimelineLedgerCursor, TimelineLedgerEvent
from packages.contracts.parity import ClusterScope
from packages.contracts.timeline import RealtimePolicy, TimelineEvent, TimelineWindow
from packages.storage.engine import DatabaseConnection

TimelineReplayStatus = Literal["available", "resync_required"]
TimelineResyncReason = Literal["retention_boundary"]


@dataclass(frozen=True)
class TimelineLedgerReadScope:
    """An already-authorized read boundary; HTTP authorization is intentionally external."""

    workspace_id: str
    scopes: tuple[ClusterScope, ...]

    def __post_init__(self) -> None:
        if not self.workspace_id:
            raise ValueError("timeline ledger scope requires a workspace")
        if not self.scopes:
            raise ValueError("timeline ledger scope requires at least one cluster scope")
        if any(scope.workspace_id != self.workspace_id for scope in self.scopes):
            raise ValueError("timeline ledger scopes must use the authorized workspace")


@dataclass(frozen=True)
class TimelineLedgerAppend:
    event: TimelineEvent
    sequence: int
    inserted: bool


@dataclass(frozen=True)
class TimelineLedgerSnapshot:
    events: tuple[TimelineEvent, ...]
    high_water_sequence: int
    retained_from_sequence: int


@dataclass(frozen=True)
class TimelineReplayResult:
    status: TimelineReplayStatus
    events: tuple[TimelineEvent, ...]
    high_water_sequence: int
    retained_from_sequence: int
    reason: TimelineResyncReason | None = None


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
        cursor_state = self._cursor_state(read_scope.workspace_id)
        events = self._read_events(
            read_scope,
            after_sequence=0,
            through_sequence=cursor_state[0],
            window=window,
            limit=limit,
            replay_order=False,
        )
        return TimelineLedgerSnapshot(
            events=events,
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
        high_water, retained_from = self._cursor_state(read_scope.workspace_id)
        if after_sequence < retained_from - 1:
            return TimelineReplayResult(
                status="resync_required",
                events=(),
                high_water_sequence=high_water,
                retained_from_sequence=retained_from,
                reason="retention_boundary",
            )
        return TimelineReplayResult(
            status="available",
            events=self._read_events(
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

    def _read_events(
        self,
        read_scope: TimelineLedgerReadScope,
        *,
        after_sequence: int,
        through_sequence: int,
        window: TimelineWindow | None,
        limit: int,
        replay_order: bool,
    ) -> tuple[TimelineEvent, ...]:
        if limit < 1 or limit > 10_000:
            raise ValueError("timeline ledger limit must be between 1 and 10000")
        ledger = TimelineLedgerEvent.__table__
        conditions: list[Any] = [
            ledger.c.workspace_id == read_scope.workspace_id,
            ledger.c.sequence > after_sequence,
            ledger.c.sequence <= through_sequence,
            _read_scope_predicate(ledger, read_scope.scopes),
        ]
        if window is not None:
            conditions.extend(
                (
                    ledger.c.occurred_at >= _from_datetime(window.from_ms),
                    ledger.c.occurred_at <= _to_datetime(window.to_ms),
                )
            )
        order_by = (
            (ledger.c.sequence.asc(),)
            if replay_order
            else (ledger.c.occurred_at.asc(), ledger.c.sequence.asc())
        )
        statement = select(ledger).where(and_(*conditions)).order_by(*order_by).limit(limit)
        with self.connection() as conn:
            rows = conn.execute(statement).mappings()
            return tuple(_event_from_row(row) for row in rows)


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
    events: Iterable[TimelineEvent | tuple[int, TimelineEvent]],
) -> TimelineReplayResult:
    """Pure replay folding used by storage adapters and deterministic contract tests."""
    if after_sequence < 0 or retained_from_sequence < 1 or high_water_sequence < 0:
        raise ValueError("timeline replay bounds are invalid")
    if after_sequence < retained_from_sequence - 1:
        return TimelineReplayResult(
            status="resync_required",
            events=(),
            high_water_sequence=high_water_sequence,
            retained_from_sequence=retained_from_sequence,
            reason="retention_boundary",
        )
    ordered: list[tuple[int, TimelineEvent]] = []
    for index, item in enumerate(events, start=1):
        sequence, event = item if isinstance(item, tuple) else (index, item)
        if sequence > after_sequence:
            ordered.append((sequence, event))
    deduped: list[TimelineEvent] = []
    seen_source_keys: set[str] = set()
    for _sequence, event in sorted(ordered, key=lambda item: item[0]):
        if event.source_key not in seen_source_keys:
            seen_source_keys.add(event.source_key)
            deduped.append(event)
    return TimelineReplayResult(
        status="available",
        events=tuple(deduped),
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


def _read_scope_predicate(ledger: Any, scopes: Sequence[ClusterScope]) -> Any:
    predicates: list[Any] = []
    for scope in scopes:
        predicate = ledger.c.cluster_id == scope.cluster_id
        if scope.namespaces:
            predicate = and_(predicate, ledger.c.namespace.in_(scope.namespaces))
        predicates.append(predicate)
    return or_(*predicates)


def _from_datetime(milliseconds: int) -> datetime:
    return datetime.fromtimestamp(milliseconds / 1_000, tz=UTC)


def _to_datetime(milliseconds: int) -> datetime:
    return datetime.fromtimestamp(milliseconds / 1_000, tz=UTC)

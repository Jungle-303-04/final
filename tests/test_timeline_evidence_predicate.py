"""P0 evidence selection must agree across snapshots, replay, and live SSE."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.dialects import postgresql

from domains.inventory_filter.cursor import FilterCursorCodec
from domains.timeline.cursor import TimelineCursorBinding, TimelineReplayCursorCodec
from domains.timeline.predicate import TimelineEvidencePredicate
from domains.timeline.repository import TimelineLedgerReadScope, _timeline_events_statement
from packages.contracts.parity import ClusterScope, ResourceRef
from packages.contracts.timeline import (
    TimelineEvent,
    TimelineQuery,
    TimelineResourceSubject,
    TimelineWindow,
)


def test_evidence_predicate_keeps_only_the_same_scope_window_and_requested_filters() -> None:
    query = _query()
    predicate = TimelineEvidencePredicate.from_query(_read_scope(), query)

    assert [
        event.event_id
        for event in (
            _event("matching"),
            _event("wrong-activity", activity="warning"),
            _event("wrong-kind", resource_kind="Pod"),
            _event("deleted", event_type="delete"),
            _event("outside-window", occurred_at=datetime(1970, 1, 1, 0, 0, 2, tzinfo=UTC)),
            _event("wrong-search", title="Payments API updated", resource_name="payments-api"),
            _event("wrong-cluster", cluster_id="cluster-b"),
        )
        if predicate.matches(event)
    ] == ["matching"]


def test_replay_identity_ignores_client_grouping_sort_and_pin_preferences() -> None:
    query = _query()
    changed_presentation = query.model_copy(
        update={
            "grouping": "flat",
            "sort": "name",
            "filters": query.filters.model_copy(update={"pinned_only": True}),
        }
    )
    codec = TimelineReplayCursorCodec(
        FilterCursorCodec("timeline-evidence-predicate-test-secret!!", now=lambda: 1_000)
    )
    binding = TimelineCursorBinding.from_query(
        user_id="user-a",
        authorization_revision="revision-a",
        query=query,
    )
    cursor = codec.encode(binding, sequence=7)

    assert (
        TimelineCursorBinding.from_query(
            user_id="user-a",
            authorization_revision="revision-a",
            query=changed_presentation,
        ).replay_identity
        == binding.replay_identity
    )
    assert (
        codec.decode(
            cursor,
            binding=TimelineCursorBinding.from_query(
                user_id="user-a",
                authorization_revision="revision-a",
                query=changed_presentation,
            ),
        )
        == 7
    )


def test_repository_sql_uses_the_evidence_predicate_for_snapshot_and_replay() -> None:
    predicate = TimelineEvidencePredicate.from_query(_read_scope(), _query())
    statement = _timeline_events_statement(
        _read_scope(),
        predicate=predicate,
        after_sequence=0,
        through_sequence=12,
        phase="snapshot",
        limit=20,
        replay_order=True,
    )
    sql = " ".join(
        str(statement.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
        .casefold()
        .split()
    )

    assert "timeline_events.activity in ('change')" in sql
    assert "timeline_events.event_type != 'delete'" in sql
    assert "timeline_events.occurred_at >= '1970-01-01 00:00:01+00:00'" in sql
    assert "timeline_events.occurred_at < '1970-01-01 00:00:02+00:00'" in sql
    assert "timeline_events.resource ->> 'kind'" in sql
    assert "ilike '%%checkout%%'" in sql


def test_live_stream_advances_past_snapshot_upper_bound_but_frozen_stream_does_not() -> None:
    after_snapshot = _event(
        "live-after-snapshot",
        occurred_at=datetime(1970, 1, 1, 0, 0, 2, 500_000, tzinfo=UTC),
    )
    live = TimelineEvidencePredicate.from_query(
        _read_scope(),
        _query().model_copy(update={"filters": _query().filters.model_copy(update={"query": ""})}),
        now=lambda: datetime(1970, 1, 1, 0, 0, 3, tzinfo=UTC),
    )
    frozen = TimelineEvidencePredicate.from_query(
        _read_scope(),
        _query().model_copy(
            update={
                "mode": "frozen",
                "filters": _query().filters.model_copy(update={"query": ""}),
            }
        ),
        now=lambda: datetime(1970, 1, 1, 0, 0, 3, tzinfo=UTC),
    )

    assert live.matches_snapshot(after_snapshot) is False
    assert live.matches_stream(after_snapshot) is True
    assert frozen.matches_stream(after_snapshot) is False


def _query() -> TimelineQuery:
    return TimelineQuery(
        scopes=(ClusterScope(workspace_id="workspace-a", cluster_id="cluster-a"),),
        window=TimelineWindow(from_ms=1_000, to_ms=2_000),
        mode="live",
        filters={
            "activity": ("change",),
            "kinds": ("Deployment",),
            "include_deleted": False,
            "pinned_only": False,
            "query": "checkout",
        },
        grouping="app",
        sort="importance",
    )


def _read_scope() -> TimelineLedgerReadScope:
    return TimelineLedgerReadScope(
        workspace_id="workspace-a",
        scopes=(ClusterScope(workspace_id="workspace-a", cluster_id="cluster-a"),),
        inventory_cluster_ids=frozenset({"cluster-a"}),
    )


def _event(
    event_id: str,
    *,
    activity: str = "change",
    resource_kind: str = "Deployment",
    event_type: str = "update",
    occurred_at: datetime = datetime(1970, 1, 1, 0, 0, 1, 500_000, tzinfo=UTC),
    title: str = "Checkout deployment updated",
    cluster_id: str = "cluster-a",
    resource_name: str = "checkout",
) -> TimelineEvent:
    resource = ResourceRef(
        kind=resource_kind,
        namespace="payments",
        name=resource_name,
        uid=f"{event_id}-uid",
    )
    return TimelineEvent(
        event_id=event_id,
        source="inventory",
        source_key=f"inventory:{event_id}",
        native_id=event_id,
        activity=activity,  # type: ignore[arg-type]
        occurred_at=occurred_at,
        scope=ClusterScope(workspace_id="workspace-a", cluster_id=cluster_id),
        subject=TimelineResourceSubject(resource=resource),
        resource=resource,
        event_type=event_type,  # type: ignore[arg-type]
        severity="info",
        title=title,
    )

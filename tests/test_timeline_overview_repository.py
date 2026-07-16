"""The retained overview may aggregate evidence but must never widen its SQL boundary."""

from __future__ import annotations

from sqlalchemy import BigInteger
from sqlalchemy.dialects import postgresql

from domains.timeline.predicate import TimelineEvidencePredicate
from domains.timeline.repository import (
    TimelineLedgerReadScope,
    _timeline_overview_activity_facets_statement,
    _timeline_overview_buckets_statement,
    _timeline_overview_kind_facets_statement,
    _timeline_overview_later_count_statement,
)
from packages.contracts.parity import ClusterScope
from packages.contracts.timeline import TimelineFilters, TimelineQuery, TimelineWindow


def test_overview_aggregate_and_independent_facets_keep_scope_rbac_and_half_open_window() -> None:
    scope = TimelineLedgerReadScope(
        workspace_id="workspace-a",
        scopes=(
            ClusterScope(
                workspace_id="workspace-a",
                cluster_id="cluster-a",
                namespaces=("payments",),
            ),
        ),
        inventory_cluster_ids=frozenset({"cluster-a"}),
    )
    query = TimelineQuery(
        scopes=scope.scopes,
        window=TimelineWindow(from_ms=1_000, to_ms=2_000),
        mode="frozen",
        filters=TimelineFilters(activity=("change",), kinds=("Deployment",)),
    )
    predicate = TimelineEvidencePredicate.from_query(scope, query)
    activity_predicate = predicate.with_filters(TimelineFilters(activity=(), kinds=("Deployment",)))
    kind_predicate = predicate.with_filters(TimelineFilters(activity=("change",), kinds=()))
    later_predicate = predicate.after_frozen_window()
    assert later_predicate is not None

    bucket_sql = _sql(
        _timeline_overview_buckets_statement(scope, predicate=predicate, bucket_width_ms=1_000)
    )
    activity_sql = _sql(
        _timeline_overview_activity_facets_statement(scope, predicate=activity_predicate)
    )
    kind_sql = _sql(_timeline_overview_kind_facets_statement(scope, predicate=kind_predicate))
    later_sql = _sql(_timeline_overview_later_count_statement(scope, predicate=later_predicate))

    for sql in (bucket_sql, activity_sql, kind_sql, later_sql):
        assert "timeline_events.workspace_id = 'workspace-a'" in sql
        assert "timeline_events.cluster_id = 'cluster-a'" in sql
        assert "timeline_events.namespace in ('payments')" in sql
        assert "timeline_events.source = 'inventory'" in sql
        assert "metadata" not in sql
        assert "timeline_events.title" not in sql

    assert "timeline_events.occurred_at >= '1970-01-01 00:00:01+00:00'" in bucket_sql
    assert "timeline_events.occurred_at < '1970-01-01 00:00:02+00:00'" in bucket_sql
    assert "timeline_events.activity in ('change')" in bucket_sql
    assert "timeline_events.resource ->> 'kind'" in bucket_sql
    assert "'deployment'" in bucket_sql
    assert "problem_count" in bucket_sql

    assert "timeline_events.activity in" not in activity_sql
    assert "timeline_events.resource ->> 'kind'" in activity_sql
    assert "group by timeline_events.activity" in activity_sql

    assert "timeline_events.activity in ('change')" in kind_sql
    assert "'deployment'" not in kind_sql
    assert "coalesce(" in kind_sql

    assert "timeline_events.occurred_at >= '1970-01-01 00:00:02+00:00'" in later_sql
    assert "timeline_events.occurred_at <= now()" in later_sql
    assert "timeline_events.activity in ('change')" in later_sql
    assert "timeline_events.resource ->> 'kind'" in later_sql


def test_overview_bucket_binds_current_epoch_milliseconds_as_64_bit_integers() -> None:
    """A current Unix millisecond value must not be coerced to PostgreSQL INTEGER."""
    from_ms = 1_784_223_572_056
    scope = TimelineLedgerReadScope(
        workspace_id="workspace-a",
        scopes=(
            ClusterScope(
                workspace_id="workspace-a",
                cluster_id="cluster-a",
            ),
        ),
        inventory_cluster_ids=frozenset({"cluster-a"}),
    )
    query = TimelineQuery(
        scopes=scope.scopes,
        window=TimelineWindow(from_ms=from_ms, to_ms=from_ms + 3_600_000),
        mode="live",
    )
    statement = _timeline_overview_buckets_statement(
        scope,
        predicate=TimelineEvidencePredicate.from_query(scope, query),
        bucket_width_ms=60_000,
    )

    compiled = statement.compile(dialect=postgresql.dialect())
    epoch_bindings = {
        id(binding): binding for binding in compiled.binds.values() if binding.value == from_ms
    }

    assert epoch_bindings
    assert all(isinstance(binding.type, BigInteger) for binding in epoch_bindings.values())


def _sql(statement: object) -> str:
    return " ".join(
        str(
            statement.compile(  # type: ignore[union-attr]
                dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}
            )
        )
        .casefold()
        .split()
    )

"""Timeline P0 ledger contracts: identity, replay, and opaque resume safety."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from domains.timeline.cursor import TimelineCursorBinding, TimelineReplayCursorCodec
from domains.timeline.mapping import inventory_timeline_event
from domains.timeline.repository import TimelineReplayResult, replay_result

from domains.inventory_filter.cursor import FilterCursorCodec
from packages.contracts.parity import ClusterScope, ResourceRef
from packages.contracts.timeline import (
    TimelineEvent,
    TimelineInventoryLocatorSubject,
    TimelineQuery,
    TimelineResourceSubject,
    TimelineWindow,
)


def _query(*, cluster_id: str = "cluster-a") -> TimelineQuery:
    return TimelineQuery(
        scopes=(ClusterScope(workspace_id="workspace-a", cluster_id=cluster_id),),
        window=TimelineWindow(from_ms=1_000, to_ms=2_000),
    )


def _resource_event(source_key: str, event_id: str) -> TimelineEvent:
    resource = ResourceRef(kind="Deployment", namespace="payments", name="checkout", uid="uid-1")
    return TimelineEvent(
        event_id=event_id,
        source="inventory",
        source_key=source_key,
        native_id=f"native-{event_id}",
        activity="change",
        occurred_at=datetime(2026, 7, 15, tzinfo=UTC),
        scope=ClusterScope(workspace_id="workspace-a", cluster_id="cluster-a"),
        subject=TimelineResourceSubject(resource=resource),
        resource=resource,
        event_type="update",
        severity="info",
        title="Deployment checkout updated",
    )


def test_inventory_mapping_only_relates_a_resource_when_its_uid_is_present() -> None:
    exact = inventory_timeline_event(
        event_id="inventory-version-1",
        source_key="inventory:version-1",
        native_id="version-1",
        occurred_at=datetime(2026, 7, 15, tzinfo=UTC),
        workspace_id="workspace-a",
        cluster_id="cluster-a",
        api_version="apps/v1",
        resource_kind="Deployment",
        namespace="payments",
        name="checkout",
        uid="deployment-uid",
        title="Deployment checkout updated",
    )
    missing_uid = inventory_timeline_event(
        event_id="inventory-version-2",
        source_key="inventory:version-2",
        native_id="version-2",
        occurred_at=datetime(2026, 7, 15, tzinfo=UTC),
        workspace_id="workspace-a",
        cluster_id="cluster-a",
        api_version="v1",
        resource_kind="ConfigMap",
        namespace="payments",
        name="runtime-config",
        uid=None,
        title="ConfigMap runtime-config observed",
    )

    assert isinstance(exact.subject, TimelineResourceSubject)
    assert exact.resource == exact.subject.resource
    assert exact.resource.uid == "deployment-uid"
    assert isinstance(missing_uid.subject, TimelineInventoryLocatorSubject)
    assert missing_uid.resource is None
    assert missing_uid.subject.inventory_key == "version-2"


def test_timeline_cursor_is_bound_to_user_workspace_query_and_authorization_revision() -> None:
    codec = TimelineReplayCursorCodec(
        FilterCursorCodec("timeline-cursor-test-secret-32-bytes!!", now=lambda: 1_000)
    )
    binding = TimelineCursorBinding(
        user_id="user-a",
        authorization_revision="auth-revision-a",
        query=_query(),
        snapshot_revision=7,
    )
    cursor = codec.encode(binding, sequence=42)

    assert codec.decode(cursor, binding=binding) == 42
    with pytest.raises(ValueError, match="cursor scope changed"):
        codec.decode(
            cursor,
            binding=binding.model_copy(update={"user_id": "user-b"}),
        )
    with pytest.raises(ValueError, match="cursor scope changed"):
        codec.decode(
            cursor,
            binding=binding.model_copy(update={"query": _query(cluster_id="cluster-b")}),
        )


def test_replay_reports_resync_when_the_cursor_precedes_the_retention_boundary() -> None:
    result = replay_result(
        after_sequence=7,
        retained_from_sequence=9,
        high_water_sequence=12,
        events=(_resource_event("inventory:11", "event-11"),),
    )

    assert isinstance(result, TimelineReplayResult)
    assert result.status == "resync_required"
    assert result.reason == "retention_boundary"
    assert result.events == ()


def test_replay_records_preserve_ledger_order_and_dedupe_uses_source_key() -> None:
    earliest = _resource_event("inventory:1", "event-1")
    later = _resource_event("inventory:2", "event-2")
    duplicate = _resource_event("inventory:1", "event-1-reported-again")
    result = replay_result(
        after_sequence=0,
        retained_from_sequence=1,
        high_water_sequence=2,
        events=((2, later), (1, earliest), (3, duplicate)),
    )

    assert result.status == "available"
    assert [event.event_id for event in result.events] == ["event-1", "event-2"]

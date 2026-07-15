from __future__ import annotations

from datetime import UTC, datetime

from domains.inventory.kubernetes_events import KubernetesEventCapture
from domains.inventory.kubernetes_snapshot import kubernetes_evidence_to_inventory_snapshot
from domains.inventory.repository import inventory_timeline_events, is_timeline_inventory_resource


def event_row(
    *,
    uid: str = "event-uid-1",
    count: int = 1,
    last_occurrence_at: str = "2026-07-15T00:01:00Z",
) -> dict[str, object]:
    return {
        "inventory_key": f"inventory-{uid}",
        "resource_type": "event",
        "api_version": "v1",
        "kind": "Event",
        "namespace": "payments",
        "name": "checkout-api.18d6a1",
        "uid": uid,
        "resource_version": "7",
        "status": "Warning",
        "health": "degraded",
        "labels": {},
        "annotations": {},
        "summary": {
            "uid": uid,
            "count": count,
            "last_occurrence_at": last_occurrence_at,
            "message": "secret error detail that must never enter Timeline",
            "manifest": {"spec": {"secret": "must-not-leak"}},
        },
        "raw": {"message": "secret error detail", "metadata": {"uid": uid}},
    }


FULL_EVENT_CAPTURE = KubernetesEventCapture(complete=True, truncated=False)


def timeline_events(
    previous_rows: list[dict[str, object]],
    current_rows: list[dict[str, object]],
    *,
    capture: KubernetesEventCapture = FULL_EVENT_CAPTURE,
):
    return inventory_timeline_events(
        workspace_id="workspace-1",
        cluster_id="cluster-1",
        observed_at=datetime(2026, 7, 15, tzinfo=UTC),
        previous_rows=previous_rows,
        current_rows=current_rows,
        resources_complete=False,
        event_capture=capture,
    )


def test_full_event_capture_records_one_safe_kubernetes_event_fact() -> None:
    current = event_row()
    events = timeline_events([], [current])

    assert len(events) == 1
    assert not is_timeline_inventory_resource(current)
    event = events[0]
    assert event.source == "kubernetes_event"
    assert event.activity == "k8s_event"
    assert event.event_type == "k8s_event"
    assert event.native_id == "event-uid-1"
    assert event.resource is not None
    assert event.resource.uid == "event-uid-1"
    assert event.subject.kind == "resource"
    assert event.title == "Kubernetes event observed"
    assert event.metadata == {
        "count": 1,
        "last_occurrence_at": "2026-07-15T00:01:00Z",
        "collection_complete": True,
        "collection_truncated": False,
    }
    assert "secret" not in event.title
    assert "message" not in event.metadata
    assert "manifest" not in event.metadata
    assert "raw" not in event.metadata


def test_event_recollection_only_appends_when_count_or_last_occurrence_advances() -> None:
    original = event_row()

    same = timeline_events([original], [event_row()])
    count_advanced = timeline_events([original], [event_row(count=2)])
    time_advanced = timeline_events(
        [original],
        [event_row(last_occurrence_at="2026-07-15T00:02:00Z")],
    )
    regressed = timeline_events(
        [original],
        [event_row(count=0, last_occurrence_at="2026-07-15T00:00:00Z")],
    )

    assert same == ()
    assert len(count_advanced) == 1
    assert len(time_advanced) == 1
    assert count_advanced[0].source_key != time_advanced[0].source_key
    assert regressed == ()


def test_partial_or_truncated_event_capture_never_emits_change_or_delete() -> None:
    previous = event_row()
    partial = KubernetesEventCapture(complete=False, truncated=False)
    truncated = KubernetesEventCapture(complete=True, truncated=True)

    assert timeline_events([previous], [], capture=partial) == ()
    assert timeline_events([previous], [event_row(count=2)], capture=truncated) == ()
    assert timeline_events([previous], [], capture=FULL_EVENT_CAPTURE) == ()


def test_event_capture_requires_explicit_complete_and_truncated_proof() -> None:
    missing_truncation = KubernetesEventCapture.from_snapshot_summary(
        {"kubernetes_event_capture": {"complete": True}}
    )
    missing_completeness = KubernetesEventCapture.from_snapshot_summary(
        {"kubernetes_event_capture": {"truncated": False}}
    )

    assert not missing_truncation.authoritative
    assert not missing_completeness.authoritative


def test_existing_agent_evidence_explicitly_fails_closed_for_event_timeline() -> None:
    snapshot = kubernetes_evidence_to_inventory_snapshot(
        {
            "events": [
                {
                    "uid": "event-uid-1",
                    "name": "checkout-api.18d6a1",
                    "namespace": "payments",
                    "type": "Warning",
                    "count": 1,
                    "last_occurrence_at": "2026-07-15T00:01:00Z",
                }
            ],
            "collection_limits": {"lists": {"events": {"truncated": False}}},
        },
        cluster_id="cluster-1",
        agent_id="agent-1",
    )

    proof = snapshot["summary"]["kubernetes_event_capture"]
    assert proof == {"complete": False, "truncated": False}
    assert not KubernetesEventCapture.from_snapshot_summary(snapshot["summary"]).authoritative

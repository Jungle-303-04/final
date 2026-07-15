from __future__ import annotations

from datetime import UTC, datetime

from domains.inventory.kubernetes_events import KubernetesEventCapture, KubernetesEventFactBatch
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


CAPTURED_AT = datetime(2026, 7, 15, tzinfo=UTC)
FULL_EVENT_CAPTURE = KubernetesEventCapture(
    complete=True,
    truncated=False,
    reason="complete",
    observed_at=CAPTURED_AT,
    max_age_seconds=120,
    coverage={"scope": "all_namespaces", "pagination": "continue", "event_count": 1},
)


def event_batch(
    facts: list[dict[str, object]],
    *,
    capture: KubernetesEventCapture = FULL_EVENT_CAPTURE,
) -> KubernetesEventFactBatch:
    return KubernetesEventFactBatch.from_snapshot_summary(
        {
            "kubernetes_event_capture": {
                "complete": capture.complete,
                "truncated": capture.truncated,
                "reason": capture.reason,
                "freshness": {
                    "observed_at": capture.observed_at.isoformat().replace("+00:00", "Z")
                    if capture.observed_at
                    else None,
                    "max_age_seconds": capture.max_age_seconds,
                },
                "coverage": {
                    "scope": "all_namespaces",
                    "pagination": "continue",
                    "event_count": len(facts),
                },
            },
            "kubernetes_event_facts": facts,
        }
    )


def event_fact(
    *,
    uid: str = "event-uid-1",
    count: int = 1,
    last_occurrence_at: str = "2026-07-15T00:01:00Z",
) -> dict[str, object]:
    return {
        "uid": uid,
        "api_version": "v1",
        "namespace": "payments",
        "name": "checkout-api.18d6a1",
        "type": "Warning",
        "count": count,
        "last_occurrence_at": last_occurrence_at,
        "message": "secret error detail that must never enter Timeline",
        "manifest": {"spec": {"secret": "must-not-leak"}},
    }


def timeline_events(
    previous_facts: list[dict[str, object]],
    current_facts: list[dict[str, object]],
    *,
    capture: KubernetesEventCapture = FULL_EVENT_CAPTURE,
    observed_at: datetime = CAPTURED_AT,
):
    return inventory_timeline_events(
        workspace_id="workspace-1",
        cluster_id="cluster-1",
        observed_at=observed_at,
        previous_rows=[],
        current_rows=[],
        resources_complete=False,
        previous_event_batch=event_batch(previous_facts, capture=capture)
        if capture.authoritative
        else None,
        current_event_batch=event_batch(current_facts, capture=capture),
    )


def test_full_event_capture_records_one_safe_kubernetes_event_fact() -> None:
    current = event_row()
    events = timeline_events([], [event_fact()])

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
        "collection_reason": "complete",
        "capture_observed_at": "2026-07-15T00:00:00Z",
        "freshness_max_age_seconds": 120,
    }
    assert "secret" not in event.title
    assert "message" not in event.metadata
    assert "manifest" not in event.metadata
    assert "raw" not in event.metadata


def test_event_recollection_only_appends_when_count_or_last_occurrence_advances() -> None:
    original = event_fact()

    same = timeline_events([original], [event_fact()])
    count_advanced = timeline_events([original], [event_fact(count=2)])
    time_advanced = timeline_events(
        [original],
        [event_fact(last_occurrence_at="2026-07-15T00:02:00Z")],
    )
    regressed = timeline_events(
        [original],
        [event_fact(count=0, last_occurrence_at="2026-07-15T00:00:00Z")],
    )

    assert same == ()
    assert len(count_advanced) == 1
    assert len(time_advanced) == 1
    assert count_advanced[0].source_key != time_advanced[0].source_key
    assert regressed == ()


def test_partial_or_truncated_event_capture_never_emits_change_or_delete() -> None:
    previous = event_fact()
    partial = KubernetesEventCapture(complete=False, truncated=False)
    truncated = KubernetesEventCapture(complete=True, truncated=True)

    assert timeline_events([previous], [], capture=partial) == ()
    assert timeline_events([previous], [event_fact(count=2)], capture=truncated) == ()
    assert timeline_events([previous], [], capture=FULL_EVENT_CAPTURE) == ()


def test_stale_event_capture_never_appends() -> None:
    stale_capture = KubernetesEventCapture(
        complete=True,
        truncated=False,
        reason="complete",
        observed_at=datetime(2026, 7, 15, 0, 0, tzinfo=UTC),
        max_age_seconds=30,
        coverage={"scope": "all_namespaces", "pagination": "continue", "event_count": 1},
    )

    events = timeline_events(
        [],
        [event_fact()],
        capture=stale_capture,
        observed_at=datetime(2026, 7, 15, 0, 1, tzinfo=UTC),
    )

    assert events == ()


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
    assert proof == {
        "complete": False,
        "truncated": False,
        "reason": "not_requested",
        "freshness": {},
        "coverage": {
            "scope": "all_namespaces",
            "pagination": "continue",
            "gap": "not_requested",
        },
    }
    assert not KubernetesEventCapture.from_snapshot_summary(snapshot["summary"]).authoritative


def test_complete_cluster_wide_capture_isolated_from_scoped_inventory_and_persists_safe_facts() -> (
    None
):
    snapshot = kubernetes_evidence_to_inventory_snapshot(
        {
            "events": [
                {
                    "uid": "scoped-event",
                    "name": "scoped-event",
                    "namespace": "payments",
                    "type": "Warning",
                    "count": 3,
                    "last_occurrence_at": "2026-07-16T00:01:00Z",
                }
            ],
            "event_capture": {
                "complete": True,
                "truncated": False,
                "reason": "complete",
                "freshness": {
                    "observed_at": "2026-07-16T00:02:00Z",
                    "max_age_seconds": 120,
                },
                "coverage": {
                    "scope": "all_namespaces",
                    "pagination": "continue",
                    "page_count": 2,
                    "event_count": 1,
                    "resource_version": "rv-1",
                },
                "events": [
                    {
                        "uid": "cluster-event",
                        "api_version": "v1",
                        "name": "cluster-event",
                        "namespace": "other",
                        "type": "Warning",
                        "count": 4,
                        "last_occurrence_at": "2026-07-16T00:02:00Z",
                        "message": "must not persist in the event fact contract",
                    }
                ],
            },
        },
        cluster_id="cluster-1",
        agent_id="agent-1",
    )

    summary = snapshot["summary"]
    assert [
        resource["uid"]
        for resource in snapshot["resources"]
        if resource["resource_type"] == "event"
    ] == ["scoped-event"]
    assert summary["kubernetes_event_capture"] == {
        "complete": True,
        "truncated": False,
        "reason": "complete",
        "freshness": {
            "observed_at": "2026-07-16T00:02:00Z",
            "max_age_seconds": 120,
        },
        "coverage": {
            "scope": "all_namespaces",
            "pagination": "continue",
            "page_count": 2,
            "event_count": 1,
            "resource_version": "rv-1",
        },
    }
    assert summary["kubernetes_event_facts"] == [
        {
            "uid": "cluster-event",
            "api_version": "v1",
            "namespace": "other",
            "name": "cluster-event",
            "type": "Warning",
            "count": 4,
            "last_occurrence_at": "2026-07-16T00:02:00Z",
        }
    ]
    assert "message" not in summary["kubernetes_event_facts"][0]
    assert KubernetesEventFactBatch.from_snapshot_summary(summary).capture.authoritative


def test_incomplete_cluster_wide_capture_persists_gap_without_partial_facts() -> None:
    snapshot = kubernetes_evidence_to_inventory_snapshot(
        {
            "event_capture": {
                "complete": False,
                "truncated": True,
                "reason": "item_limit_exceeded",
                "freshness": {
                    "observed_at": "2026-07-16T00:02:00Z",
                    "max_age_seconds": 120,
                },
                "coverage": {
                    "scope": "all_namespaces",
                    "pagination": "continue",
                    "page_count": 4,
                    "event_count": 1000,
                    "gap": "item_limit_exceeded",
                },
                "events": [{"uid": "partial-event"}],
            }
        },
        cluster_id="cluster-1",
        agent_id="agent-1",
    )

    summary = snapshot["summary"]
    assert summary["kubernetes_event_capture"]["complete"] is False
    assert summary["kubernetes_event_capture"]["coverage"]["gap"] == "item_limit_exceeded"
    assert summary["kubernetes_event_facts"] == []
    assert not KubernetesEventFactBatch.from_snapshot_summary(summary).capture.authoritative

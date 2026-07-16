"""RealtimeHub 검증 — snapshot/delta/seq/overflow(최신값 복구) 불변식."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest
from conftest import ROOT, load_file

from packages.contracts.realtime import (
    BROWSER_QUEUE_MAX,
    LiveSummary,
    RealtimeIngressLimits,
    ResourceDelta,
    SnapshotMessage,
    Subscription,
)

CLUSTER = "target-cluster-01"


def make_hub(*, limits: RealtimeIngressLimits | None = None) -> Any:
    module = load_file(
        ROOT / "src" / "services" / "realtime" / "realtime-gateway" / "hub.py",
        "test_realtime_hub_module",
    )
    return module.RealtimeHub(limits=limits)


def summary(cluster_id: str = CLUSTER, **overrides: Any) -> LiveSummary:
    base: dict[str, Any] = {"cluster_id": cluster_id, "pods_ready": 1, "pods_total": 1}
    base.update(overrides)
    return LiveSummary.model_validate(base)


def delta(key: str, op: str = "replace", value: dict | None = None) -> ResourceDelta:
    return ResourceDelta(op=op, key=key, value=value)


def test_snapshot_starts_empty() -> None:
    hub = make_hub()
    snapshot = hub.snapshot_for(Subscription(workspace_id="ws-1"))
    assert snapshot.seq == 0
    assert snapshot.state == {"clusters": {}, "resources": {}}


def test_summary_updates_snapshot_and_fans_out() -> None:
    hub = make_hub()
    client = hub.register_browser(Subscription(workspace_id="ws-1"))

    message = hub.publish_summary(summary())

    assert message.seq == 1
    assert client.queue.get_nowait() is message
    snapshot = hub.snapshot_for(client.subscription)
    assert snapshot.state["clusters"][CLUSTER]["pods_ready"] == 1


def test_seq_monotonic_across_message_kinds() -> None:
    hub = make_hub()
    first = hub.publish_summary(summary())
    second = hub.publish_delta(delta(f"{CLUSTER}/sandbox/pod/checkout", value={"ready": True}))
    third = hub.publish_summary(summary(pods_ready=0))
    assert (first.seq, second.seq, third.seq) == (1, 2, 3)


def test_delta_replace_and_remove_mutate_snapshot() -> None:
    hub = make_hub()
    key = f"{CLUSTER}/sandbox/pod/checkout"
    hub.publish_delta(delta(key, value={"ready": False}))
    assert hub.snapshot_for(Subscription(workspace_id="ws-1")).state["resources"] == {
        key: {"ready": False}
    }
    hub.publish_delta(delta(key, op="remove"))
    assert hub.snapshot_for(Subscription(workspace_id="ws-1")).state["resources"] == {}


def test_delta_fanout_preserves_the_agent_observation_time() -> None:
    hub = make_hub()
    client = hub.register_browser(Subscription(workspace_id="ws-1"))
    observed_at = datetime(2026, 7, 15, 3, tzinfo=UTC)

    published = hub.publish_delta(
        ResourceDelta(
            op="remove",
            key=f"{CLUSTER}/sandbox/pod/checkout",
            value=None,
            observed_at=observed_at,
        )
    )

    assert published.observed_at == observed_at
    assert client.queue.get_nowait().observed_at == observed_at


def test_subscription_filters_cluster_and_namespace() -> None:
    hub = make_hub()
    other_cluster = hub.register_browser(Subscription(workspace_id="ws-1", cluster_id="other"))
    other_namespace = hub.register_browser(
        Subscription(workspace_id="ws-1", cluster_id=CLUSTER, namespace="target")
    )
    matching = hub.register_browser(
        Subscription(workspace_id="ws-1", cluster_id=CLUSTER, namespace="sandbox")
    )

    hub.publish_delta(delta(f"{CLUSTER}/sandbox/pod/checkout", value={"app": "checkout"}))

    assert other_cluster.queue.empty()
    assert other_namespace.queue.empty()
    assert matching.queue.qsize() == 1


def test_summary_ignores_namespace_filter_but_respects_cluster() -> None:
    hub = make_hub()
    namespaced = hub.register_browser(
        Subscription(workspace_id="ws-1", cluster_id=CLUSTER, namespace="sandbox")
    )
    other_cluster = hub.register_browser(Subscription(workspace_id="ws-1", cluster_id="other"))

    hub.publish_summary(summary())

    assert namespaced.queue.qsize() == 1
    assert other_cluster.queue.empty()


def test_slow_browser_recovers_with_latest_snapshot_instead_of_unbounded_queue() -> None:
    hub = make_hub()
    client = hub.register_browser(Subscription(workspace_id="ws-1"))

    total = BROWSER_QUEUE_MAX + 1
    for index in range(total):
        hub.publish_summary(summary(pods_ready=index))

    # overflow 시 밀린 메시지는 전부 버려지고 최신 snapshot 1개로 복구됨.
    assert client.queue.qsize() == 1
    assert client.dropped_messages == BROWSER_QUEUE_MAX
    recovery = client.queue.get_nowait()
    assert isinstance(recovery, SnapshotMessage)
    assert recovery.state["clusters"][CLUSTER]["pods_ready"] == total - 1
    assert recovery.seq == hub.seq


def test_unregister_stops_fanout() -> None:
    hub = make_hub()
    client = hub.register_browser(Subscription(workspace_id="ws-1"))
    hub.unregister_browser(client)
    hub.publish_summary(summary())
    assert client.queue.empty()
    assert hub.browser_count == 0


def test_hub_refuses_new_retained_resource_after_cluster_budget_without_eviction() -> None:
    hub = make_hub(limits=RealtimeIngressLimits(cluster_retained_resources=1))
    first_key = f"{CLUSTER}/sandbox/pod/checkout"
    second_key = f"{CLUSTER}/sandbox/pod/payments"

    hub.publish_delta(delta(first_key, value={"ready": True}))
    with pytest.raises(ValueError, match="cluster_resource_limit_exceeded"):
        hub.publish_delta(delta(second_key, value={"ready": True}))

    snapshot = hub.snapshot_for(Subscription(workspace_id="ws-1", cluster_id=CLUSTER))
    assert snapshot.state["resources"] == {first_key: {"ready": True}}


def test_retained_resource_budget_is_isolated_per_cluster() -> None:
    hub = make_hub(limits=RealtimeIngressLimits(cluster_retained_resources=1))
    other_cluster = "target-cluster-02"
    first_key = f"{CLUSTER}/sandbox/pod/checkout"
    second_key = f"{other_cluster}/sandbox/pod/payments"

    hub.publish_delta(delta(first_key, value={"ready": True}))
    hub.publish_delta(delta(second_key, value={"ready": True}))

    first_snapshot = hub.snapshot_for(Subscription(workspace_id="ws-1", cluster_id=CLUSTER))
    second_snapshot = hub.snapshot_for(Subscription(workspace_id="ws-1", cluster_id=other_cluster))
    assert first_snapshot.state["resources"] == {first_key: {"ready": True}}
    assert second_snapshot.state["resources"] == {second_key: {"ready": True}}


def test_snapshot_limit_fails_explicitly_instead_of_truncating() -> None:
    hub = make_hub(
        limits=RealtimeIngressLimits(cluster_retained_resources=2, snapshot_max_resources=1)
    )
    hub.publish_delta(delta(f"{CLUSTER}/sandbox/pod/checkout", value={"ready": True}))
    hub.publish_delta(delta(f"{CLUSTER}/sandbox/pod/payments", value={"ready": True}))

    with pytest.raises(ValueError, match="snapshot_limit_exceeded"):
        hub.snapshot_for(Subscription(workspace_id="ws-1", cluster_id=CLUSTER))

"""realtime.v1 계약 검증 — 메시지 schema 와 bounded 상한이 계약으로 강제되는지."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from packages.contracts.realtime import (
    MAX_HOT_PODS,
    MAX_LIVE_NODE_OBSERVATIONS,
    MAX_WINDOW_MS,
    REALTIME_PROTOCOL,
    HelloMessage,
    HotPod,
    LiveClusterResourceObservation,
    LiveNodeResourceObservation,
    LiveSummary,
    LiveSummaryMessage,
    PingMessage,
    RealtimeIngressLimits,
    ResourceDelta,
    SnapshotMessage,
    Subscription,
    delta_key_parts,
    parse_realtime_message,
    serialized_json_bytes,
)

CLUSTER = "target-cluster-01"


def sample_summary(**overrides) -> LiveSummary:
    base = {
        "cluster_id": CLUSTER,
        "window_ms": 500,
        "pods_ready": 12,
        "pods_total": 13,
        "restart_delta": 1,
        "rollout_phase": "progressing",
        "hot_pods": [{"namespace": "sandbox", "pod": "checkout-abc", "cpu_ratio": 0.72}],
    }
    base.update(overrides)
    return LiveSummary.model_validate(base)


def test_parses_every_message_type() -> None:
    messages = [
        {"type": "hello", "protocol": REALTIME_PROTOCOL},
        {"type": "snapshot", "seq": 10, "state": {"clusters": {}}},
        {
            "type": "live.summary",
            "seq": 11,
            "cluster_id": CLUSTER,
            "summary": sample_summary().model_dump(),
        },
        {
            "type": "resource.delta",
            "seq": 12,
            "op": "replace",
            "key": f"{CLUSTER}/sandbox/pod/checkout",
            "value": {"ready": True},
            "observed_at": "2026-07-15T03:00:00Z",
        },
        {"type": "ping", "ts": 1720000000.123},
    ]
    parsed = [parse_realtime_message(message) for message in messages]

    assert isinstance(parsed[0], HelloMessage)
    assert isinstance(parsed[1], SnapshotMessage)
    assert isinstance(parsed[2], LiveSummaryMessage)
    assert isinstance(parsed[3], ResourceDelta)
    assert parsed[3].observed_at == datetime(2026, 7, 15, 3, tzinfo=UTC)
    assert isinstance(parsed[4], PingMessage)


def test_unknown_type_rejected() -> None:
    with pytest.raises(ValidationError):
        parse_realtime_message({"type": "raw.metrics", "data": []})


def test_extra_fields_rejected() -> None:
    with pytest.raises(ValidationError):
        parse_realtime_message(
            {"type": "ping", "ts": 1.0, "raw_prometheus_response": {"huge": "blob"}}
        )


def test_hot_pods_bounded_by_contract() -> None:
    too_many = [{"namespace": "sandbox", "pod": f"pod-{i}"} for i in range(MAX_HOT_PODS + 1)]
    with pytest.raises(ValidationError):
        sample_summary(hot_pods=too_many)


def test_window_ms_bounded_by_contract() -> None:
    with pytest.raises(ValidationError):
        sample_summary(window_ms=MAX_WINDOW_MS + 1)


def test_negative_counts_rejected() -> None:
    with pytest.raises(ValidationError):
        sample_summary(pods_ready=-1)
    with pytest.raises(ValidationError):
        HotPod(namespace="sandbox", pod="p", restart_count=-1)


def test_subscription_requires_workspace() -> None:
    with pytest.raises(ValidationError):
        Subscription(workspace_id="")
    subscription = Subscription(workspace_id="ws-1")
    assert subscription.cluster_id == ""


def test_delta_key_parts() -> None:
    assert delta_key_parts(f"{CLUSTER}/sandbox/pod/checkout-abc") == (
        CLUSTER,
        "sandbox",
        "pod",
        "checkout-abc",
    )
    assert delta_key_parts(CLUSTER) == (CLUSTER, "", "", "")


def test_resource_delta_rejects_invalid_key_shape_and_unbounded_value() -> None:
    with pytest.raises(ValidationError):
        ResourceDelta(key=f"{CLUSTER}/sandbox/pod")

    limits = RealtimeIngressLimits(delta_value_max_bytes=24)
    with pytest.raises(ValueError, match="delta_value_too_large"):
        parse_realtime_message(
            {
                "type": "resource.delta",
                "op": "replace",
                "key": f"{CLUSTER}/sandbox/pod/checkout",
                "value": {"payload": "x" * 64},
            },
            limits=limits,
        )


def test_resource_delta_replace_requires_a_value() -> None:
    with pytest.raises(ValueError, match="replace requires a value"):
        parse_realtime_message(
            {
                "type": "resource.delta",
                "op": "replace",
                "key": f"{CLUSTER}/sandbox/pod/checkout",
            }
        )


def test_cluster_metrics_delta_is_bounded_and_fits_existing_ingress_budget() -> None:
    observed_at = datetime(2026, 7, 15, 3, tzinfo=UTC)
    nodes = [
        LiveNodeResourceObservation(
            name=f"worker-{index:02d}",
            status="ready",
            cpu_mcores=250.0,
            mem_mib=128.0,
            observed_at=observed_at,
            source="kubelet_stats_summary",
            stale=False,
            status_observed_at=observed_at,
            status_stale=False,
        )
        for index in range(MAX_LIVE_NODE_OBSERVATIONS)
    ]
    observation = LiveClusterResourceObservation(
        cluster_id=CLUSTER,
        name=CLUSTER,
        actual_interval_seconds=1.0,
        collection_complete=True,
        status="ready",
        cpu_mcores=250.0 * MAX_LIVE_NODE_OBSERVATIONS,
        mem_mib=128.0 * MAX_LIVE_NODE_OBSERVATIONS,
        observed_at=observed_at,
        source="kubelet_stats_summary",
        stale=False,
        status_observed_at=observed_at,
        status_stale=False,
        nodes_ready=MAX_LIVE_NODE_OBSERVATIONS,
        nodes_total=MAX_LIVE_NODE_OBSERVATIONS,
        nodes=nodes,
    )
    delta = ResourceDelta(
        key=f"{CLUSTER}/cluster/metrics/live",
        value=observation.model_dump(mode="json"),
        observed_at=observed_at,
    )

    parsed = parse_realtime_message(delta.model_dump(mode="json"))

    assert isinstance(parsed, ResourceDelta)
    assert serialized_json_bytes(delta.value) <= RealtimeIngressLimits().delta_value_max_bytes
    with pytest.raises(ValidationError):
        LiveClusterResourceObservation(
            cluster_id=CLUSTER,
            name=CLUSTER,
            collection_complete=False,
            status="unknown",
            source="unavailable",
            stale=True,
            status_stale=True,
            nodes=[*nodes, nodes[0]],
        )

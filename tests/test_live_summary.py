"""cluster-agent live summary 검증 — bounded payload, 요약 계산, 게이트웨이 URL 유도."""

from __future__ import annotations

import asyncio
import json
from contextlib import suppress
from datetime import UTC, datetime
from typing import Any

import httpx
import yaml
from conftest import ROOT, load_file

from packages.contracts.realtime import MAX_HOT_PODS, LiveSummary

CLUSTER = "target-cluster-01"
MAX_STREAM_PAYLOAD_BYTES = 16_384  # live summary 1건의 직렬화 상한(넉넉한 안전 마진)


def load_live_summary_module() -> Any:
    return load_file(
        ROOT / "src" / "services" / "target" / "cluster-agent" / "live_summary.py",
        "test_live_summary_module",
    )


def pod(
    namespace: str = "sandbox",
    name: str = "checkout-abc",
    *,
    ready: bool = True,
    restarts: int = 0,
    crash_loop: bool = False,
) -> dict[str, Any]:
    state = {"waiting": {"reason": "CrashLoopBackOff"}} if crash_loop else {"running": {}}
    return {
        "metadata": {"namespace": namespace, "name": name},
        "status": {
            "containerStatuses": [
                {"ready": ready, "restartCount": restarts, "state": state},
            ]
        },
    }


class StubConnection:
    def __init__(self) -> None:
        self.sent: list[str] = []

    async def send(self, message: str) -> None:
        self.sent.append(message)


class StubConnector:
    """websockets.connect 대역 — (url, headers) 기록 + 고정 연결 반환."""

    def __init__(self) -> None:
        self.connection = StubConnection()
        self.urls: list[str] = []
        self.headers: list[dict[str, str]] = []

    def __call__(self, url: str, headers: dict[str, str]) -> StubConnector:
        self.urls.append(url)
        self.headers.append(headers)
        return self

    async def __aenter__(self) -> StubConnection:
        return self.connection

    async def __aexit__(self, *_exc: object) -> bool:
        return False


def test_summarize_counts_ready_restarts_and_phase() -> None:
    module = load_live_summary_module()
    collector = module.KubernetesPodSummaryCollector(CLUSTER, window_ms=1000)

    first = collector.summarize(
        [
            pod(name="ok-1"),
            pod(name="warming", ready=False),
            pod(namespace="target", name="collector", restarts=2),
        ]
    )
    assert first.pods_total == 3
    assert first.pods_ready == 2
    assert first.restart_delta == 0  # 첫 관측은 기준점 — delta 없음
    assert first.rollout_phase == "progressing"
    assert {hot.pod for hot in first.hot_pods} == {"warming", "collector"}

    second = collector.summarize(
        [
            pod(name="ok-1"),
            pod(name="warming"),
            pod(namespace="target", name="collector", restarts=3, crash_loop=True),
        ]
    )
    assert second.restart_delta == 1
    assert second.rollout_phase == "degraded"


def test_summarize_hot_pods_stay_bounded() -> None:
    module = load_live_summary_module()
    collector = module.KubernetesPodSummaryCollector(CLUSTER, window_ms=1000)
    pods = [pod(name=f"broken-{i}", ready=False) for i in range(MAX_HOT_PODS * 3)]
    summary = collector.summarize(pods)
    assert len(summary.hot_pods) == MAX_HOT_PODS
    assert summary.pods_total == MAX_HOT_PODS * 3


def test_summarize_emits_measured_resource_delta_and_aggregate_metric_metadata() -> None:
    module = load_live_summary_module()
    collector = module.KubernetesPodSummaryCollector(CLUSTER, window_ms=1000)
    measured = {
        "sandbox/checkout-abc": {
            "cpu_mcores": 240.0,
            "cpu_request_mcores": 300.0,
            "mem_bytes": 134_217_728,
            "mem_mib": 128.0,
            "mem_request_mib": 256.0,
            "cpu_request_pct": 80.0,
            "cpu_limit_pct": 40.0,
            "mem_request_pct": 50.0,
            "mem_limit_pct": 25.0,
            "observed_at": "2026-07-15T03:00:00Z",
            "metrics_metadata": {
                "source": "kubelet_stats_summary",
                "actual_interval_seconds": 1.1,
                "degraded_reason": None,
            },
        }
    }

    summary = collector.summarize([pod()], measured)
    delta = collector.drain_deltas()[0]

    assert summary.metrics_metadata.model_dump() == {
        "source": "kubelet_stats_summary",
        "actual_interval_seconds": 1.1,
        "degraded_reason": None,
    }
    assert delta.value["cpu_mcores"] == 240.0
    assert delta.value["cpu_request_mcores"] == 300.0
    assert delta.value["mem_bytes"] == 134_217_728
    assert delta.value["mem_request_mib"] == 256.0
    assert delta.value["cpu_request_pct"] == 80.0
    assert delta.value["metrics_metadata"] == summary.metrics_metadata.model_dump()


def test_resource_removal_delta_uses_the_actual_collection_observation_time() -> None:
    module = load_live_summary_module()
    collector = module.KubernetesPodSummaryCollector(CLUSTER, window_ms=1000)
    first_observed_at = datetime(2026, 7, 15, 3, tzinfo=UTC)
    removed_at = datetime(2026, 7, 15, 3, 0, 1, tzinfo=UTC)

    collector.summarize([pod()], observed_at=first_observed_at)
    created = collector.drain_deltas()[0]
    collector.summarize([], observed_at=removed_at)
    removed = collector.drain_deltas()[0]

    assert created.observed_at == first_observed_at
    assert removed.op == "remove"
    assert removed.value is None
    assert removed.observed_at == removed_at


def test_summarize_exposes_adaptive_interval_for_publisher_sleep() -> None:
    module = load_live_summary_module()
    collector = module.KubernetesPodSummaryCollector(CLUSTER, window_ms=1000)

    summary = collector.summarize([pod(name=f"pod-{index}") for index in range(200)])

    assert summary.window_ms == 2000
    assert collector.next_interval_seconds() == 2.0


def test_collector_reads_pods_across_the_cluster_including_application_namespaces(
    monkeypatch: Any,
) -> None:
    """라이브 요약은 설치용 네임스페이스가 아니라 실제 앱 전체를 관측해야 한다."""
    module = load_live_summary_module()
    requested_paths: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested_paths.append(request.url.path)
        assert request.url.params["limit"] == str(module.agent_config.LIVE_SUMMARY_POD_LIST_LIMIT)
        return httpx.Response(
            200,
            json={
                "metadata": {},
                "items": [
                    pod(namespace="target", name="cluster-agent"),
                    pod(namespace="color-turf", name="color-turf-server"),
                ],
            },
        )

    class MetricsCollector:
        async def collect(self, _client: Any, **kwargs: Any) -> dict[str, dict[str, Any]]:
            assert {item["metadata"]["namespace"] for item in kwargs["pods"]} == {
                "target",
                "color-turf",
            }
            return {}

    monkeypatch.setattr(module, "kubernetes_api_base_url", lambda: "https://kube.local")
    monkeypatch.setattr(module, "service_account_token", lambda: "service-account-token")
    collector = module.KubernetesPodSummaryCollector(
        CLUSTER,
        window_ms=1000,
        transport=httpx.MockTransport(handler),
        metrics_collector=MetricsCollector(),
    )

    summary = asyncio.run(collector())
    deltas = collector.drain_deltas()

    assert requested_paths == ["/api/v1/pods"]
    assert summary is not None
    assert summary.pods_total == 2
    assert {delta.value["namespace"] for delta in deltas if delta.value} == {
        "target",
        "color-turf",
    }


def test_publisher_streams_bounded_live_summary_payloads() -> None:
    module = load_live_summary_module()
    connector = StubConnector()

    async def collector() -> LiveSummary:
        return LiveSummary(
            cluster_id=CLUSTER,
            window_ms=500,
            pods_ready=12,
            pods_total=13,
            restart_delta=1,
            rollout_phase="progressing",
        )

    publisher = module.LiveSummaryPublisher(
        cluster_id=CLUSTER,
        gateway_url="ws://management-host:30090",
        token="secret-token",
        interval_seconds=0.01,
        collector=collector,
        connect=connector,
    )

    async def run_until_three_messages() -> None:
        task = asyncio.create_task(publisher.run())
        try:
            while len(connector.connection.sent) < 3:
                await asyncio.sleep(0.005)
        finally:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task

    asyncio.run(asyncio.wait_for(run_until_three_messages(), timeout=5))

    assert connector.urls[0] == f"ws://management-host:30090/live/agent?cluster_id={CLUSTER}"
    assert connector.headers[0] == {"x-agent-token": "secret-token"}
    for raw in connector.connection.sent:
        assert len(raw.encode()) < MAX_STREAM_PAYLOAD_BYTES
        message = json.loads(raw)
        assert message["type"] == "live.summary"
        assert message["cluster_id"] == CLUSTER
        assert len(message["summary"]["hot_pods"]) <= MAX_HOT_PODS


def test_publisher_disabled_returns_immediately() -> None:
    module = load_live_summary_module()
    connector = StubConnector()

    async def collector() -> LiveSummary | None:
        raise AssertionError("비활성 시 수집 자체가 없어야 함")

    publisher = module.LiveSummaryPublisher(
        cluster_id=CLUSTER,
        gateway_url="ws://management-host:30090",
        token="t",
        interval_seconds=0.01,
        collector=collector,
        connect=connector,
        enabled=False,
    )
    asyncio.run(asyncio.wait_for(publisher.run(), timeout=1))
    assert connector.urls == []


def test_publisher_without_gateway_url_is_noop() -> None:
    module = load_live_summary_module()
    connector = StubConnector()

    async def collector() -> LiveSummary | None:
        return None

    publisher = module.LiveSummaryPublisher(
        cluster_id=CLUSTER,
        gateway_url="",
        token="t",
        interval_seconds=0.01,
        collector=collector,
        connect=connector,
    )
    asyncio.run(asyncio.wait_for(publisher.run(), timeout=1))
    assert connector.urls == []


def test_derive_gateway_url_from_management_base_url() -> None:
    module = load_live_summary_module()
    assert module.derive_gateway_url("http://192.168.0.10:30080") == "ws://192.168.0.10:30080"
    assert module.derive_gateway_url("https://mgmt.example.com/api") == "wss://mgmt.example.com"
    assert module.derive_gateway_url("https://mgmt.example.com:8443/api") == (
        "wss://mgmt.example.com:8443"
    )
    assert module.derive_gateway_url("") == ""


def test_from_env_uses_enabled_default_and_agent_proxy_root(monkeypatch: Any) -> None:
    module = load_live_summary_module()
    monkeypatch.delenv(module.agent_config.REALTIME_GATEWAY_URL_ENV, raising=False)
    monkeypatch.delenv(module.agent_config.LIVE_SUMMARY_ENABLED_ENV, raising=False)
    monkeypatch.setenv(module.agent_config.AGENT_TOKEN_ENV, "agent-secret")

    publisher = module.LiveSummaryPublisher.from_env(
        CLUSTER,
        "https://agent-api.woonyong.org/api",
    )

    assert publisher.enabled is True
    assert publisher.gateway_url == "wss://agent-api.woonyong.org"
    assert publisher.endpoint == (f"wss://agent-api.woonyong.org/live/agent?cluster_id={CLUSTER}")


def test_management_gateway_is_internal_and_kind_opens_expected_realtime_nodeport() -> None:
    """운영 기본은 ClusterIP, kind 스크립트만 realtime fallback 포트를 연다."""
    module = load_live_summary_module()
    manifest = (ROOT / "deploy" / "management" / "services.yaml").read_text(encoding="utf-8")
    service = next(
        doc
        for doc in yaml.safe_load_all(manifest)
        if doc
        and doc.get("kind") == "Service"
        and doc.get("metadata", {}).get("name") == "realtime-gateway"
    )
    assert service["spec"]["type"] == "ClusterIP"
    assert all("nodePort" not in port for port in service["spec"]["ports"])
    local_up = (ROOT / "scripts" / "up.sh").read_text(encoding="utf-8")
    assert f'"nodePort":{module.agent_config.DEFAULT_REALTIME_GATEWAY_NODEPORT}' in local_up

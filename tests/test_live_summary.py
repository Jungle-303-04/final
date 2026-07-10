"""cluster-agent live summary 검증 — bounded payload, 요약 계산, 게이트웨이 URL 유도."""

from __future__ import annotations

import asyncio
import json
from contextlib import suppress
from typing import Any

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
    port = module.agent_config.DEFAULT_REALTIME_GATEWAY_NODEPORT
    assert module.derive_gateway_url("http://192.168.0.10:30080") == f"ws://192.168.0.10:{port}"
    assert module.derive_gateway_url("https://mgmt.example.com/api") == "wss://mgmt.example.com"
    assert module.derive_gateway_url("https://mgmt.example.com:8443/api") == (
        "wss://mgmt.example.com:8443"
    )
    assert module.derive_gateway_url("") == ""


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

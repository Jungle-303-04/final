"""Live summary producer — cluster-agent → management realtime-gateway outbound WS.

경계 원칙:
- agent 는 browser fan-out 을 모름. 클러스터당 outbound 연결 1개만 유지하고,
  사용자 수 확장은 전적으로 realtime-gateway 의 책임임.
- payload 는 계약(LiveSummary)이 강제하는 bounded 요약만 — raw metric/전체 pod 목록 금지.
- 실패 시 backoff 재접속. 기존 evidence/command 경로에는 영향 없음(끄면 no-op).
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from contextlib import AbstractAsyncContextManager
from typing import Any, Protocol
from urllib.parse import urlsplit

import httpx
from kubernetes_api import (
    kubernetes_api_base_url,
    kubernetes_client,
    kubernetes_headers,
    service_account_token,
)

import config as agent_config
from packages.config.logs import CONTEXT_KEY, get_logger
from packages.config.settings import env
from packages.contracts.gateway.fields import Gateway
from packages.contracts.realtime import (
    AGENT_LIVE_PATH,
    MAX_HOT_PODS,
    HotPod,
    LiveSummary,
    LiveSummaryMessage,
)

LOGGER = get_logger(__name__)

CRASH_LOOP_REASON = "CrashLoopBackOff"

SummaryCollector = Callable[[], Awaitable[LiveSummary | None]]


class LiveStreamConnection(Protocol):
    async def send(self, message: str) -> None: ...


# (url, headers) → async context manager yielding LiveStreamConnection
LiveStreamConnector = Callable[[str, dict[str, str]], AbstractAsyncContextManager[Any]]


def _websockets_connector(url: str, headers: dict[str, str]) -> AbstractAsyncContextManager[Any]:
    import websockets  # 지연 import — 비활성/테스트 경로에서 불필요한 의존 로드 금지

    return websockets.connect(url, additional_headers=headers)


def derive_gateway_url(management_base_url: str) -> str:
    """REALTIME_GATEWAY_URL 미설정 시 MANAGEMENT_BASE_URL 호스트 + NodePort 로 유도."""
    parts = urlsplit(management_base_url)
    if not parts.hostname:
        return ""
    scheme = "wss" if parts.scheme == "https" else "ws"
    return f"{scheme}://{parts.hostname}:{agent_config.DEFAULT_REALTIME_GATEWAY_NODEPORT}"


def _clamp_interval(raw: str) -> float:
    try:
        value = float(raw)
    except ValueError:
        value = float(agent_config.DEFAULT_LIVE_SUMMARY_INTERVAL_SECONDS)
    return min(
        max(value, agent_config.MIN_LIVE_SUMMARY_INTERVAL_SECONDS),
        agent_config.MAX_LIVE_SUMMARY_INTERVAL_SECONDS,
    )


class KubernetesPodSummaryCollector:
    """k8s pod 목록(상한 있음)에서 bounded 요약을 계산함. API 미접근 환경이면 None."""

    def __init__(
        self,
        cluster_id: str,
        window_ms: int,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.cluster_id = cluster_id
        self.window_ms = window_ms
        self.transport = transport
        self._last_restart_total: int | None = None

    async def __call__(self) -> LiveSummary | None:
        base_url = kubernetes_api_base_url()
        token = service_account_token()
        if not base_url or not token:
            return None
        pods: list[dict[str, Any]] = []
        async with kubernetes_client(self.transport) as client:
            for namespace in agent_config.LIVE_SUMMARY_NAMESPACES:
                response = await client.get(
                    f"{base_url}/api/v1/namespaces/{namespace}/pods",
                    params={"limit": agent_config.LIVE_SUMMARY_POD_LIST_LIMIT},
                    headers=kubernetes_headers(token),
                )
                response.raise_for_status()
                pods.extend(response.json().get("items", []))
        return self.summarize(pods)

    def summarize(self, pods: list[dict[str, Any]]) -> LiveSummary:
        ready_count = 0
        restart_total = 0
        crash_looping = False
        hot_pods: list[HotPod] = []
        for pod in pods:
            namespace = pod.get("metadata", {}).get("namespace", "")
            name = pod.get("metadata", {}).get("name", "")
            statuses = pod.get("status", {}).get("containerStatuses", [])
            ready = bool(statuses) and all(status.get("ready", False) for status in statuses)
            restarts = sum(int(status.get("restartCount", 0)) for status in statuses)
            crash = any(
                status.get("state", {}).get("waiting", {}).get("reason", "") == CRASH_LOOP_REASON
                for status in statuses
            )
            ready_count += int(ready)
            restart_total += restarts
            crash_looping = crash_looping or crash
            if (not ready or restarts > 0) and len(hot_pods) < MAX_HOT_PODS and namespace and name:
                hot_pods.append(
                    HotPod(namespace=namespace, pod=name, restart_count=restarts, ready=ready)
                )
        restart_delta = (
            max(0, restart_total - self._last_restart_total)
            if self._last_restart_total is not None
            else 0
        )
        self._last_restart_total = restart_total
        if crash_looping:
            phase = "degraded"
        elif ready_count < len(pods):
            phase = "progressing"
        else:
            phase = "idle"
        return LiveSummary(
            cluster_id=self.cluster_id,
            window_ms=self.window_ms,
            pods_ready=ready_count,
            pods_total=len(pods),
            restart_delta=restart_delta,
            rollout_phase=phase,
            hot_pods=hot_pods,
        )


class LiveSummaryPublisher:
    """주기적으로 요약을 수집해 realtime-gateway 로 push. 끄면(run 즉시 반환) no-op."""

    def __init__(
        self,
        *,
        cluster_id: str,
        gateway_url: str,
        token: str,
        interval_seconds: float,
        collector: SummaryCollector,
        connect: LiveStreamConnector | None = None,
        retry_delay_seconds: float = agent_config.LIVE_SUMMARY_RETRY_DELAY_SECONDS,
        enabled: bool = True,
    ) -> None:
        self.cluster_id = cluster_id
        self.gateway_url = gateway_url.rstrip("/")
        self.token = token
        self.interval_seconds = interval_seconds
        self.collector = collector
        self.connect = connect or _websockets_connector
        self.retry_delay_seconds = retry_delay_seconds
        self.enabled = enabled

    @classmethod
    def from_env(
        cls,
        cluster_id: str,
        management_base_url: str,
        kubernetes_transport: httpx.AsyncBaseTransport | None = None,
    ) -> LiveSummaryPublisher:
        enabled = (
            env(
                agent_config.LIVE_SUMMARY_ENABLED_ENV, agent_config.DEFAULT_LIVE_SUMMARY_ENABLED
            ).lower()
            == "true"
        )
        interval = _clamp_interval(
            env(
                agent_config.LIVE_SUMMARY_INTERVAL_SECONDS_ENV,
                agent_config.DEFAULT_LIVE_SUMMARY_INTERVAL_SECONDS,
            )
        )
        gateway_url = env(agent_config.REALTIME_GATEWAY_URL_ENV, "") or derive_gateway_url(
            management_base_url
        )
        return cls(
            cluster_id=cluster_id,
            gateway_url=gateway_url,
            token=env(agent_config.AGENT_TOKEN_ENV, ""),
            interval_seconds=interval,
            collector=KubernetesPodSummaryCollector(
                cluster_id, int(interval * 1000), kubernetes_transport
            ),
            enabled=enabled,
        )

    @property
    def endpoint(self) -> str:
        return f"{self.gateway_url}{AGENT_LIVE_PATH}?{Gateway.CLUSTER_ID}={self.cluster_id}"

    async def run(self) -> None:
        if not self.enabled or not self.gateway_url:
            LOGGER.info(
                "live_summary_disabled",
                extra={CONTEXT_KEY: {Gateway.CLUSTER_ID: self.cluster_id, "enabled": self.enabled}},
            )
            return
        headers = {agent_config.AGENT_TOKEN_HEADER: self.token}
        while True:
            try:
                async with self.connect(self.endpoint, headers) as connection:
                    await self._stream(connection)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                LOGGER.warning(
                    "live_summary_stream_retry",
                    extra={
                        CONTEXT_KEY: {
                            Gateway.CLUSTER_ID: self.cluster_id,
                            "exception_type": type(exc).__name__,
                        }
                    },
                )
                await asyncio.sleep(self.retry_delay_seconds)

    async def _stream(self, connection: LiveStreamConnection) -> None:
        while True:
            summary = await self.collector()
            if summary is not None:
                message = LiveSummaryMessage(cluster_id=self.cluster_id, summary=summary)
                await connection.send(message.model_dump_json())
            await asyncio.sleep(self.interval_seconds)

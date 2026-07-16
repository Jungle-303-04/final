"""Realtime 계약(realtime.v1) — cluster-agent → realtime-gateway → browser fan-out.

경계 원칙:
- node-collector 는 이 경로에 참여하지 않음(/metrics 는 Prometheus scrape 가 정식 경로).
- agent 가 보내는 live summary 는 raw metric 이 아니라 bounded 요약이어야 함
  (raw Prometheus 응답/전체 로그/무제한 pod 목록 금지 — 상한을 계약으로 강제).
- 메시지는 StrictModel(extra 금지) — 계약 밖 필드는 즉시 검증 실패(fail-fast).
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import Field, TypeAdapter

from packages.contracts.gateway.base import StrictModel

REALTIME_PROTOCOL = "realtime.v1"

# WebSocket 경로 — producer(cluster-agent)와 gateway 가 같은 계약을 import 함(중복 리터럴 금지).
AGENT_LIVE_PATH = "/live/agent"
BROWSER_LIVE_PATH = "/live/browser"

# snapshot.state 구조 키 — browser 소비자가 최초 렌더링에 쓰는 read model 의 계약.
STATE_CLUSTERS_KEY = "clusters"
STATE_RESOURCES_KEY = "resources"

# live summary 상한 — 사용자 수와 무관하게 agent payload 가 bounded 이도록 계약으로 강제.
MAX_HOT_PODS = 20
MAX_WINDOW_MS = 60_000

# browser fan-out 상한 — 느린 client 는 밀린 메시지를 버리고 최신 snapshot 으로 복구함.
BROWSER_QUEUE_MAX = 32
BROWSER_STREAM_POLICY_REVISION = 1
BROWSER_STREAM_MAX_FRAMES_PER_SECOND = 60

# resource.delta key 형식: "<cluster>/<namespace>/<kind>/<name>"
DELTA_KEY_SEGMENTS = 4

RolloutPhase = Literal["idle", "progressing", "degraded"]
DeltaOp = Literal["replace", "remove"]
MetricSource = Literal[
    "kubelet_stats_summary",
    "metrics_server_fallback",
    "mixed",
    "unavailable",
]


class HotPod(StrictModel):
    """주의가 필요한 pod 1개 — 목록 크기는 MAX_HOT_PODS 로 제한됨."""

    namespace: str = Field(min_length=1)
    pod: str = Field(min_length=1)
    cpu_ratio: float | None = Field(default=None, ge=0.0)
    restart_count: int = Field(default=0, ge=0)
    ready: bool = True


class LiveMetricsMetadata(StrictModel):
    """실시간 측정 출처와 실제 관측 간격 — 추정값과 실측값의 혼동을 막는다."""

    source: MetricSource
    actual_interval_seconds: float | None = Field(default=None, ge=0.0)
    degraded_reason: str | None = None


class LiveSummary(StrictModel):
    """cluster-agent 가 주기 송신하는 클러스터 요약 — raw metric 금지."""

    cluster_id: str = Field(min_length=1)
    window_ms: int = Field(default=1000, ge=0, le=MAX_WINDOW_MS)
    pods_ready: int = Field(default=0, ge=0)
    pods_total: int = Field(default=0, ge=0)
    restart_delta: int = Field(default=0, ge=0)
    rollout_phase: RolloutPhase = "idle"
    hot_pods: list[HotPod] = Field(default_factory=list, max_length=MAX_HOT_PODS)
    metrics_metadata: LiveMetricsMetadata | None = None


class Subscription(StrictModel):
    """browser 구독 필터 — 빈 문자열은 '전체 허용'."""

    workspace_id: str = Field(min_length=1)
    cluster_id: str = ""
    namespace: str = ""
    app: str = ""


class BrowserStreamPolicy(StrictModel):
    """Browser delivery budget negotiated by the gateway before a snapshot."""

    revision: int = Field(default=BROWSER_STREAM_POLICY_REVISION, ge=1)
    max_frames_per_second: int = Field(
        default=BROWSER_STREAM_MAX_FRAMES_PER_SECOND,
        ge=1,
        le=BROWSER_STREAM_MAX_FRAMES_PER_SECOND,
    )
    hidden_tab: Literal["coalesce"] = "coalesce"
    max_pending_messages: int = Field(default=BROWSER_QUEUE_MAX, ge=1, le=BROWSER_QUEUE_MAX)


class HelloMessage(StrictModel):
    type: Literal["hello"] = "hello"
    protocol: str = REALTIME_PROTOCOL
    stream_policy: BrowserStreamPolicy = Field(default_factory=BrowserStreamPolicy)


class SnapshotMessage(StrictModel):
    """접속(또는 overflow 복구) 시 1회 전송되는 최신 상태 전체."""

    type: Literal["snapshot"] = "snapshot"
    seq: int = Field(default=0, ge=0)
    state: dict[str, Any] = Field(default_factory=dict)


class LiveSummaryMessage(StrictModel):
    """agent → gateway ingest, gateway → browser fan-out 공용. seq 는 gateway 가 부여."""

    type: Literal["live.summary"] = "live.summary"
    seq: int = Field(default=0, ge=0)
    cluster_id: str = Field(min_length=1)
    summary: LiveSummary


class ResourceDelta(StrictModel):
    """개별 리소스 변경 1건 — key 는 "<cluster>/<namespace>/<kind>/<name>"."""

    type: Literal["resource.delta"] = "resource.delta"
    seq: int = Field(default=0, ge=0)
    op: DeltaOp = "replace"
    key: str = Field(min_length=1)
    value: dict[str, Any] | None = None
    observed_at: datetime | None = None


class PingMessage(StrictModel):
    type: Literal["ping"] = "ping"
    ts: float


RealtimeMessage = Annotated[
    HelloMessage | SnapshotMessage | LiveSummaryMessage | ResourceDelta | PingMessage,
    Field(discriminator="type"),
]

# 단일 진입점 — 수신 payload 는 전부 이 어댑터로 검증함(수동 dict 검사 금지).
RealtimeEnvelope: TypeAdapter[RealtimeMessage] = TypeAdapter(RealtimeMessage)


def parse_realtime_message(payload: Any) -> RealtimeMessage:
    return RealtimeEnvelope.validate_python(payload)


def delta_key_parts(key: str) -> tuple[str, str, str, str]:
    """key → (cluster, namespace, kind, name). 부족한 조각은 빈 문자열."""
    parts = key.split("/", DELTA_KEY_SEGMENTS - 1)
    while len(parts) < DELTA_KEY_SEGMENTS:
        parts.append("")
    return parts[0], parts[1], parts[2], parts[3]

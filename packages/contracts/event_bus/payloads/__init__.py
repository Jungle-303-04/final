"""발행 이벤트 payload 계약(단일 출처, 도메인별 모듈).

네이밍 규칙:
- "<이벤트>Payload" = 한 이벤트의 본문 전체(예: GitChangedPayload).
- 접미사 없는 명사 = 본문 안에 끼워지는 값 객체(예: Manifest, Diff, Plan).
규칙: 입력은 Pydantic으로 검증, 출력(이 패키지)은 dataclass로 구성.

도메인별로 base/gitops/command/rca/dashboard 모듈에 나뉘어 있고, 여기서
전부 재노출하므로 `from ...payloads import X` 는 그대로 동작한다.
"""

from __future__ import annotations

from packages.contracts.event_bus.payloads.base import (
    EventPayload,
    JsonObject,
)
from packages.contracts.event_bus.payloads.command import (
    CommandDispatchedPayload,
    CommandDispatchReadyPayload,
    CommandQueuedForAgentPayload,
    CommandRejectedPayload,
    CommandRequestedPayload,
    Plan,
    Route,
)
from packages.contracts.event_bus.payloads.dashboard import (
    DashboardUpdatedPayload,
)
from packages.contracts.event_bus.payloads.gitops import (
    DesiredDiffPayload,
    Diff,
    GitChangedPayload,
    Manifest,
    ManifestRenderedPayload,
    RenderedManifest,
    RenderedMetadata,
    RenderedSpec,
)
from packages.contracts.event_bus.payloads.rca import (
    ClusterEvidenceReceived,
    Evidence,
    EvidenceBuiltPayload,
    RcaCompletedPayload,
    SafePrCreatedPayload,
)

__all__ = [
    "ClusterEvidenceReceived",
    "CommandDispatchReadyPayload",
    "CommandDispatchedPayload",
    "CommandQueuedForAgentPayload",
    "CommandRejectedPayload",
    "CommandRequestedPayload",
    "DashboardUpdatedPayload",
    "DesiredDiffPayload",
    "Diff",
    "EventPayload",
    "Evidence",
    "EvidenceBuiltPayload",
    "GitChangedPayload",
    "JsonObject",
    "Manifest",
    "ManifestRenderedPayload",
    "Plan",
    "RcaCompletedPayload",
    "RenderedManifest",
    "RenderedMetadata",
    "RenderedSpec",
    "Route",
    "SafePrCreatedPayload",
]

"""발행 이벤트 body 계약(단일 출처, 도메인별 모듈).

네이밍 규칙:
- "<이벤트>Body" = 한 이벤트의 본문 전체(예: GitChangedBody).
- 접미사 없는 명사 = 본문 안에 끼워지는 값 객체(예: Manifest, Diff, Plan).
규칙: 입력은 Pydantic으로 검증, 출력(이 패키지)은 dataclass로 구성.

도메인별 base/gitops/command/rca/dashboard 모듈로 분리, 여기서 전부
재노출 → `from packages.contracts.event_bus.bodies import X`로 사용.
"""

from __future__ import annotations

from domains.alert.events import (
    AlertDispatchedBody,
    AlertRejectedBody,
    AlertRequestedBody,
)
from domains.command.events import (
    CommandCompletedBody,
    CommandDispatchedBody,
    CommandDispatchReadyBody,
    CommandQueuedForAgentBody,
    CommandRejectedBody,
    CommandRequestedBody,
    Plan,
    Route,
)
from domains.gitops.events import (
    Diff,
    DiffAnalyzedBody,
    DiffDetectedBody,
    GitChangedBody,
    GitWebhookReceivedBody,
    Manifest,
    ManifestRenderedBody,
    RenderedManifest,
    RenderedMetadata,
    RenderedSpec,
)
from domains.projection.events import DashboardUpdatedBody
from domains.rca.events import (
    ClusterEvidenceReceivedBody,
    Evidence,
    EvidenceBuiltBody,
    RcaCompletedBody,
)
from domains.scm.events import (
    SafePrCreatedBody,
    SafePrFailedBody,
    SafePrRequestedBody,
)
from packages.contracts.event_bus.bodies.base import EventBody, JsonObject

__all__ = [
    "ClusterEvidenceReceivedBody",
    "AlertDispatchedBody",
    "AlertRejectedBody",
    "AlertRequestedBody",
    "CommandCompletedBody",
    "CommandDispatchReadyBody",
    "CommandDispatchedBody",
    "CommandQueuedForAgentBody",
    "CommandRejectedBody",
    "CommandRequestedBody",
    "DashboardUpdatedBody",
    "DiffDetectedBody",
    "Diff",
    "DiffAnalyzedBody",
    "EventBody",
    "Evidence",
    "EvidenceBuiltBody",
    "GitChangedBody",
    "GitWebhookReceivedBody",
    "JsonObject",
    "Manifest",
    "ManifestRenderedBody",
    "Plan",
    "RcaCompletedBody",
    "RenderedManifest",
    "RenderedMetadata",
    "RenderedSpec",
    "Route",
    "SafePrCreatedBody",
    "SafePrFailedBody",
    "SafePrRequestedBody",
]

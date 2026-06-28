"""rca-worker — 한 파일 서비스.

증거(cluster.evidence.received) → RCA 보고서 생성. 안전 롤백 PR 은
repo-gateway 에 위임. 결과: evidence.built · rca.completed · safe_pr.requested.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from packages.config.constants import GitHub
from packages.contracts.event_bus.payloads import (
    ClusterEvidenceReceived,
    EventPayload,
    Evidence,
    EvidenceBuiltPayload,
    RcaCompletedPayload,
    SafePrRequestedPayload,
)
from packages.runtime.app import App, EventContext

app = App("rca-worker")

# 서비스 설정(상수) — settings.py 대신 여기.
ROOT_CAUSE = "Image rollout introduced failing readiness checks"
RECOMMENDED_ACTION = "Open a safe PR to pin the previous image tag"
PR_TITLE = "Safe rollback proposal for checkout-api"
OBJECT_EVIDENCE_PREFIX = "object://evidence"
EVIDENCE_KIND = "rca_bundle"


@app.sub(ClusterEvidenceReceived)
async def on_cluster_evidence(
    evt: ClusterEvidenceReceived, ctx: EventContext
) -> AsyncIterator[EventPayload]:
    evidence_ref = f"{OBJECT_EVIDENCE_PREFIX}/{ctx.correlation_id}.json"
    evidence = Evidence(
        cluster_id=evt.cluster_id,
        kubernetes=evt.kubernetes,
        metrics=evt.metrics,
        logs=evt.logs,
        traces=evt.traces,
        object_ref=evidence_ref,
    )
    report = RcaCompletedPayload(
        root_cause=ROOT_CAUSE,
        action=RECOMMENDED_ACTION,
        evidence_ref=evidence.object_ref,
    )
    ctx.db.save_evidence(
        ctx.correlation_id, EVIDENCE_KIND, evidence.to_payload()
    )
    ctx.db.save_rca_report(
        ctx.correlation_id, ROOT_CAUSE, RECOMMENDED_ACTION, report.to_payload()
    )

    # 체이닝: 다음 이벤트들을 yield. PR 생성은 repo-gateway 담당.
    yield EvidenceBuiltPayload(evidence=evidence)
    yield report
    yield SafePrRequestedPayload(
        title=PR_TITLE,
        body=f"RCA: {ROOT_CAUSE}\n\nAction: {RECOMMENDED_ACTION}",
        provider=GitHub.PROVIDER,
    )


if __name__ == "__main__":
    app.run()

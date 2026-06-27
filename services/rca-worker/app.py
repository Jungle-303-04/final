"""rca-worker — 한 파일 서비스.

증거(cluster.evidence.received)를 받아 RCA 보고서와 안전 PR을 만들고,
결과 이벤트(evidence.built, rca.completed, safe_pr.created)를 흘린다.
"""

from __future__ import annotations

import time
from collections.abc import AsyncIterator

from packages.config.constants import GitHub
from packages.contracts.event_bus.payloads import (
    ClusterEvidenceReceived,
    EventPayload,
    Evidence,
    EvidenceBuiltPayload,
    RcaCompletedPayload,
    SafePrCreatedPayload,
)
from packages.runtime.app import App, EventContext

app = App("rca-worker")

# 서비스 설정(상수) — settings.py 대신 여기.
ROOT_CAUSE = "Image rollout introduced failing readiness checks"
RECOMMENDED_ACTION = "Open a safe PR to pin the previous image tag"
PR_TITLE = "Safe rollback proposal for checkout-api"
PR_MODE = "fake_github_api_call"
MISSING_GITHUB_TOKEN_REF = "missing-github-oauth-fallback"
OBJECT_EVIDENCE_PREFIX = "object://evidence"
EVIDENCE_KIND = "rca_bundle"
PR_URL_PREFIX = "https://github.example.local/project/repo/pull"
PR_NUMBER_MODULO = 100000
PR_STATUS_CREATED = "created"


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
    pr_url = f"{PR_URL_PREFIX}/{int(time.time()) % PR_NUMBER_MODULO}"
    token_ref = ctx.db.latest_github_token_ref() or MISSING_GITHUB_TOKEN_REF

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
    ctx.db.save_pull_request(
        ctx.correlation_id,
        pr_url,
        PR_TITLE,
        f"RCA: {ROOT_CAUSE}\n\nAction: {RECOMMENDED_ACTION}",
        PR_STATUS_CREATED,
    )

    # 체이닝: 다음 이벤트들을 yield 로 내보낸다(여러 개).
    yield EvidenceBuiltPayload(evidence=evidence)
    yield report
    yield SafePrCreatedPayload(
        pr_url=pr_url,
        provider=GitHub.PROVIDER,
        token_ref=token_ref,
        mode=PR_MODE,
    )


if __name__ == "__main__":
    app.run()

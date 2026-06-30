"""rca-worker — 한 파일 서비스.

증거(cluster.evidence.received) → RCA 보고서 생성. 안전 롤백 PR 은
repo-gateway 에 위임. 결과: evidence.built · rca.completed · safe_pr.requested.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from packages.config.constants import GitHub
from packages.contracts.event_bus.bodies import (
    ClusterEvidenceReceivedBody,
    EventBody,
    Evidence,
    EvidenceBuiltBody,
    IncidentDetectedBody,
    RcaActionRequiredBody,
    RcaCompletedBody,
    RcaScenariosEvaluatedBody,
    SafePrPolicyDecidedBody,
    SafePrRequestedBody,
)
from packages.contracts.stores import RcaStore
from packages.runtime.app import App, EventContext

app = App("rca-worker")

# 서비스 설정(상수) — settings.py 대신 여기.
ROOT_CAUSE = "Image rollout introduced failing readiness checks"
RECOMMENDED_ACTION = "Open a safe PR to pin the previous image tag"
PR_TITLE = "Safe rollback proposal for checkout-api"
OBJECT_EVIDENCE_PREFIX = "object://evidence"
EVIDENCE_KIND = "rca_bundle"
INCIDENT_DETECTED_REASON = "deterministic evidence sample indicates failure"
INCIDENT_NOT_DETECTED_REASON = "no deterministic incident signal found"
SELECTED_SCENARIO = "readiness-regression-after-rollout"
RCA_CONFIDENCE = "sample"
SAFE_PR_ROUTE = "draft_pr"
NO_INCIDENT_ACTION_REQUIRED = "incident flag was not set"


def build_evidence_bundle(evt: ClusterEvidenceReceivedBody, correlation_id: str) -> Evidence:
    # TODO(rca): raw Kubernetes/metrics/logs/traces를 제한된 evidence bundle로 정규화
    # TODO(rca): 큰 raw artifact는 외부 저장, event payload에는 object ref만 유지
    evidence_ref = f"{OBJECT_EVIDENCE_PREFIX}/{correlation_id}.json"
    return Evidence(
        cluster_id=evt.cluster_id,
        kubernetes=evt.kubernetes,
        metrics=evt.metrics,
        logs=evt.logs,
        traces=evt.traces,
        object_ref=evidence_ref,
        workspace_id=evt.workspace_id,
    )


def detect_incident(evidence: Evidence) -> IncidentDetectedBody:
    # TODO(rca): deterministic sample check를 policy 기반 incident flag rule로 교체
    detected = bool(evidence.logs or evidence.kubernetes.get("pods") or evidence.metrics)
    return IncidentDetectedBody(
        cluster_id=evidence.cluster_id,
        detected=detected,
        reason=INCIDENT_DETECTED_REASON if detected else INCIDENT_NOT_DETECTED_REASON,
        workspace_id=evidence.workspace_id,
    )


def evaluate_rca_scenarios(
    evidence: Evidence,
) -> tuple[RcaScenariosEvaluatedBody, RcaCompletedBody]:
    # TODO(rca): evidence 기반 scenario 평가와 낮은 confidence 시 insufficient_evidence 반환
    # TODO(rca): AI/rule 분석을 port 뒤에 두어 prompt/rule/fallback 테스트 가능성 확보
    return (
        RcaScenariosEvaluatedBody(
            scenario_count=1,
            selected=SELECTED_SCENARIO,
            confidence=RCA_CONFIDENCE,
            evidence_ref=evidence.object_ref,
            workspace_id=evidence.workspace_id,
        ),
        RcaCompletedBody(
            root_cause=ROOT_CAUSE,
            action=RECOMMENDED_ACTION,
            evidence_ref=evidence.object_ref,
            workspace_id=evidence.workspace_id,
        ),
    )


def decide_safe_pr_policy(report: RcaCompletedBody) -> SafePrPolicyDecidedBody:
    # TODO(rca): draft_pr/auto/approval_required/forbidden policy와 audit proof 구현
    return SafePrPolicyDecidedBody(
        route=SAFE_PR_ROUTE,
        reason="sample policy allows draft rollback PR",
        evidence_ref=report.evidence_ref,
        workspace_id=report.workspace_id,
    )


def build_safe_pr_request(report: RcaCompletedBody) -> SafePrRequestedBody:
    # TODO(rca): RCA policy 기반 draft_pr/auto/approval_required/forbidden route 선택
    # TODO(rca): 고정 문구 대신 evidence ref와 rollback safety checklist 포함
    return SafePrRequestedBody(
        title=PR_TITLE,
        body=f"RCA: {report.root_cause}\n\nAction: {report.action}",
        provider=GitHub.PROVIDER,
        workspace_id=report.workspace_id,
    )


@app.on(ClusterEvidenceReceivedBody)
async def on_cluster_evidence(
    evt: ClusterEvidenceReceivedBody, ctx: EventContext[RcaStore]
) -> AsyncIterator[EventBody]:
    evidence = build_evidence_bundle(evt, ctx.correlation_id)
    incident = detect_incident(evidence)
    await ctx.db.save_evidence(
        ctx.correlation_id,
        evidence.workspace_id,
        EVIDENCE_KIND,
        evidence.to_body(),
    )

    yield incident
    yield EvidenceBuiltBody(evidence=evidence)

    if not incident.detected:
        yield RcaActionRequiredBody(
            reason=NO_INCIDENT_ACTION_REQUIRED,
            evidence_ref=evidence.object_ref,
            workspace_id=evidence.workspace_id,
        )
        return

    scenarios, report = evaluate_rca_scenarios(evidence)
    policy = decide_safe_pr_policy(report)
    await ctx.db.save_rca_report(
        ctx.correlation_id,
        evidence.workspace_id,
        ROOT_CAUSE,
        RECOMMENDED_ACTION,
        report.to_body(),
    )

    # 체이닝: 다음 이벤트들을 yield. PR 생성은 repo-gateway 담당.
    yield scenarios
    yield report
    yield policy
    if policy.route == SAFE_PR_ROUTE:
        yield build_safe_pr_request(report)
    else:
        yield RcaActionRequiredBody(
            reason=policy.reason,
            evidence_ref=policy.evidence_ref,
            workspace_id=policy.workspace_id,
        )


if __name__ == "__main__":
    app.run()

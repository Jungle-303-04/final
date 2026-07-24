import { describe, expect, it } from "vitest";

import type { AlertEventView } from "./alertsFeed";
import {
  ALERT_RCA_POLL_MS,
  alertIncidentClusterIds,
  alertIncidentPollMs,
  incidentFromAlertEvent,
  incidentFromRcaIssueByIncidentId,
  promoteAlertIncident,
} from "./alertIncident";
import type { RcaIssueDetailView } from "./rcaDetailFeed";

function alertEvent(overrides: Partial<AlertEventView> = {}): AlertEventView {
  return {
    eventId: "alert-1",
    ruleName: "Readiness probe response failure",
    source: "incident",
    severity: "medium",
    status: "firing",
    cluster: "cluster-1",
    namespace: "sandbox",
    kind: "ReplicaSet",
    name: "game-room-abc",
    firedAt: "2026-07-23T22:37:09Z",
    incidentId: "incident-1",
    ...overrides,
  };
}

function rcaIssue(overrides: Partial<RcaIssueDetailView> = {}): RcaIssueDetailView {
  return {
    correlationId: "correlation-1",
    incidentId: "incident-1",
    currentSubject: "rca.completed",
    clusterId: "cluster-1",
    namespace: "sandbox",
    resourceName: "game-room-abc",
    resourceKind: "ReplicaSet",
    rawSymptom: "Readiness probe response failure",
    symptom: "준비 상태 확인 응답 실패",
    status: "rca_completed",
    severity: "warning",
    rootCause: "probe_path_wrong",
    confidence: 0.92,
    supportingEvidence: ["object://evidence/correlation-1.json#logs:related_logs"],
    missingEvidence: [],
    situationSummary: "준비 상태 확인 경로가 실제 서버 경로와 다릅니다.",
    recommendedActionSummary: "준비 상태 확인 경로를 수정합니다.",
    evidenceSummary: "404 응답이 반복됐습니다.",
    evidenceBundleSummary: "logs, kubernetes",
    actionRoute: "draft_pr",
    prUrl: null,
    errorReason: null,
    updatedAt: "2026-07-23T22:38:09Z",
    ...overrides,
  };
}

describe("incidentFromAlertEvent", () => {
  it("opens the observed incident while the RCA issue projection catches up", () => {
    expect(incidentFromAlertEvent(alertEvent())).toMatchObject({
      name: "game-room-abc",
      symptom: "준비 상태 확인 응답 실패",
      rawSymptom: "Readiness probe response failure",
      cluster: "cluster-1",
      svc: "game-room-abc",
      ns: "sandbox",
      resourceKind: "ReplicaSet",
      incidentId: "incident-1",
      status: "firing",
      severity: "warning",
    });
    expect(incidentFromAlertEvent(alertEvent()).correlationId).toBeUndefined();
  });

  it("preserves an observed high severity as critical", () => {
    expect(incidentFromAlertEvent(alertEvent({ severity: "high" })).severity).toBe("critical");
  });

  it("polls only the incident cluster until the real correlation arrives", () => {
    const provisional = incidentFromAlertEvent(alertEvent());

    expect(alertIncidentPollMs(provisional)).toBe(ALERT_RCA_POLL_MS);
    expect(alertIncidentClusterIds(provisional, ["cluster-1", "cluster-2"])).toEqual(["cluster-1"]);

    const promoted = promoteAlertIncident(provisional, [rcaIssue()]);
    expect(promoted).toMatchObject({
      incidentId: "incident-1",
      correlationId: "correlation-1",
      rootCause: "probe_path_wrong",
      confidence: 0.92,
    });
    expect(alertIncidentPollMs(promoted)).toBe(0);
    expect(alertIncidentClusterIds(promoted, ["cluster-1", "cluster-2"])).toEqual([]);
    expect(alertIncidentClusterIds(null, ["cluster-1", "cluster-2"])).toEqual([]);
  });

  it("never regresses a promoted RCA when a later issue fetch is empty", () => {
    const promoted = promoteAlertIncident(
      incidentFromAlertEvent(alertEvent()),
      [rcaIssue()],
    );

    expect(promoteAlertIncident(promoted, [])).toBe(promoted);
  });

  it("promotes a grouped latest attempt when the representative keeps an older recovery plan", () => {
    const grouped = rcaIssue({
      correlationId: "older-ready-plan",
      incidentId: "older-incident",
      status: "approval_recommended",
      recentAttempts: [
        {
          correlationId: "latest-evaluated",
          incidentId: "incident-1",
          currentSubject: "rca.evaluated",
          clusterId: "cluster-1",
          namespace: "sandbox",
          resourceName: "game-room-abc",
          resourceKind: "ReplicaSet",
          rawSymptom: null,
          status: "rca_evaluated",
          updatedAt: "2026-07-23T22:39:09Z",
          severity: "warning",
          rootCause: "probe_path_wrong_latest",
          confidence: 0.87,
          supportingEvidence: ["object://evidence/latest-evaluated.json#logs:related_logs"],
          missingEvidence: ["rollout_status"],
          situationSummary: "최신 분석 요약",
          recommendedActionSummary: "최신 권장 조치",
          evidenceSummary: "최신 근거 요약",
          evidenceBundleSummary: "최신 번들 요약",
          actionRoute: null,
          prUrl: null,
          errorReason: null,
          recoveryReasonCode: null,
        },
      ],
    });

    expect(incidentFromRcaIssueByIncidentId([grouped], "incident-1")).toMatchObject({
      correlationId: "latest-evaluated",
      incidentId: "incident-1",
      rootCause: "probe_path_wrong_latest",
      supportingEvidence: ["object://evidence/latest-evaluated.json#logs:related_logs"],
    });
    expect(promoteAlertIncident(incidentFromAlertEvent(alertEvent()), [grouped])).toMatchObject({
      correlationId: "latest-evaluated",
      incidentId: "incident-1",
    });
  });

  it("does not copy representative analysis fields into a grouped attempt", () => {
    const grouped = rcaIssue({
      correlationId: "older-ready-plan",
      incidentId: "older-incident",
      status: "approval_recommended",
      rootCause: "older_root_cause",
      confidence: 0.91,
      supportingEvidence: ["object://evidence/older-ready-plan.json#logs:related_logs"],
      prUrl: "https://github.com/acme/platform/pull/7",
      recentAttempts: [
        {
          correlationId: "latest-evaluated",
          incidentId: "incident-1",
          currentSubject: "rca.evaluated",
          clusterId: "cluster-1",
          namespace: "sandbox",
          resourceName: "game-room-abc",
          resourceKind: "ReplicaSet",
          rawSymptom: null,
          status: "rca_evaluated",
          updatedAt: "2026-07-23T22:39:09Z",
          severity: null,
          rootCause: null,
          confidence: null,
          supportingEvidence: [],
          missingEvidence: [],
          situationSummary: null,
          recommendedActionSummary: null,
          evidenceSummary: null,
          evidenceBundleSummary: null,
          actionRoute: null,
          prUrl: null,
          errorReason: null,
          recoveryReasonCode: null,
        },
      ],
    });

    expect(incidentFromRcaIssueByIncidentId([grouped], "incident-1")).toMatchObject({
      correlationId: "latest-evaluated",
      incidentId: "incident-1",
      symptom: "rca_evaluated",
      severity: null,
      rootCause: null,
      confidence: null,
      supportingEvidence: [],
      prUrl: null,
    });
  });
});

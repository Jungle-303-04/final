import { describe, expect, it, vi } from "vitest";
import {
  createIssuesAdapter,
  type IssuesEndpointDependencies,
} from "./createIssuesAdapter";
import { IssuesPortFailure } from "./issuesContract";
const timelineItem = {
  workspace_id: "workspace-1",
  correlation_id: "correlation-1",
  cluster_id: "cluster-1",
  incident_id: "incident-1",
  incident_namespace: "payments",
  incident_resource_kind: "Deployment",
  incident_resource_name: "checkout-api",
  incident_symptom: "Elevated response latency",
  evidence_ref: "evidence-1",
  current_subject: "deployment/payments/checkout-api",
  status: "investigating",
  root_cause: "Memory pressure",
  confidence: 0.86,
  supporting_evidence: ["restart spike"],
  missing_evidence: ["deployment history"],
  action_route: null,
  command_id: null,
  pr_url: null,
  error_reason: null,
  updated_at: "2026-07-13T01:30:00Z",
};
const evidencePage = {
  items: [{
    id: 7,
    workspace_id: "workspace-1",
    correlation_id: "correlation-1",
    kind: "incident.evidence",
    cluster_id: "cluster-1",
    evidence_ref: "evidence-1",
    summary: "Kubernetes and metrics evidence collected",
    sources: [{
      source: "kubernetes",
      summary: "Pod restart and OOMKilled events",
      schema_version: 1,
      collector: "cluster-agent",
      collector_version: "1.0.0",
      source_version: null,
      query_version: null,
      collected_at: "2026-07-13T01:20:00Z",
      evidence_key: "kubernetes",
      source_id: null,
      agent_id: "agent-1",
      window_start: null,
    }],
    created_at: "2026-07-13T01:20:00Z",
  }],
  limit: 50,
  offset: 0,
  has_more: true,
  next_cursor: "cursor-2",
};
const reportPage = {
  items: [{
    id: 11,
    workspace_id: "workspace-1",
    correlation_id: "correlation-1",
    root_cause: "Memory limit exceeded",
    action: "Increase the memory limit after approval",
    incident_id: "incident-1",
    cluster_id: "cluster-1",
    symptom: "Pod repeatedly restarted",
    severity: "warning",
    confidence: 0.86,
    reason: "OOMKilled and usage evidence agree",
    evidence_ref: "evidence-1",
    supporting_evidence: ["OOMKilled"],
    missing_evidence: [],
    created_at: "2026-07-13T01:30:00Z",
    resource_kind: "Deployment",
    resource_name: "checkout-api",
    namespace: "payments",
    secondary_symptoms: [],
    selected_candidate_id: "candidate-memory",
    candidates: [{
      candidate_id: "candidate-memory",
      title: "Memory pressure",
      source: "rule",
      score: 0.86,
      reason: "OOMKilled",
      supporting_evidence: ["evidence-1"],
      missing_evidence: [],
    }],
    supporting_evidence_refs: [{
      source: "kubernetes",
      name: "pod-state",
      check_id: "check-pod-state",
      summary: "OOMKilled",
      query: null,
      evidence_ref: "evidence-1",
      schema_version: 1,
      source_version: null,
      collector: "cluster-agent",
      collector_version: "1.0.0",
      query_version: null,
      collected_at: "2026-07-13T01:20:00Z",
      evidence_key: "kubernetes",
      source_id: null,
      agent_id: "agent-1",
      window_start: null,
    }],
    missing_evidence_checks: [],
    narrative: {
      locale: "ko" as const,
      executive_summary: "메모리 한도 초과로 Pod가 반복 재시작되었습니다.",
      impact: "API 처리 안정성이 저하되었을 가능성이 있습니다.",
      reasoning: "OOMKilled와 메모리 사용량 근거가 일치합니다.",
      recommended_action: "승인 후 메모리 한도를 검토하고 단계적으로 조정합니다.",
      recurrence_prevention: ["OOMKilled와 메모리 사용률을 함께 모니터링합니다."],
      limitations: ["요청 오류율 근거는 수집되지 않았습니다."],
    },
    narrative_status: "generated" as const,
  }],
  limit: 50,
  offset: 0,
  has_more: false,
  next_cursor: null,
};
const recoveryPlan = {
  plan_id: "plan-1",
  correlation_id: "correlation-1",
  incident_id: "incident-1",
  evidence_ref: "evidence-1",
  status: "selection_requested",
  summary: "Choose a safe recovery action",
  target: { cluster_id: "cluster-1", provider_internal: "not-presented" },
  recommended_action_id: "increase-memory",
  execution_route: "approval",
  selection_required: true,
  selected_action_id: null,
  selected_by: null,
  selected_action: null,
  candidates: [{
    action_id: "increase-memory",
    title: "Increase memory limit",
    description: "Raise the Deployment memory limit",
    route: "deployment.patch",
    rank: 1,
    score: 0.86,
    risk_level: "medium",
    blast_radius: "one Deployment",
    approval_required: true,
    prerequisites: ["confirm capacity"],
    validation_checks: ["rollout healthy"],
    rollback_plan: "Restore the previous limit",
    evidence_refs: ["evidence-1"],
  }],
};
describe("createIssuesAdapter", () => {
  it("loads only the composition-injected issues audit refresh policy", async () => {
    const policy = {
      staleAfterSeconds: 30,
      refreshAfterSeconds: 43,
      keepLastSuccess: true as const,
      pauseWhenHidden: true as const,
      eventInvalidation: false,
      retryAfterSeconds: null,
      retryLimit: null,
      postMutationRefreshAfterSeconds: null,
    };
    const getPolicy = vi.fn().mockResolvedValue(policy);

    await expect(
      createIssuesAdapter(endpoints(), { getPolicy }).loadIssuesAuditRefreshPolicy(),
    ).resolves.toBe(policy);
    expect(getPolicy).toHaveBeenCalledWith("issues_audit", undefined);
  });

  it("loads the list and detail through canonical request boundaries", async () => {
    const dependencies = endpoints();
    const port = createIssuesAdapter(dependencies);
    await expect(port.listIssues("cluster-1", 25)).resolves.toMatchObject({
      clusterId: "cluster-1",
      returned: 1,
      items: [{ incidentId: "incident-1", correlationId: "correlation-1" }],
    });
    await expect(port.loadIssue("incident-1", "cluster-1")).resolves.toMatchObject({
      incidentId: "incident-1",
      correlationId: "correlation-1",
    });
    expect(dependencies.listRcaTimeline).toHaveBeenCalledWith({
      categories: [],
      clusterId: "cluster-1",
      limit: 25,
      namespaces: [],
      severities: [],
      signal: undefined,
    });
    expect(dependencies.getRcaIncident).toHaveBeenCalledWith("incident-1", {
      clusterId: "cluster-1",
      signal: undefined,
    });
  });
  it("prefers the additive issue projection and keeps its server-owned severity", async () => {
    const dependencies = endpoints({
      listRcaIssues: vi.fn().mockResolvedValue({
        items: [{
          ...timelineItem,
          issue_severity: "critical",
          severity_availability: "available",
          severity_reason_code: null,
        }],
      }),
    });

    await expect(createIssuesAdapter(dependencies).listIssues("cluster-1")).resolves.toMatchObject({
      items: [{ severity: "critical", severityAvailability: "available" }],
    });
    expect(dependencies.listRcaIssues).toHaveBeenCalledOnce();
    expect(dependencies.listRcaTimeline).not.toHaveBeenCalled();
  });
  it("uses exactly one legacy read fallback for an in-flight endpoint rollout", async () => {
    const routeMissing = Object.assign(new Error("missing additive route"), {
      kind: "not-found",
      status: 404,
    });
    const dependencies = endpoints({
      listRcaIssues: vi.fn().mockRejectedValue(routeMissing),
    });
    const port = createIssuesAdapter(dependencies);

    const first = await port.listIssues("cluster-1");
    expect(first.items[0]?.severity).toBeUndefined();
    await expect(port.listIssues("cluster-1")).rejects.toMatchObject({ code: "not-found" });
    expect(dependencies.listRcaTimeline).toHaveBeenCalledOnce();
    expect(dependencies.listRcaIssues).toHaveBeenCalledTimes(2);
  });
  it("refuses a blank correlation before evidence endpoints are called", async () => {
    const dependencies = endpoints();
    const port = createIssuesAdapter(dependencies);
    await expect(port.loadEvidence(" ")).rejects.toMatchObject({
      code: "invalid-request",
    } satisfies Partial<IssuesPortFailure>);
    await expect(port.loadReports("")).rejects.toMatchObject({
      code: "invalid-request",
    } satisfies Partial<IssuesPortFailure>);
    expect(dependencies.listEvidence).not.toHaveBeenCalled();
    expect(dependencies.listRcaReports).not.toHaveBeenCalled();
  });
  it("loads a recovery plan without presenting open target metadata", async () => {
    const port = createIssuesAdapter(endpoints());
    const result = await port.loadRecoveryPlan("correlation-1");
    expect(result).toMatchObject({
      id: "plan-1",
      correlationId: "correlation-1",
      recommendedActionId: "increase-memory",
      candidates: [{ id: "increase-memory", approvalRequired: true }],
    });
    expect(result).not.toHaveProperty("target");
  });
  it("returns an accepted receipt without optimistic recovery state", async () => {
    const dependencies = endpoints();
    const port = createIssuesAdapter(dependencies);
    await expect(port.selectRecoveryAction({
      correlationId: "correlation-1",
      planId: "plan-1",
      actionId: "increase-memory",
      reason: null,
    })).resolves.toEqual({
      kind: "accepted",
      receipt: {
        accepted: true,
        eventId: "event-1",
        correlationId: "correlation-1",
      },
    });
    expect(dependencies.selectRecoveryAction).toHaveBeenCalledWith(
      "correlation-1",
      "plan-1",
      "increase-memory",
      { reason: null },
      { signal: undefined },
    );
  });
  it("reloads the plan after a 409 without retrying the selection POST", async () => {
    const conflict = Object.assign(new Error("already selected"), {
      kind: "http",
      status: 409,
    });
    const dependencies = endpoints({
      selectRecoveryAction: vi.fn().mockRejectedValue(conflict),
    });
    const port = createIssuesAdapter(dependencies);
    await expect(port.selectRecoveryAction({
      correlationId: "correlation-1",
      planId: "plan-1",
      actionId: "increase-memory",
    })).resolves.toMatchObject({
      kind: "conflict",
      plan: { id: "plan-1", correlationId: "correlation-1" },
    });
    expect(dependencies.selectRecoveryAction).toHaveBeenCalledOnce();
    expect(dependencies.getRecoveryPlanByCorrelation).toHaveBeenCalledOnce();
  });
  it("maps section failures and preserves AbortError identity", async () => {
    const offline = Object.assign(new Error("offline"), { kind: "network" });
    const abort = new DOMException("Aborted", "AbortError");
    const offlinePort = createIssuesAdapter(endpoints({
      listEvidence: vi.fn().mockRejectedValue(offline),
    }));
    const abortedPort = createIssuesAdapter(endpoints({
      listRcaReports: vi.fn().mockRejectedValue(abort),
    }));
    await expect(offlinePort.loadEvidence("correlation-1")).rejects.toMatchObject({
      code: "offline",
    } satisfies Partial<IssuesPortFailure>);
    await expect(abortedPort.loadReports("correlation-1")).rejects.toBe(abort);
  });
});
function endpoints(
  overrides: Partial<IssuesEndpointDependencies> = {},
): IssuesEndpointDependencies {
  return {
    listRcaTimeline: vi.fn().mockResolvedValue({ items: [timelineItem] }),
    getRcaIncident: vi.fn().mockResolvedValue({ item: timelineItem }),
    listEvidence: vi.fn().mockResolvedValue(evidencePage),
    listRcaReports: vi.fn().mockResolvedValue(reportPage),
    getAuditTimeline: vi.fn().mockResolvedValue({ items: [], limit: 50, has_more: false, next_cursor: null }),
    getIncidentRecentChanges: vi.fn().mockResolvedValue({ incident_id: "incident-1", items: [], limit: 5 }),
    getRecoveryPlanByCorrelation: vi.fn().mockResolvedValue(recoveryPlan),
    selectRecoveryAction: vi.fn().mockResolvedValue({
      accepted: true,
      event_id: "event-1",
      correlation_id: "correlation-1",
    }),
    ...overrides,
  };
}

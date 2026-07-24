import { describe, expect, it } from "vitest";

import type { RcaIssueItem } from "./rcaIssueGrouping";
import { selectRcaIssueRepresentatives } from "./rcaIssueGrouping";

function issue(overrides: Partial<RcaIssueItem> = {}): RcaIssueItem {
  return {
    workspace_id: "workspace-1",
    correlation_id: "correlation-1",
    cluster_id: "cluster-1",
    incident_id: "incident-1",
    incident_namespace: "sandbox",
    incident_resource_kind: "ReplicaSet",
    incident_resource_name: "game-room",
    incident_symptom: "FailedScheduling",
    evidence_ref: "object://evidence/correlation-1.json",
    current_subject: "rca.evaluated",
    status: "rca_evaluated",
    root_cause: null,
    confidence: null,
    supporting_evidence: [],
    missing_evidence: [],
    action_route: null,
    command_id: null,
    pr_url: null,
    error_reason: null,
    updated_at: "2026-07-24T00:00:00Z",
    issue_severity: "warning",
    severity_availability: "available",
    severity_reason_code: null,
    situation_summary: null,
    recommended_action_summary: null,
    evidence_summary: null,
    evidence_bundle_summary: null,
    recovery_reason_code: null,
    ...overrides,
  };
}

describe("selectRcaIssueRepresentatives", () => {
  it("keeps a recovery-ready attempt visible when a newer evaluated attempt arrives", () => {
    const items = selectRcaIssueRepresentatives([
      issue({
        correlation_id: "newer-evaluated",
        status: "rca_evaluated",
        updated_at: "2026-07-24T00:02:00Z",
      }),
      issue({
        correlation_id: "ready-plan",
        status: "approval_recommended",
        action_route: "draft_pr",
        updated_at: "2026-07-24T00:01:00Z",
      }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].correlation_id).toBe("ready-plan");
    expect(items[0].attemptCount).toBe(2);
    expect(items[0].recentAttempts.map((attempt) => attempt.correlationId)).toEqual([
      "newer-evaluated",
      "ready-plan",
    ]);
  });

  it("lets the newest terminal attempt close the representative group", () => {
    const items = selectRcaIssueRepresentatives([
      issue({
        correlation_id: "older-pr",
        status: "pr_open",
        pr_url: "https://github.com/acme/platform/pull/7",
        updated_at: "2026-07-24T00:01:00Z",
      }),
      issue({
        correlation_id: "newer-resolved",
        status: "incident_resolved",
        updated_at: "2026-07-24T00:02:00Z",
      }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].correlation_id).toBe("newer-resolved");
    expect(items[0].recentAttempts[0]?.correlationId).toBe("newer-resolved");
  });

  it("uses the latest attempt when no attempt has recovery progress", () => {
    const items = selectRcaIssueRepresentatives([
      issue({
        correlation_id: "older-evaluated",
        updated_at: "2026-07-24T00:01:00Z",
      }),
      issue({
        correlation_id: "newer-evaluated",
        updated_at: "2026-07-24T00:02:00Z",
      }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].correlation_id).toBe("newer-evaluated");
  });

  it("sorts groups by their latest raw attempt, not only the representative timestamp", () => {
    const items = selectRcaIssueRepresentatives([
      issue({
        correlation_id: "group-a-representative",
        status: "approval_recommended",
        action_route: "draft_pr",
        updated_at: "2026-07-24T00:01:00Z",
      }),
      issue({
        correlation_id: "group-a-newer",
        status: "rca_evaluated",
        updated_at: "2026-07-24T00:03:00Z",
      }),
      issue({
        correlation_id: "group-b-newer",
        incident_resource_name: "api-server",
        status: "rca_evaluated",
        updated_at: "2026-07-24T00:02:00Z",
      }),
    ]);

    expect(items.map((item) => item.correlation_id)).toEqual([
      "group-a-representative",
      "group-b-newer",
    ]);
  });
});

import { describe, expect, it, vi } from "vitest";

import { createResourceIssuesAdapter } from "./createResourceIssuesAdapter";

describe("createResourceIssuesAdapter", () => {
  it("preserves server severity and onset without browser classification", async () => {
    const getResourceIssues = vi.fn().mockResolvedValue({
      scope: {
        workspace_id: "workspace-1",
        cluster_id: "cluster-1",
        namespaces: ["target"],
        freshness: "live",
      },
      coverage_availability: "available",
      observed_at: "2026-07-16T05:00:00Z",
      reason_codes: [],
      items: [{
        workspace_id: "workspace-1",
        correlation_id: "corr-1",
        cluster_id: "cluster-1",
        incident_id: "incident-1",
        incident_namespace: "target",
        incident_resource_kind: "Deployment",
        incident_resource_name: "checkout-api",
        incident_symptom: "Unavailable replicas",
        evidence_ref: null,
        current_subject: "incident.detected",
        status: "incident_detected",
        root_cause: null,
        confidence: null,
        supporting_evidence: [],
        missing_evidence: [],
        action_route: null,
        command_id: null,
        pr_url: null,
        error_reason: null,
        updated_at: "2026-07-16T05:01:00Z",
        issue_severity: "warning",
        severity_availability: "available",
        severity_reason_code: null,
        onset: {
          first_observed_at: "2026-07-16T05:00:00Z",
          source: "timeline_created_at",
          timing_kind: null,
          timing_availability: "unavailable",
          timing_reason_code: "health_transition_evidence_unavailable",
        },
      }],
      limit: 25,
      has_more: false,
    });
    const port = createResourceIssuesAdapter({ getResourceIssues });

    const result = await port.loadResourceIssues("cluster-1", {
      resourceType: "deployments",
      kind: "Deployment",
      namespace: "target",
      name: "checkout-api",
    });

    expect(getResourceIssues).toHaveBeenCalledWith({
      clusterId: "cluster-1",
      kind: "Deployment",
      namespace: "target",
      name: "checkout-api",
      limit: 25,
    }, undefined);
    expect(result.items[0]).toMatchObject({
      severity: "warning",
      onset: {
        firstObservedAt: "2026-07-16T05:00:00Z",
        timingKind: null,
        timingAvailability: "unavailable",
      },
    });
  });
});

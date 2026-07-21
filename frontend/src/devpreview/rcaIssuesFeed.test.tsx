// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useRcaIssueDetails } from "./rcaDetailFeed";
import {
  activeIncidentClusterIds,
  isActiveRcaIssue,
  useRcaIssues,
} from "./rcaIssuesFeed";

describe("RCA rehearsal issue scope", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps only online observed target clusters in the live demo scope", () => {
    expect(activeIncidentClusterIds([
      cluster("demo-server", "target", "online", "agent_connected"),
      cluster("management-server", "management", "online", "agent_connected"),
      cluster("game-server", "target", "stale", "error"),
      cluster("expired-server", "target", "install_expired", "expired"),
      cluster("pending-server", "target", "pending", "awaiting_install"),
      cluster("ready-server", "target", "online", "ready"),
    ])).toEqual(["demo-server", "ready-server"]);
  });

  it.each([
    ["approval_recommended", true],
    ["incident_detected", true],
    ["incident_resolved", false],
    ["Incident.Resolved", false],
    ["closed", false],
  ])("classifies %s as active=%s", (status, expected) => {
    expect(isActiveRcaIssue({ status })).toBe(expected);
  });

  it("fans out eligible clusters and removes terminal or cross-scope history", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (request) => {
      const url = String(request);
      if (url.includes("demo-server")) {
        return jsonResponse({ items: [
          issue("demo-active", "demo-server", "approval_recommended"),
          issue("demo-resolved", "demo-server", "incident_resolved"),
          issue("wrong-cluster", "stale-server", "approval_recommended"),
        ] });
      }
      return jsonResponse({ items: [issue("secondary-active", "secondary-server", "incident_detected")] });
    });

    const rendered = renderHook(() => useRcaIssues(["demo-server", "secondary-server"]));

    await waitFor(() => expect(rendered.result.current.status).toBe("ready"));
    expect(rendered.result.current.items.map((item) => item.correlationId)).toEqual([
      "demo-active",
      "secondary-active",
    ]);
    expect(fetchMock.mock.calls.map(([request]) => String(request))).toEqual(expect.arrayContaining([
      "/api/dashboard/rca/issues?cluster_id=demo-server&limit=100",
      "/api/dashboard/rca/issues?cluster_id=secondary-server&limit=100",
    ]));
  });

  it("does not query an unscoped queue when there is no eligible target", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const rendered = renderHook(() => useRcaIssues([]));

    await waitFor(() => expect(rendered.result.current.status).toBe("ready"));
    expect(rendered.result.current.items).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the same live active scope for the issue detail surface", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ items: [
      issue("demo-active", "demo-server", "approval_recommended"),
      issue("demo-resolved", "demo-server", "incident_resolved"),
    ] }));

    const rendered = renderHook(() => useRcaIssueDetails(["demo-server"]));

    await waitFor(() => expect(rendered.result.current.status).toBe("ready"));
    expect(rendered.result.current.items).toHaveLength(1);
    expect(rendered.result.current.items[0]).toMatchObject({
      correlationId: "demo-active",
      clusterId: "demo-server",
      status: "approval_recommended",
    });
  });
});

function cluster(
  id: string,
  role: "management" | "target",
  connectionStatus: string,
  connectionStage: "agent_connected" | "ready" | "error" | "expired" | "awaiting_install",
) {
  return { id, role, connectionStatus, connectionStage };
}

function issue(correlationId: string, clusterId: string, status: string) {
  return {
    workspace_id: "workspace-1",
    correlation_id: correlationId,
    cluster_id: clusterId,
    incident_id: `incident-${correlationId}`,
    incident_namespace: "demo",
    incident_resource_kind: "Pod",
    incident_resource_name: `pod-${correlationId}`,
    incident_symptom: "Pod readiness failure",
    evidence_ref: null,
    current_subject: "incident.detected",
    status,
    root_cause: null,
    confidence: null,
    supporting_evidence: [],
    missing_evidence: [],
    action_route: null,
    command_id: null,
    pr_url: null,
    error_reason: null,
    updated_at: "2026-07-21T00:00:00Z",
    issue_severity: "warning",
    severity_availability: "available",
    severity_reason_code: null,
    situation_summary: null,
    recommended_action_summary: null,
    evidence_summary: null,
    evidence_bundle_summary: null,
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

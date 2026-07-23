import { describe, expect, it } from "vitest";

import { rcaReportSchema } from "../api/evidence-schemas";
import { parseEvidenceObjectReference } from "./rcaDetailFeed";

describe("parseEvidenceObjectReference", () => {
  it("extracts an RCA correlation and provider fragment", () => {
    expect(parseEvidenceObjectReference(
      "object://evidence/8e7f72bf-9ce5-4fb4-a60d-253f55a299a4.json#traces:cluster_recent_traces",
    )).toEqual({
      value: "object://evidence/8e7f72bf-9ce5-4fb4-a60d-253f55a299a4.json#traces:cluster_recent_traces",
      correlationId: "8e7f72bf-9ce5-4fb4-a60d-253f55a299a4",
      source: "traces",
      name: "cluster_recent_traces",
    });
  });

  it("rejects unrelated and source-less references", () => {
    expect(parseEvidenceObjectReference("https://example.test/evidence")).toBeNull();
    expect(parseEvidenceObjectReference("object://evidence/correlation.json")).toBeNull();
  });
});

describe("RCA report detail contract", () => {
  it("accepts the evidence summaries emitted by the backend", () => {
    const parsed = rcaReportSchema.parse({
      id: 1,
      workspace_id: "default",
      correlation_id: "correlation-1",
      root_cause: "upstream_latency",
      action: "rollback",
      incident_id: "incident-1",
      cluster_id: "target-1",
      symptom: "request latency",
      severity: "warning",
      first_seen_at: "2026-07-24T00:00:00Z",
      confidence: 0.91,
      reason: "Tempo에서 오류 span이 확인됨",
      evidence_ref: "object://evidence/correlation-1.json",
      supporting_evidence: [],
      missing_evidence: [],
      evidence_summary: "trace 오류율이 증가했습니다.",
      evidence_bundle_summary: "traces, metrics",
      created_at: "2026-07-24T00:01:00Z",
      resource_kind: "Deployment",
      resource_name: "checkout",
      namespace: "sandbox",
      secondary_symptoms: [],
      selected_candidate_id: null,
      candidates: [],
      supporting_evidence_refs: [],
      missing_evidence_checks: [],
      narrative: null,
      narrative_status: "unavailable",
    });

    expect(parsed.evidence_summary).toBe("trace 오류율이 증가했습니다.");
    expect(parsed.evidence_bundle_summary).toBe("traces, metrics");
  });
});

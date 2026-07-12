import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import {
  getRemediationBundle as getPublicRemediationBundle,
  remediationBundleResponseSchema as publicRemediationBundleResponseSchema,
} from "./index";
import { getRemediationBundle } from "./rca-bundle";
import { remediationBundleResponseSchema } from "./rca-bundle-schemas";

const EVIDENCE_REF = {
  source: "kubernetes",
  name: "events",
  check_id: "events",
  summary: "Failed to pull image",
  query: "events(namespace=sandbox)",
  evidence_ref: "evidence://incident-1",
  schema_version: 1,
  source_version: null,
  collector: "cluster-agent",
  collector_version: null,
  query_version: null,
  collected_at: "2026-07-13T01:00:00+00:00",
  evidence_key: null,
  source_id: null,
  agent_id: "agent-1",
  window_start: null,
};

const MISSING_CHECK = {
  check_id: "loki:application-logs",
  source: "loki",
  status: "missing",
  reason: "query pending",
};

const ACTION_DRAFT = {
  action_type: "rollout_restart",
  namespace: "sandbox",
  resource_kind: "Deployment",
  resource_name: "checkout-api",
  reason: "recover from image pull failure",
  risk_level: "medium",
  dry_run: false,
  source_evidence: ["kubernetes:events"],
  params: {
    deployment: "checkout-api",
    strategy: { max_unavailable: 1 },
    channels: ["events", "metrics"],
  },
};

const RECOVERY_CANDIDATE = {
  action_id: "remediation-restart",
  title: "Restart deployment",
  description: "Restart checkout-api after image correction",
  draft: ACTION_DRAFT,
  route: "agent_command",
  rank: 1,
  score: 0.94,
  risk_level: "medium",
  blast_radius: "single_deployment",
  approval_required: true,
  prerequisites: ["image tag corrected"],
  validation_checks: ["deployment.available_replicas"],
  rollback_plan: "restore previous image tag",
  evidence_refs: ["evidence://incident-1"],
};

const REMEDIATION = {
  status: "selected",
  selected_action_id: "remediation-restart",
  selected_by: "user-1",
  candidates: [RECOVERY_CANDIDATE],
  evidence_ref: "evidence://incident-1",
};

const DIAGNOSIS = {
  root_cause: "image_pull_backoff",
  confidence: 0.91,
  supporting_evidence: ["kubernetes:events"],
  missing_evidence: ["loki:application_logs"],
  supporting_evidence_refs: [EVIDENCE_REF],
  missing_evidence_checks: [MISSING_CHECK],
  selected_candidate_id: "diagnosis-image-pull",
};

const META = {
  correlation_id: "corr-1",
  incident_id: "incident-1",
  cluster_id: "cluster-1",
  workspace_id: "workspace-1",
  created_at: "2026-07-13T01:00:00+00:00",
};

const REMEDIATION_BUNDLE = {
  meta: META,
  diagnosis: DIAGNOSIS,
  remediation: REMEDIATION,
};

const STRICT_DRIFT_CASES = [
  ["response", { ...REMEDIATION_BUNDLE, unexpected: true }],
  ["meta", { ...REMEDIATION_BUNDLE, meta: { ...META, unexpected: true } }],
  ["diagnosis", {
    ...REMEDIATION_BUNDLE,
    diagnosis: { ...DIAGNOSIS, unexpected: true },
  }],
  ["evidence ref", {
    ...REMEDIATION_BUNDLE,
    diagnosis: {
      ...DIAGNOSIS,
      supporting_evidence_refs: [{ ...EVIDENCE_REF, unexpected: true }],
    },
  }],
  ["missing check", {
    ...REMEDIATION_BUNDLE,
    diagnosis: {
      ...DIAGNOSIS,
      missing_evidence_checks: [{ ...MISSING_CHECK, unexpected: true }],
    },
  }],
  ["remediation", {
    ...REMEDIATION_BUNDLE,
    remediation: { ...REMEDIATION, unexpected: true },
  }],
  ["candidate", {
    ...REMEDIATION_BUNDLE,
    remediation: {
      ...REMEDIATION,
      candidates: [{ ...RECOVERY_CANDIDATE, unexpected: true }],
    },
  }],
  ["draft", {
    ...REMEDIATION_BUNDLE,
    remediation: {
      ...REMEDIATION,
      candidates: [{
        ...RECOVERY_CANDIDATE,
        draft: { ...ACTION_DRAFT, unexpected: true },
      }],
    },
  }],
] as const;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("RemediationBundle API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes the verified endpoint and response schema through the public API barrel", () => {
    expect(getPublicRemediationBundle).toBe(getRemediationBundle);
    expect(publicRemediationBundleResponseSchema).toBe(remediationBundleResponseSchema);
  });

  it("loads every bundle layer without merging the two selected ids", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(REMEDIATION_BUNDLE),
    );

    const result = await getRemediationBundle("corr-1");

    expect(result).toEqual(REMEDIATION_BUNDLE);
    expect(result.diagnosis.selected_candidate_id).toBe("diagnosis-image-pull");
    expect(result.remediation?.selected_action_id).toBe("remediation-restart");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/rca/bundles/corr-1",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("accepts a normal 200 response with no recovery plan", async () => {
    const payload = { ...REMEDIATION_BUNDLE, remediation: null };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));

    await expect(getRemediationBundle("corr-1")).resolves.toEqual(payload);
  });

  it("accepts omitted nullable evidence fields and the open draft params record", async () => {
    const payload = {
      ...REMEDIATION_BUNDLE,
      diagnosis: {
        ...DIAGNOSIS,
        supporting_evidence_refs: [{ source: "metrics", name: "memory_usage" }],
        missing_evidence_checks: [{ check_id: "logs" }],
      },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));

    await expect(getRemediationBundle("corr-1")).resolves.toEqual(payload);
  });

  it("encodes the correlation id and preserves AbortSignal identity", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("Aborted", "AbortError");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);

    await expect(
      getRemediationBundle("corr/1", { signal: controller.signal }),
    ).rejects.toBe(abortError);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/rca/bundles/corr%2F1",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("preserves concealed missing bundles as not-found errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "Remediation bundle not found" }, 404),
    );

    await expect(getRemediationBundle("missing")).rejects.toMatchObject({
      kind: "not-found",
      status: 404,
      detail: "Remediation bundle not found",
    } satisfies Partial<ApiError>);
  });

  it.each(STRICT_DRIFT_CASES)("rejects unknown fields in the %s layer", async (_layer, payload) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));

    await expect(getRemediationBundle("corr-1")).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it.each([
    ["missing remediation key", { meta: META, diagnosis: DIAGNOSIS }],
    ["fractional candidate rank", {
      ...REMEDIATION_BUNDLE,
      remediation: {
        ...REMEDIATION,
        candidates: [{ ...RECOVERY_CANDIDATE, rank: 1.5 }],
      },
    }],
    ["non-number confidence", {
      ...REMEDIATION_BUNDLE,
      diagnosis: { ...DIAGNOSIS, confidence: "high" },
    }],
  ])("rejects %s", async (_case, payload) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));

    await expect(getRemediationBundle("corr-1")).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });
});

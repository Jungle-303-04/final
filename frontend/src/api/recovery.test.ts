import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import {
  getRecoveryPlanByCorrelation,
  selectRecoveryAction,
} from "./recovery";

const RECOVERY_PLAN = {
  plan_id: "plan-123",
  correlation_id: "corr-123",
  incident_id: "inc-456",
  evidence_ref: "evidence-123",
  status: "selection_requested",
  summary: "Choose a safe action for the memory pressure incident",
  target: { cluster_id: "prod-seoul-01", namespace: "default", name: "api" },
  recommended_action_id: "increase-memory",
  execution_route: "approval",
  selection_required: true,
  selected_action_id: null,
  selected_by: null,
  selected_action: null,
  candidates: [
    {
      action_id: "increase-memory",
      title: "Increase memory limit",
      description: "Raise the api Deployment memory limit to 1Gi",
      route: "deployment.patch",
      rank: 1,
      score: 0.86,
      risk_level: "medium",
      blast_radius: "one Deployment",
      approval_required: true,
      prerequisites: ["confirm capacity"],
      validation_checks: ["rollout healthy"],
      rollback_plan: "Restore the previous memory limit",
      evidence_refs: ["evidence-123"],
    },
  ],
};

const ACCEPTED = {
  accepted: true,
  event_id: "evt-789",
  correlation_id: "corr-123",
  command_id: null,
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("recovery plan API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the recovery plan by correlation id", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(RECOVERY_PLAN));

    await expect(getRecoveryPlanByCorrelation("corr-123")).resolves.toEqual(
      RECOVERY_PLAN,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/rca/recovery-plans/by-correlation/corr-123",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("selects one action through the correlation path with opaque ids in JSON", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(ACCEPTED));

    await expect(
      selectRecoveryAction("corr-123", "plan-123", "increase-memory", {
        reason: "Memory pressure is confirmed by the evidence",
      }),
    ).resolves.toEqual(ACCEPTED);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/rca/recovery-plans/by-correlation/corr-123/actions/select",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          expected_plan_id: "plan-123",
          action_id: "increase-memory",
          reason: "Memory pressure is confirmed by the evidence",
        }),
      }),
    );
  });

  it("sends the required empty JSON object when no reason is provided", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(ACCEPTED));

    await expect(
      selectRecoveryAction(
        "corr/123",
        "object://evidence/plan.json",
        "object://evidence/action.json:restart",
      ),
    ).resolves.toEqual(ACCEPTED);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/rca/recovery-plans/by-correlation/corr%2F123/actions/select",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          expected_plan_id: "object://evidence/plan.json",
          action_id: "object://evidence/action.json:restart",
        }),
        headers: expect.any(Headers),
      }),
    );
  });

  it("preserves an explicit null reason and does not derive one client-side", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(ACCEPTED));

    await selectRecoveryAction("corr-123", "plan-123", "increase-memory", { reason: null });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/rca/recovery-plans/by-correlation/corr-123/actions/select",
      expect.objectContaining({
        body: JSON.stringify({
          expected_plan_id: "plan-123",
          action_id: "increase-memory",
          reason: null,
        }),
      }),
    );
  });

  it("encodes correlation ids and forwards AbortSignal", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("Aborted", "AbortError");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);

    await expect(
      getRecoveryPlanByCorrelation("corr/123", { signal: controller.signal }),
    ).rejects.toBe(abortError);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/rca/recovery-plans/by-correlation/corr%2F123",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("preserves a conflict when the plan changed or is already resolved", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "recovery plan changed" }, 409),
    );

    await expect(
      selectRecoveryAction("corr-123", "plan-123", "increase-memory"),
    ).rejects.toMatchObject({
      kind: "http",
      status: 409,
      detail: "recovery plan changed",
    } satisfies Partial<ApiError>);
  });

  it("rejects malformed recovery plans", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ ...RECOVERY_PLAN, candidates: [{ action_id: "only-id" }] }),
    );

    await expect(getRecoveryPlanByCorrelation("corr-123")).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it("rejects unknown recovery plan fields as contract drift", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ ...RECOVERY_PLAN, provider: "unknown" }),
    );

    await expect(getRecoveryPlanByCorrelation("corr-123")).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });
});

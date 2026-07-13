import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import {
  getApplication,
  listApplicationDeployments,
  listApplicationRuns,
  listApplications,
} from "./applications";

const APPLICATION = {
  application_id: "app-payment",
  name: "payment-api",
  repo_ref: "team/payment-api",
  default_branch: "main",
  manifest_path: "deploy/overlays/prod",
  status: "active",
};

const PROMOTION_GATE = {
  eligible: true,
  command_status: "completed",
  command_completed: true,
  applied: null,
  applied_not_false: true,
  failed_resources: [],
  failed_resource_count: 0,
  rollout_ready: null,
  rollout_ready_not_false: true,
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Application deployment history API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lists Applications with the backend default limit", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ applications: [APPLICATION] }));

    await expect(listApplications()).resolves.toEqual({
      applications: [APPLICATION],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/applications?limit=100",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("loads an Application and its deployment/run history", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ application: APPLICATION }))
      .mockResolvedValueOnce(
        jsonResponse({ deployments: [{ cluster_id: "prod-seoul-01" }] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ runs: [{ run_id: "run-123", status: "SUCCEEDED" }] }),
      );

    await expect(getApplication("app/payment")).resolves.toEqual({
      application: APPLICATION,
    });
    await expect(
      listApplicationDeployments("app/payment", { limit: 25 }),
    ).resolves.toEqual({ deployments: [{ cluster_id: "prod-seoul-01" }] });
    await expect(
      listApplicationRuns("app/payment", { limit: 25 }),
    ).resolves.toEqual({ runs: [{ run_id: "run-123", status: "SUCCEEDED" }] });

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/applications/app%2Fpayment",
      "/api/applications/app%2Fpayment/deployments?limit=25",
      "/api/applications/app%2Fpayment/runs?limit=25",
    ]);
  });

  it("forwards AbortSignal to history requests", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("Aborted", "AbortError");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);

    await expect(
      listApplicationRuns("app-payment", { signal: controller.signal }),
    ).rejects.toBe(abortError);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/applications/app-payment/runs?limit=100",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("rejects invalid limits before making a request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(listApplications({ limit: 501 })).rejects.toThrow(
      "application history limit must be an integer from 1 to 500",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an empty Application identity before making a request", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    expect(() => getApplication("")).toThrow("applicationId must not be empty");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed Application list responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ applications: "not-an-array" }),
    );

    await expect(listApplications()).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it("strictly closes response envelopes while preserving inner JsonMap fields", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({ applications: [{ ...APPLICATION, extension: { source: "provider" } }] }),
    );
    await expect(listApplications()).resolves.toEqual({
      applications: [{ ...APPLICATION, extension: { source: "provider" } }],
    });

    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ applications: [APPLICATION], next_cursor: "invented" }),
    );
    await expect(listApplications()).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it("preserves additive run fields and accepts absent or nullable promotion gates", async () => {
    const futureRunField = { source_revision: "sha-next" };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        runs: [
          { workflow_run_id: "run-absent", future_run_field: futureRunField },
          { workflow_run_id: "run-null", promotion_gate: null },
          {
            workflow_run_id: "run-gated",
            promotion_gate: PROMOTION_GATE,
            steps: [{ details: { changes: [{ kind: "Deployment" }] } }],
          },
        ],
      }),
    );

    await expect(listApplicationRuns("app-payment")).resolves.toEqual({
      runs: [
        { workflow_run_id: "run-absent", future_run_field: futureRunField },
        { workflow_run_id: "run-null", promotion_gate: null },
        {
          workflow_run_id: "run-gated",
          promotion_gate: PROMOTION_GATE,
          steps: [{ details: { changes: [{ kind: "Deployment" }] } }],
        },
      ],
    });
  });

  it.each([
    [
      "an unknown promotion gate field",
      { ...PROMOTION_GATE, observation_window: "invented" },
    ],
    [
      "an eligible flag that contradicts the four gate conditions",
      { ...PROMOTION_GATE, eligible: false },
    ],
    [
      "a failed resource count that differs from the resource list",
      {
        ...PROMOTION_GATE,
        eligible: false,
        failed_resource_count: 1,
      },
    ],
    [
      "an applied not-false flag that contradicts the tri-state value",
      {
        ...PROMOTION_GATE,
        eligible: false,
        applied: false,
        applied_not_false: true,
      },
    ],
  ])("rejects %s", async (_caseName, promotionGate) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        runs: [{ workflow_run_id: "run-invalid", promotion_gate: promotionGate }],
      }),
    );

    await expect(listApplicationRuns("app-payment")).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });
});

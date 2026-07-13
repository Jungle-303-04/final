import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import { restartDeployment, scaleDeployment } from "./deployments";

const ACCEPTED = {
  accepted: true,
  event_id: "evt-deployment-1",
  correlation_id: "corr-deployment-1",
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Deployment action API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("requests a Deployment restart with optional audit references", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(ACCEPTED));

    await expect(
      restartDeployment("prod/1", "payments", "api", {
        reason: "Apply the approved incident recovery action",
        approvalRef: "approval-7",
        policyDecisionRef: "policy-7",
      }),
    ).resolves.toEqual(ACCEPTED);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters/prod%2F1/namespaces/payments/deployments/api/restart",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          reason: "Apply the approved incident recovery action",
          approval_ref: "approval-7",
          policy_decision_ref: "policy-7",
        }),
      }),
    );
  });

  it("requests a replica count change", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(ACCEPTED));

    await expect(
      scaleDeployment("prod-1", "payments", "api", {
        replicas: 5,
        reason: "Handle increased traffic",
      }),
    ).resolves.toEqual(ACCEPTED);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters/prod-1/namespaces/payments/deployments/api/scale",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ replicas: 5, reason: "Handle increased traffic" }),
      }),
    );
  });

  it("passes an AbortSignal to action requests", async () => {
    const controller = new AbortController();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(ACCEPTED));

    await restartDeployment("prod-1", "default", "api", {
      signal: controller.signal,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters/prod-1/namespaces/default/deployments/api/restart",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("rejects invalid action input before making a request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    expect(() =>
      scaleDeployment("prod-1", "default", "api", { replicas: 101 }),
    ).toThrow("deployment replicas must be an integer from 0 to 100");
    expect(() =>
      restartDeployment("prod-1", "default", "api", { reason: "x".repeat(501) }),
    ).toThrow("deployment action reason must be at most 500 characters");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects empty deployment identity segments before making a request", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    expect(() => restartDeployment("", "default", "api")).toThrow(
      "deployment clusterId must not be empty",
    );
    expect(() => restartDeployment("prod-1", "", "api")).toThrow(
      "deployment namespace must not be empty",
    );
    expect(() => restartDeployment("prod-1", "default", "")).toThrow(
      "deployment name must not be empty",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not retry a possibly-sent restart mutation", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("connection closed after send"));

    await expect(restartDeployment("prod-1", "default", "api")).rejects.toMatchObject({
      kind: "network",
    } satisfies Partial<ApiError>);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves backend errors and rejects malformed responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "deployment is not allowed" }, 403),
    );
    await expect(restartDeployment("prod-1", "default", "api")).rejects.toMatchObject({
      kind: "forbidden",
      status: 403,
      detail: "deployment is not allowed",
    } satisfies Partial<ApiError>);

    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ accepted: true, event_id: "evt-only", correlation_id: 1 }),
    );
    await expect(restartDeployment("prod-1", "default", "api")).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);

    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ ...ACCEPTED, command_id: "command-not-in-contract" }),
    );
    await expect(restartDeployment("prod-1", "default", "api")).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });
});

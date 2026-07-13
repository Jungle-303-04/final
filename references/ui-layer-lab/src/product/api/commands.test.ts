import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import { submitCommand } from "./commands";

const ACCEPTED = {
  accepted: true,
  event_id: "evt-command-1",
  correlation_id: "corr-command-1",
  command_id: "cmd-command-1",
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("general command API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("submits a command with the backend field names", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(ACCEPTED));

    await expect(
      submitCommand({
        clusterId: "prod-1",
        action: "rollout_restart",
        namespace: "payments",
        reason: "Recover the API deployment",
        diff: { resource: "deployment/api" },
        approvalRef: "approval-1",
        policyDecisionRef: "policy-1",
      }),
    ).resolves.toEqual(ACCEPTED);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/commands",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          cluster_id: "prod-1",
          action: "rollout_restart",
          namespace: "payments",
          reason: "Recover the API deployment",
          diff: { resource: "deployment/api" },
          approval_ref: "approval-1",
          policy_decision_ref: "policy-1",
        }),
      }),
    );
  });

  it("passes an AbortSignal and accepts a command receipt", async () => {
    const controller = new AbortController();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(ACCEPTED));

    await expect(
      submitCommand(
        {
          clusterId: "prod-1",
          action: "apply_manifest",
          namespace: "sandbox",
        },
        { signal: controller.signal },
      ),
    ).resolves.toEqual(ACCEPTED);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/commands",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("preserves a null command id when approval prevents derivation at submission time", async () => {
    const receipt = { ...ACCEPTED, command_id: null };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(receipt));

    await expect(
      submitCommand({
        clusterId: "prod-1",
        action: "apply_manifest",
        namespace: "sandbox",
      }),
    ).resolves.toEqual(receipt);
  });

  it("rejects missing identifiers before making a request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    expect(() =>
      submitCommand({ clusterId: "prod-1", action: " ", namespace: "sandbox" }),
    ).toThrow("command action is required");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves backend errors and rejects malformed receipts", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "command is not allowed" }, 403),
    );
    await expect(
      submitCommand({ clusterId: "prod-1", action: "rollout_restart", namespace: "sandbox" }),
    ).rejects.toMatchObject({
      kind: "forbidden",
      status: 403,
      detail: "command is not allowed",
    } satisfies Partial<ApiError>);

    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ accepted: true, event_id: "evt-only", correlation_id: 7 }),
    );
    await expect(
      submitCommand({ clusterId: "prod-1", action: "rollout_restart", namespace: "sandbox" }),
    ).rejects.toMatchObject({ kind: "invalid-payload", status: 200 } satisfies Partial<ApiError>);

    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        accepted: true,
        event_id: "evt-only",
        correlation_id: "corr-only",
      }),
    );
    await expect(
      submitCommand({ clusterId: "prod-1", action: "rollout_restart", namespace: "sandbox" }),
    ).rejects.toMatchObject({ kind: "invalid-payload", status: 200 } satisfies Partial<ApiError>);
  });
});

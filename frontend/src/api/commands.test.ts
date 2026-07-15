import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import { cancelCommand, retryCommand, submitCommand } from "./commands";

const ACCEPTED = {
  accepted: true,
  event_id: "evt-command-1",
  audit_event_id: "evt-command-1",
  correlation_id: "corr-command-1",
  command_id: "cmd-command-1",
  status: "queued",
};

const CONTROL_ACCEPTED = {
  accepted: true,
  action: "cancel",
  event_id: "evt-control-1",
  audit_event_id: "evt-control-1",
  correlation_id: "corr-command-1",
  command_id: "cmd-command-1",
  status: "cancel_requested",
  idempotent: false,
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
        confirmation: true,
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
          confirmation: true,
        }),
      }),
    );
  });

  it("sends cancel and retry controls with a caller-owned idempotency key", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(CONTROL_ACCEPTED, 202));

    await expect(cancelCommand({
      commandId: "cmd-command-1",
      idempotencyKey: "cancel-key-1",
      reason: "operator stopped rollout",
    })).resolves.toEqual(CONTROL_ACCEPTED);

    const [cancelPath, cancelRequest] = fetchMock.mock.calls[0] ?? [];
    expect(cancelPath).toBe("/api/commands/cmd-command-1/cancel");
    expect(cancelRequest).toMatchObject({ method: "POST" });
    expect(new Headers((cancelRequest as RequestInit).headers).get("idempotency-key"))
      .toBe("cancel-key-1");

    vi.mocked(fetchMock).mockResolvedValueOnce(jsonResponse({
      ...CONTROL_ACCEPTED,
      action: "retry",
      status: "queued",
      attempt_id: "attempt-2",
    }, 202));
    await expect(retryCommand({
      commandId: "cmd-command-1",
      idempotencyKey: "retry-key-1",
    })).resolves.toMatchObject({ action: "retry", attempt_id: "attempt-2" });
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
          confirmation: true,
        },
        { signal: controller.signal },
      ),
    ).resolves.toEqual(ACCEPTED);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/commands",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("requires the stable command id that begins realtime tracking at acceptance", async () => {
    const receipt = { ...ACCEPTED, command_id: "cmd-accepted-before-approval" };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(receipt));

    await expect(
      submitCommand({
        clusterId: "prod-1",
        action: "apply_manifest",
        namespace: "sandbox",
        confirmation: true,
      }),
    ).resolves.toEqual(receipt);
  });

  it("rejects missing identifiers before making a request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    expect(() =>
      submitCommand({ clusterId: "prod-1", action: " ", namespace: "sandbox", confirmation: true }),
    ).toThrow("command action is required");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves backend errors and rejects malformed receipts", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "command is not allowed" }, 403),
    );
    await expect(
      submitCommand({ clusterId: "prod-1", action: "rollout_restart", namespace: "sandbox", confirmation: true }),
    ).rejects.toMatchObject({
      kind: "forbidden",
      status: 403,
      detail: "command is not allowed",
    } satisfies Partial<ApiError>);

    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ accepted: true, event_id: "evt-only", audit_event_id: "evt-only", correlation_id: 7 }),
    );
    await expect(
      submitCommand({ clusterId: "prod-1", action: "rollout_restart", namespace: "sandbox", confirmation: true }),
    ).rejects.toMatchObject({ kind: "invalid-payload", status: 200 } satisfies Partial<ApiError>);

    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        accepted: true,
        event_id: "evt-only",
        audit_event_id: "evt-other",
        correlation_id: "corr-only",
        command_id: "cmd-only",
        status: "queued",
      }),
    );
    await expect(
      submitCommand({ clusterId: "prod-1", action: "rollout_restart", namespace: "sandbox", confirmation: true }),
    ).rejects.toMatchObject({ kind: "invalid-payload", status: 200 } satisfies Partial<ApiError>);
  });
});

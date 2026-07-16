import { describe, expect, it, vi } from "vitest";

import { createResourceActionsAdapter } from "./createResourceActionsAdapter";
import type { ResourceActionCapability } from "./resourceCapabilitiesContract";

const CAPABILITY: ResourceActionCapability = {
  capabilityId: "deployment.scale",
  label: "Scale",
  description: "Change the desired replica count and stream the operation result.",
  execution: "command",
  confirmationRequired: true,
  realtime: true,
  inputSchema: [{
    key: "replicas",
    label: "Replicas",
    type: "integer",
    required: true,
    minimum: 0,
    maximum: 100,
    default: 1,
  }],
  method: "POST",
  path: "/clusters/cluster-1/namespaces/shop/deployments/checkout-api/scale",
};

const EXECUTION = {
  capabilityId: "cronjob.trigger",
  idempotencyKey: "resource-action-cronjob-key-1",
  resourceId: "resource-cronjob-nightly",
  snapshotId: "snapshot-42",
  revision: "a".repeat(64),
  resource: {
    apiGroup: "batch",
    version: "v1",
    kind: "CronJob",
    namespace: "shop",
    name: "nightly",
    uid: "cronjob-uid-1",
  },
} as const;

describe("resource action adapter", () => {
  it("submits the server-owned descriptor and its validated values without action branching", async () => {
    const executeResourceCapability = vi.fn().mockResolvedValue({
      accepted: true,
      event_id: "event-1",
      audit_event_id: "event-1",
      correlation_id: "correlation-1",
      command_id: "command-1",
      status: "queued",
    });
    const port = createResourceActionsAdapter({ executeResourceCapability });

    await expect(port.execute(CAPABILITY, { replicas: 4 })).resolves.toEqual({
      accepted: true,
      eventId: "event-1",
      auditEventId: "event-1",
      correlationId: "correlation-1",
      commandId: "command-1",
      status: "queued",
    });
    expect(executeResourceCapability).toHaveBeenCalledWith(
      CAPABILITY,
      { replicas: 4 },
      undefined,
      undefined,
    );
  });

  it("rejects a non-command capability before an HTTP request is attempted", async () => {
    const executeResourceCapability = vi.fn();
    const port = createResourceActionsAdapter({ executeResourceCapability });

    await expect(port.execute({ ...CAPABILITY, execution: "terminal" }, {}))
      .rejects.toMatchObject({ code: "invalid-request" });
    expect(executeResourceCapability).not.toHaveBeenCalled();
  });

  it("passes one exact CronJob execution binding without copying action-specific transport", async () => {
    const executeResourceCapability = vi.fn().mockResolvedValue({
      accepted: true,
      event_id: "event-1",
      audit_event_id: "event-1",
      correlation_id: "correlation-1",
      command_id: "command-1",
      status: "queued",
    });
    const port = createResourceActionsAdapter({ executeResourceCapability });
    const cronjobCapability = {
      ...CAPABILITY,
      capabilityId: "cronjob.trigger",
      inputSchema: [],
      path: "/clusters/cluster-1/namespaces/shop/cronjobs/nightly/trigger",
    };

    await port.execute(cronjobCapability, {}, EXECUTION);

    expect(executeResourceCapability).toHaveBeenCalledWith(
      cronjobCapability,
      {},
      EXECUTION,
      undefined,
    );
  });
});

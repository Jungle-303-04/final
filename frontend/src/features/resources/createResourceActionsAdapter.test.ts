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

describe("resource action adapter", () => {
  it("submits the server-owned descriptor and its validated values without action branching", async () => {
    const executeResourceCapability = vi.fn().mockResolvedValue({
      accepted: true,
      event_id: "event-1",
      correlation_id: "correlation-1",
      command_id: "command-1",
    });
    const port = createResourceActionsAdapter({ executeResourceCapability });

    await expect(port.execute(CAPABILITY, { replicas: 4 })).resolves.toEqual({
      accepted: true,
      eventId: "event-1",
      correlationId: "correlation-1",
      commandId: "command-1",
    });
    expect(executeResourceCapability).toHaveBeenCalledWith(CAPABILITY, { replicas: 4 }, undefined);
  });

  it("rejects a non-command capability before an HTTP request is attempted", async () => {
    const executeResourceCapability = vi.fn();
    const port = createResourceActionsAdapter({ executeResourceCapability });

    await expect(port.execute({ ...CAPABILITY, execution: "terminal" }, {}))
      .rejects.toMatchObject({ code: "invalid-request" });
    expect(executeResourceCapability).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import { executeResourceCapability } from "./resource-capability-actions";

describe("server-discovered resource action API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("posts only the supplied descriptor path, values, and direct-execution confirmation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      accepted: true,
      event_id: "event-1",
      correlation_id: "correlation-1",
      command_id: "command-1",
    }), { status: 200 }));

    await expect(executeResourceCapability(
      "/clusters/cluster-1/namespaces/shop/deployments/checkout-api/scale",
      { replicas: 4 },
    )).resolves.toMatchObject({ command_id: "command-1" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters/cluster-1/namespaces/shop/deployments/checkout-api/scale",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          replicas: 4,
          direct_execution: true,
          direct_execution_confirmed: true,
        }),
      }),
    );
  });

  it("rejects paths that cannot be a same-origin API capability", () => {
    expect(() => executeResourceCapability("https://invalid.example/action", {})).toThrow(TypeError);
    expect(() => executeResourceCapability("//invalid.example/action", {})).toThrow(TypeError);
  });

  it("rejects a malformed direct-execution receipt", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      accepted: true,
      event_id: "event-1",
      correlation_id: "correlation-1",
      unexpected: true,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

    await expect(executeResourceCapability("/clusters/cluster-1/actions/restart", {}))
      .rejects.toMatchObject({ kind: "invalid-payload", status: 200 } satisfies Partial<ApiError>);
  });
});

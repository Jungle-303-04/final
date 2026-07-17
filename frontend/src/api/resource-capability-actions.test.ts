import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import { executeResourceCapability } from "./resource-capability-actions";

describe("server-discovered resource action API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("posts only the supplied descriptor path, values, and target-impact confirmation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      accepted: true,
      event_id: "event-1",
      audit_event_id: "event-1",
      correlation_id: "correlation-1",
      command_id: "command-1",
      status: "queued",
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
          confirmation: true,
        }),
      }),
    );
  });

  it("binds a CronJob mutation to the exact capability snapshot, ResourceRef, and idempotency key", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      accepted: true,
      event_id: "event-cronjob-1",
      audit_event_id: "event-cronjob-1",
      correlation_id: "correlation-cronjob-1",
      command_id: "command-cronjob-1",
      status: "queued",
    }), { status: 202 }));

    await executeResourceCapability(
      "/clusters/cluster-1/namespaces/shop/cronjobs/nightly/trigger",
      {},
      {
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
      },
    );

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(request.headers).get("Idempotency-Key"))
      .toBe("resource-action-cronjob-key-1");
    expect(request.body).toBe(JSON.stringify({
      resource_id: "resource-cronjob-nightly",
      snapshot_id: "snapshot-42",
      capability_revision: "a".repeat(64),
      resource: {
        api_group: "batch",
        version: "v1",
        kind: "CronJob",
        namespace: "shop",
        name: "nightly",
        uid: "cronjob-uid-1",
      },
      confirmation: true,
    }));
  });

  it("binds maintenance actions to the exact capability snapshot and dynamic inputs", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      accepted: true,
      event_id: "event-drain-1",
      audit_event_id: "event-drain-1",
      correlation_id: "correlation-drain-1",
      command_id: "command-drain-1",
      status: "queued",
    }), { status: 202 }));
    const context = {
      capabilityId: "node.drain",
      idempotencyKey: "resource-action-node-drain-1",
      resourceId: "resource-node-worker-a",
      snapshotId: "snapshot-42",
      revision: "b".repeat(64),
      resource: {
        apiGroup: "",
        version: "v1",
        kind: "Node",
        namespace: null,
        name: "worker-a",
        uid: "node-uid-1",
      },
    };

    await executeResourceCapability(
      "/clusters/cluster-1/nodes/worker-a/drain",
      { timeout_seconds: 120, max_parallel: 8 },
      context,
    );

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(request.headers).get("Idempotency-Key"))
      .toBe("resource-action-node-drain-1");
    expect(request.body).toBe(JSON.stringify({
      timeout_seconds: 120,
      max_parallel: 8,
      resource_id: "resource-node-worker-a",
      snapshot_id: "snapshot-42",
      capability_revision: "b".repeat(64),
      resource: {
        api_group: "",
        version: "v1",
        kind: "Node",
        namespace: null,
        name: "worker-a",
        uid: "node-uid-1",
      },
      confirmation: true,
    }));
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

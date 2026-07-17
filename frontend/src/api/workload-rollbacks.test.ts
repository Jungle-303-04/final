import { beforeEach, describe, expect, it, vi } from "vitest";

import { getWorkloadRollbackPreview } from "./workload-rollbacks";

const resource = {
  api_group: "apps",
  version: "v1",
  kind: "Deployment",
  namespace: "shop",
  name: "checkout",
  uid: "deployment-uid-1",
};

const preview = {
  availability: "available" as const,
  completeness: "exact" as const,
  reason: null,
  snapshot_id: "snapshot-42",
  current: {
    resource,
    resource_version: "42",
    template_sha256: `sha256:${"a".repeat(64)}`,
  },
  revisions: [{
    revision: "2",
    resource: {
      ...resource,
      kind: "ReplicaSet",
      name: "checkout-r2",
      uid: "revision-uid-2",
    },
    resource_version: "2",
    created_at: "2026-07-02T00:00:00Z",
    template_sha256: `sha256:${"b".repeat(64)}`,
    preview_revision: `sha256:${"c".repeat(64)}`,
    changes: [{
      path: "/spec/containers/0/image",
      before: "checkout:v3",
      after: "checkout:v2",
    }],
  }],
  next_cursor: null,
};

describe("workload rollback preview API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("loads the exact server-projected capability path and validates its CAS evidence", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify(preview),
      { status: 200, headers: { "content-type": "application/json" } },
    ));

    await expect(getWorkloadRollbackPreview("/resource-rollbacks/workload-checkout"))
      .resolves.toEqual(preview);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/resource-rollbacks/workload-checkout",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("rejects external paths and contradictory availability before the action can execute", async () => {
    expect(() => getWorkloadRollbackPreview("https://invalid.example/rollback"))
      .toThrow(TypeError);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      ...preview,
      availability: "unavailable",
      reason: "revision_history_incomplete",
    }), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(getWorkloadRollbackPreview("/resource-rollbacks/workload-checkout"))
      .rejects.toThrow();
  });
});

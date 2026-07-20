import { describe, expect, it } from "vitest";

import { DEV_PREVIEW_CLUSTER_FIXTURE, projectCluster } from "./contracts";

describe("devpreview contract fixtures", () => {
  it("keeps the offline cluster fixture on the product gateway contract", () => {
    expect(DEV_PREVIEW_CLUSTER_FIXTURE.clusters.map((cluster) => cluster.cluster_id)).toEqual([
      "management-server",
      "game-server",
      "demo-server",
    ]);
  });

  it("projects management scope as read-only without losing wire evidence", () => {
    const management = projectCluster(DEV_PREVIEW_CLUSTER_FIXTURE.clusters[0]);

    expect(management).toMatchObject({
      id: "management-server",
      role: "management",
      readOnly: true,
      connectionStatus: "online",
      observationMode: "agent",
    });
  });

  it("projects target scope as mutable", () => {
    const target = projectCluster(DEV_PREVIEW_CLUSTER_FIXTURE.clusters[1]);

    expect(target).toMatchObject({
      id: "game-server",
      role: "target",
      readOnly: false,
    });
  });
});

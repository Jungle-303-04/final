import { describe, expect, it, vi } from "vitest";
import { HomePortFailure } from "./homeContract";
import { createHomeAdapter } from "./createHomeAdapter";
import {
  CLUSTER_LIST,
  CLUSTER_OVERVIEW,
  endpoints,
  NODE_COLLECTION,
  POD_COLLECTION,
} from "./createHomeAdapter.testSupport";

describe("canonical Home adapter validation", () => {
  it.each([
    ["loadClusterOverview", { ...CLUSTER_OVERVIEW, cluster_id: "other" }],
    ["loadNodes", { ...NODE_COLLECTION, cluster_id: "other" }],
    ["loadNodePods", { ...POD_COLLECTION, cluster_id: "other" }],
    ["loadNodePods", { ...POD_COLLECTION, node_name: "other" }],
  ] as const)("rejects %s response identity mismatches", async (operation, payload) => {
    const dependencies = endpoints({
      getClusterSummary: vi.fn().mockResolvedValue(payload),
      getClusterNodesSummary: vi.fn().mockResolvedValue(payload),
      getNodePodsSummary: vi.fn().mockResolvedValue(payload),
    });
    const port = createHomeAdapter(dependencies);
    const request = operation === "loadClusterOverview"
      ? port.loadClusterOverview("cluster-1")
      : operation === "loadNodes"
        ? port.loadNodes("cluster-1")
        : port.loadNodePods("cluster-1", "worker-b");

    await expect(request).rejects.toMatchObject({ code: "invalid-response" });
  });

  it.each([
    ["blank cluster id", { ...CLUSTER_LIST.clusters[0], cluster_id: " " }],
    ["negative count", { ...CLUSTER_LIST.clusters[0], node_count: -1 }],
    ["invalid timestamp", { ...CLUSTER_LIST.clusters[0], updated_at: "yesterday" }],
  ])("rejects %s in cluster choices", async (_name, cluster) => {
    const dependencies = endpoints({
      listClusters: vi.fn().mockResolvedValue({ clusters: [cluster] }),
    });

    await expect(createHomeAdapter(dependencies).listClusterChoices())
      .rejects.toMatchObject({ code: "invalid-response" });
  });

  it.each([
    ["empty", "", ""],
    ["whitespace-only", "   ", "\t"],
  ])("keeps the selector usable when cluster display fields are %s", async (
    _case,
    name,
    environment,
  ) => {
    const sparseCluster = {
      ...CLUSTER_LIST.clusters[1],
      name,
      environment,
    };
    const dependencies = endpoints({
      listClusters: vi.fn().mockResolvedValue({
        clusters: [CLUSTER_LIST.clusters[0], sparseCluster],
      }),
    });

    await expect(createHomeAdapter(dependencies).listClusterChoices())
      .resolves.toMatchObject({
        clusters: [
          { id: "cluster-1", name: "Production", environment: "production" },
          { id: "kubernetes-ops", name: "kubernetes-ops", environment: "unknown" },
        ],
      });
  });

  it.each([
    ["empty", ""],
    ["whitespace-only", "   "],
  ])("falls back to the requested cluster id when overview name is %s", async (
    _case,
    name,
  ) => {
    const dependencies = endpoints({
      getClusterSummary: vi.fn().mockResolvedValue({ ...CLUSTER_OVERVIEW, name }),
    });

    await expect(createHomeAdapter(dependencies).loadClusterOverview("cluster-1"))
      .resolves.toMatchObject({ clusterId: "cluster-1", name: "cluster-1" });
  });

  it("rejects duplicate cluster and node identities", async () => {
    const clusterDependencies = endpoints({
      listClusters: vi.fn().mockResolvedValue({
        clusters: [CLUSTER_LIST.clusters[0], CLUSTER_LIST.clusters[0]],
      }),
    });
    await expect(createHomeAdapter(clusterDependencies).listClusterChoices())
      .rejects.toMatchObject({ code: "invalid-response" });

    const nodeDependencies = endpoints({
      getClusterNodesSummary: vi.fn().mockResolvedValue({
        ...NODE_COLLECTION,
        nodes: [NODE_COLLECTION.nodes[0], NODE_COLLECTION.nodes[0]],
      }),
    });
    await expect(createHomeAdapter(nodeDependencies).loadNodes("cluster-1"))
      .rejects.toMatchObject({ code: "invalid-response" });
  });

  it.each([
    ["usage running count", { ...CLUSTER_OVERVIEW.usage, pods_running: 19 }],
    ["negative usage percent", { ...CLUSTER_OVERVIEW.usage, cpu_pct: -1 }],
  ])("rejects invalid %s invariants", async (_name, usage) => {
    const dependencies = endpoints({
      getClusterSummary: vi.fn().mockResolvedValue({ ...CLUSTER_OVERVIEW, usage }),
    });

    await expect(createHomeAdapter(dependencies).loadClusterOverview("cluster-1"))
      .rejects.toMatchObject({ code: "invalid-response" });
  });

  it("rejects malformed Pod readiness and negative usage", async () => {
    const invalidPods = [
      { ...POD_COLLECTION.pods[0], ready: "ready" },
      { ...POD_COLLECTION.pods[0], cpu_mcores: -1 },
    ];

    for (const pod of invalidPods) {
      const dependencies = endpoints({
        getNodePodsSummary: vi.fn().mockResolvedValue({ ...POD_COLLECTION, pods: [pod] }),
      });
      await expect(createHomeAdapter(dependencies).loadNodePods("cluster-1", "worker-b"))
        .rejects.toMatchObject({ code: "invalid-response" });
    }
  });

  it("preserves an otherwise valid Pod when owner metadata is partial", async () => {
    const dependencies = endpoints({
      getNodePodsSummary: vi.fn().mockResolvedValue({
        ...POD_COLLECTION,
        pods: [{ ...POD_COLLECTION.pods[0], owner_name: null }],
      }),
    });

    await expect(createHomeAdapter(dependencies).loadNodePods("cluster-1", "worker-b"))
      .resolves.toMatchObject({ pods: [{ owner: null }] });
  });

  it("keeps utilization above 100 instead of discarding the whole snapshot", async () => {
    const dependencies = endpoints({
      getClusterSummary: vi.fn().mockResolvedValue({
        ...CLUSTER_OVERVIEW,
        usage: { ...CLUSTER_OVERVIEW.usage, cpu_pct: 125.5 },
      }),
    });

    await expect(createHomeAdapter(dependencies).loadClusterOverview("cluster-1"))
      .resolves.toMatchObject({ usage: { cpuPercent: 125.5 } });
  });

  it.each([
    ["unauthorized", "unauthorized"],
    ["forbidden", "forbidden"],
    ["network", "offline"],
    ["invalid-payload", "invalid-response"],
    ["not-found", "not-found"],
    ["rate-limited", "rate-limited"],
    ["http", "error"],
  ] as const)("maps %s transport failures to %s", async (kind, code) => {
    const dependencies = endpoints({
      listClusters: vi.fn().mockRejectedValue({ kind, retryAfter: 9 }),
    });

    await expect(createHomeAdapter(dependencies).listClusterChoices())
      .rejects.toMatchObject({
        code,
        retryAfterSeconds: 9,
      } satisfies Partial<HomePortFailure>);
  });

  it("preserves AbortError identity", async () => {
    const abortError = new DOMException("Aborted", "AbortError");
    const dependencies = endpoints({
      getClusterNodesSummary: vi.fn().mockRejectedValue(abortError),
    });

    await expect(createHomeAdapter(dependencies).loadNodes("cluster-1"))
      .rejects.toBe(abortError);
  });
});

import { describe, expect, it } from "vitest";

import { compareCandidateListSchema, compareResourcePairSchema } from "../../api/compare-schemas";
import { createCompareAdapter } from "./createCompareAdapter";
import { ComparePortFailure } from "./compareContract";

describe("createCompareAdapter", () => {
  it("accepts only the descriptor-resolved safe projection and serializes side targets", async () => {
    const calls: unknown[] = [];
    const port = createCompareAdapter({
      getCompareResourcePair: async (query) => {
        calls.push(query);
        return pairResponse();
      },
      getCompareCandidates: async () => candidatesResponse(),
    });

    const result = await port.getComparison({
      clusterId: "cluster-a",
      kind: "deployments",
      apiGroup: "apps",
      apiVersion: null,
      a: { namespace: "shop", name: "api-a" },
      b: { namespace: "shop", name: "api-b" },
    });

    expect(calls).toEqual([{
      clusterId: "cluster-a",
      kind: "deployments",
      apiGroup: "apps",
      apiVersion: null,
      a: "shop/api-a",
      b: "shop/api-b",
    }]);
    expect(result.descriptor).toMatchObject({ apiVersion: "v1", projectionKind: "workload_replicas" });
    expect(result.a.projection).toEqual({ projectionKind: "workload_replicas", replicas: 2 });
  });

  it("rejects a response whose descriptor does not match the requested source identity", async () => {
    const port = createCompareAdapter({
      getCompareResourcePair: async () => pairResponse({ route_kind: "statefulsets" }),
      getCompareCandidates: async () => candidatesResponse(),
    });

    await expect(port.getComparison({
      clusterId: "cluster-a",
      kind: "deployments",
      apiGroup: "apps",
      apiVersion: "v1",
      a: { namespace: "shop", name: "api-a" },
      b: { namespace: "shop", name: "api-b" },
    })).rejects.toEqual(expect.objectContaining<Partial<ComparePortFailure>>({ code: "invalid-response" }));
  });
});

function pairResponse(descriptorOverride: Record<string, unknown> = {}) {
  return compareResourcePairSchema.parse({
    comparison: {
      scope: { workspace_id: "workspace-a", cluster_id: "cluster-a", namespaces: ["shop"], freshness: "live" },
      descriptor: {
        route_kind: "deployments",
        api_group: "apps",
        api_version: "v1",
        kubernetes_kind: "Deployment",
        resource_type: "workload",
        projection_kind: "workload_replicas",
        ...descriptorOverride,
      },
      coverage: { availability: "available", latest_snapshot_id: "snapshot-a", reason_codes: [] },
      presentation: { modes: ["side-by-side", "unified"], swap: true, diff_only: true },
      a: manifest("api-a", "uid-a", 2),
      b: manifest("api-b", "uid-b", 3),
    },
  });
}

function candidatesResponse() {
  return compareCandidateListSchema.parse({
    result: {
      scope: { workspace_id: "workspace-a", cluster_id: "cluster-a", namespaces: ["shop"], freshness: "live" },
      descriptor: {
        route_kind: "deployments",
        api_group: "apps",
        api_version: "v1",
        kubernetes_kind: "Deployment",
        resource_type: "workload",
        projection_kind: "workload_replicas",
      },
      coverage: { availability: "available", latest_snapshot_id: "snapshot-a", reason_codes: [] },
      candidates: [{ resource: manifest("api-a", "uid-a", 2).resource, provenance: provenance() }],
      excluded_count: 0,
    },
  });
}

function manifest(name: string, uid: string, replicas: number) {
  return {
    projection_version: "safe-manifest-v1",
    resource: { api_group: "apps", version: "v1", kind: "Deployment", namespace: "shop", name, uid },
    metadata: { namespace: "shop", name },
    projection: { projection_kind: "workload_replicas", replicas },
    provenance: provenance(),
    omitted_paths: [],
  };
}

function provenance() {
  return {
    source_kind: "inventory_snapshot",
    observation_snapshot_id: "snapshot-a",
    latest_snapshot_id: "snapshot-a",
    observed_at: "2026-07-16T09:00:00Z",
    availability: "available",
    reason_codes: [],
  };
}

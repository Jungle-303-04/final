import { describe, expect, it, vi } from "vitest";

import type { WorkloadDetailEndpoint } from "../../api/workload-detail-schemas";
import { createWorkloadDetailAdapter } from "./createWorkloadDetailAdapter";

const request = {
  clusterId: "cluster-a",
  apiGroup: "apps",
  apiVersion: "v1",
  kind: "Deployment",
  namespace: "shop",
  name: "checkout",
};

describe("Workload Detail adapter", () => {
  it("maps only the typed safe projection and validates the exact route identity", async () => {
    const getWorkloadDetail = vi.fn(async () => fixture());
    const port = createWorkloadDetailAdapter({ getWorkloadDetail });

    const detail = await port.getDetail(request);

    expect(getWorkloadDetail).toHaveBeenCalledWith(request, undefined);
    expect(detail.observation).toMatchObject({
      resource: { apiGroup: "apps", version: "v1", uid: "workload-uid" },
      replicas: { ready: 3 },
    });
    expect(detail.logStream).toEqual({ availability: "available", streamKind: "deployments", reasonCodes: [] });
    expect(detail.capabilities.actions).toEqual([]);
  });

  it("rejects a response whose API group differs from the URL identity", async () => {
    const wire = fixture();
    wire.detail.observation.resource.api_group = "other.example.io";
    const port = createWorkloadDetailAdapter({ getWorkloadDetail: async () => wire });

    await expect(port.getDetail(request)).rejects.toMatchObject({
      code: "invalid-response",
    });
  });
});

function fixture(): WorkloadDetailEndpoint {
  const resource = {
    api_group: "apps",
    version: "v1",
    kind: "Deployment",
    namespace: "shop",
    name: "checkout",
    uid: "workload-uid",
  };
  return {
    detail: {
      scope: { workspace_id: "workspace-a", cluster_id: "cluster-a", namespaces: ["shop"], freshness: "live" },
      observation: {
        resource,
        health: "healthy",
        replicas: { desired: 3, ready: 3, available: 3, updated: 3, unavailable: 0 },
        labels: [{ key: "app", value: "checkout" }],
        observed_at: "2026-07-16T09:00:00Z",
      },
      coverage: {
        availability: "available",
        observation_snapshot_id: "snapshot-a",
        latest_snapshot_id: "snapshot-a",
        observed_at: "2026-07-16T09:00:00Z",
        reason_codes: [],
      },
      pods: { availability: "partial", items: [], excluded_count: 0, reason_codes: ["direct_pod_relationship_is_bounded"] },
      events: { availability: "partial", items: [], excluded_count: 0, reason_codes: ["direct_event_relationship_is_bounded"] },
      log_stream: { availability: "available", stream_kind: "deployments", reason_codes: [] },
      capabilities: { scope: { workspace_id: "workspace-a", cluster_id: "cluster-a", namespaces: ["shop"], freshness: "live" }, resource, revision: "snapshot-a", actions: [] },
      features: [
        { name: "overview", availability: "available", reason_codes: [] },
        { name: "pods", availability: "partial", reason_codes: ["direct_pod_relationship_is_bounded"] },
        { name: "events", availability: "partial", reason_codes: ["direct_event_relationship_is_bounded"] },
        { name: "logs", availability: "available", reason_codes: [] },
        { name: "metrics", availability: "unavailable", reason_codes: ["workload_metrics_not_integrated"] },
        { name: "topology", availability: "unavailable", reason_codes: ["workload_topology_not_integrated"] },
        { name: "timeline", availability: "unavailable", reason_codes: ["workload_timeline_not_integrated"] },
        { name: "rbac", availability: "unavailable", reason_codes: ["workload_rbac_not_integrated"] },
        { name: "gitops", availability: "unavailable", reason_codes: ["workload_gitops_not_integrated"] },
        { name: "helm", availability: "unavailable", reason_codes: ["workload_helm_not_integrated"] },
        { name: "operations", availability: "unavailable", reason_codes: ["workload_operations_not_integrated"] },
        { name: "yaml", availability: "unavailable", reason_codes: ["safe_manifest_projection_not_integrated"] },
        { name: "compare", availability: "unavailable", reason_codes: ["safe_comparable_manifest_not_integrated"] },
      ],
    },
  };
}

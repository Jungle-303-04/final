import { describe, expect, it, vi } from "vitest";

import { createWorkloadDetailAdapter } from "./createWorkloadDetailAdapter";
import type { ScheduledRunCatalogEndpoint, WorkloadDetailEndpoint } from "./workloadDetailWireContract";

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
    const port = createWorkloadDetailAdapter({ getWorkloadDetail, getScheduledWorkloadRuns: vi.fn() });

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
    const port = createWorkloadDetailAdapter({ getWorkloadDetail: async () => wire, getScheduledWorkloadRuns: vi.fn() });

    await expect(port.getDetail(request)).rejects.toMatchObject({
      code: "invalid-response",
    });
  });

  it("maps server-owned run guidance and rejects lifecycle rows outside the catalog", async () => {
    const getScheduledWorkloadRuns = vi.fn(async () => scheduledFixture());
    const port = createWorkloadDetailAdapter({ getWorkloadDetail: async () => fixture(), getScheduledWorkloadRuns });

    const catalog = await port.getScheduledRuns({ ...request, kind: "CronJob", apiGroup: "batch", name: "nightly" });

    expect(catalog.runs[0]).toMatchObject({ runKey: "run-1", nextStep: "logs", podFailed: 1 });
    expect(catalog.lifecycle[0]).toMatchObject({ eventId: "run-1:finished", eventType: "warning" });
    const invalid = scheduledFixture();
    invalid.lifecycle[0]!.run_key = "outside-catalog";
    const invalidPort = createWorkloadDetailAdapter({ getWorkloadDetail: async () => fixture(), getScheduledWorkloadRuns: async () => invalid });
    await expect(invalidPort.getScheduledRuns({ ...request, kind: "CronJob", apiGroup: "batch", name: "nightly" }))
      .rejects.toMatchObject({ code: "invalid-response" });
  });
});

function scheduledFixture(): ScheduledRunCatalogEndpoint {
  const owner = { api_group: "batch", version: "v1", kind: "CronJob", namespace: "shop", name: "nightly", uid: "owner-1" };
  const resource = { api_group: "batch", version: "v1", kind: "Job", namespace: "shop", name: "nightly-1", uid: "run-1" };
  return {
    scope: { workspace_id: "workspace-a", cluster_id: "cluster-a", namespaces: ["shop"], freshness: "live" },
    owner,
    runs: [{
      run_key: "run-1", resource, phase: "failed", active: false,
      scheduled_at: null, started_at: "2026-07-16T09:00:00Z", finished_at: "2026-07-16T09:01:00Z",
      desired: 1, succeeded: 0, failed: 1, pod_total: 1, pod_succeeded: 0, pod_failed: 1, pod_running: 0,
      next_step: "logs", observed_at: "2026-07-16T09:01:00Z",
    }],
    lifecycle: [{ event_id: "run-1:finished", run_key: "run-1", resource, stage: "finished", occurred_at: "2026-07-16T09:01:00Z", event_type: "warning", reason: "Job failed" }],
    default_run_key: "run-1", complete: true, reason_codes: [],
  };
}

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
      rightsizing: {
        availability: "unavailable",
        reason_codes: ["rightsizing_observation_not_integrated"],
      },
      capabilities: { scope: { workspace_id: "workspace-a", cluster_id: "cluster-a", namespaces: ["shop"], freshness: "live" }, resource, revision: "snapshot-a", actions: [] },
      features: [
        { name: "overview", availability: "available", reason_codes: [] },
        { name: "pods", availability: "partial", reason_codes: ["direct_pod_relationship_is_bounded"] },
        { name: "events", availability: "partial", reason_codes: ["direct_event_relationship_is_bounded"] },
        { name: "logs", availability: "available", reason_codes: [] },
        { name: "rightsizing", availability: "unavailable", reason_codes: ["rightsizing_observation_not_integrated"] },
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

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createHomeAdapter } from "../features/home/createHomeAdapter";
import { ApiError } from "./client";
import {
  getClusterNodesSummary,
  getClusterSummary,
  getHomeInsights,
  getNodePodsSummary,
} from "./cluster-summary";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function clusterSummaryWithoutPodsTotal() {
  return {
    cluster_id: "cluster-1",
    name: "Production Seoul",
    health: "critical",
    workloads: {
      degraded: [
        {
          name: "checkout-api",
          kind: "Deployment",
          namespace: "shop",
          health: "degraded",
          ready: "1/2",
          restarts: 3,
        },
      ],
    },
    warning_events: [
      {
        namespace: "shop",
        name: "checkout-warning",
        reason: "BackOff",
        message: "Container is restarting",
        involved_kind: "Pod",
        involved_name: "checkout-api-0",
        count: 2,
        last_seen_at: "2026-07-12T09:59:00Z",
      },
    ],
    open_incidents: [
      {
        incident_id: "incident-1",
        correlation_id: "correlation-1",
        symptom: "Restart loop",
        root_cause: null,
        namespace: "shop",
        resource_kind: "Pod",
        resource_name: "checkout-api-0",
        status: "open",
        created_at: "2026-07-12T09:58:00Z",
      },
    ],
    usage: {
      sampled_at: "2026-07-12T10:00:00Z",
      pods_running: 5,
      nodes_ready: 2,
      nodes_total: 2,
      restart_total: 3,
      cpu_pct: 42.5,
      mem_pct: 61.25,
    },
  };
}

describe("cluster summary API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads cluster-level workload, incident, and usage summary", async () => {
    const payload = {
      cluster_id: "cluster-1",
      name: "Production Seoul",
      health: "healthy",
      workloads: {
        healthy: [
          {
            name: "api",
            kind: "Deployment",
            namespace: "default",
            health: "healthy",
            ready: "3/3",
            restarts: 0,
          },
        ],
      },
      warning_events: [],
      open_incidents: [],
      usage: {
        sampled_at: "2026-07-12T00:00:00Z",
        pods_running: 42,
        pods_total: 45,
        nodes_ready: 3,
        nodes_total: 3,
        restart_total: 2,
        cpu_pct: 41.5,
        mem_pct: 68.2,
      },
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));

    await expect(getClusterSummary("cluster/one")).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters/cluster%2Fone/summary",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("preserves a missing pods_total through getClusterSummary for Home usage isolation", async () => {
    const payload = clusterSummaryWithoutPodsTotal();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));
    const adapter = createHomeAdapter({
      listClusters: async () => ({ clusters: [] }),
      getClusterSummary,
      getHomeInsights,
      getClusterNodesSummary,
      getNodePodsSummary,
      subscribeHomeDashboardEvents: () => ({
        async *[Symbol.asyncIterator]() {
          yield* [];
        },
      }),
    });

    await expect(adapter.loadClusterOverview("cluster-1")).resolves.toMatchObject({
      health: "critical",
      usage: null,
      workloads: [{ name: "checkout-api" }],
      warnings: [{ name: "checkout-warning" }],
      incidents: [{ incidentId: "incident-1" }],
      dataQualityWarnings: [
        { code: "usage-unavailable", section: "usage", entityId: null },
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters/cluster-1/summary",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("loads strict bounded Home insights for one encoded cluster", async () => {
    const payload = {
      cluster_id: "cluster/one",
      topology: {
        coverage: {
          availability: "available",
          observed_at: "2026-07-16T09:00:00Z",
          reason_codes: [],
        },
        node_count: 12,
        edge_count: 9,
        omitted_node_count: 0,
        omitted_edge_count: 0,
        relation_completeness: "exact",
      },
      explore: {
        traffic: {
          coverage: {
            availability: "unavailable",
            observed_at: null,
            reason_codes: ["traffic_observation_not_integrated"],
          },
        },
        cost: {
          coverage: {
            availability: "unavailable",
            observed_at: null,
            reason_codes: ["cost_observation_not_integrated"],
          },
        },
      },
      posture: {
        network_policy: {
          coverage: {
            availability: "unavailable",
            observed_at: null,
            reason_codes: ["network_policy_coverage_not_reported"],
          },
          total_policies: null,
          covered_workloads: null,
          total_workloads: null,
        },
        gitops: {
          coverage: {
            availability: "available",
            observed_at: "2026-07-16T09:00:00Z",
            reason_codes: [],
          },
          controller_count: 2,
          provider_counts: { argo: 1, flux: 1 },
          health_counts: { healthy: 1, degraded: 1 },
        },
        audit: {
          coverage: {
            availability: "available",
            observed_at: "2026-07-16T09:00:00Z",
            reason_codes: [],
          },
          total_check_count: 6,
          total_finding_count: 3,
          severity_counts: { warning: 2, danger: 1 },
        },
      },
      custom_resources: {
        coverage: {
          availability: "available",
          observed_at: "2026-07-16T09:00:00Z",
          reason_codes: [],
        },
        items: [{
          api_group: "argoproj.io",
          version: "v1alpha1",
          kind: "Application",
          count: 7,
        }],
        total_kinds: 1,
        total_resources: 7,
        has_more: false,
      },
      helm: {
        coverage: {
          availability: "available",
          observed_at: "2026-07-16T09:00:00Z",
          reason_codes: [],
        },
        release_count: 2,
        status_counts: { deployed: 2 },
      },
      certificate_expiry: {
        coverage: {
          availability: "available",
          observed_at: "2026-07-16T09:00:00Z",
          reason_codes: [],
        },
        items: [{
          secret: {
            api_group: "",
            version: "v1",
            kind: "Secret",
            namespace: "shop",
            name: "api-tls",
            uid: "secret-api-tls",
          },
          source_certificate: {
            api_group: "cert-manager.io",
            version: "v1",
            kind: "Certificate",
            namespace: "shop",
            name: "api-certificate",
            uid: "certificate-api",
          },
          not_after: "2026-07-20T10:00:00Z",
          status: "expiring",
          seconds_remaining: 345_600,
          observed_at: "2026-07-16T09:00:00Z",
        }],
        tls_secret_count: 1,
        observed_expiry_count: 1,
        expiring_count: 1,
        expired_count: 0,
        earliest_expiry: "2026-07-20T10:00:00Z",
        warning_before_seconds: 2_592_000,
        has_more: false,
      },
      refresh_after_seconds: 30,
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));

    await expect(getHomeInsights("cluster/one")).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters/cluster%2Fone/home/insights",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it.each([
    {
      section: "workloads",
      payload: (() => {
        const payload = clusterSummaryWithoutPodsTotal();
        return {
          ...payload,
          workloads: {
            degraded: [{ ...payload.workloads.degraded[0], unexpected: true }],
          },
        };
      })(),
    },
    {
      section: "warning_events",
      payload: (() => {
        const payload = clusterSummaryWithoutPodsTotal();
        return {
          ...payload,
          warning_events: [{ ...payload.warning_events[0], unexpected: true }],
        };
      })(),
    },
    {
      section: "open_incidents",
      payload: (() => {
        const payload = clusterSummaryWithoutPodsTotal();
        return {
          ...payload,
          open_incidents: [{ ...payload.open_incidents[0], unexpected: true }],
        };
      })(),
    },
  ])("keeps $section strict while usage is partial", async ({ payload }) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));

    await expect(getClusterSummary("cluster-1")).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it("loads node summaries and preserves unavailable metrics as null", async () => {
    const payload = {
      cluster_id: "cluster-1",
      nodes: [
        {
          name: "worker-1",
          ready: true,
          health: "healthy",
          pods_running: 12,
          pods_capacity: 30,
          cpu_pct: null,
          mem_pct: null,
          restarts_recent: 0,
          conditions: [],
          kubernetes_version: "v1.30.7",
        },
      ],
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));

    await expect(getClusterNodesSummary("cluster-1")).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters/cluster-1/nodes/summary",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("loads pods for an encoded node name", async () => {
    const payload = {
      cluster_id: "cluster-1",
      node_name: "worker/node-1",
      pods: [
        {
          name: "api-abc",
          namespace: "default",
          phase: "Running",
          health: "healthy",
          ready: "1/1",
          restarts: 0,
          owner_kind: "Deployment",
          owner_name: "api",
          cpu_mcores: 120,
          mem_mib: 256,
          incident_correlation_id: null,
        },
      ],
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));

    await expect(getNodePodsSummary("cluster-1", "worker/node-1")).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters/cluster-1/nodes/worker%2Fnode-1/pods/summary",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("rejects an invalid node summary payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ cluster_id: "cluster-1", nodes: [{ name: "worker-1", ready: "yes" }] }),
    );

    await expect(getClusterNodesSummary("cluster-1")).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it("preserves a missing node response as a not-found API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "node not found" }, 404),
    );

    await expect(getNodePodsSummary("cluster-1", "missing-node")).rejects.toMatchObject({
      kind: "not-found",
      status: 404,
      detail: "node not found",
    } satisfies Partial<ApiError>);
  });
});

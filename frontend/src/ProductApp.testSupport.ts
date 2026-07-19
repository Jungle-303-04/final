import type { MockInstance } from "vitest";

export function requestCount(
  fetchMock: MockInstance<typeof globalThis.fetch>,
  path: string,
) {
  return fetchMock.mock.calls.filter(
    ([input]) => requestPath(input) === path,
  ).length;
}

export function requestPath(input: Parameters<typeof globalThis.fetch>[0]): string {
  const raw = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
  const url = new URL(raw, "http://test.local");
  return `${url.pathname}${url.search}`;
}

export function homeApiResponse(path: string): Response {
  const responses: Record<string, unknown> = {
    "/api/auth/session": {
      authenticated: true,
      user_id: "test-user",
      roles: ["viewer"],
      workspace_id: "test-workspace",
    },
    "/api/clusters?limit=100": {
      clusters: [
        {
          workspace_id: "test-workspace",
          cluster_id: "cluster-1",
          name: "cluster-1",
          environment: "production",
          status: "connected",
          settings: {},
          connection_status: "online",
          last_agent_id: "agent-1",
          last_agent_seen_at: "2026-07-12T10:00:00Z",
          node_count: 2,
          pod_count: 18,
          incident_count: 0,
          created_at: null,
          updated_at: "2026-07-12T10:00:01Z",
        },
      ],
    },
    "/api/clusters/cluster-1/summary": {
      cluster_id: "cluster-1",
      name: "cluster-1",
      health: "healthy",
      workloads: {},
      warning_events: [],
      open_incidents: [],
      usage: {
        sampled_at: "2026-07-12T10:00:00Z",
        pods_running: 18,
        pods_total: 18,
        nodes_ready: 2,
        nodes_total: 2,
        restart_total: 0,
        cpu_pct: 36,
        mem_pct: 48,
      },
    },
    "/api/clusters/cluster-1/nodes/summary": {
      cluster_id: "cluster-1",
      nodes: [
        {
          name: "worker-b",
          ready: true,
          health: "healthy",
          pods_running: 9,
          pods_capacity: 110,
          cpu_pct: 35,
          mem_pct: 47,
          restarts_recent: 0,
          conditions: [],
        },
      ],
    },
    "/api/clusters/cluster-1/nodes/worker-b/pods/summary": {
      cluster_id: "cluster-1",
      node_name: "worker-b",
      pods: [
        {
          name: "checkout-api-0",
          namespace: "shop",
          phase: "Running",
          health: "healthy",
          ready: "1/1",
          restarts: 0,
          owner_kind: "Deployment",
          owner_name: "checkout-api",
          cpu_mcores: 120,
          mem_mib: 256,
          incident_correlation_id: null,
        },
      ],
    },
    "/api/clusters/cluster-1/inventory/summary": {
      cluster_id: "cluster-1",
      latest_snapshot: { collected_at: "2026-07-12T10:00:00Z" },
      counts: [{ resource_type: "pod", health: "healthy", count: 1 }],
    },
    "/api/clusters/cluster-1/inventory/resources?resource_type=pod&include_deleted=false&limit=200":
      {
        cluster_id: "cluster-1",
        resource_type: "pod",
        resources: [inventoryResource()],
      },
    "/api/resources?clusters=cluster-1&resources.types=pod&resources.includeDeleted=false&limit=50":
      {
        items: [
          {
            resource: inventoryResource(),
            cluster: {
              cluster_id: "cluster-1",
              name: "cluster-1",
              provider: "eks",
            },
            application_ids: ["checkout"],
            application_binding_completeness: "exact",
          },
        ],
        next_cursor: null,
        has_more: false,
        counts: {
          filtered_count: 1,
          unfiltered_count: 1,
          filtered_count_completeness: "exact",
          unfiltered_count_completeness: "exact",
        },
        snapshot: filterSnapshot(),
      },
    "/api/resources/label-facets?surface=resources&clusters=cluster-1&resources.types=pod&resources.includeDeleted=false&limit=50":
      {
        surface: "resources",
        items: [],
        selected_resolutions: [],
        next_cursor: null,
        has_more: false,
        counts: {
          filtered_count: 1,
          unfiltered_count: 1,
          filtered_count_completeness: "exact",
          unfiltered_count_completeness: "exact",
        },
        snapshot: filterSnapshot(),
      },
    "/api/clusters/cluster-1/inventory/resource-detail?resource_type=pod&kind=Pod&name=checkout-api-0&namespace=shop&related_limit=100&event_limit=50":
      {
        cluster_id: "cluster-1",
        identity: {
          resource_type: "pod",
          kind: "Pod",
          namespace: "shop",
          name: "checkout-api-0",
        },
        resource: inventoryResource(),
        related: {},
        events: [],
      },
  };
  if (!(path in responses)) throw new Error(`Unexpected test request: ${path}`);
  return new Response(JSON.stringify(responses[path]), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function filterSnapshot() {
  return {
    snapshot_revision: 42,
    authorization_revision: "auth-1",
    filter_fingerprint: "filter-1",
    observed_at: "2026-07-12T10:00:00Z",
    stale: false,
    partial_reason_codes: [],
  };
}

function inventoryResource() {
  return {
    inventory_key: "inventory-pod-checkout",
    snapshot_id: "snapshot-1",
    workspace_id: "test-workspace",
    cluster_id: "cluster-1",
    resource_type: "pod",
    api_version: "v1",
    kind: "Pod",
    namespace: "shop",
    name: "checkout-api-0",
    uid: "uid-checkout-api-0",
    resource_version: "10",
    status: "Running",
    health: "healthy",
    labels: { app: "checkout" },
    annotations: {},
    summary: {
      phase: "Running",
      node_name: "worker-b",
      restart_total: 0,
      cpu_mcores: 120,
      mem_mib: 256,
    },
    observed_at: "2026-07-12T10:00:00Z",
    first_seen_at: "2026-07-12T09:00:00Z",
    last_seen_at: "2026-07-12T10:00:00Z",
    deleted_at: null,
    created_at: "2026-07-12T09:00:00Z",
    updated_at: "2026-07-12T10:00:00Z",
  };
}

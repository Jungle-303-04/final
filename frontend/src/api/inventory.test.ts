import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import {
  getInventoryResourceDetail,
  listInventoryResources,
  listInventoryServices,
  listInventoryWorkloads,
} from "./inventory";

const RESOURCE = {
  inventory_key: "pod/default/api-abc",
  snapshot_id: "snapshot-123",
  workspace_id: "default",
  cluster_id: "cluster-1",
  resource_type: "pod",
  api_version: "v1",
  kind: "Pod",
  namespace: "default",
  name: "api-abc",
  uid: "uid-api-abc",
  resource_version: "42",
  status: "Running",
  health: "healthy",
  labels: { app: "api" },
  annotations: {},
  summary: { phase: "Running" },
  observed_at: "2026-07-12T10:30:00Z",
  first_seen_at: "2026-07-12T09:00:00Z",
  last_seen_at: "2026-07-12T10:30:00Z",
  deleted_at: null,
  created_at: "2026-07-12T09:00:00Z",
  updated_at: "2026-07-12T10:30:00Z",
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("inventory resource API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lists filtered resources with the bounded default limit", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ cluster_id: "cluster-1", resource_type: "pod", resources: [RESOURCE] }),
    );

    await expect(
      listInventoryResources("cluster/one", {
        resourceType: "pod",
        namespace: "default",
      }),
    ).resolves.toEqual({ cluster_id: "cluster-1", resource_type: "pod", resources: [RESOURCE] });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters/cluster%2Fone/inventory/resources?resource_type=pod&namespace=default&include_deleted=false&limit=1000",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("lists services and workloads through their dedicated collections", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({ cluster_id: "cluster-1", resource_type: null, resources: [] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ cluster_id: "cluster-1", resource_type: null, resources: [] }),
      );

    await listInventoryServices("cluster-1");
    await listInventoryWorkloads("cluster-1", { namespace: "backend" });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/clusters/cluster-1/inventory/services?limit=200",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/clusters/cluster-1/inventory/workloads?namespace=backend&limit=200",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("loads a resource detail with related resources and events", async () => {
    const payload = {
      cluster_id: "cluster-1",
      identity: { resource_type: "pod", kind: "Pod", name: "api-abc", namespace: "default" },
      resource: RESOURCE,
      provider_detail: null,
      access: null,
      related: { owner: [] },
      events: [],
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));

    await expect(
      getInventoryResourceDetail("cluster-1", {
        resourceType: "pod",
        kind: "Pod",
        name: "api-abc",
        namespace: "default",
      }),
    ).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters/cluster-1/inventory/resource-detail?resource_type=pod&kind=Pod&name=api-abc&namespace=default&related_limit=100&event_limit=50",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("rejects malformed resource rows instead of fabricating details", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        cluster_id: "cluster-1",
        resource_type: "pod",
        resources: [{ ...RESOURCE, name: 123 }],
      }),
    );

    await expect(
      listInventoryResources("cluster-1", { resourceType: "pod" }),
    ).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it("normalizes omitted nullable projections and validates present discriminators", async () => {
    const base = {
      cluster_id: "cluster-1",
      identity: { resource_type: "pod", kind: "Pod", name: "api-abc", namespace: "default" },
      resource: RESOURCE,
      provider_detail: null,
      access: null,
      related: {},
      events: [],
    };
    const missingProvider = { ...base } as Partial<typeof base>;
    delete missingProvider.provider_detail;
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(missingProvider))
      .mockResolvedValueOnce(jsonResponse({ ...base, provider_detail: { type: "invented-provider" } }))
      .mockResolvedValueOnce(jsonResponse({ ...base, access: { type: "invented-access" } }));

    const request = () => getInventoryResourceDetail("cluster-1", {
      resourceType: "pod", kind: "Pod", name: "api-abc", namespace: "default",
    });
    await expect(request()).resolves.toMatchObject({
      provider_detail: null,
      access: null,
    });
    await expect(request()).rejects.toMatchObject({ kind: "invalid-payload" });
    await expect(request()).rejects.toMatchObject({ kind: "invalid-payload" });
  });

  it("accepts the explicit unavailable access projection", async () => {
    const payload = {
      cluster_id: "cluster-1",
      identity: { resource_type: "pod", kind: "Pod", name: "api-abc", namespace: "default" },
      resource: RESOURCE,
      provider_detail: { type: "aws-machine", instance_id: "i-123" },
      access: { type: "unavailable", reason_codes: ["rbac_not_observed"] },
      related: {},
      events: [],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));
    await expect(getInventoryResourceDetail("cluster-1", {
      resourceType: "pod", kind: "Pod", name: "api-abc", namespace: "default",
    })).resolves.toEqual(payload);
  });

  it("preserves a missing resource response as a not-found API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "resource not found" }, 404),
    );

    await expect(
      getInventoryResourceDetail("cluster-1", {
        resourceType: "pod",
        kind: "Pod",
        name: "missing",
      }),
    ).rejects.toMatchObject({
      kind: "not-found",
      status: 404,
      detail: "resource not found",
    } satisfies Partial<ApiError>);
  });
});

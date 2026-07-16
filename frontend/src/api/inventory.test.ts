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

  it("validates a redacted provider detail without accepting raw Kubernetes data", async () => {
    const providerDetail = {
      type: "aws-machine" as const,
      instance_type: "m6i.large",
      instance_id: "i-123",
      instance_state: "running",
      provider_id: "aws:///zone/i-123",
      iam_instance_profile: null,
      ssh_key_name: null,
      subnet_id: "subnet-a",
      secrets_backend: null,
      addresses: [{ type: "InternalIP", address: "10.0.0.2" }],
      conditions: [{
        type: "Ready",
        status: "True" as const,
        reason: null,
        message: null,
        last_transition_time: null,
      }],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      cluster_id: "cluster-1",
      identity: { resource_type: "awsmachine", kind: "AWSMachine", name: "node-a", namespace: "default" },
      resource: { ...RESOURCE, resource_type: "awsmachine", kind: "AWSMachine", name: "node-a" },
      provider_detail: providerDetail,
      related: {},
      events: [],
    }));

    const response = await getInventoryResourceDetail("cluster-1", {
      resourceType: "awsmachine",
      kind: "AWSMachine",
      name: "node-a",
      namespace: "default",
    });

    expect(response.provider_detail).toEqual(providerDetail);
    expect(JSON.stringify(response.provider_detail)).not.toContain("raw");
  });

  it("rejects an unknown provider detail discriminator", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      cluster_id: "cluster-1",
      identity: { resource_type: "pod", kind: "Pod", name: "api-abc", namespace: "default" },
      resource: RESOURCE,
      provider_detail: { type: "forged-provider", conditions: [] },
      related: {},
      events: [],
    }));

    await expect(getInventoryResourceDetail("cluster-1", {
      resourceType: "pod",
      kind: "Pod",
      name: "api-abc",
      namespace: "default",
    })).rejects.toMatchObject({ kind: "invalid-payload", status: 200 });
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

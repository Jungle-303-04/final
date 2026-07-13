import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import {
  listFilteredResources as publicListFilteredResources,
  listResourceFilterFacets as publicListResourceFilterFacets,
  listResourceLabelFacets as publicListResourceLabelFacets,
} from "./index";
import {
  FILTERED_RESOURCES_PATH,
  RESOURCES_FILTER_FACETS_PATH,
  RESOURCE_LABEL_FACETS_PATH,
  listFilteredResources,
  listResourceFilterFacets,
  listResourceLabelFacets,
} from "./resource-filters";

const SNAPSHOT = {
  snapshot_revision: 42,
  authorization_revision: "auth-revision-1",
  filter_fingerprint: "filter-fingerprint-1",
  observed_at: "2026-07-13T20:20:00Z",
  stale: false,
  partial_reason_codes: [],
};

const RESOURCE = {
  inventory_key: "cluster-a:apps/v1:Deployment:shop:checkout",
  snapshot_id: "snapshot-42",
  workspace_id: "workspace-a",
  cluster_id: "cluster-a",
  resource_type: "workload",
  api_version: "apps/v1",
  kind: "Deployment",
  namespace: "shop",
  name: "checkout",
  uid: "uid-checkout",
  resource_version: "42",
  status: "Ready",
  health: "healthy",
  labels: { team: "checkout" },
  annotations: {},
  summary: { ready_replicas: 3 },
  observed_at: "2026-07-13T20:20:00Z",
  first_seen_at: "2026-07-13T19:20:00Z",
  last_seen_at: "2026-07-13T20:20:00Z",
  deleted_at: null,
  created_at: "2026-07-13T19:20:00Z",
  updated_at: "2026-07-13T20:20:00Z",
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("workspace Resources filter API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("exports the three canonical browser paths", () => {
    expect(RESOURCES_FILTER_FACETS_PATH).toBe("/api/resources/filter-facets");
    expect(FILTERED_RESOURCES_PATH).toBe("/api/resources");
    expect(RESOURCE_LABEL_FACETS_PATH).toBe("/api/resources/label-facets");
    expect(publicListResourceFilterFacets).toBe(listResourceFilterFacets);
    expect(publicListFilteredResources).toBe(listFilteredResources);
    expect(publicListResourceLabelFacets).toBe(listResourceLabelFacets);
  });

  it("loads one structural facet axis with selected resolutions and an opaque cursor", async () => {
    const controller = new AbortController();
    const payload = {
      axis: "namespaces",
      items: [{
        axis: "namespace",
        value: "cluster-a/shop",
        cluster_id: "cluster-a",
        namespace: "shop",
        availability: "available",
      }],
      selected_resolutions: [{
        axis: "namespace",
        value: "cluster-a/restricted",
        status: "restricted",
        display_label: null,
      }],
      next_cursor: "cursor-2",
      has_more: true,
      snapshot: SNAPSHOT,
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));

    await expect(listResourceFilterFacets({
      axis: "namespaces",
      selected: ["cluster-a/default", "cluster-b/kube-system"],
      cursor: "cursor-1",
      limit: 25,
    }, controller.signal)).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/resources/filter-facets?axis=namespaces&selected=cluster-a%2Fdefault%2Ccluster-b%2Fkube-system&cursor=cursor-1&limit=25",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
        signal: controller.signal,
      }),
    );
  });

  it("binds the structural response axis and selected resolution set to the request", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({
      axis: "applications",
      items: [],
      selected_resolutions: [],
      next_cursor: null,
      has_more: false,
      snapshot: SNAPSHOT,
    }));
    await expect(listResourceFilterFacets({ axis: "clusters" })).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);

    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      axis: "clusters",
      items: [],
      selected_resolutions: [{
        axis: "cluster",
        value: "cluster-a",
        status: "resolved",
        display_label: null,
      }],
      next_cursor: null,
      has_more: false,
      snapshot: SNAPSHOT,
    }));
    await expect(listResourceFilterFacets({
      axis: "clusters",
      selected: ["cluster-b", "cluster-a", "cluster-a"],
    })).rejects.toMatchObject({ kind: "invalid-payload" } satisfies Partial<ApiError>);
  });

  it("serializes only canonical multi-axis Resources query names", async () => {
    const payload = {
      items: [{
        resource: RESOURCE,
        cluster: { cluster_id: "cluster-a", name: "production", provider: "private-cloud" },
        application_ids: ["app-checkout"],
        application_binding_completeness: "partial",
      }],
      next_cursor: null,
      has_more: false,
      counts: {
        filtered_count: 1,
        unfiltered_count: 92,
        filtered_count_completeness: "partial",
        unfiltered_count_completeness: "exact",
      },
      snapshot: { ...SNAPSHOT, partial_reason_codes: ["labels-incomplete"] },
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));

    await expect(listFilteredResources({
      clusters: ["cluster-a", "cluster/b"],
      namespaces: ["cluster-a/shop"],
      applications: ["app-checkout"],
      resourceTypes: ["pod", "workload"],
      health: ["healthy", "degraded"],
      labels: ["team=checkout", "tier=critical"],
      query: "api checkout",
      includeDeleted: false,
      cursor: "cursor/1",
      limit: 100,
    })).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/resources?clusters=cluster-a%2Ccluster%2Fb&namespaces=cluster-a%2Fshop&applications=app-checkout&resources.types=pod%2Cworkload&resources.health=healthy%2Cdegraded&labels=team%3Dcheckout%2Ctier%3Dcritical&resources.q=api+checkout&resources.includeDeleted=false&cursor=cursor%2F1&limit=100",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("loads server-computed Label facets without changing the selected AND set", async () => {
    const payload = {
      surface: "resources",
      items: [{
        key: "team",
        value: "checkout",
        selector: "team=checkout",
        match_count: 18,
        count_completeness: "partial",
      }],
      selected_resolutions: [{
        key: "tier",
        value: "critical",
        selector: "tier=critical",
        status: "resolved",
      }],
      next_cursor: null,
      has_more: false,
      counts: {
        filtered_count: null,
        unfiltered_count: null,
        filtered_count_completeness: "unavailable",
        unfiltered_count_completeness: "unavailable",
      },
      snapshot: { ...SNAPSHOT, snapshot_revision: 0, observed_at: null },
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));

    await expect(listResourceLabelFacets({
      clusters: ["cluster-a"],
      labels: ["tier=critical"],
      facetQuery: "team=check",
    })).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/resources/label-facets?surface=resources&clusters=cluster-a&labels=tier%3Dcritical&resources.includeDeleted=false&facet_q=team%3Dcheck&limit=50",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("canonicalizes structural selections and rejects incomplete Label resolutions", async () => {
    const facetPayload = {
      axis: "clusters",
      items: [],
      selected_resolutions: ["cluster-a", "cluster-b"].map((value) => ({
        axis: "cluster",
        value,
        status: "resolved",
        display_label: null,
      })),
      next_cursor: null,
      has_more: false,
      snapshot: SNAPSHOT,
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse(facetPayload),
    );
    await expect(listResourceFilterFacets({
      axis: "clusters",
      selected: ["cluster-b", "cluster-a", "cluster-a"],
    })).resolves.toEqual(facetPayload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/resources/filter-facets?axis=clusters&selected=cluster-a%2Ccluster-b&limit=50",
      expect.objectContaining({ method: "GET" }),
    );

    fetchMock.mockResolvedValueOnce(jsonResponse({
      surface: "resources",
      items: [],
      selected_resolutions: [{
        key: "team",
        value: "checkout",
        selector: "team=checkout",
        status: "resolved",
      }],
      next_cursor: null,
      has_more: false,
      counts: {
        filtered_count: 0,
        unfiltered_count: 0,
        filtered_count_completeness: "exact",
        unfiltered_count_completeness: "exact",
      },
      snapshot: SNAPSHOT,
    }));
    await expect(listResourceLabelFacets({
      labels: ["team=checkout", "tier=critical"],
    })).rejects.toMatchObject({ kind: "invalid-payload" } satisfies Partial<ApiError>);
  });

  it("rejects client-side bounds before opening the transport", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    expect(() => listFilteredResources({ limit: 201 })).toThrow(RangeError);
    expect(() => listFilteredResources({ clusters: Array.from({ length: 101 }, (_, index) => `c-${index}`) }))
      .toThrow(RangeError);
    expect(() => listResourceLabelFacets({ labels: Array.from({ length: 25 }, (_, index) => `k${index}=v`) }))
      .toThrow(RangeError);
    expect(() => listResourceLabelFacets({ facetQuery: "x".repeat(201) })).toThrow(RangeError);
    expect(() => listResourceFilterFacets({ axis: "clusters", cursor: "" })).toThrow(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects non-canonical cursors and invalid Kubernetes Label selectors before transport", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("transport must not open"),
    );

    await expect(listFilteredResources({ cursor: " cursor " })).rejects.toBeInstanceOf(TypeError);
    await expect(listResourceLabelFacets({
      labels: ["UPPER.PREFIX/name=x"],
    })).rejects.toBeInstanceOf(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves scope and cursor failures as transport errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "resource filter scope not found" }, 404),
    );
    await expect(listFilteredResources({ clusters: ["forbidden"] })).rejects.toMatchObject({
      detail: "resource filter scope not found",
      kind: "not-found",
      status: 404,
    } satisfies Partial<ApiError>);

    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "resource filter request is invalid" }, 422),
    );
    await expect(listResourceLabelFacets({ cursor: "expired" })).rejects.toMatchObject({
      kind: "invalid-request",
      status: 422,
    } satisfies Partial<ApiError>);
  });

  it("preserves AbortError identity for request cancellation", async () => {
    const abortError = new DOMException("cancelled", "AbortError");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);

    await expect(listFilteredResources()).rejects.toBe(abortError);
  });
});

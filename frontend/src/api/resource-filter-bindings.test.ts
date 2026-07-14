import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import {
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

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("Resources filter request-bound contracts", () => {
  beforeEach(() => vi.restoreAllMocks());

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

  it("rejects non-canonical cursors and invalid Kubernetes Label selectors before transport", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    expect(() => listFilteredResources({ cursor: " cursor " })).toThrow(TypeError);
    expect(() => listResourceLabelFacets({
      labels: ["UPPER.PREFIX/name=x"],
    })).toThrow(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

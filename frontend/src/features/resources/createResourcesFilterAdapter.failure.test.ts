import { describe, expect, it, vi } from "vitest";

import { ResourcesPortFailure } from "./resourcesContract";
import { createResourcesFilterAdapter } from "./createResourcesFilterAdapter";
import {
  filterEndpoints,
  populatedFilterState,
} from "./createResourcesFilterAdapter.testSupport";

describe("Resources filter adapter failure mapping", () => {
  it.each([
    [{ kind: "unauthorized", status: 401 }, "unauthorized"],
    [{ kind: "forbidden", status: 403 }, "forbidden"],
    [{ kind: "not-found", status: 404 }, "not-found"],
    [{ kind: "invalid-request", status: 422 }, "invalid-request"],
    [{ kind: "rate-limited", status: 429, retryAfter: 12 }, "rate-limited"],
    [{ kind: "network" }, "offline"],
    [{ kind: "invalid-payload", status: 200 }, "invalid-response"],
    [{ kind: "http", status: 503, retryAfter: 5 }, "unavailable"],
    [{ kind: "http", status: 500 }, "error"],
  ] as const)("maps transport %j to %s", async (transport, code) => {
    const endpoints = filterEndpoints({
      listFilteredResources: vi.fn().mockRejectedValue(transport),
    });

    await expect(createResourcesFilterAdapter(endpoints).listResourcePage(
      populatedFilterState(),
      {},
    )).rejects.toMatchObject({
      code,
      retryAfterSeconds: "retryAfter" in transport ? transport.retryAfter : null,
    });
    expect(endpoints.listFilteredResources).toHaveBeenCalledTimes(1);
    expect(endpoints.listResourceFilterFacets).not.toHaveBeenCalled();
    expect(endpoints.listResourceLabelFacets).not.toHaveBeenCalled();
  });

  it("maps a bare 503 status to unavailable", async () => {
    const endpoints = filterEndpoints({
      listResourceFilterFacets: vi.fn().mockRejectedValue({ status: 503 }),
    });

    await expect(createResourcesFilterAdapter(endpoints).listFacetPage(
      populatedFilterState(),
      { axis: "clusters" },
    )).rejects.toMatchObject({ code: "unavailable" });
  });

  it("preserves AbortError identity and never starts a fallback request", async () => {
    const abortError = Object.assign(new Error("cancelled"), { name: "AbortError" });
    const endpoints = filterEndpoints({
      listResourceLabelFacets: vi.fn().mockRejectedValue(abortError),
    });
    const syntheticFallback = vi.fn();

    await expect(createResourcesFilterAdapter({
      ...endpoints,
      listSyntheticLabelFacets: syntheticFallback,
    }).listLabelFacetPage(populatedFilterState(), {})).rejects.toBe(abortError);
    expect(endpoints.listResourceLabelFacets).toHaveBeenCalledTimes(1);
    expect(syntheticFallback).not.toHaveBeenCalled();
  });

  it("preserves an existing ResourcesPortFailure", async () => {
    const failure = new ResourcesPortFailure("forbidden");

    await expect(createResourcesFilterAdapter(filterEndpoints({
      listFilteredResources: vi.fn().mockRejectedValue(failure),
    })).listResourcePage(populatedFilterState(), {})).rejects.toBe(failure);
  });

  it("maps malformed local filters to invalid-request without transport or fallback", async () => {
    const state = populatedFilterState();
    const invalidState = {
      ...state,
      common: {
        ...state.common,
        labels: [{ key: "UPPER.PREFIX/name", value: "x" }],
      },
    };
    const endpoints = filterEndpoints();

    await expect(createResourcesFilterAdapter(endpoints).listResourcePage(
      invalidState,
      {},
    )).rejects.toMatchObject({ code: "invalid-request" });
    expect(endpoints.listFilteredResources).not.toHaveBeenCalled();
  });
});

import { screen } from "@testing-library/react";
import { expect, vi } from "vitest";
import type { UnifiedFilterState } from "../../features/filters/filterContract";
import type {
  ResourcesFilterPort,
  ResourcesFilterResourcePage,
} from "../../features/resources/resourcesFilterContract";
import {
  POD_LIST,
  renderResources,
  resourcesClusterPort,
  resourcesFilterPort,
  resourcesPort,
} from "./ResourcesPage.testSupport";

export function renderEnglishResources(
  port: ReturnType<typeof resourcesPort>,
  entry: string,
  clusterPort = resourcesClusterPort(),
  filterPort: ResourcesFilterPort = resourcesFilterPort(),
) {
  return renderResources(port, entry, clusterPort, vi.fn(), "en", filterPort);
}

export function resourcePage(
  resources: ResourcesFilterResourcePage["items"][number]["resource"][] = POD_LIST.items,
): ResourcesFilterResourcePage {
  return {
    items: resources.map((resource) => ({
      applicationBindingCompleteness: "exact",
      applicationIds: [],
      cluster: {
        clusterId: resource.clusterId,
        name: resource.clusterId,
        provider: "eks",
      },
      resource,
    })),
    nextCursor: null,
    hasMore: false,
    counts: {
      filteredCount: resources.length,
      unfilteredCount: POD_LIST.items.length,
      filteredCountCompleteness: "exact",
      unfilteredCountCompleteness: "exact",
    },
    snapshot: {
      snapshotRevision: 42,
      authorizationRevision: "auth-1",
      filterFingerprint: "filter-1",
      observedAt: "2026-07-12T10:00:00.000Z",
      stale: false,
      partialReasonCodes: [],
    },
    excludedCount: 0,
    dataQualityWarnings: [],
  };
}

export function lastFilterState(
  request: ReturnType<typeof vi.fn>,
): UnifiedFilterState {
  const calls = request.mock.calls;
  const state = calls[calls.length - 1]?.[0] as UnifiedFilterState | undefined;
  if (!state) throw new Error("Expected a Resources filter request");
  return state;
}

export function canonicalDetailEntry(): string {
  return "/resources/pod?cluster=cluster-1&clusters=cluster-1" +
    "&namespaces=cluster-1%2Fshop&namespace=shop" +
    "&resources.types=pod" +
    "&resource=shop%2Fcheckout-api-0&resourceKind=Pod&kind=Pod&full=true";
}

export function readResourcesQuery(): URLSearchParams {
  const location = screen.getByTestId("resources-location").textContent ?? "";
  return new URL(location, "https://product.test").searchParams;
}

export function expectDetailQueryPreserved(query: URLSearchParams) {
  expect(query.get("resource")).toMatch(/^v1\//u);
  expect(query.get("resourceKind")).toBe("Pod");
  expect(query.get("full")).toBe("true");
}

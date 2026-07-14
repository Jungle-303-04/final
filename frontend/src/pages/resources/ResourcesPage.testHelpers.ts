import { vi } from "vitest";
import type { ResourcesFilterResourcePage } from "../../features/resources/resourcesFilterContract";
import { POD_LIST } from "./ResourcesPage.testSupport";

export function resetDocumentTestClock() {
  vi.useRealTimers();
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
}

export function filterPageFromList(
  list: typeof POD_LIST,
): ResourcesFilterResourcePage {
  return {
    items: list.items.map((resource) => ({
      resource,
      cluster: {
        clusterId: resource.clusterId,
        name: resource.clusterId,
        provider: "eks",
      },
      applicationIds: [],
      applicationBindingCompleteness: "exact",
    })),
    nextCursor: null,
    hasMore: list.limitReached,
    counts: {
      filteredCount: list.returned,
      unfilteredCount: list.returned,
      filteredCountCompleteness: "exact",
      unfilteredCountCompleteness: "exact",
    },
    snapshot: {
      snapshotRevision: 42,
      authorizationRevision: "auth-1",
      filterFingerprint: "filter-1",
      observedAt: list.items[0]?.observedAt ?? null,
      stale: false,
      partialReasonCodes: [],
    },
    excludedCount: list.excludedCount ?? 0,
    dataQualityWarnings: [],
  };
}

import { within } from "@testing-library/react";
import { expect } from "vitest";

import { translate } from "../../shared/i18n";
import type {
  ResourcesFilterCompleteness,
  ResourcesFilterResourcePage,
} from "../../features/resources/resourcesFilterContract";

export function expectFleetMetrics(
  summary: HTMLElement,
  expected: { clusters: string; nodes: string; pods: string },
): void {
  expect(within(summary).getByText(translate("ko", "home.cluster.label")).nextElementSibling?.textContent)
    .toBe(expected.clusters);
  expect(within(summary).getByText(translate("ko", "clusters.card.nodesLabel")).nextElementSibling?.textContent)
    .toBe(expected.nodes);
  expect(within(summary).getByText(translate("ko", "clusters.card.podsLabel")).nextElementSibling?.textContent)
    .toBe(expected.pods);
}

export function seedMinimalHomeBoard(): void {
  window.localStorage.setItem("opsia:home-board:test-workspace:test-user:v2", JSON.stringify({
    collapsed: [],
    order: ["W2", "W3", "W4", "W5", "W6", "W7", "W8"],
    visible: ["W2", "W3", "W4"],
  }));
}

export function criticalResourcePage(
  filteredCount: number | null,
  filteredCountCompleteness: ResourcesFilterCompleteness,
  returned: number,
): ResourcesFilterResourcePage {
  return {
    items: Array.from({ length: returned }, (_, index) => ({
      resource: {
        id: `resource-${index}`,
        identityStability: "uid",
        inventoryKey: `inventory-${index}`,
        uid: `uid-${index}`,
        clusterId: "cluster-1",
        resourceType: "pod",
        apiVersion: "v1",
        kind: "Pod",
        namespace: "shop",
        name: `checkout-api-${index}`,
        status: "CrashLoopBackOff",
        health: "critical",
        healthStatus: "CrashLoopBackOff",
        facts: { type: "generic" },
        observedAt: "2026-07-19T01:00:00Z",
        firstSeenAt: null,
        lastSeenAt: "2026-07-19T01:00:00Z",
        deletedAt: null,
      },
      cluster: { clusterId: "cluster-1", name: "prod", provider: "eks" },
      applicationIds: [],
      applicationBindingCompleteness: "exact",
    })),
    nextCursor: returned < (filteredCount ?? returned) ? "next" : null,
    hasMore: returned < (filteredCount ?? returned),
    counts: {
      filteredCount,
      unfilteredCount: 50,
      filteredCountCompleteness,
      unfilteredCountCompleteness: "exact",
    },
    snapshot: {
      snapshotRevision: 1,
      authorizationRevision: "auth-1",
      filterFingerprint: "critical-1",
      observedAt: "2026-07-19T01:00:00Z",
      stale: false,
      partialReasonCodes: filteredCountCompleteness === "partial" ? ["scope_partial"] : [],
    },
    excludedCount: 0,
    dataQualityWarnings: [],
  };
}

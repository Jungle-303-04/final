// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChecksPort } from "../../features/checks/checksContract";
import type { ResourceDetail } from "../../features/resources/resourcesContract";
import { I18nProvider } from "../../shared/i18n";
import { ResourceChecksSection } from "./ResourceChecksSection";

afterEach(cleanup);

describe("ResourceChecksSection", () => {
  it("loads and renders only the exact UID-bound agent finding", async () => {
    const port = checksPort();
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <ResourceChecksSection detail={DETAIL} port={port} />
      </I18nProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Checks (1)" })).toBeTruthy();
    expect(screen.getByText("Container limits are not observed.")).toBeTruthy();
    expect(port.getOverview).toHaveBeenCalledWith({
      clusterIds: ["cluster-1"],
      namespaces: ["cluster-1/shop"],
      resource: {
        apiGroup: "apps",
        version: "v1",
        kind: "Deployment",
        namespace: "shop",
        name: "checkout",
        uid: "uid-1",
      },
    }, expect.any(AbortSignal));
  });
});

function checksPort(): ChecksPort & { getOverview: ReturnType<typeof vi.fn> } {
  return {
    loadRefreshPolicy: vi.fn().mockResolvedValue({
      staleAfterSeconds: 30,
      refreshAfterSeconds: 60,
      keepLastSuccess: true,
      pauseWhenHidden: true,
      eventInvalidation: false,
      retryAfterSeconds: null,
      retryLimit: null,
      postMutationRefreshAfterSeconds: null,
    }),
    getOverview: vi.fn().mockResolvedValue({
      scopeCoverage: {
        availability: "available",
        scopes: [{
          workspaceId: "workspace-1",
          clusterId: "cluster-1",
          namespaces: ["shop"],
          freshness: "live",
        }],
        observedAt: "2026-07-17T05:59:30Z",
        reasonCodes: [],
      },
      resultSet: {
        availability: "available",
        evaluatedAt: "2026-07-17T05:59:30Z",
        checks: [{
          findingId: "finding-1",
          clusterId: "cluster-1",
          checkId: "workload-limits",
          category: "resources",
          severity: "warning",
          message: "Container limits are not observed.",
          resource: {
            apiGroup: "apps",
            version: "v1",
            kind: "Deployment",
            namespace: "shop",
            name: "checkout",
            uid: "uid-1",
          },
        }],
        totalCheckCount: 1,
        totalFindingCount: 1,
        reasonCodes: [],
      },
      catalog: { availability: "available", entries: [], reasonCodes: [] },
      visibility: { availability: "available", clusters: [], reasonCodes: [] },
    }),
    getDetail: vi.fn(),
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
  };
}

const DETAIL: ResourceDetail = {
  clusterId: "cluster-1",
  identity: {
    resourceType: "workloads",
    kind: "Deployment",
    namespace: "shop",
    name: "checkout",
  },
  resource: {
    id: "resource-1",
    inventoryKey: "inventory-1",
    clusterId: "cluster-1",
    resourceType: "workloads",
    namespace: "shop",
    name: "checkout",
    kind: "Deployment",
    apiVersion: "apps/v1",
    uid: "uid-1",
    identityStability: "uid",
    health: "healthy",
    healthStatus: "Healthy",
    status: "Ready",
    observedAt: null,
    firstSeenAt: null,
    lastSeenAt: null,
    deletedAt: null,
    facts: {
      type: "workload",
      desiredReplicas: 1,
      readyReplicas: 1,
      availableReplicas: 1,
      updatedReplicas: 1,
      unavailableReplicas: 0,
      generation: 1,
      observedGeneration: 1,
    },
  },
  relatedCompleteness: "unknown",
  related: [],
  eventsCompleteness: "unknown",
  events: [],
};

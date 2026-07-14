import { describe, expect, it } from "vitest";

import type {
  ResourceDetail,
  ResourceSummary,
} from "../../features/resources/resourcesContract";
import {
  infraMapFocusItemFromResource,
  selectedPodIdsFromFocusDetails,
} from "./useInfraMapFocusDetails";

describe("infra map focus details", () => {
  it("collects related pod ids from selected concrete resources", () => {
    const service = resource({
      kind: "Service",
      name: "api-gateway",
      resourceType: "service",
    });
    const apiPod = resource({
      inventoryKey: "pod:api-gateway-0",
      kind: "Pod",
      name: "api-gateway-0",
      resourceType: "pod",
    });
    const workerPod = resource({
      inventoryKey: "pod:worker-0",
      kind: "Pod",
      name: "worker-0",
      resourceType: "pod",
    });

    const ids = selectedPodIdsFromFocusDetails(
      [detail(service, [apiPod, workerPod])],
      [infraMapFocusItemFromResource(service)],
    );

    expect([...ids].sort()).toEqual(["pod:api-gateway-0", "pod:worker-0"]);
  });

  it("uses the selected pod itself even when no related resources are present", () => {
    const selectedPod = resource({
      inventoryKey: "pod:alloy-0",
      kind: "Pod",
      name: "alloy-0",
      resourceType: "pod",
    });

    const ids = selectedPodIdsFromFocusDetails(
      [detail(selectedPod, [])],
      [infraMapFocusItemFromResource(selectedPod)],
    );

    expect([...ids]).toEqual(["pod:alloy-0"]);
  });
});

function detail(
  resourceSummary: ResourceSummary,
  related: ResourceSummary[],
): ResourceDetail {
  return {
    clusterId: "cluster-a",
    dataQualityWarnings: [],
    eventExcludedCount: 0,
    events: [],
    eventsCompleteness: "unknown",
    identity: {
      resourceType: resourceSummary.resourceType,
      kind: resourceSummary.kind,
      namespace: resourceSummary.namespace,
      name: resourceSummary.name,
    },
    related: [{ excludedCount: 0, items: related, name: "Related" }],
    relatedCompleteness: "unknown",
    relatedExcludedCount: 0,
    resource: resourceSummary,
  };
}

function resource(
  overrides: Partial<ResourceSummary>,
): ResourceSummary {
  const resourceType = overrides.resourceType ?? "pod";
  return {
    apiVersion: "v1",
    clusterId: "cluster-a",
    deletedAt: null,
    facts: resourceType === "pod"
      ? {
        type: "pod",
        phase: "Running",
        nodeName: "worker-a",
        owner: null,
        readiness: null,
        restartCount: 0,
        cpuMillicores: null,
        memoryMebibytes: null,
        podIp: null,
        hostIp: null,
        waitingReasons: [],
        terminatedReasons: [],
      }
      : { type: "generic" },
    firstSeenAt: null,
    health: "healthy",
    healthStatus: "healthy",
    id: overrides.inventoryKey ?? `${resourceType}:${overrides.name ?? "resource"}`,
    identityStability: "uid",
    inventoryKey: overrides.inventoryKey ?? `${resourceType}:${overrides.name ?? "resource"}`,
    kind: overrides.kind ?? "Pod",
    lastSeenAt: null,
    name: overrides.name ?? "resource",
    namespace: overrides.namespace ?? "default",
    observedAt: null,
    resourceType,
    status: "Running",
    uid: null,
    ...overrides,
  };
}

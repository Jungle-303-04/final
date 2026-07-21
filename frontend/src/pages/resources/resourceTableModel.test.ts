import { describe, expect, it } from "vitest";

import type {
  ResourceFacts,
  ResourceSummary,
} from "../../features/resources/resourcesContract";
import { POD_LIST } from "./ResourcesPage.testFixtures";
import {
  resourceTableColumns,
  resourceTableSortValue,
} from "./resourceTableModel";

describe("resource table model", () => {
  it.each([
    ["pod", ["name", "namespace", "ready", "status", "cpu", "memory", "restarts", "node", "trend", "observed"]],
    ["node", ["name", "status", "ready", "cpu", "memory", "capacity", "trend", "observed"]],
    ["workload", ["name", "namespace", "ready", "updated", "available", "unavailable", "health", "trend", "observed"]],
    ["service", ["name", "namespace", "serviceType", "selector", "ports", "external", "health", "trend", "observed"]],
    ["event", ["name", "namespace", "status", "reason", "object", "count", "lastSeen", "trend"]],
    ["generic", ["name", "namespace", "kind", "status", "health", "trend", "observed"]],
  ] as const)("uses canonical %s facts columns", (type, keys) => {
    expect(resourceTableColumns([row(facts(type))]).map(({ key }) => key)).toEqual(keys);
  });

  it("falls back to generic columns for a mixed canonical result", () => {
    expect(resourceTableColumns([
      row(facts("pod")),
      row(facts("service")),
    ]).map(({ key }) => key)).toEqual([
      "name",
      "namespace",
      "kind",
      "status",
      "health",
      "trend",
      "observed",
    ]);
  });

  it("sorts by observed canonical facts without reading raw Kubernetes payloads", () => {
    const observed = facts("pod");
    if (observed.type !== "pod") throw new Error("expected pod facts");
    const pod = row({
      ...observed,
      cpuMillicores: 125,
      restartCount: 7,
    });
    expect(resourceTableSortValue(pod, "cpu")).toBe(125);
    expect(resourceTableSortValue(pod, "restarts")).toBe(7);
    expect("raw" in pod).toBe(false);
  });
});

function row(value: ResourceFacts): ResourceSummary {
  return { ...POD_LIST.items[0], facts: value };
}

function facts(type: ResourceFacts["type"]): ResourceFacts {
  if (type === "pod") {
    return {
      type,
      phase: "Running",
      nodeName: "worker-a",
      owner: null,
      readiness: { ready: 1, total: 1 },
      restartCount: 0,
      cpuMillicores: null,
      memoryMebibytes: null,
      podIp: null,
      hostIp: null,
      waitingReasons: [],
      terminatedReasons: [],
    };
  }
  if (type === "node") {
    return {
      type,
      ready: true,
      podCapacity: 20,
      cpuMillicores: null,
      memoryMebibytes: null,
      cpuRatio: null,
      memoryRatio: null,
    };
  }
  if (type === "workload") {
    return {
      type,
      desiredReplicas: 3,
      readyReplicas: 2,
      availableReplicas: 2,
      updatedReplicas: 3,
      unavailableReplicas: 1,
      generation: 4,
      observedGeneration: 4,
    };
  }
  if (type === "service") {
    return {
      type,
      serviceType: "ClusterIP",
      clusterIp: null,
      externalUrl: null,
      externalHosts: [],
      selector: [],
      ports: [],
    };
  }
  if (type === "event") {
    return {
      type,
      eventType: "Warning",
      reason: "BackOff",
      message: null,
      occurrenceCount: 2,
      firstSeenAt: null,
      lastSeenAt: null,
      reportingComponent: null,
      involvedResource: null,
    };
  }
  return { type: "generic" };
}

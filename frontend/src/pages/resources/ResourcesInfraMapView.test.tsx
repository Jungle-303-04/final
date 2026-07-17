// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../../shared/i18n";
import { TooltipProvider } from "../../shared/ui/primitives/tooltip";
import { ResourcesInfraMapView } from "./ResourcesInfraMapView";
import type { InfraMapModel, InfraMapPod } from "./resourcesInfraMapModel";
import type { TrafficPort } from "../../features/traffic/trafficContract";

afterEach(cleanup);

describe("ResourcesInfraMapView", () => {
  it("explains visual marks differently for each Infra Map viewer", () => {
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <TooltipProvider delay={0}>
          <ResourcesInfraMapView
            focusOptions={[]}
            model={infraMapModel()}
            onFocusRemove={vi.fn()}
            onFocusSelect={vi.fn()}
            onOpenPod={vi.fn()}
            onRetry={vi.fn()}
            onShowMorePods={vi.fn()}
            phase="ready"
            selectedFocus={[]}
            trafficPort={trafficPort()}
            trafficRequest={{ clusterIds: ["cluster-a"], namespaces: [] }}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    const legend = screen.getByRole("complementary", {
      name: "Infra Map Pod placement legend",
    });

    expect(screen.getByText(
      "Summarizes nodes as server cards so key Pods, Pod distribution, and node capacity can be compared at a glance.",
    )).toBeTruthy();
    expect(legend.getAttribute("data-slot")).toBe("infra-map-legend");
    expect(legend.textContent).toContain("Healthy");
    expect(legend.textContent).toContain("Pod CPU request usage");
    expect(legend.textContent).toContain("Node CPU capacity gauge");
    expect(legend.textContent).toContain("Abnormal state");
    expect(legend.textContent).toContain("Unknown");

    fireEvent.click(screen.getByRole("button", { name: "Topology" }));
    expect(screen.getByText(
      "Shows Cluster, Node, and Pod relationships as a graph, with hover details for status, usage, restarts, and placement.",
    )).toBeTruthy();
    expect(legend.textContent).toContain("Placement relationship");
    expect(legend.textContent).toContain("Resource pressure");
    expect(legend.textContent).toContain("Unknown");
    const topologyLegendText = legend.textContent ?? "";
    expect(topologyLegendText.indexOf("Unknown"))
      .toBeGreaterThan(topologyLegendText.indexOf("Placement relationship"));
    expect(topologyLegendText.indexOf("Healthy"))
      .toBeGreaterThan(topologyLegendText.indexOf("Unknown"));

    fireEvent.click(screen.getByRole("button", { name: "Navigator" }));
    expect(screen.getByText(
      "Shows each node as a rack row with attached Pod hexagons, so Pod density, health, and requested capacity can be scanned by node.",
    )).toBeTruthy();
    expect(legend.textContent).toContain("Node");
    expect(legend.textContent).toContain("CPU pressure");
    expect(legend.textContent).toContain("Requested capacity");

    fireEvent.click(screen.getByRole("button", { name: "Traffic" }));
    expect(screen.getByText(
      "Checks collector-backed network-flow evidence for the selected cluster and namespace scope without inventing missing traffic.",
    )).toBeTruthy();
    expect(legend.textContent).toContain("Traffic volume");
    expect(legend.textContent).toContain("Source/target resource");
    expect(legend.textContent).toContain("Traffic evidence unavailable");
  });
});

function trafficPort(): TrafficPort {
  return {
    getOverview: vi.fn().mockResolvedValue({
      scopeCoverage: {
        availability: "available",
        scopes: [{
          clusterId: "cluster-a",
          freshness: "live",
          namespaces: [],
          workspaceId: "workspace-a",
        }],
        observedAt: "2026-07-16T09:00:00Z",
        reasonCodes: [],
      },
      observation: {
        availability: "unavailable",
        observedAt: null,
        reasonCodes: ["traffic_observation_not_integrated"],
      },
      relationships: {
        availability: "unavailable",
        edges: null,
        reasonCodes: ["traffic_observation_not_integrated"],
      },
      summary: {
        availability: "unavailable",
        deniedFlowCount: null,
        externalFlowCount: null,
        reasonCodes: ["traffic_observation_not_integrated"],
        totalFlowCount: null,
      },
    }),
    getSources: vi.fn().mockResolvedValue({
      availability: "available",
      clusters: [],
      coverage: {
        availability: "available",
        observedAt: "2026-07-16T09:00:00Z",
        reasonCodes: [],
        scopes: [],
      },
      reasonCodes: [],
    }),
    selectSource: vi.fn().mockResolvedValue(commandReceipt()),
    connectSource: vi.fn().mockResolvedValue(commandReceipt()),
  };
}

function commandReceipt() {
  return {
    accepted: true as const,
    auditEventId: "event-a",
    commandId: "command-a",
    correlationId: "correlation-a",
    eventId: "event-a",
    status: "queued" as const,
  };
}

function infraMapModel(): InfraMapModel {
  const visiblePods = [pod()];
  return {
    clusters: [{
      criticalCount: 0,
      health: "healthy",
      id: "cluster-a",
      name: "Production",
      nodeCount: 1,
      podCount: visiblePods.length,
      provider: "eks",
      warningCount: 0,
    }],
    nodes: [{
      assignedPodCount: visiblePods.length,
      clusterId: "cluster-a",
      cpuMillicores: null,
      cpuRatio: null,
      health: "healthy",
      hiddenPodCount: 0,
      hiddenPods: [],
      id: "node:worker-a",
      memoryMebibytes: null,
      memoryRatio: null,
      name: "worker-a",
      podCapacity: 110,
      ready: true,
      unassigned: false,
      visiblePods,
    }],
    selection: {
      active: false,
      matchedPodCount: visiblePods.length,
    },
  };
}

function pod(): InfraMapPod {
  return {
    clusterId: "cluster-a",
    cpu: { request: 100, ratio: 0.1, value: 10 },
    health: "healthy",
    id: "pod:default",
    memory: { request: 100, ratio: 0.1, value: 10 },
    name: "default",
    namespace: "default",
    ownerKind: null,
    ownerName: null,
    ownerReferencesComplete: null,
    ownerUid: null,
    phase: "Running",
    replicaGroupKey: null,
    replicaGroupKind: null,
    replicaGroupName: null,
    replicaGroupUid: null,
    restartCount: 0,
    selected: false,
    usagePercent: 10,
    workloadKey: null,
  };
}

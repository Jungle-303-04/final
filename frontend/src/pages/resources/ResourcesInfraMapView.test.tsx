// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../../shared/i18n";
import { TooltipProvider } from "../../shared/ui/primitives/tooltip";
import { ResourcesInfraMapView } from "./ResourcesInfraMapView";
import type { InfraMapModel, InfraMapPod } from "./resourcesInfraMapModel";

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
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    const legend = screen.getByRole("complementary", {
      name: "Infra Map Pod placement legend",
    });

    expect(screen.getByText(
      "Summarizes each node as a server card, highlighting key Pods, Pod distribution, and node capacity at a glance.",
    )).toBeTruthy();
    expect(legend.getAttribute("data-slot")).toBe("infra-map-legend");
    expect(within(legend).getByText("Green · normal")).toBeTruthy();
    expect(within(legend).getByText("Card fill · CPU request usage")).toBeTruthy();
    expect(within(legend).getByText("Red · abnormal state")).toBeTruthy();
    expect(within(legend).getByText("Dashed card · metric or request unavailable")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Topology" }));
    expect(screen.getByText(
      "Shows Cluster, Node, and Pod relationships as a graph, with hover details for status, usage, restarts, and placement.",
    )).toBeTruthy();
    expect(within(legend).getByText("Solid line · placement relationship")).toBeTruthy();
    expect(within(legend).getByText("Icon color · health and pressure")).toBeTruthy();
    expect(within(legend).getByText("Dashed line · metric or request unavailable")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Navigator" }));
    expect(screen.getByText(
      "Shows the cluster as a radial navigator so you can scan node placement, Pod density, and requested capacity visually.",
    )).toBeTruthy();
    expect(within(legend).getByText("Line · cluster, node, and pod placement")).toBeTruthy();
    expect(within(legend).getByText("Rack · node")).toBeTruthy();
    expect(within(legend).getByText("Dot size · requested capacity")).toBeTruthy();
  });
});

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
    id: "pod:api",
    memory: { request: 100, ratio: 0.1, value: 10 },
    name: "api",
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

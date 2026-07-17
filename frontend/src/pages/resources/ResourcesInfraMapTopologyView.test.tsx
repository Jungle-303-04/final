// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../../shared/i18n";
import { TooltipProvider } from "../../shared/ui/primitives/tooltip";
import { ResourcesInfraMapTopologyView } from "./ResourcesInfraMapTopologyView";
import type { InfraMapModel, InfraMapPod } from "./resourcesInfraMapModel";

afterEach(cleanup);

describe("ResourcesInfraMapTopologyView", () => {
  it("opens the single cluster directly and groups pods by replica group key", () => {
    const onOpenPod = vi.fn();
    renderTopology(infraMapModel([
      pod({
        id: "pod:api-a",
        name: "api-a",
        replicaGroupKey: "default/Deployment/api",
        replicaGroupKind: "Deployment",
        replicaGroupName: "api",
      }),
      pod({
        id: "pod:api-b",
        name: "api-b",
        replicaGroupKey: "default/Deployment/api",
        replicaGroupKind: "Deployment",
        replicaGroupName: "api",
      }),
    ]), { onOpenPod });

    expect(screen.getByLabelText("Production")).toBeTruthy();
    expect(document.querySelector('[data-slot="infra-map-topology-detail"]')?.className)
      .toContain("grid-rows-[minmax(0,1fr)]");
    expect(screen.queryByText("Production")).toBeNull();
    expect(screen.queryByText("worker-a")).toBeNull();
    expect(screen.queryByText(/Deployment/u)).toBeNull();
    const group = document.querySelector('[data-pod-group-key="default/Deployment/api"]');
    expect(group).not.toBeNull();
    expect(group?.getAttribute("data-group-evidence")).toBe("replicaGroup");
    expect(group?.getAttribute("data-slot")).toBe("infra-map-topology-pod-static-group");
    expect(within(group as HTMLElement).getAllByRole("button")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /api-a/u }));
    expect(onOpenPod).toHaveBeenCalledWith(expect.objectContaining({ id: "pod:api-a" }));
  });

  it("shows cluster overview before drill-in when more than one cluster is available", () => {
    const model = infraMapModel([pod({ id: "pod:api", name: "api" })]);
    model.clusters.push({
      criticalCount: 0,
      health: "healthy",
      id: "cluster-b",
      name: "Staging",
      nodeCount: 0,
      podCount: 0,
      provider: null,
      warningCount: 0,
    });
    renderTopology(model);
    expect(document.querySelector('[data-slot="infra-map-topology-overview"]')).not.toBeNull();

    expect(screen.getByText("클러스터 개요")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Production/u }));
    expect(document.querySelector('[data-slot="infra-map-topology-detail"]')?.className)
      .toContain("grid-rows-[auto_minmax(0,1fr)]");
    expect(screen.getByLabelText("worker-a")).toBeTruthy();
    expect(screen.queryByText("worker-a")).toBeNull();
  });

  it("shows the same node capacity summary on server icon hover as the card view", async () => {
    const model = infraMapModel([pod({ id: "pod:api", name: "api" })]);
    model.nodes[0] = {
      ...model.nodes[0]!,
      assignedPodCount: 12,
      cpuRatio: 0.25,
      memoryRatio: 0.5,
      podCapacity: 110,
    };

    renderTopology(model);

    fireEvent.mouseEnter(screen.getByLabelText("worker-a"));

    const tooltip = await screen.findByRole("tooltip");
    expect(within(tooltip).getByText("12/110")).toBeTruthy();
    expect(within(tooltip).getByText("25% / 75%")).toBeTruthy();
    expect(within(tooltip).getByText("50% / 50%")).toBeTruthy();
  });

  it("shows the same pod evidence on topology pod hover as the card view", async () => {
    renderTopology(infraMapModel([
      pod({
        cpu: { request: 100, ratio: 0.25, value: 25 },
        id: "pod:api",
        memory: { request: 128, ratio: 0.5, value: 64 },
        name: "api",
        restartCount: 2,
        usagePercent: 25,
      }),
    ]));

    fireEvent.mouseEnter(screen.getByRole("button", { name: /api/u }));

    const tooltip = await screen.findByRole("tooltip");
    expect(within(tooltip).getByText("api")).toBeTruthy();
    expect(within(tooltip).getByText("25m")).toBeTruthy();
    expect(within(tooltip).getByText("100m", { exact: false })).toBeTruthy();
    expect(within(tooltip).getByText("64 MiB")).toBeTruthy();
    expect(within(tooltip).getByText("128 MiB", { exact: false })).toBeTruthy();
    expect(within(tooltip).getByText("2")).toBeTruthy();
  });
});

function renderTopology(
  model: InfraMapModel,
  options: { onOpenPod?: (pod: InfraMapPod) => void } = {},
) {
  return render(
    <I18nProvider navigatorLanguage="ko-KR" storage={null}>
      <TooltipProvider delay={0}>
        <ResourcesInfraMapTopologyView
          metricMode="cpu"
          model={model}
          onOpenPod={options.onOpenPod ?? vi.fn()}
        />
      </TooltipProvider>
    </I18nProvider>,
  );
}

function infraMapModel(pods: InfraMapPod[]): InfraMapModel {
  return {
    clusters: [{
      criticalCount: 0,
      health: "healthy",
      id: "cluster-a",
      name: "Production",
      nodeCount: 1,
      podCount: pods.length,
      provider: "eks",
      warningCount: 0,
    }],
    nodes: [{
      assignedPodCount: pods.length,
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
      visiblePods: pods,
    }],
    selection: {
      active: false,
      matchedPodCount: pods.length,
    },
  };
}

function pod(overrides: Partial<InfraMapPod>): InfraMapPod {
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
    ...overrides,
  };
}

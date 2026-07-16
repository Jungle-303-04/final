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

    expect(screen.getByText("Production")).toBeTruthy();
    const group = screen.getByText("Deployment · api").closest("section");
    expect(group).not.toBeNull();
    expect(group?.getAttribute("data-group-evidence")).toBe("replicaGroup");
    expect(group?.getAttribute("data-pod-group-key")).toBe("default/Deployment/api");
    expect(group?.querySelector('[data-slot="infra-map-topology-honeycomb"]')).not.toBeNull();
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

    expect(screen.getByText("클러스터 개요")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Production/u }));
    expect(screen.getByText("worker-a")).toBeTruthy();
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

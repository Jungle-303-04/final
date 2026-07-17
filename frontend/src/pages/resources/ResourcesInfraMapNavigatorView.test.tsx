// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../../shared/i18n";
import { ResourcesInfraMapNavigatorView } from "./ResourcesInfraMapNavigatorView";
import type { InfraMapModel, InfraMapPod } from "./resourcesInfraMapModel";

afterEach(cleanup);

describe("ResourcesInfraMapNavigatorView", () => {
  it("shows an evidence hover card for navigator pods", () => {
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <ResourcesInfraMapNavigatorView
          metricMode="cpu"
          model={infraMapModel()}
          onOpenPod={vi.fn()}
        />
      </I18nProvider>,
    );

    fireEvent.mouseEnter(screen.getByRole("button", { name: /api-gateway/ }), {
      clientX: 240,
      clientY: 220,
    });

    const hoverCard = document.querySelector(
      '[data-slot="infra-map-navigator-hover-card"]',
    );
    expect(hoverCard?.textContent).toContain("api-gateway");
    expect(hoverCard?.textContent).toContain("Request usage");
    expect(hoverCard?.textContent).toContain("CPU");
    expect(hoverCard?.textContent).toContain("Restarts");
  });

  it("shows summary hover cards for navigator cluster and node marks", () => {
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <ResourcesInfraMapNavigatorView
          metricMode="memory"
          model={infraMapModel()}
          onOpenPod={vi.fn()}
        />
      </I18nProvider>,
    );

    fireEvent.mouseEnter(document.querySelector(
      '[data-slot="infra-map-navigator-cluster-hub"]',
    )!);
    expect(document.querySelector(
      '[data-slot="infra-map-navigator-hover-card"]',
    )?.textContent).toContain("Production");

    fireEvent.mouseEnter(document.querySelector(
      '[data-slot="infra-map-navigator-node-rack"]',
    )!);
    expect(document.querySelector(
      '[data-slot="infra-map-navigator-hover-card"]',
    )?.textContent).toContain("worker-a");
  });

  it("shows node capacity summary inside navigator node racks", () => {
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <ResourcesInfraMapNavigatorView
          metricMode="cpu"
          model={infraMapModel()}
          onOpenPod={vi.fn()}
        />
      </I18nProvider>,
    );

    const summary = document.querySelector(
      '[data-slot="infra-map-navigator-node-summary"]',
    );

    expect(summary?.textContent).toContain("10% / 90%");
    expect(summary?.textContent).toContain("25% / 75%");
    expect(summary?.textContent).toContain("1/110");
  });

  it("renders every observed pod as a navigator hex without synthetic caps", () => {
    const model = infraMapModel({
      hiddenPods: [
        pod({ id: "pod:hidden-a", name: "hidden-a" }),
        pod({ id: "pod:hidden-b", name: "hidden-b" }),
      ],
      visiblePods: [
        pod({ id: "pod:visible-a", name: "visible-a" }),
        pod({ id: "pod:visible-b", name: "visible-b" }),
        pod({ id: "pod:visible-c", name: "visible-c" }),
      ],
    });

    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <ResourcesInfraMapNavigatorView
          metricMode="cpu"
          model={model}
          onOpenPod={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(document.querySelector("[data-slot='infra-map-navigator-node-rack']")).toBeTruthy();
    expect(document.querySelectorAll("[data-slot='infra-map-navigator-pod']")).toHaveLength(5);
  });
});

function infraMapModel({
  hiddenPods = [],
  visiblePods = [pod()],
}: {
  hiddenPods?: InfraMapPod[];
  visiblePods?: InfraMapPod[];
} = {}): InfraMapModel {
  return {
    clusters: [{
      criticalCount: 0,
      health: "healthy",
      id: "cluster-a",
      name: "Production",
      nodeCount: 1,
      podCount: visiblePods.length + hiddenPods.length,
      provider: "eks",
      warningCount: 0,
    }],
    nodes: [{
      assignedPodCount: visiblePods.length + hiddenPods.length,
      clusterId: "cluster-a",
      cpuMillicores: 10,
      cpuRatio: 0.1,
      health: "healthy",
      hiddenPodCount: hiddenPods.length,
      hiddenPods,
      id: "node:worker-a",
      memoryMebibytes: 128,
      memoryRatio: 0.25,
      name: "worker-a",
      podCapacity: 110,
      ready: true,
      unassigned: false,
      visiblePods,
    }],
    selection: {
      active: false,
      matchedPodCount: visiblePods.length + hiddenPods.length,
    },
  };
}

function pod(overrides: Partial<InfraMapPod> = {}): InfraMapPod {
  return {
    clusterId: "cluster-a",
    cpu: { request: 100, ratio: 0.25, value: 25 },
    health: "healthy",
    id: "pod:api-gateway",
    memory: { request: 512, ratio: 0.5, value: 256 },
    name: "api-gateway",
    namespace: "default",
    ownerKind: "ReplicaSet",
    ownerName: "api-gateway-abc",
    ownerReferencesComplete: true,
    ownerUid: "owner-a",
    phase: "Running",
    replicaGroupKey: "replicaset:api-gateway-abc",
    replicaGroupKind: "ReplicaSet",
    replicaGroupName: "api-gateway-abc",
    replicaGroupUid: "owner-a",
    restartCount: 1,
    selected: false,
    usagePercent: 25,
    workloadKey: "deployment:api-gateway",
    ...overrides,
  };
}

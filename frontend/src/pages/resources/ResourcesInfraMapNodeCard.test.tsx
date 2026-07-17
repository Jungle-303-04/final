// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../../shared/i18n";
import { TooltipProvider } from "../../shared/ui/primitives/tooltip";
import { InfraMapNodeCard } from "./ResourcesInfraMapNodeCard";
import type { InfraMapNode } from "./resourcesInfraMapModel";

afterEach(cleanup);

describe("InfraMapNodeCard", () => {
  it("shows capacity as ratios and pod capacity as counts instead of raw units", () => {
    const { container } = render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <TooltipProvider delay={0}>
          <InfraMapNodeCard
            metricMode="cpu"
            node={nodeFixture()}
            onOpenPod={vi.fn()}
            onShowMorePods={vi.fn()}
            selectionActive={false}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    expect(screen.getByText("5% / 95%")).toBeTruthy();
    expect(screen.getByText("33% / 67%")).toBeTruthy();
    expect(screen.getByText("20/110")).toBeTruthy();
    expect(container.textContent).not.toContain("574.4m");
    expect(container.textContent).not.toContain("5,320.1MiB");
    expect(container.textContent).not.toContain("18%");
  });

  it("drills into the lower Pod list instead of expanding hidden pods inside the node", () => {
    const onShowMorePods = vi.fn();
    const node = nodeFixture({
      hiddenPodCount: 5,
      hiddenPods: [
        podFixture({ id: "pod:hidden-one", name: "hidden-one" }),
        podFixture({ id: "pod:hidden-two", name: "hidden-two" }),
        podFixture({ id: "pod:hidden-three", name: "hidden-three" }),
        podFixture({ id: "pod:hidden-four", name: "hidden-four" }),
        podFixture({ id: "pod:hidden-five", name: "hidden-five" }),
      ],
    });
    const rendered = render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <TooltipProvider delay={0}>
          <InfraMapNodeCard
            metricMode="cpu"
            node={node}
            onOpenPod={vi.fn()}
            onShowMorePods={onShowMorePods}
            selectionActive={false}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    expect(screen.queryByText("hidden-three")).toBeNull();
    expect(rendered.container.querySelectorAll("[data-slot='infra-map-pod']")).toHaveLength(4);
    expect(rendered.container.querySelectorAll("[data-slot='infra-map-pod-cube']")).toHaveLength(6);

    fireEvent.click(screen.getByRole("button", { name: "View details" }));

    expect(onShowMorePods).toHaveBeenCalledWith(node);
    expect(screen.queryByText("hidden-three")).toBeNull();
    expect(screen.queryByText("hidden-two")).toBeNull();
  });

  it("keeps detail drilldown available even when no Pods are hidden", () => {
    const onShowMorePods = vi.fn();
    const node = nodeFixture({
      assignedPodCount: 2,
      visiblePods: [
        podFixture({ id: "pod:api", name: "api-gateway-0" }),
        podFixture({ id: "pod:worker", name: "worker-0" }),
      ],
    });
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <TooltipProvider delay={0}>
          <InfraMapNodeCard
            metricMode="cpu"
            node={node}
            onOpenPod={vi.fn()}
            onShowMorePods={onShowMorePods}
            selectionActive={false}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "View details" }));

    expect(onShowMorePods).toHaveBeenCalledWith(node);
  });

  it("summarizes Pod distribution after the visible two-row limit", () => {
    const pods = Array.from({ length: 31 }, (_, index) =>
      podFixture({
        id: `pod:visible-${index}`,
        name: `visible-${index}`,
      }));
    const rendered = render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <TooltipProvider delay={0}>
          <InfraMapNodeCard
            metricMode="cpu"
            node={nodeFixture({
              assignedPodCount: pods.length,
              hiddenPodCount: 20,
              hiddenPods: pods.slice(4),
              visiblePods: pods.slice(0, 4),
            })}
            onOpenPod={vi.fn()}
            onShowMorePods={vi.fn()}
            selectionActive={false}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    expect(rendered.container.querySelectorAll("[data-slot='infra-map-pod-cube']")).toHaveLength(26);
    expect(screen.getByText("+5")).toBeTruthy();
    expect(screen.getByRole("button", { name: "View details" })).toBeTruthy();
  });

  it("keeps the distribution overflow count separate from the detail button label", () => {
    const pods = Array.from({ length: 12 }, (_, index) =>
      podFixture({
        id: `pod:observed-${index}`,
        name: `observed-${index}`,
      }));
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <TooltipProvider delay={0}>
          <InfraMapNodeCard
            metricMode="cpu"
            node={nodeFixture({
              assignedPodCount: 34,
              hiddenPodCount: 30,
              hiddenPods: pods.slice(4),
              visiblePods: pods.slice(0, 4),
            })}
            onOpenPod={vi.fn()}
            onShowMorePods={vi.fn()}
            selectionActive={false}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    expect(screen.getByText("+22")).toBeTruthy();
    expect(screen.getByRole("button", { name: "View details" })).toBeTruthy();
  });

  it("colors Pod cards from the selected metric risk without inventing missing values", () => {
    const node = nodeFixture({
      visiblePods: [
        podFixture({
          cpu: { request: 100, ratio: 0.2, value: 20 },
          id: "pod:stable",
          memory: { request: 100, ratio: 0.92, value: 92 },
          name: "stable-api",
        }),
        podFixture({
          cpu: { request: 100, ratio: 0.97, value: 97 },
          id: "pod:hot",
          memory: { request: 100, ratio: 0.1, value: 10 },
          name: "hot-worker",
        }),
        podFixture({
          cpu: { request: null, ratio: null, value: null },
          id: "pod:unknown",
          memory: { request: null, ratio: null, value: null },
          name: "unknown-worker",
        }),
      ],
    });
    const rendered = render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <TooltipProvider delay={0}>
          <InfraMapNodeCard
            metricMode="cpu"
            node={node}
            onOpenPod={vi.fn()}
            onShowMorePods={vi.fn()}
            selectionActive={false}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    const cpuPods = rendered.container.querySelectorAll<HTMLElement>(
      "[data-slot='infra-map-pod']",
    );
    expect(cpuPods[0]?.getAttribute("aria-label")).toContain("hot-worker");
    expect(cpuPods[0]?.getAttribute("aria-label")).toContain("97%");
    expect(cpuPods[0]?.textContent).toContain("97%");
    expect(cpuPods[0]?.textContent).not.toContain("/");
    expect(cpuPods[0]?.dataset.usageTone).toBe("danger");
    expect(cpuPods[1]?.getAttribute("aria-label")).toContain("stable-api");
    expect(cpuPods[1]?.dataset.usageTone).toBe("healthy");
    expect(cpuPods[2]?.getAttribute("aria-label")).toContain("unknown-worker");
    expect(cpuPods[2]?.dataset.usageTone).toBe("unknown");
    expect(cpuPods[2]?.dataset.metricAvailable).toBe("false");
    expect(cpuPods[2]?.dataset.healthTone).toBe("healthy");
    expect(cpuPods[2]?.className).toContain("emerald");

    const cpuCubes = rendered.container.querySelectorAll<HTMLElement>(
      "[data-slot='infra-map-pod-cube']",
    );
    expect(cpuCubes[0]?.getAttribute("aria-label")).toContain("hot-worker");
    expect(cpuCubes[0]?.dataset.metricAvailable).toBe("true");
    expect(cpuCubes[0]?.style.getPropertyValue("--infra-map-pod-cube-color")).toContain("orange");
    expect(cpuCubes[1]?.getAttribute("aria-label")).toContain("stable-api");
    expect(cpuCubes[1]?.dataset.metricAvailable).toBe("true");
    expect(cpuCubes[1]?.style.getPropertyValue("--infra-map-pod-cube-color")).toContain("emerald");
    expect(cpuCubes[2]?.getAttribute("aria-label")).toContain("unknown-worker");
    expect(cpuCubes[2]?.dataset.metricAvailable).toBe("false");
    expect(cpuCubes[2]?.style.getPropertyValue("--infra-map-pod-cube-color")).toBe("");
    expect(cpuCubes[2]?.dataset.healthTone).toBe("healthy");
    expect(cpuCubes[2]?.className).toContain("emerald");

    rendered.rerender(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <TooltipProvider delay={0}>
          <InfraMapNodeCard
            metricMode="memory"
            node={node}
            onOpenPod={vi.fn()}
            onShowMorePods={vi.fn()}
            selectionActive={false}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    const memoryPods = rendered.container.querySelectorAll<HTMLElement>(
      "[data-slot='infra-map-pod']",
    );
    expect(memoryPods[0]?.getAttribute("aria-label")).toContain("stable-api");
    expect(memoryPods[0]?.dataset.usageTone).toBe("warning");
    expect(memoryPods[1]?.getAttribute("aria-label")).toContain("hot-worker");
    expect(memoryPods[1]?.dataset.usageTone).toBe("healthy");
  });

  it("keeps problem Pods first even when their selected metric is missing", () => {
    const node = nodeFixture({
      visiblePods: [
        podFixture({
          cpu: { request: 100, ratio: 0.9, value: 90 },
          id: "pod:hot",
          name: "hot-api",
        }),
        podFixture({
          cpu: { request: null, ratio: null, value: null },
          health: "CrashLoopBackOff",
          id: "pod:crashing",
          name: "crashing-worker",
          restartCount: 4,
        }),
        podFixture({
          cpu: { request: 100, ratio: 0.1, value: 10 },
          id: "pod:cool",
          name: "cool-api",
        }),
      ],
    });
    const rendered = render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <TooltipProvider delay={0}>
          <InfraMapNodeCard
            metricMode="cpu"
            node={node}
            onOpenPod={vi.fn()}
            onShowMorePods={vi.fn()}
            selectionActive={false}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    const pods = rendered.container.querySelectorAll<HTMLElement>(
      "[data-slot='infra-map-pod']",
    );
    expect(pods[0]?.getAttribute("aria-label")).toContain("crashing-worker");
    expect(pods[0]?.dataset.healthTone).toBe("critical");
    expect(pods[0]?.dataset.usageTone).toBe("unknown");
    expect(pods[0]?.querySelector("[data-pod-badge='crash-loop']")).toBeTruthy();
    expect(pods[1]?.getAttribute("aria-label")).toContain("hot-api");
    expect(pods[2]?.getAttribute("aria-label")).toContain("cool-api");
  });

  it("uses the selected metric value for the Infra Map Pod tooltip usage row", async () => {
    const node = nodeFixture({
      visiblePods: [
        podFixture({
          cpu: { request: 10, ratio: 0.9183, value: 9.183 },
          memory: { request: 50, ratio: 1.6043, value: 80.215 },
          name: "alloy-75495d7747-csd49",
          usagePercent: 160.4,
        }),
      ],
    });
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <TooltipProvider delay={0}>
          <InfraMapNodeCard
            metricMode="cpu"
            node={node}
            onOpenPod={vi.fn()}
            onShowMorePods={vi.fn()}
            selectionActive={false}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    const representativePod = document.querySelector<HTMLElement>("[data-slot='infra-map-pod']");
    expect(representativePod?.textContent).toContain("91.8%");

    fireEvent.focus(representativePod!);

    const tooltip = await screen.findByRole("tooltip");
    expect(within(tooltip).getByText("91.8%")).toBeTruthy();
    expect(within(tooltip).queryByText("160.4%")).toBeNull();
  });

  it("opens visible Pod details from the compact Pod card", () => {
    const onOpenPod = vi.fn();
    const pod = podFixture({ name: "api-gateway-0" });
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <TooltipProvider delay={0}>
          <InfraMapNodeCard
            metricMode="cpu"
            node={nodeFixture({ visiblePods: [pod] })}
            onOpenPod={onOpenPod}
            onShowMorePods={vi.fn()}
            selectionActive={false}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    const representativePod = document.querySelector<HTMLElement>("[data-slot='infra-map-pod']");
    expect(representativePod).toBeTruthy();

    fireEvent.click(representativePod!);

    expect(onOpenPod).toHaveBeenCalledWith(pod);
  });
});

function nodeFixture(overrides: Partial<InfraMapNode> = {}): InfraMapNode {
  return {
    assignedPodCount: 20,
    clusterId: "cluster-a",
    cpuMillicores: 574.4,
    cpuRatio: 0.05,
    health: "healthy",
    hiddenPods: [],
    hiddenPodCount: 0,
    id: "node:worker-a",
    memoryMebibytes: 5_320.1,
    memoryRatio: 0.33,
    name: "worker-a",
    podCapacity: 110,
    ready: true,
    unassigned: false,
    visiblePods: [podFixture()],
    ...overrides,
  };
}

function podFixture(
  overrides: Partial<InfraMapNode["visiblePods"][number]> = {},
): InfraMapNode["visiblePods"][number] {
  return {
    clusterId: "cluster-a",
    cpu: { request: 1000, ratio: 0.5, value: 574.4 },
    health: "healthy",
    id: "pod:alloy",
    memory: { request: 512, ratio: 0.25, value: 128 },
    name: "alloy-75495d7747-csd49",
    namespace: "target",
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
    usagePercent: 50,
    workloadKey: null,
    ...overrides,
  };
}

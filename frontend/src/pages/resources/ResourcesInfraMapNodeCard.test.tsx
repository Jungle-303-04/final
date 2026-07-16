// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../../shared/i18n";
import { InfraMapNodeCard } from "./ResourcesInfraMapNodeCard";
import type { InfraMapNode } from "./resourcesInfraMapModel";

afterEach(cleanup);

describe("InfraMapNodeCard", () => {
  it("shows capacity as ratios and pod capacity as counts instead of raw units", () => {
    const { container } = render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <InfraMapNodeCard
          metricMode="cpu"
          node={nodeFixture()}
          onShowMorePods={vi.fn()}
          selectionActive={false}
        />
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
      hiddenPodCount: 2,
      hiddenPods: [
        podFixture({ id: "pod:hidden-one", name: "hidden-one" }),
        podFixture({ id: "pod:hidden-two", name: "hidden-two" }),
      ],
    });
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <InfraMapNodeCard
          metricMode="cpu"
          node={node}
          onShowMorePods={onShowMorePods}
          selectionActive={false}
        />
      </I18nProvider>,
    );

    expect(screen.queryByText("hidden-one")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "View 2 more Pods" }));

    expect(onShowMorePods).toHaveBeenCalledWith(node);
    expect(screen.queryByText("hidden-one")).toBeNull();
    expect(screen.queryByText("hidden-two")).toBeNull();
  });

  it("colors Pod cards from the selected metric risk without inventing missing values", () => {
    const node = nodeFixture({
      visiblePods: [
        podFixture({
          cpu: { ratio: 0.2, value: 20 },
          id: "pod:stable",
          memory: { ratio: 0.92, value: 92 },
          name: "stable-api",
        }),
        podFixture({
          cpu: { ratio: 0.97, value: 97 },
          id: "pod:hot",
          memory: { ratio: 0.1, value: 10 },
          name: "hot-worker",
        }),
        podFixture({
          cpu: { ratio: null, value: null },
          id: "pod:unknown",
          memory: { ratio: null, value: null },
          name: "unknown-worker",
        }),
      ],
    });
    const rendered = render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <InfraMapNodeCard
          metricMode="cpu"
          node={node}
          onShowMorePods={vi.fn()}
          selectionActive={false}
        />
      </I18nProvider>,
    );

    const cpuPods = rendered.container.querySelectorAll<HTMLElement>(
      "[data-slot='infra-map-pod']",
    );
    expect(cpuPods[0]?.dataset.usageTone).toBe("healthy");
    expect(cpuPods[1]?.dataset.usageTone).toBe("critical");
    expect(cpuPods[2]?.dataset.usageTone).toBe("unknown");
    expect(cpuPods[2]?.dataset.metricAvailable).toBe("false");
    expect(cpuPods[2]?.textContent).toContain("—");

    rendered.rerender(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <InfraMapNodeCard
          metricMode="memory"
          node={node}
          onShowMorePods={vi.fn()}
          selectionActive={false}
        />
      </I18nProvider>,
    );

    const memoryPods = rendered.container.querySelectorAll<HTMLElement>(
      "[data-slot='infra-map-pod']",
    );
    expect(memoryPods[0]?.dataset.usageTone).toBe("danger");
    expect(memoryPods[1]?.dataset.usageTone).toBe("healthy");
  });
});

function nodeFixture(overrides: Partial<InfraMapNode> = {}): InfraMapNode {
  return {
    assignedPodCount: 20,
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
    cpu: { ratio: 0.5, value: 574.4 },
    health: "healthy",
    id: "pod:alloy",
    memory: { ratio: 0.25, value: 128 },
    name: "alloy-75495d7747-csd49",
    namespace: "target",
    phase: "Running",
    selected: false,
    ...overrides,
  };
}

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

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

  it("expands hidden pods inside the node pod area", () => {
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <InfraMapNodeCard
          metricMode="cpu"
          node={nodeFixture({
            hiddenPodCount: 2,
            hiddenPods: [
              podFixture({ id: "pod:hidden-one", name: "hidden-one" }),
              podFixture({ id: "pod:hidden-two", name: "hidden-two" }),
            ],
          })}
          selectionActive={false}
        />
      </I18nProvider>,
    );

    expect(screen.queryByText("hidden-one")).toBeNull();

    const expandButton = screen.getByRole("button", { name: "+ 2 more" });
    fireEvent.click(expandButton);

    expect(expandButton.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("hidden-one")).toBeTruthy();
    expect(screen.getByText("hidden-two")).toBeTruthy();
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

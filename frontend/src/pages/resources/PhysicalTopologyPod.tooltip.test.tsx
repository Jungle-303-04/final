// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PhysicalTopologyPod as PhysicalTopologyPodValue } from "../../features/resources/physicalTopologyContract";
import { I18nProvider } from "../../shared/i18n";
import { TooltipProvider } from "../../shared/ui/primitives/tooltip";
import { PhysicalTopologyPod } from "./PhysicalTopologyPod";

afterEach(cleanup);

describe("PhysicalTopologyPod evidence tooltip", () => {
  it("opens from keyboard focus and shows every available real field", async () => {
    renderPod(pod({
      name: "checkout-api-0",
      namespace: "shop",
      usagePercent: 106.2,
      cpuMillicores: 531,
      cpuRequestMillicores: 500,
      memoryMebibytes: 64,
      memoryRequestMebibytes: 128,
      phase: "Running",
      restartCount: 2,
    }));

    fireEvent.focus(screen.getByRole("button"));
    const tooltip = await screen.findByRole("tooltip");
    expect(within(tooltip).getByText("checkout-api-0")).toBeTruthy();
    expect(within(tooltip).getByText("shop · Running")).toBeTruthy();
    expect(within(tooltip).getByText("531m")).toBeTruthy();
    expect(within(tooltip).getByText("· 요청 500m")).toBeTruthy();
    expect(within(tooltip).getByText("64 MiB")).toBeTruthy();
    expect(within(tooltip).getByText("· 요청 128 MiB")).toBeTruthy();
    expect(within(tooltip).getByText("2")).toBeTruthy();
  });

  it("opens on hover and omits evidence rows the API did not provide", async () => {
    renderPod(pod({ name: "metrics-missing", phase: "Pending" }));

    fireEvent.mouseEnter(screen.getByRole("button"));
    const tooltip = await screen.findByRole("tooltip");
    expect(within(tooltip).queryByText("CPU")).toBeNull();
    expect(within(tooltip).queryByText("메모리")).toBeNull();
    expect(tooltip.textContent).not.toContain("—");
  });
});

function renderPod(value: PhysicalTopologyPodValue) {
  return render(
    <I18nProvider navigatorLanguage="ko-KR" storage={null}>
      <TooltipProvider delay={0}>
        <PhysicalTopologyPod nodeIndex={0} onOpen={vi.fn()} pod={value} podIndex={0} />
      </TooltipProvider>
    </I18nProvider>,
  );
}

function pod(overrides: Partial<PhysicalTopologyPodValue>): PhysicalTopologyPodValue {
  return {
    id: "pod:test",
    name: "test",
    namespace: "default",
    serverId: "node:worker-a",
    usagePercent: null,
    cpuMillicores: null,
    cpuRequestMillicores: null,
    memoryMebibytes: null,
    memoryRequestMebibytes: null,
    phase: "Running",
    health: "healthy",
    restartCount: 0,
    matchesFilter: true,
    ...overrides,
  };
}

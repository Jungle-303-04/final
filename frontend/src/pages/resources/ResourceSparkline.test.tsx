// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ResourceMetricHistorySeries } from "../../features/resources/resourceMetricsHistoryContract";
import { I18nProvider } from "../../shared/i18n";
import { ResourceSparkline } from "./ResourceSparkline";

afterEach(cleanup);

const IDENTITY = {
  resourceType: "pod",
  kind: "Pod",
  namespace: "shop",
  name: "checkout-0",
};

function history(cpu: Array<number | null>): ResourceMetricHistorySeries {
  return {
    resourceId: "inventory-pod-1",
    clusterId: "cluster-1",
    resourceType: "pod",
    namespace: "shop",
    name: "checkout-0",
    points: cpu.map((cpuMillicores, index) => ({
      observedAt: `2026-07-14T00:0${index}:00Z`,
      cpuMillicores,
      memoryMebibytes: null,
    })),
    hasSparklinePoints: cpu.some((value) => value !== null),
    completeness: cpu.every((value) => value !== null) ? "exact" : "partial",
    partialReasonCodes: cpu.every((value) => value !== null) ? [] : ["sample_gap"],
  };
}

function renderSparkline(series: ResourceMetricHistorySeries | null, onOpen = vi.fn()) {
  return {
    onOpen,
    ...render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <ResourceSparkline
          identity={IDENTITY}
          name="checkout-0"
          onOpen={onOpen}
          series={series}
        />
      </I18nProvider>,
    ),
  };
}

describe("ResourceSparkline", () => {
  it("renders a truthful Recharts line for two measured CPU points and opens detail", () => {
    const view = renderSparkline(history([10, null, 18]));
    const button = screen.getByRole("button", { name: /Open details for checkout-0: CPU trend/u });
    expect(view.container.querySelector(".recharts-line")).not.toBeNull();
    fireEvent.click(button);
    expect(view.onOpen).toHaveBeenCalledWith(IDENTITY);
  });

  it.each([
    ["missing batch", null],
    ["empty series", history([])],
    ["one measured sample", history([null, 12, null])],
    ["all-null samples", history([null, null])],
  ])("keeps the trend blank for %s", (_label, series) => {
    const view = renderSparkline(series);
    expect(screen.getByRole("img", { name: "CPU trend unavailable" })).toBeTruthy();
    expect(view.container.querySelector(".recharts-line")).toBeNull();
  });

  it("keeps identical row geometry while measured points arrive", () => {
    const view = renderSparkline(null);
    const unavailable = screen.getByRole("img", { name: "CPU trend unavailable" });

    expect(unavailable.className).toContain("h-7");
    view.rerender(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <ResourceSparkline
          identity={IDENTITY}
          name="checkout-0"
          onOpen={view.onOpen}
          series={history([10, 18])}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: /CPU trend/u }).className)
      .toContain("h-7");
  });
});

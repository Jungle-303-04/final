// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../../shared/i18n";
import type { CostTrend } from "./costContract";
import { COST_TREND_ANIMATION_ENABLED, CostTrendChart } from "./CostTrendChart";

afterEach(cleanup);

describe("CostTrendChart", () => {
  it("renders measured currency series without motion-dependent disclosure", () => {
    const view = renderChart({
      availability: "available",
      timeRange: "24h",
      currency: "KRW",
      reasonCodes: [],
      series: [{
        key: "namespace/shop",
        label: "shop",
        points: [
          { timestamp: 1_721_100_000, rateMicros: 1_000_000 },
          { timestamp: 1_721_100_300, rateMicros: 2_000_000 },
        ],
      }],
    });

    expect(view.container.querySelector('[data-slot="chart"]')).not.toBeNull();
    expect(screen.getByText("shop")).toBeTruthy();
    expect(COST_TREND_ANIMATION_ENABLED).toBe(false);
  });

  it("keeps unavailable evidence empty and supports range keyboard navigation", () => {
    const onChange = vi.fn();
    renderChart({
      availability: "unavailable",
      timeRange: "24h",
      currency: null,
      reasonCodes: ["cost_observation_not_integrated"],
      series: [],
    }, onChange);

    expect(screen.getByText("No observed allocation trend is available for this scope.")).toBeTruthy();
    const range = screen.getByRole("button", { name: "24 hours" });
    range.focus();
    fireEvent.keyDown(range, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("7d");
  });
});

function renderChart(trend: CostTrend, onChange = vi.fn()) {
  return render(
    <I18nProvider navigatorLanguage="en" storage={null}>
      <CostTrendChart onTimeRangeChange={onChange} timeRange="24h" trend={trend} />
    </I18nProvider>,
  );
}

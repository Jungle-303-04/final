// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { I18nProvider } from "../../shared/i18n";
import { CurrentAllocationUse } from "./CurrentAllocationUse";

afterEach(cleanup);

describe("CurrentAllocationUse", () => {
  it("renders only server-provided projections and separates zero from unavailable use", () => {
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <CurrentAllocationUse
          allocation={{
            replicas: 0,
            hourlyRateMicros: 300_000,
            projectedDailyMicros: 7_200_000,
            projectedMonthlyMicros: 219_000_000,
            cpuRateMicros: 0,
            memoryRateMicros: 120_000,
            cpuAllocationUseBasisPoints: null,
            memoryAllocationUseBasisPoints: null,
            cpuUsageWindowSeconds: null,
            memoryUsageWindowSeconds: null,
          }}
          currency="USD"
        />
      </I18nProvider>,
    );

    expect(screen.getByText("$219.00")).toBeTruthy();
    expect(screen.getByText("No allocation")).toBeTruthy();
    expect(screen.getByText("Usage unavailable")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "CPU allocation use" }).getAttribute("aria-valuenow")).toBe("0");
    expect(screen.getByRole("progressbar", { name: "Memory allocation use" }).getAttribute("aria-valuenow")).toBeNull();
  });
});

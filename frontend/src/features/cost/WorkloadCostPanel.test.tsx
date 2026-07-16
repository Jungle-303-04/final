// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { I18nProvider } from "../../shared/i18n";
import { WorkloadCostPanel } from "./WorkloadCostPanel";

afterEach(cleanup);

describe("WorkloadCostPanel", () => {
  it("does not turn an absent collector into zero currency", () => {
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <WorkloadCostPanel cost={{ availability: "unavailable", reasonCodes: ["cost_observation_not_integrated"] }} />
      </I18nProvider>,
    );

    expect(screen.getByTestId("workload-cost-unavailable")).toBeTruthy();
    expect(screen.queryByText(/\$0/)).toBeNull();
    expect(screen.queryByText("cost_observation_not_integrated")).toBeNull();
  });
});

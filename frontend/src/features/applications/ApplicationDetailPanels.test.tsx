// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../../shared/i18n";
import { ApplicationUnavailableEvidencePanel } from "./ApplicationDetailPanels";

afterEach(cleanup);

describe("ApplicationUnavailableEvidencePanel", () => {
  it.each([
    ["workload_history_link_not_persisted", "Workload-specific history is not connected yet."],
    ["cost_observation_not_integrated", "Workload-specific cost data is not connected yet."],
    ["workload_action_capabilities_not_connected", "Available workload actions are not connected yet."],
    ["unrecognized_backend_reason", "No evidence is connected to this workload scope yet."],
  ])("maps %s to a safe user message without rendering the internal reason", (reasonCode, message) => {
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <ApplicationUnavailableEvidencePanel
          evidence={{ availability: "unavailable", reasonCodes: [reasonCode] }}
          title="History"
        />
      </I18nProvider>,
    );

    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.queryByText(reasonCode)).toBeNull();
  });
});

// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { HomeClusterChoice } from "../../features/home/homeContract";
import { UnifiedFilterProvider } from "../../features/filters/UnifiedFilterProvider";
import { I18nProvider } from "../../shared/i18n";
import { HomeClusterGrid } from "./HomeClusterGrid";

const clusters: HomeClusterChoice[] = [{
  id: "cluster-production",
  workspaceId: "workspace-main",
  name: "Production",
  environment: "production",
  provider: "eks",
  connectionStage: "ready",
  registrationState: "active",
  connectionState: "online",
  lastObservedAt: "2026-07-14T01:00:00Z",
  nodeCount: 8,
  podCount: 47,
  incidentCount: 0,
}];

describe("HomeClusterGrid", () => {
  it("explains the same Resources exploration destination used by every cluster tile", () => {
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <MemoryRouter initialEntries={["/home"]}>
          <UnifiedFilterProvider>
            <HomeClusterGrid clusters={clusters} />
          </UnifiedFilterProvider>
        </MemoryRouter>
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "Explore resources by cluster" })).toBeTruthy();
    expect(screen.getByText("Choose a cluster to explore its resources.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open resources for Production" })
      .getAttribute("href")).toBe("/resources?clusters=cluster-production");
  });

  it("keeps cluster connection as a named Home action", async () => {
    const connect = vi.fn();
    const user = userEvent.setup();
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <MemoryRouter initialEntries={["/home"]}>
          <UnifiedFilterProvider>
            <HomeClusterGrid clusters={clusters} onConnect={connect} />
          </UnifiedFilterProvider>
        </MemoryRouter>
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Connect cluster" }));
    expect(connect).toHaveBeenCalledOnce();
  });
});

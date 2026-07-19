// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import type { HomeClusterChoice } from "../../features/home/homeContract";
import { UnifiedFilterProvider } from "../../features/filters/UnifiedFilterProvider";
import { I18nProvider } from "../../shared/i18n";
import { HomeClusterGrid } from "./HomeClusterGrid";

afterEach(cleanup);

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
  it("keeps v3 cluster tiles inside the named Resources explorer", () => {
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <MemoryRouter initialEntries={["/home"]}>
          <UnifiedFilterProvider>
            <HomeClusterGrid clusters={clusters} />
          </UnifiedFilterProvider>
        </MemoryRouter>
      </I18nProvider>,
    );

    const explorer = screen.getByRole("region", { name: "Cluster resource explorer" });
    expect(within(explorer).queryByRole("heading", { name: "Explore resources by cluster" }))
      .toBeNull();
    expect(within(explorer).getByRole("link", { name: "Open resources for Production" })
      .getAttribute("href")).toBe("/resources?clusters=cluster-production");
  });

  it("keeps the grid free of a connect card so the header button stays the single entry (D22)", () => {
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <MemoryRouter initialEntries={["/home"]}>
          <UnifiedFilterProvider>
            <HomeClusterGrid clusters={clusters} />
          </UnifiedFilterProvider>
        </MemoryRouter>
      </I18nProvider>,
    );

    expect(screen.queryByRole("button", { name: "Connect cluster" })).toBeNull();
  });
});

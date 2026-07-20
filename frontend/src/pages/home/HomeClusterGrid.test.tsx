// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
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

  it("fills an odd grid cell with the existing cluster connection action", async () => {
    const onConnect = vi.fn();
    const user = userEvent.setup();
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <MemoryRouter initialEntries={["/home"]}>
          <UnifiedFilterProvider>
            <HomeClusterGrid clusters={clusters} onConnect={onConnect} />
          </UnifiedFilterProvider>
        </MemoryRouter>
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: /Connect cluster/u }));
    expect(onConnect).toHaveBeenCalledOnce();
  });

  it("keeps a single scoped cluster on the fixed v3 two-column track", () => {
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <MemoryRouter initialEntries={["/home?clusters=cluster-production"]}>
          <UnifiedFilterProvider>
            <HomeClusterGrid clusters={clusters} onConnect={() => undefined} />
          </UnifiedFilterProvider>
        </MemoryRouter>
      </I18nProvider>,
    );

    const grid = document.querySelector('[data-slot="home-cluster-grid"]');
    expect(grid?.className).toContain("md:grid-cols-2");
    expect(document.querySelector('[data-slot="home-cluster-cell"]')?.className)
      .not.toContain("col-span");
    expect(document.querySelector('[data-slot="home-cluster-connect-cell"]')).not.toBeNull();
  });
});

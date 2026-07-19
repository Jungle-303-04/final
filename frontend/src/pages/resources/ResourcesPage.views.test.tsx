// @vitest-environment jsdom

import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import {
  renderResources,
  resourcesClusterPort,
  resourcesPhysicalTopologyPort,
  resourcesPort,
} from "./ResourcesPage.testSupport";

afterEach(cleanup);

describe("ResourcesPage view contract", () => {
  it("renders the map and list as mutually exclusive URL-backed views", async () => {
    const user = userEvent.setup();
    const rendered = renderResources(
      resourcesPort(),
      "/resources?clusters=cluster-1&resources.types=pod",
      resourcesClusterPort(),
      undefined,
      "en",
      undefined,
      resourcesPhysicalTopologyPort(),
    );

    expect(await screen.findByRole("table", { name: "Resource list" })).toBeTruthy();
    expect(document.querySelector('[data-slot="resources-graph-shell"]')).toBeNull();

    await user.click(screen.getByRole("button", { name: "Map" }));
    expect(await screen.findByRole("button", { name: "Include inactive resources" })).toBeTruthy();
    expect(screen.queryByRole("table", { name: "Resource list" })).toBeNull();
    expect(rendered.router.state.location.search).toContain("resources.view=graph");

    await user.click(screen.getByRole("button", { name: "List" }));
    expect(await screen.findByRole("table", { name: "Resource list" })).toBeTruthy();
    expect(document.querySelector('[data-slot="resources-graph-shell"]')).toBeNull();
    expect(rendered.router.state.location.search).not.toContain("resources.view");
  });
});

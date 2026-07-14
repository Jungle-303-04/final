// @vitest-environment jsdom

import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import {
  renderResources,
  resourcesClusterPort,
  resourcesPort,
} from "./ResourcesPage.testSupport";

afterEach(cleanup);

describe("ResourcesPage VP-012 four-layer surface", () => {
  it("shows filters, physical-view slot, scrubber, and verified table together", async () => {
    const port = resourcesPort();
    renderEnglishResources(
      port,
      "/resources?clusters=cluster-1&resources.types=pod",
    );

    expect(await screen.findByRole("table", { name: "Resource list" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Resource filters" })).toBeTruthy();
    expect(screen.getByText("Physical placement")).toBeTruthy();
    expect(screen.getByRole("heading", {
      level: 2,
      name: "Graph data is not available yet",
    })).toBeTruthy();

    const timeline = screen.getByRole("slider", { name: "Time" });
    const play = screen.getByRole("button", { name: "Play resource history" });
    expect(timeline.getAttribute("disabled")).not.toBeNull();
    expect(play.getAttribute("disabled")).not.toBeNull();
    expect(document.querySelector('[data-slot="resources-time-scrubber"]')
      ?.getAttribute("data-state")).toBe("unavailable");

    expect(screen.getAllByRole("img", { name: "CPU trend unavailable" })).toHaveLength(3);
    expect(document.querySelector('[data-slot="resource-trend-sparkline"]')).toBeNull();
    expect(screen.queryByRole("button", { name: "Graph" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Table" })).toBeNull();
    expect(port.loadCatalog).toHaveBeenCalledWith("cluster-1", expect.any(AbortSignal));
    expect(port.listResources).toHaveBeenCalledWith(
      "cluster-1",
      expect.objectContaining({ resourceType: "pod" }),
      expect.any(AbortSignal),
    );
  }, 15_000);

  it("canonicalizes the retired graph mode without hiding either graph or table", async () => {
    const port = resourcesPort();
    renderEnglishResources(
      port,
      "/resources?clusters=cluster-1&resources.types=pod&resources.view=graph",
    );

    expect(await screen.findByRole("table", { name: "Resource list" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Graph data is not available yet" }))
      .toBeTruthy();
    await waitFor(() => expect(readResourcesQuery().has("resources.view")).toBe(false));
    expect(port.listResources).toHaveBeenCalledOnce();
  }, 15_000);

  it("keeps multi-Cluster scope unavailable instead of issuing a single-Cluster request", async () => {
    const port = resourcesPort();
    renderEnglishResources(
      port,
      "/resources?clusters=cluster-1,kubernetes-ops&resources.types=pod",
    );

    expect(await screen.findByRole("heading", {
      name: "Multi-Cluster results need server support",
    })).toBeTruthy();
    expect(port.loadCatalog).not.toHaveBeenCalled();
    expect(port.listResources).not.toHaveBeenCalled();
    expect(screen.queryByRole("table", { name: "Resource list" })).toBeNull();
  });

  it("opens the real resource detail and isolates unsupported historical evidence", async () => {
    const user = userEvent.setup();
    const port = resourcesPort();
    renderEnglishResources(
      port,
      "/resources?clusters=cluster-1&resources.types=pod",
    );

    await user.click(await screen.findByRole("button", {
      name: "Open details for checkout-api-0",
    }));
    const dialog = await screen.findByRole("dialog", { name: "checkout-api-0 details" });

    expect(await within(dialog).findByText("Point-in-time evidence")).toBeTruthy();
    expect(within(dialog).getByText("CPU and memory history")).toBeTruthy();
    expect(within(dialog).getByText("Logs at the selected time")).toBeTruthy();
    expect(within(dialog).getByText("Related incident")).toBeTruthy();
    expect(within(dialog).getAllByText("Unavailable")).toHaveLength(3);
    expect(within(dialog).getByText("Running")).toBeTruthy();
    expect(port.loadResourceDetail).toHaveBeenCalledWith(
      "cluster-1",
      expect.objectContaining({ name: "checkout-api-0" }),
      expect.any(AbortSignal),
    );
  }, 15_000);
});

function renderEnglishResources(port: ReturnType<typeof resourcesPort>, entry: string) {
  return renderResources(port, entry, resourcesClusterPort(), undefined, "en");
}

function readResourcesQuery(): URLSearchParams {
  const location = screen.getByTestId("resources-location").textContent ?? "";
  return new URL(location, "https://product.test").searchParams;
}

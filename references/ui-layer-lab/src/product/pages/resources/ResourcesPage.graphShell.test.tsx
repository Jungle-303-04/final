// @vitest-environment jsdom

import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ResourcesPortFailure,
  type ResourceList,
} from "../../features/resources/resourcesContract";
import {
  deferred,
  POD_LIST,
  renderResources,
  resourcesClusterPort,
  resourcesPort,
} from "./ResourcesPage.testSupport";

afterEach(cleanup);

describe("ResourcesPage graph shell", () => {
  it("renders no graph data and returns to the verified table projection", async () => {
    const port = resourcesPort();
    renderEnglishResources(
      port,
      "/product/resources?clusters=cluster-1&resources.types=pod&resources.view=graph",
    );

    const graph = await screen.findByRole("button", { name: "Graph" });
    expect(graph.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Table" }).getAttribute("aria-pressed"))
      .toBe("false");
    expect(await screen.findByRole("heading", {
      level: 2,
      name: "Graph data is not available yet",
    }))
      .toBeTruthy();
    expect(port.loadCatalog).not.toHaveBeenCalled();
    expect(port.listResources).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Table" }));

    await waitFor(() => expect(readResourcesQuery().has("resources.view")).toBe(false));
    await waitFor(() => expect(port.listResources).toHaveBeenCalledWith(
      "cluster-1",
      expect.objectContaining({ resourceType: "pod" }),
      expect.any(AbortSignal),
    ));
    expect(screen.queryByRole("heading", { name: "Graph data is not available yet" })).toBeNull();
  }, 15_000);

  it("keeps the view switch available when Graph needs exactly one Cluster", async () => {
    const port = resourcesPort();
    renderEnglishResources(
      port,
      "/product/resources?clusters=cluster-1,kubernetes-ops" +
      "&resources.types=pod&resources.view=graph",
    );

    expect(await screen.findByRole("button", { name: "Graph" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Select one Cluster for Graph" }))
      .toBeTruthy();
    expect(port.loadCatalog).not.toHaveBeenCalled();
    expect(port.listResources).not.toHaveBeenCalled();
  });

  it("keeps an unknown Cluster identity distinct from a Graph scope choice", async () => {
    const port = resourcesPort();
    renderEnglishResources(
      port,
      "/product/resources?clusters=unknown-cluster" +
      "&resources.types=pod&resources.view=graph",
    );

    expect(await screen.findByRole("heading", {
      name: "Not found in the current cluster list",
    })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Select one Cluster for Graph" })).toBeNull();
    expect(port.loadCatalog).not.toHaveBeenCalled();
    expect(port.listResources).not.toHaveBeenCalled();
  });

  it("keeps Graph recovery available after a table read is forbidden", async () => {
    const port = resourcesPort({
      listResources: vi.fn().mockRejectedValue(new ResourcesPortFailure("forbidden")),
    });
    renderEnglishResources(
      port,
      "/product/resources?clusters=cluster-1&resources.types=pod",
    );

    expect(await screen.findByRole("heading", {
      name: "You cannot access this scope",
    })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Graph" }));

    expect(await screen.findByRole("heading", {
      level: 2,
      name: "Graph data is not available yet",
    }))
      .toBeTruthy();
    expect(port.loadCatalog).toHaveBeenCalledOnce();
    expect(port.listResources).toHaveBeenCalledTimes(1);
  });

  it("aborts an in-flight table request without exposing its late result", async () => {
    const pending = deferred<ResourceList>();
    let requestSignal: AbortSignal | null = null;
    const port = resourcesPort({
      listResources: vi.fn().mockImplementation((_clusterId, _query, signal) => {
        requestSignal = signal;
        return pending.promise;
      }),
    });
    renderEnglishResources(
      port,
      "/product/resources?clusters=cluster-1&resources.types=pod",
    );

    await waitFor(() => expect(port.listResources).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Graph" }));

    await waitFor(() => expect(requestSignal?.aborted).toBe(true));
    await act(async () => {
      pending.resolve(POD_LIST);
      await pending.promise;
    });
    expect(screen.getByRole("heading", {
      level: 2,
      name: "Graph data is not available yet",
    })).toBeTruthy();
    expect(screen.queryByRole("table", { name: "Resource list" })).toBeNull();
  });

  it("restores Table and Graph with browser history", async () => {
    const port = resourcesPort();
    const view = renderEnglishResources(
      port,
      "/product/resources?clusters=cluster-1&resources.types=pod",
    );
    expect(await screen.findByRole("table", { name: "Resource list" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Graph" }));
    await waitFor(() => expect(readResourcesQuery().get("resources.view")).toBe("graph"));
    expect(await screen.findByRole("heading", {
      level: 2,
      name: "Graph data is not available yet",
    })).toBeTruthy();

    await act(async () => { await view.router.navigate(-1); });
    await waitFor(() => expect(readResourcesQuery().has("resources.view")).toBe(false));
    expect(await screen.findByRole("table", { name: "Resource list" })).toBeTruthy();

    await act(async () => { await view.router.navigate(1); });
    await waitFor(() => expect(readResourcesQuery().get("resources.view")).toBe("graph"));
    expect(await screen.findByRole("heading", {
      level: 2,
      name: "Graph data is not available yet",
    })).toBeTruthy();
  }, 15_000);
});

function renderEnglishResources(port: ReturnType<typeof resourcesPort>, entry: string) {
  return renderResources(port, entry, resourcesClusterPort(), undefined, "en");
}

function readResourcesQuery(): URLSearchParams {
  const location = screen.getByTestId("resources-location").textContent ?? "";
  return new URL(location, "https://product.test").searchParams;
}

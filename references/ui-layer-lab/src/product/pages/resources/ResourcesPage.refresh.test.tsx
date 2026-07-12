// @vitest-environment jsdom

import { act, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResourcesPortFailure } from "../../features/resources/resourcesContract";
import {
  CATALOG,
  deferred,
  NODE_LIST,
  POD_LIST,
  renderResources,
  resourcesPort,
  setVisibility,
} from "./ResourcesPage.testSupport";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Reflect.deleteProperty(document, "visibilityState");
});

describe("ResourcesPage refresh and generation safety", () => {
  it("keeps the last successful list visible when a background refresh fails", async () => {
    const user = userEvent.setup();
    const listResources = vi.fn()
      .mockResolvedValueOnce(POD_LIST)
      .mockRejectedValueOnce(new ResourcesPortFailure("offline"));
    renderResources(
      resourcesPort({ listResources }),
      "/product/resources/pod?cluster=cluster-1",
    );
    expect(await screen.findByText("checkout-api-0", {}, { timeout: 5_000 })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "새로 고침" }));
    expect(await screen.findByText("checkout-api-0", {}, { timeout: 5_000 })).toBeTruthy();
    expect((await screen.findByRole("alert")).textContent)
      .toContain("목록을 갱신하지 못했습니다");
  }, 15_000);

  it("aborts an obsolete cluster/type request and never paints its late result", async () => {
    const oldList = deferred<typeof POD_LIST>();
    const newList = deferred<typeof NODE_LIST>();
    const signals: AbortSignal[] = [];
    const listResources = vi.fn((clusterId, query, signal: AbortSignal) => {
      signals.push(signal);
      if (clusterId === "kubernetes-ops" && query.resourceType === "node") {
        return newList.promise;
      }
      return oldList.promise;
    });
    const port = resourcesPort({
      loadCatalog: vi.fn().mockImplementation((clusterId) => Promise.resolve({
        ...CATALOG,
        clusterId,
      })),
      listResources,
    });
    const { router } = renderResources(
      port,
      "/product/resources/pod?cluster=cluster-1",
    );
    await waitFor(() => expect(listResources).toHaveBeenCalledOnce());

    await act(async () => {
      await router.navigate("/product/resources/node?cluster=kubernetes-ops");
    });
    await waitFor(() => expect(listResources).toHaveBeenCalledTimes(2));
    expect(signals[0]?.aborted).toBe(true);

    act(() => newList.resolve(NODE_LIST));
    expect(await screen.findByText("worker-new", {}, { timeout: 5_000 })).toBeTruthy();
    act(() => oldList.resolve(POD_LIST));
    await act(async () => Promise.resolve());
    expect(screen.queryByText("checkout-api-0")).toBeNull();
    expect(screen.getByText("worker-new")).toBeTruthy();
  }, 15_000);

  it("polls every 30 seconds only while visible and refreshes when visibility returns", async () => {
    vi.useFakeTimers();
    setVisibility("visible");
    const port = resourcesPort();
    const rendered = renderResources(port, "/product/resources/pod?cluster=cluster-1");
    await flushPromises();
    expect(port.listResources).toHaveBeenCalledOnce();

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });
    expect(port.listResources).toHaveBeenCalledTimes(2);
    expect(port.loadCatalog).toHaveBeenCalledTimes(2);
    expect(rendered.clusterPort.listClusterChoices).toHaveBeenCalledTimes(2);

    act(() => {
      setVisibility("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(60_000);
    });
    await act(async () => Promise.resolve());
    expect(port.listResources).toHaveBeenCalledTimes(2);
    expect(port.loadCatalog).toHaveBeenCalledTimes(2);

    await act(async () => {
      setVisibility("visible");
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(port.listResources).toHaveBeenCalledTimes(3);
    expect(port.loadCatalog).toHaveBeenCalledTimes(3);
    expect(rendered.clusterPort.listClusterChoices).toHaveBeenCalledTimes(3);
  });
});

async function flushPromises() {
  await act(async () => {
    for (let index = 0; index < 12; index += 1) await Promise.resolve();
  });
}

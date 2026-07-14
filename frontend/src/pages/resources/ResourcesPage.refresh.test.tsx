// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResourcesPortFailure } from "../../features/resources/resourcesContract";
import {
  CATALOG,
  deferred,
  NODE_LIST,
  POD_LIST,
  renderResources,
  resourcesClusterPort,
  resourcesFilterPage,
  resourcesFilterPort,
  resourcesPhysicalTopologyPort,
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
    const listResources = vi
      .fn()
      .mockResolvedValueOnce(POD_LIST)
      .mockRejectedValueOnce(new ResourcesPortFailure("offline"));
    renderResources(
      resourcesPort({ listResources }),
      "/resources?clusters=cluster-1&resources.types=pod",
    );
    expect(
      await screen.findByText("checkout-api-0", {}, { timeout: 5_000 }),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "새로 고침" }));
    expect(
      await screen.findByText("checkout-api-0", {}, { timeout: 5_000 }),
    ).toBeTruthy();
    expect((await screen.findByRole("alert")).textContent).toContain(
      "목록을 갱신하지 못했습니다",
    );
  }, 15_000);

  it("aborts an obsolete cluster/type request and never paints its late result", async () => {
    const oldList = deferred<typeof POD_LIST>();
    const newList = deferred<typeof NODE_LIST>();
    const oldFilterList = deferred<ReturnType<typeof resourcesFilterPage>>();
    const newFilterList = deferred<ReturnType<typeof resourcesFilterPage>>();
    const signals: AbortSignal[] = [];
    const listResources = vi.fn((clusterId, query, signal: AbortSignal) => {
      signals.push(signal);
      if (clusterId === "kubernetes-ops" && query.resourceType === "node") {
        return newList.promise;
      }
      return oldList.promise;
    });
    const port = resourcesPort({
      loadCatalog: vi.fn().mockImplementation((clusterId) =>
        Promise.resolve({
          ...CATALOG,
          clusterId,
        }),
      ),
      listResources,
    });
    const { router } = renderResources(
      port,
      "/resources?clusters=cluster-1&resources.types=pod",
      resourcesClusterPort(),
      vi.fn(),
      "ko",
      resourcesFilterPort({
        listResourcePage: vi.fn((state, _options, signal) => {
          signals.push(signal!);
          return state.common.clusters.includes("kubernetes-ops")
            ? newFilterList.promise
            : oldFilterList.promise;
        }),
      }),
    );
    await waitFor(() => expect(listResources).toHaveBeenCalledOnce());

    await act(async () => {
      await router.navigate(
        "/resources?clusters=kubernetes-ops&resources.types=node",
      );
    });
    await waitFor(() => expect(listResources).toHaveBeenCalledTimes(2));
    expect(signals.some((signal) => signal.aborted)).toBe(true);

    act(() => newList.resolve(NODE_LIST));
    act(() => newFilterList.resolve(resourcesFilterPage(NODE_LIST)));
    expect(
      await screen.findByText("worker-new", {}, { timeout: 5_000 }),
    ).toBeTruthy();
    act(() => oldList.resolve(POD_LIST));
    act(() => oldFilterList.resolve(resourcesFilterPage(POD_LIST)));
    await act(async () => Promise.resolve());
    expect(screen.queryByText("checkout-api-0")).toBeNull();
    expect(screen.getByText("worker-new")).toBeTruthy();
  }, 15_000);

  it("polls pod state every 5 seconds and resource counts every 10 seconds only while visible", async () => {
    vi.useFakeTimers();
    setVisibility("visible");
    const port = resourcesPort();
    const topologyPort = resourcesPhysicalTopologyPort();
    const rendered = renderResources(
      port,
      "/resources?clusters=cluster-1&resources.types=pod",
      resourcesClusterPort(),
      vi.fn(),
      "ko",
      resourcesFilterPort(),
      topologyPort,
    );
    await flushPromises();
    expect(port.listResources).toHaveBeenCalledOnce();
    expect(topologyPort.loadPhysicalTopology).toHaveBeenCalledOnce();
    expect(screen.getByText("5초마다 확인")).toBeTruthy();
    expect(document.querySelector('[data-slot="freshness-control"]')?.textContent)
      .toContain("0초 전 갱신");

    await act(async () => {
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
    });
    expect(topologyPort.loadPhysicalTopology).toHaveBeenCalledTimes(2);
    expect(port.listResources).toHaveBeenCalledOnce();
    expect(port.loadCatalog).toHaveBeenCalledOnce();

    await act(async () => {
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
    });
    expect(topologyPort.loadPhysicalTopology).toHaveBeenCalledTimes(3);
    expect(port.listResources).toHaveBeenCalledTimes(2);
    expect(port.loadCatalog).toHaveBeenCalledTimes(2);
    expect(rendered.clusterPort.listClusterChoices).toHaveBeenCalledTimes(2);

    act(() => {
      setVisibility("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(20_000);
    });
    await act(async () => Promise.resolve());
    expect(port.listResources).toHaveBeenCalledTimes(2);
    expect(port.loadCatalog).toHaveBeenCalledTimes(2);
    expect(topologyPort.loadPhysicalTopology).toHaveBeenCalledTimes(3);

    await act(async () => {
      setVisibility("visible");
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(port.listResources).toHaveBeenCalledTimes(3);
    expect(port.loadCatalog).toHaveBeenCalledTimes(3);
    expect(rendered.clusterPort.listClusterChoices).toHaveBeenCalledTimes(3);
    expect(topologyPort.loadPhysicalTopology).toHaveBeenCalledTimes(4);
  });

  it("does not automatically retry a forbidden read and exposes an explicit safe recovery", async () => {
    vi.useFakeTimers();
    setVisibility("visible");
    const recovery = deferred<typeof POD_LIST>();
    const filterRecovery = deferred<ReturnType<typeof resourcesFilterPage>>();
    const listResources = vi
      .fn()
      .mockResolvedValueOnce(POD_LIST)
      .mockRejectedValueOnce(new ResourcesPortFailure("forbidden"))
      .mockReturnValueOnce(recovery.promise);
    const listResourcePage = vi
      .fn()
      .mockResolvedValueOnce(resourcesFilterPage())
      .mockRejectedValueOnce(new ResourcesPortFailure("forbidden"))
      .mockReturnValueOnce(filterRecovery.promise);
    renderResources(
      resourcesPort({ listResources }),
      "/resources?clusters=cluster-1&resources.types=pod",
      resourcesClusterPort(),
      vi.fn(),
      "ko",
      resourcesFilterPort({ listResourcePage }),
    );
    await flushPromises();
    expect(screen.getByText("checkout-api-0")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "새로 고침" }));
    await flushPromises();

    expect(
      screen.getByRole("heading", { name: "이 범위에 접근할 수 없습니다" }),
    ).toBeTruthy();
    act(() => vi.advanceTimersByTime(90_000));
    await flushPromises();
    expect(listResources).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "권한 다시 확인" }));
    await flushPromises();
    expect(listResources).toHaveBeenCalledTimes(3);
    expect(screen.queryByText("checkout-api-0")).toBeNull();

    act(() =>
      recovery.resolve({
        ...POD_LIST,
        items: [POD_LIST.items[1]!],
        limitReached: false,
        returned: 1,
      }),
    );
    act(() =>
      filterRecovery.resolve(
        resourcesFilterPage({
          ...POD_LIST,
          items: [POD_LIST.items[1]!],
          limitReached: false,
          returned: 1,
        }),
      ),
    );
    await flushPromises();
    expect(screen.getByText("orders-api-0")).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "이 범위에 접근할 수 없습니다" }),
    ).toBeNull();
  });

  it("does not automatically retry an incompatible response", async () => {
    vi.useFakeTimers();
    setVisibility("visible");
    const listResources = vi
      .fn()
      .mockRejectedValueOnce(new ResourcesPortFailure("invalid-response"))
      .mockResolvedValueOnce(POD_LIST);
    const listResourcePage = vi
      .fn()
      .mockRejectedValueOnce(new ResourcesPortFailure("invalid-response"))
      .mockResolvedValueOnce(resourcesFilterPage());
    renderResources(
      resourcesPort({ listResources }),
      "/resources?clusters=cluster-1&resources.types=pod",
      resourcesClusterPort(),
      vi.fn(),
      "ko",
      resourcesFilterPort({ listResourcePage }),
    );
    await flushPromises();

    expect(
      screen.getByRole("heading", { name: "정보를 불러오지 못했습니다" }),
    ).toBeTruthy();
    act(() => vi.advanceTimersByTime(90_000));
    await flushPromises();
    expect(listResources).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    await flushPromises();
    expect(listResources).toHaveBeenCalledTimes(2);
    expect(screen.getByText("checkout-api-0")).toBeTruthy();
  });

  it("honors Retry-After before an automatic rate-limit recovery", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T10:00:00Z"));
    setVisibility("visible");
    const listResources = vi
      .fn()
      .mockRejectedValueOnce(new ResourcesPortFailure("rate-limited", 45))
      .mockResolvedValueOnce(POD_LIST);
    const listResourcePage = vi
      .fn()
      .mockRejectedValueOnce(new ResourcesPortFailure("rate-limited", 45))
      .mockResolvedValueOnce(resourcesFilterPage());
    renderResources(
      resourcesPort({ listResources }),
      "/resources?clusters=cluster-1&resources.types=pod",
      resourcesClusterPort(),
      vi.fn(),
      "ko",
      resourcesFilterPort({ listResourcePage }),
    );
    await flushPromises();

    expect(
      screen.getByText(/45초 이후 자동으로 다시 확인합니다/u),
    ).toBeTruthy();
    act(() => vi.advanceTimersByTime(44_999));
    await flushPromises();
    expect(listResources).toHaveBeenCalledOnce();

    act(() => vi.advanceTimersByTime(1));
    await flushPromises();
    expect(listResources).toHaveBeenCalledTimes(2);
    expect(screen.getByText("checkout-api-0")).toBeTruthy();
  });

});

async function flushPromises() {
  await act(async () => {
    for (let index = 0; index < 12; index += 1) await Promise.resolve();
  });
}

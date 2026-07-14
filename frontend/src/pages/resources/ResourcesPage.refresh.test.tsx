// @vitest-environment jsdom

import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomePortFailure } from "../../features/home/homeContract";
import { ResourcesPortFailure } from "../../features/resources/resourcesContract";
import {
  CATALOG,
  CLUSTERS,
  deferred,
  NODE_LIST,
  POD_LIST,
  renderResources,
  resourcesClusterPort,
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
      "/resources?clusters=cluster-1&resources.types=pod",
    );
    expect(await findTableText("checkout-api-0")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "새로 고침" }));
    expect(await findTableText("checkout-api-0")).toBeTruthy();
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
      "/resources?clusters=cluster-1&resources.types=pod",
    );
    await waitFor(() => expect(listResources).toHaveBeenCalledOnce());

    await act(async () => {
      await router.navigate(
        "/resources?clusters=kubernetes-ops&resources.types=node",
      );
    });
    await waitFor(() => expect(listResources).toHaveBeenCalledTimes(2));
    expect(signals[0]?.aborted).toBe(true);

    act(() => newList.resolve(NODE_LIST));
    expect(await findTableText("worker-new")).toBeTruthy();
    act(() => oldList.resolve(POD_LIST));
    await act(async () => Promise.resolve());
    expect(queryTableText("checkout-api-0")).toBeNull();
    expect(tableScope().getByText("worker-new")).toBeTruthy();
  }, 15_000);

  it("polls every 30 seconds only while visible and refreshes when visibility returns", async () => {
    vi.useFakeTimers();
    setVisibility("visible");
    const port = resourcesPort();
    const rendered = renderResources(
      port,
      "/resources?clusters=cluster-1&resources.types=pod",
    );
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

  it("does not automatically retry a forbidden read and exposes an explicit safe recovery", async () => {
    vi.useFakeTimers();
    setVisibility("visible");
    const recovery = deferred<typeof POD_LIST>();
    const listResources = vi.fn()
      .mockResolvedValueOnce(POD_LIST)
      .mockRejectedValueOnce(new ResourcesPortFailure("forbidden"))
      .mockReturnValueOnce(recovery.promise);
    renderResources(
      resourcesPort({ listResources }),
      "/resources?clusters=cluster-1&resources.types=pod",
    );
    await flushPromises();
    expect(tableScope().getByText("checkout-api-0")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "새로 고침" }));
    await flushPromises();

    expect(screen.getByRole("heading", { name: "이 범위에 접근할 수 없습니다" })).toBeTruthy();
    act(() => vi.advanceTimersByTime(90_000));
    await flushPromises();
    expect(listResources).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "권한 다시 확인" }));
    await flushPromises();
    expect(listResources).toHaveBeenCalledTimes(3);
    expect(queryTableText("checkout-api-0")).toBeNull();

    act(() => recovery.resolve({
      ...POD_LIST,
      items: [POD_LIST.items[1]!],
      limitReached: false,
      returned: 1,
    }));
    await flushPromises();
    expect(tableScope().getByText("orders-api-0")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "이 범위에 접근할 수 없습니다" })).toBeNull();
  });

  it("does not automatically retry an incompatible response", async () => {
    vi.useFakeTimers();
    setVisibility("visible");
    const listResources = vi.fn()
      .mockRejectedValueOnce(new ResourcesPortFailure("invalid-response"))
      .mockResolvedValueOnce(POD_LIST);
    renderResources(
      resourcesPort({ listResources }),
      "/resources?clusters=cluster-1&resources.types=pod",
    );
    await flushPromises();

    expect(screen.getByRole("heading", { name: "검증된 응답을 읽지 못했습니다" })).toBeTruthy();
    act(() => vi.advanceTimersByTime(90_000));
    await flushPromises();
    expect(listResources).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    await flushPromises();
    expect(listResources).toHaveBeenCalledTimes(2);
    expect(tableScope().getByText("checkout-api-0")).toBeTruthy();
  });

  it("honors Retry-After before an automatic rate-limit recovery", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T10:00:00Z"));
    setVisibility("visible");
    const listResources = vi.fn()
      .mockRejectedValueOnce(new ResourcesPortFailure("rate-limited", 45))
      .mockResolvedValueOnce(POD_LIST);
    renderResources(
      resourcesPort({ listResources }),
      "/resources?clusters=cluster-1&resources.types=pod",
    );
    await flushPromises();

    expect(screen.getByText(/45초 이후 자동으로 다시 확인합니다/u)).toBeTruthy();
    act(() => vi.advanceTimersByTime(44_999));
    await flushPromises();
    expect(listResources).toHaveBeenCalledOnce();

    act(() => vi.advanceTimersByTime(1));
    await flushPromises();
    expect(listResources).toHaveBeenCalledTimes(2);
    expect(tableScope().getByText("checkout-api-0")).toBeTruthy();
  });

  it("surfaces a cluster-choice background failure while preserving the last valid frame", async () => {
    const clusterPort = resourcesClusterPort({
      listClusterChoices: vi.fn()
        .mockResolvedValueOnce(CLUSTERS)
        .mockRejectedValueOnce(new HomePortFailure("offline")),
    });
    renderResources(
      resourcesPort(),
      "/resources?clusters=cluster-1&resources.types=pod",
      clusterPort,
    );
    expect(await findTableText("checkout-api-0")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "새로 고침" }));

    expect(await screen.findByText("클러스터 목록을 갱신하지 못했습니다", {}, { timeout: 5_000 }))
      .toBeTruthy();
    expect(tableScope().getByText("checkout-api-0")).toBeTruthy();
  });

  it("shows catalog observation freshness instead of implying that polling made stale data current", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T10:05:00Z"));
    setVisibility("visible");
    renderResources(
      resourcesPort(),
      "/resources?clusters=cluster-1&resources.types=pod",
    );
    await flushPromises();

    expect(screen.getByText("스냅샷 지연")).toBeTruthy();
    expect(screen.getByText(/5분 전 관측/u)).toBeTruthy();
  });
});

async function flushPromises() {
  await act(async () => {
    for (let index = 0; index < 12; index += 1) await Promise.resolve();
  });
}

async function findTableText(text: string) {
  const table = await screen.findByRole("table", { hidden: true }, { timeout: 5_000 });
  return within(table).findByText(text, {}, { timeout: 5_000 });
}

function queryTableText(text: string) {
  const table = screen.queryByRole("table", { hidden: true });
  return table ? within(table).queryByText(text) : null;
}

function tableScope() {
  const table = screen.getByRole("table", { hidden: true });
  return within(table);
}

// @vitest-environment jsdom

import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomePortFailure } from "../../features/home/homeContract";
import { ResourcesPortFailure } from "../../features/resources/resourcesContract";
import {
  DISCOVERED_CATALOG,
  CATALOG,
  CLUSTERS,
  deferred,
  POD_LIST,
  renderResources,
  resourcesClusterPort,
  resourcesPort,
} from "./ResourcesPage.testSupport";

beforeEach(resetDocumentTestClock);

afterEach(() => {
  cleanup();
  resetDocumentTestClock();
});

describe("ResourcesPage scope and collection semantics", () => {
  it("exposes progressive cluster, catalog, and list loading for an explicit selection", async () => {
    const clusters = deferred<typeof CLUSTERS>();
    const catalog = deferred<typeof CATALOG>();
    const list = deferred<typeof POD_LIST>();
    const port = resourcesPort({
      loadCatalog: vi.fn().mockReturnValue(catalog.promise),
      listResources: vi.fn().mockReturnValue(list.promise),
    });
    const clusterPort = resourcesClusterPort({
      listClusterChoices: vi.fn().mockReturnValue(clusters.promise),
    });
    renderResources(
      port,
      "/product/resources?clusters=cluster-1&resources.types=pod",
      clusterPort,
    );

    const initialStatus = await screen.findByRole("status", {
      name: "불러오는 중",
    });
    expect(initialStatus.closest("section")?.getAttribute("aria-busy")).toBe("true");
    expect(port.loadCatalog).not.toHaveBeenCalled();
    expect(screen.getByTestId("resources-location").textContent)
      .toBe("/product/resources?clusters=cluster-1&resources.types=pod");

    await act(async () => {
      clusters.resolve(CLUSTERS);
      await clusters.promise;
    });
    await waitFor(() => expect(port.loadCatalog).toHaveBeenCalledOnce());
    expect(screen.getByRole("status", { name: "불러오는 중" })).toBeTruthy();
    expect(document.querySelectorAll('[data-slot="product-page-frame"]')).toHaveLength(1);
    expect(document.querySelector('[data-slot="resources-catalog-loading"]')).toBeTruthy();
    expect(port.listResources).not.toHaveBeenCalled();
    await act(async () => {
      catalog.resolve(CATALOG);
      await catalog.promise;
    });
    await waitFor(() => expect(port.listResources).toHaveBeenCalledOnce());
    expect(document.querySelectorAll('[data-slot="product-page-frame"]')).toHaveLength(1);
    expect(document.querySelector('[data-slot="resources-list-loading"]')).toBeTruthy();
    await act(async () => {
      list.resolve(POD_LIST);
      await list.promise;
    });
  });

  it("does not automatically select an API-discovered resource type", async () => {
    const port = resourcesPort({
      loadCatalog: vi.fn().mockResolvedValue(DISCOVERED_CATALOG),
      listResources: vi.fn().mockResolvedValue({
        ...POD_LIST,
        resourceType: "widget",
      }),
    });
    renderResources(port, "/product/resources?clusters=cluster-1");

    await waitFor(() => expect(port.loadCatalog).toHaveBeenCalledWith(
      "cluster-1",
      expect.any(AbortSignal),
    ), { timeout: 5_000 });
    expect(port.listResources).not.toHaveBeenCalled();
    expect(screen.getByTestId("resources-location").textContent)
      .toBe("/product/resources?clusters=cluster-1");
  }, 15_000);

  it("keeps an unknown URL cluster explicit instead of selecting another cluster", async () => {
    const port = resourcesPort();
    renderResources(port, "/product/resources?clusters=missing&resources.types=pod");

    expect(await screen.findByRole("heading", { name: "현재 조회 목록에서 확인할 수 없습니다" }))
      .toBeTruthy();
    expect(port.loadCatalog).not.toHaveBeenCalled();
    expect(port.listResources).not.toHaveBeenCalled();
  });

  it("reconciles a cluster catalog 401 through the single session authority", async () => {
    const reportUnauthorized = vi.fn();
    const port = resourcesPort();
    const clusterPort = resourcesClusterPort({
      listClusterChoices: vi.fn().mockRejectedValue(new HomePortFailure("unauthorized")),
    });
    renderResources(port, "/product/resources", clusterPort, reportUnauthorized);

    await waitFor(() => expect(reportUnauthorized).toHaveBeenCalledOnce());
    expect(port.loadCatalog).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "검증된 응답을 읽지 못했습니다" }))
      .toBeNull();
  });

  it("reconciles a Resources API 401 through the same session authority", async () => {
    const reportUnauthorized = vi.fn();
    const port = resourcesPort({
      loadCatalog: vi.fn().mockRejectedValue(new ResourcesPortFailure("unauthorized")),
    });
    renderResources(
      port,
      "/product/resources?clusters=cluster-1&resources.types=pod",
      resourcesClusterPort(),
      reportUnauthorized,
    );

    await waitFor(() => expect(reportUnauthorized).toHaveBeenCalledOnce());
    expect(screen.queryByRole("heading", { name: "검증된 응답을 읽지 못했습니다" }))
      .toBeNull();
  });

  it("renders a first-class cluster-read 403 and removes cached resource content", async () => {
    const port = resourcesPort({
      loadCatalog: vi.fn().mockRejectedValue(new ResourcesPortFailure("forbidden")),
    });
    renderResources(port, "/product/resources?clusters=cluster-1&resources.types=pod");

    expect(await screen.findByRole("heading", { name: "이 범위에 접근할 수 없습니다" }))
      .toBeTruthy();
    expect(screen.queryByText("checkout-api-0")).toBeNull();
    expect(port.listResources).not.toHaveBeenCalled();
  });

  it("promotes a list 403 to the same cluster-wide authority", async () => {
    const port = resourcesPort({
      listResources: vi.fn().mockRejectedValue(new ResourcesPortFailure("forbidden")),
    });
    renderResources(port, "/product/resources?clusters=cluster-1&resources.types=pod");

    await waitFor(() => expect(port.listResources).toHaveBeenCalledOnce(), { timeout: 5_000 });
    expect(await screen.findByRole(
      "heading",
      { name: "이 범위에 접근할 수 없습니다" },
      { timeout: 5_000 },
    ))
      .toBeTruthy();
    expect(screen.queryByRole("table", { name: "리소스 목록" })).toBeNull();
  });

  it("states that search and counts are bounded to the loaded result window", async () => {
    const port = resourcesPort();
    renderResources(port, "/product/resources?clusters=cluster-1&resources.types=pod");

    await waitFor(() => expect(port.listResources).toHaveBeenCalledOnce(), { timeout: 5_000 });
    const table = await screen.findByRole(
      "table",
      { name: "리소스 목록" },
      { timeout: 5_000 },
    );
    expect(table.textContent).toContain("checkout-api-0");
    expect(screen.queryByText("Resources", { exact: true })).toBeNull();
    expect(screen.queryByText(/실 API|30초 자동 갱신/u)).toBeNull();
    expect(screen.queryByText("스냅샷 최신")).toBeNull();
    const scope = screen.getByRole("status", { name: "목록 범위" });
    expect(scope.textContent).toMatch(/표시 3/u);
    expect(scope.textContent).toMatch(/전체 수 미확인/u);
    expect(scope.textContent).toMatch(/최대 3/u);
  });

  it("renders product-owned collection copy in English while preserving Kubernetes facts", async () => {
    renderResources(
      resourcesPort(),
      "/product/resources?clusters=cluster-1&resources.types=pod",
      resourcesClusterPort(),
      vi.fn(),
      "en",
    );

    const table = await screen.findByRole("table", { name: "Resource list" });
    expect(screen.getByRole("searchbox", { name: "Search displayed results" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Apply" }).className).toContain("w-24");
    expect(screen.getByRole("button", { name: "Include inactive resources" }).className)
      .toContain("w-32");
    expect(screen.getByText("Types observed in the inventory snapshot")).toBeTruthy();
    expect(within(table).getAllByText("Running").length).toBeGreaterThan(0);
    expect(within(table).getAllByText("Pod").length).toBeGreaterThan(0);
  });

  it("keeps the filter control available while an unsupported server query fails closed", async () => {
    const user = userEvent.setup();
    renderResources(
      resourcesPort(),
      "/product/resources?clusters=cluster-1&resources.types=pod",
    );

    const search = await screen.findByRole("searchbox", { name: "표시된 결과 검색" });
    expect(search.getAttribute("placeholder")).toMatch(/표시된 결과/u);
    await user.type(search, "checkout");

    expect(await screen.findByRole("heading", { name: "이 필터는 서버 지원이 필요합니다" }))
      .toBeTruthy();
    expect(screen.queryByRole("table", { name: "리소스 목록" })).toBeNull();
    expect(screen.getByRole("searchbox", { name: "표시된 결과 검색" })).toBe(search);

    await user.clear(search);
    expect(await screen.findByRole("table", { name: "리소스 목록" })).toBeTruthy();
  });

  it("does not present an unknown-completeness empty catalog as a confirmed empty scope", async () => {
    renderResources(resourcesPort({
      loadCatalog: vi.fn().mockResolvedValue({ ...CATALOG, items: [] }),
    }), "/product/resources?clusters=cluster-1");

    expect(await screen.findByRole("heading", { name: "관측된 리소스 종류가 없습니다" }))
      .toBeTruthy();
    expect(screen.getByText("전체 범위의 부재는 확인할 수 없습니다.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "표시할 데이터가 없습니다" })).toBeNull();
  });

  it("does not present an unknown-completeness empty list as a confirmed empty scope", async () => {
    renderResources(resourcesPort({
      listResources: vi.fn().mockResolvedValue({
        ...POD_LIST,
        items: [],
        limitReached: false,
        returned: 0,
      }),
    }), "/product/resources?clusters=cluster-1&resources.types=pod");

    expect(await screen.findByRole("heading", { name: "현재 응답에서 관측된 리소스가 없습니다" }))
      .toBeTruthy();
    expect(screen.getByText("전체 범위의 부재는 확인할 수 없습니다.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "표시할 데이터가 없습니다" })).toBeNull();
  });

  it.each([
    "namespaces=cluster-1%2Fshop",
    "resources.includeDeleted=true",
  ])("does not mix a cluster-active aggregate into the scoped list for %s", async (query) => {
    renderResources(
      resourcesPort(),
      `/product/resources?clusters=cluster-1&resources.types=pod&${query}`,
    );

    expect(await screen.findByRole("table", { name: "리소스 목록" })).toBeTruthy();
    expect(screen.queryByText(/클러스터 활성 집계/u)).toBeNull();
  });

  it("reports malformed rows that the canonical adapter isolated from the list", async () => {
    renderResources(resourcesPort({
      listResources: vi.fn().mockResolvedValue({
        ...POD_LIST,
        excludedCount: 2,
      }),
    }), "/product/resources?clusters=cluster-1&resources.types=pod");

    const scope = await screen.findByRole(
      "status",
      { name: "목록 범위" },
      { timeout: 5_000 },
    );
    expect(scope.textContent).toContain("검증 실패 제외 2");
  });
});

function resetDocumentTestClock() {
  vi.useRealTimers();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
}

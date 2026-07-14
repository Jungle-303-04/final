// @vitest-environment jsdom

import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CATALOG,
  POD_LIST,
  renderResources,
  resourcesClusterPort,
  resourcesFilterPort,
  resourcesPort,
} from "./ResourcesPage.testSupport";
import {
  filterPageFromList,
  resetDocumentTestClock,
} from "./ResourcesPage.testHelpers";

beforeEach(resetDocumentTestClock);

afterEach(() => {
  cleanup();
  resetDocumentTestClock();
});

describe("ResourcesPage collection honesty", () => {
  it("applies the canonical global query through the server filter contract", async () => {
    const listResourcePage = vi.fn().mockImplementation((state) =>
      Promise.resolve(
        filterPageFromList({
          ...POD_LIST,
          items: POD_LIST.items.filter((item) =>
            item.name.includes(state.resources.query),
          ),
          returned: 1,
          limitReached: false,
        }),
      ),
    );
    renderResources(
      resourcesPort(),
      "/resources?clusters=cluster-1&resources.types=pod&resources.q=checkout",
      resourcesClusterPort(),
      vi.fn(),
      "ko",
      resourcesFilterPort({ listResourcePage }),
    );

    const table = await screen.findByRole("table", { name: "리소스 목록" });
    expect(within(table).getByText("checkout-api-0")).toBeTruthy();
    expect(within(table).queryByText("orders-api-0")).toBeNull();
    expect(listResourcePage).toHaveBeenCalledWith(
      expect.objectContaining({
        resources: expect.objectContaining({ query: "checkout" }),
      }),
      {},
      expect.any(AbortSignal),
    );
  });

  it("does not present an unknown-completeness empty catalog as a confirmed empty scope", async () => {
    renderResources(
      resourcesPort({
        loadCatalog: vi.fn().mockResolvedValue({ ...CATALOG, items: [] }),
      }),
      "/resources?clusters=cluster-1",
    );

    expect(
      await screen.findByRole("heading", {
        name: "관측된 리소스 종류가 없습니다",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText("전체 범위의 부재는 확인할 수 없습니다."),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "표시할 데이터가 없습니다" }),
    ).toBeNull();
  });

  it("does not present an unknown-completeness empty list as a confirmed empty scope", async () => {
    renderResources(
      resourcesPort(),
      "/resources?clusters=cluster-1&resources.types=pod",
      resourcesClusterPort(),
      vi.fn(),
      "ko",
      resourcesFilterPort({
        listResourcePage: vi.fn().mockResolvedValue(
          filterPageFromList({
            ...POD_LIST,
            items: [],
            limitReached: false,
            returned: 0,
          }),
        ),
      }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "현재 응답에서 관측된 리소스가 없습니다",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText("전체 범위의 부재는 확인할 수 없습니다."),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "표시할 데이터가 없습니다" }),
    ).toBeNull();
  });

  it.each(["namespaces=cluster-1%2Fshop", "resources.includeDeleted=true"])(
    "does not mix a cluster-active aggregate into the scoped list for %s",
    async (query) => {
      renderResources(
        resourcesPort(),
        `/resources?clusters=cluster-1&resources.types=pod&${query}`,
      );

      expect(
        await screen.findByRole("table", { name: "리소스 목록" }),
      ).toBeTruthy();
      expect(screen.queryByText(/클러스터 활성 집계/u)).toBeNull();
    },
  );

  it("reports malformed rows that the canonical adapter isolated from the list", async () => {
    renderResources(
      resourcesPort(),
      "/resources?clusters=cluster-1&resources.types=pod",
      resourcesClusterPort(),
      vi.fn(),
      "ko",
      resourcesFilterPort({
        listResourcePage: vi.fn().mockResolvedValue({
          ...filterPageFromList(POD_LIST),
          excludedCount: 2,
        }),
      }),
    );

    const scope = await screen.findByRole(
      "status",
      { name: "목록 범위" },
      { timeout: 5_000 },
    );
    expect(scope.textContent).toContain("검증 실패 제외 2");
  });
});

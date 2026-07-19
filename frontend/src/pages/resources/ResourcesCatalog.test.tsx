// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

import { UnifiedFilterProvider } from "../../features/filters/UnifiedFilterProvider";
import type { ResourceCatalogItem } from "../../features/resources/resourcesContract";
import { I18nProvider } from "../../shared/i18n";
import { ResourcesCatalog } from "./ResourcesCatalog";

afterEach(cleanup);

const COUNTS = { healthy: 1, warning: 0, critical: 0, stale: 0, unknown: 0 };
const ITEMS: ResourceCatalogItem[] = [
  { resourceType: "pod", count: 5, healthCounts: COUNTS },
  { resourceType: "service", count: 3, healthCounts: COUNTS },
  { resourceType: "configmap", count: 2, healthCounts: COUNTS },
];

describe("ResourcesCatalogCore", () => {
  it("owns the four responsive lenses and uses observed catalog counts", async () => {
    const user = userEvent.setup();
    renderCatalog();

    expect(screen.getByRole("button", { name: "리소스 종류" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "서비스" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "구성" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "저장소" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "서비스, 3개" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "구성" }));
    expect(screen.getByRole("button", { name: "설정 맵, 2개" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "파드, 5개" })).toBeNull();
  });

  it("routes the repository CTA to the real deploy repository context", async () => {
    const user = userEvent.setup();
    const router = renderCatalog();

    await user.click(screen.getByRole("button", { name: "저장소" }));
    await user.click(screen.getByRole("link", { name: "저장소 연결" }));
    expect(router.state.location.pathname).toBe("/deploy");
    expect(router.state.location.search).toContain("section=repositories");
  });

  it("selects an observed type without maintaining a second search state", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderCatalog(onSelect);

    await user.click(screen.getByRole("button", { name: "파드, 5개" }));
    expect(onSelect).toHaveBeenCalledWith("pod");
    expect(screen.queryByRole("searchbox")).toBeNull();
  });
});

function renderCatalog(onSelect = vi.fn()) {
  const router = createMemoryRouter([{
    path: "*",
    element: (
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <UnifiedFilterProvider>
          <ResourcesCatalog items={ITEMS} onSelect={onSelect} selectedResourceType="pod" />
        </UnifiedFilterProvider>
      </I18nProvider>
    ),
  }], { initialEntries: ["/resources"] });
  render(<RouterProvider router={router} />);
  return router;
}

// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResourceCatalogItem } from "../../features/resources/resourcesContract";
import { I18nProvider } from "../../shared/i18n";
import { ResourcesCatalog } from "./ResourcesCatalog";

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

const HEALTH_COUNTS = {
  healthy: 1,
  warning: 0,
  critical: 0,
  stale: 0,
  unknown: 0,
} as const;

const ITEMS: ResourceCatalogItem[] = [
  { resourceType: "pod", count: 5, healthCounts: HEALTH_COUNTS },
  { resourceType: "node", count: 2, healthCounts: HEALTH_COUNTS },
  { resourceType: "service", count: 3, healthCounts: HEALTH_COUNTS },
];

describe("ResourcesCatalog responsive disclosure", () => {
  it("uses distinct landmark names and initially expands only the selected category", () => {
    const { rerender } = render(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <ResourcesCatalog
          items={ITEMS}
          onSelect={vi.fn()}
          selectedResourceType="service"
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("region", { name: "리소스 종류" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "리소스 유형 목록" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "네트워크, 리소스 3개" }).getAttribute("aria-expanded"))
      .toBe("true");
    expect(screen.getByRole("button", { name: "워크로드, 리소스 5개" }).getAttribute("aria-expanded"))
      .toBe("false");
    expect(screen.getByRole("button", { name: "클러스터, 리소스 2개" }).getAttribute("aria-expanded"))
      .toBe("false");
    expect(screen.getByRole("button", { name: "서비스, 3개" })).toBeTruthy();

    rerender(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <ResourcesCatalog
          items={ITEMS}
          onSelect={vi.fn()}
          selectedResourceType="pod"
        />
      </I18nProvider>,
    );
    expect(screen.getByRole("button", { name: "워크로드, 리소스 5개" }).getAttribute("aria-expanded"))
      .toBe("true");
    expect(screen.getByRole("button", { name: "네트워크, 리소스 3개" }).getAttribute("aria-expanded"))
      .toBe("false");
  });

  it("renders product-owned catalog copy in English without translating resource facts", () => {
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <ResourcesCatalog
          items={ITEMS}
          onSelect={vi.fn()}
          selectedResourceType="service"
        />
      </I18nProvider>,
    );

    const description = screen.getByText("Types currently observed in this cluster");
    expect(description.className).toContain("truncate");
    expect(description.getAttribute("title")).toBe("Types currently observed in this cluster");
    expect(screen.getByRole("region", { name: "Resource type list" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Services, 3 resources" })).toBeTruthy();
  });

  it("searches only the observed types and supports keyboard selection", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <ResourcesCatalog items={ITEMS} onSelect={onSelect} selectedResourceType="pod" />
      </I18nProvider>,
    );

    const search = screen.getByRole("searchbox", { name: "리소스 종류 안에서 찾기" });
    await user.click(search);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledWith("pod");

    await user.type(search, "서비스");
    expect(screen.getByRole("button", { name: "서비스, 3개" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "파드, 5개" })).toBeNull();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenLastCalledWith("service");
  });

  it("persists pinned observed types without inventing missing resources", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <ResourcesCatalog items={ITEMS} onSelect={vi.fn()} selectedResourceType="pod" />
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: "파드 즐겨찾기에 고정" }));
    expect(window.localStorage.getItem("opsia.resources.pinned-types.v1")).toContain("pod");
    unmount();

    render(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <ResourcesCatalog items={ITEMS.filter((item) => item.resourceType !== "service")} onSelect={vi.fn()} selectedResourceType="pod" />
      </I18nProvider>,
    );
    expect(screen.getAllByRole("button", { name: "파드 즐겨찾기에서 해제" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "서비스, 3개" })).toBeNull();
  });

  it("uses distinct kind icons and keeps confirmed zero counts visible", () => {
    const { container } = render(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <ResourcesCatalog
          items={[
            ...ITEMS,
            { resourceType: "VeryLongCustomResourceDefinition", count: 0, healthCounts: HEALTH_COUNTS },
          ]}
          onSelect={vi.fn()}
          selectedResourceType="VeryLongCustomResourceDefinition"
        />
      </I18nProvider>,
    );

    expect(container.querySelector(".lucide-box")).toBeTruthy();
    expect(container.querySelector(".lucide-cpu")).toBeTruthy();
    expect(container.querySelector(".lucide-plug")).toBeTruthy();
    expect(container.querySelector(".lucide-puzzle")).toBeTruthy();
    const custom = screen.getByRole("button", {
      name: "VeryLongCustomResourceDefinition, 0개",
    });
    expect(custom.getAttribute("title")).toBe("VeryLongCustomResourceDefinition");
  });
});

// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResourceCatalogItem } from "../../features/resources/resourcesContract";
import { I18nProvider } from "../../shared/i18n";
import { ResourcesCatalog } from "./ResourcesCatalog";

afterEach(cleanup);

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
    expect(screen.getByRole("button", { name: "네트워크" }).getAttribute("aria-expanded"))
      .toBe("true");
    expect(screen.getByRole("button", { name: "워크로드" }).getAttribute("aria-expanded"))
      .toBe("false");
    expect(screen.getByRole("button", { name: "클러스터" }).getAttribute("aria-expanded"))
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
    expect(screen.getByRole("button", { name: "워크로드" }).getAttribute("aria-expanded"))
      .toBe("true");
    expect(screen.getByRole("button", { name: "네트워크" }).getAttribute("aria-expanded"))
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
    expect(description.className).toContain("min-h-8");
    expect(description.className).toContain("line-clamp-2");
    expect(screen.getByRole("region", { name: "Resource type list" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Services, 3 resources" })).toBeTruthy();
  });
});

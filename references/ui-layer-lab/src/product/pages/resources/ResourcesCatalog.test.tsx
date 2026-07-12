// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResourceCatalogItem } from "../../features/resources/resourcesContract";
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
      <ResourcesCatalog
        items={ITEMS}
        onSelect={vi.fn()}
        selectedResourceType="service"
      />,
    );

    expect(screen.getByRole("region", { name: "Resource types" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "리소스 유형 목록" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Networking" }).getAttribute("aria-expanded"))
      .toBe("true");
    expect(screen.getByRole("button", { name: "Workloads" }).getAttribute("aria-expanded"))
      .toBe("false");
    expect(screen.getByRole("button", { name: "Cluster" }).getAttribute("aria-expanded"))
      .toBe("false");

    rerender(
      <ResourcesCatalog
        items={ITEMS}
        onSelect={vi.fn()}
        selectedResourceType="pod"
      />,
    );
    expect(screen.getByRole("button", { name: "Workloads" }).getAttribute("aria-expanded"))
      .toBe("true");
    expect(screen.getByRole("button", { name: "Networking" }).getAttribute("aria-expanded"))
      .toBe("false");
  });
});

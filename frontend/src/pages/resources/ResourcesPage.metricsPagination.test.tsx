// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  POD_LIST,
  renderResources,
  resourcesFilterPage,
  resourcesFilterPort,
  resourcesMetricHistoryPort,
  resourcesPort,
} from "./ResourcesPage.testSupport";

beforeEach(() => vi.setSystemTime(new Date("2026-07-12T10:00:30.000Z")));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ResourcesPage metrics and pagination", () => {
  it("loads visible pod histories in one snapshot-pinned batch", async () => {
    const loadResourceMetricsHistory = vi.fn().mockResolvedValue({
      series: [],
      completeness: "unavailable",
      partialReasonCodes: ["metrics_history_unavailable"],
      snapshot: resourcesFilterPage().snapshot,
    });
    renderResources(
      resourcesPort(),
      undefined,
      undefined,
      undefined,
      "en",
      resourcesFilterPort(),
      undefined,
      resourcesMetricHistoryPort({ loadResourceMetricsHistory }),
    );

    await waitFor(
      () => expect(loadResourceMetricsHistory).toHaveBeenCalledTimes(1),
      { timeout: 5_000 },
    );
    expect(loadResourceMetricsHistory).toHaveBeenCalledWith(
      expect.objectContaining({ resources: expect.objectContaining({ types: ["pod"] }) }),
      POD_LIST.items.map((item) => item.inventoryKey),
      { snapshotRevision: 42, range: "1h", limit: 60 },
      expect.any(AbortSignal),
    );
  });

  it("wires the Load more control to the verified cursor append channel", async () => {
    const first = {
      ...resourcesFilterPage({ ...POD_LIST, items: [POD_LIST.items[0]!], returned: 1 }),
      nextCursor: "cursor-2",
      hasMore: true,
    };
    const second = resourcesFilterPage({
      ...POD_LIST,
      items: [POD_LIST.items[1]!],
      returned: 1,
      limitReached: false,
    });
    const listResourcePage = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    renderResources(
      resourcesPort(),
      undefined,
      undefined,
      undefined,
      "en",
      resourcesFilterPort({ listResourcePage }),
    );

    fireEvent.click(await screen.findByRole(
      "button",
      { name: "Load more" },
      { timeout: 5_000 },
    ));
    await waitFor(() => expect(listResourcePage).toHaveBeenCalledTimes(2), {
      timeout: 5_000,
    });
    expect(listResourcePage.mock.calls[1]?.[1]).toMatchObject({ cursor: "cursor-2" });
    expect(await screen.findByRole("button", { name: "Open details for orders-api-0" }))
      .toBeTruthy();
  });
});

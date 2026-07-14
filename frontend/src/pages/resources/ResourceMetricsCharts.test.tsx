// @vitest-environment jsdom

import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  POD_DETAIL,
  renderResources,
  resourcesFilterPage,
  resourcesMetricHistoryPort,
  resourcesPort,
} from "./ResourcesPage.testSupport";

afterEach(cleanup);

describe("resource detail metrics", () => {
  it("renders measured CPU and memory history in the metrics tab", async () => {
    const user = userEvent.setup();
    const loadResourceMetricsHistory = vi.fn().mockResolvedValue({
      completeness: "exact",
      partialReasonCodes: [],
      series: [{
        clusterId: "cluster-1",
        completeness: "exact",
        hasSparklinePoints: true,
        name: "checkout-api-0",
        namespace: "shop",
        partialReasonCodes: [],
        points: [
          {
            cpuMillicores: 86,
            memoryMebibytes: 192,
            observedAt: "2026-07-15T05:00:00.000Z",
          },
          {
            cpuMillicores: 40,
            memoryMebibytes: 160,
            observedAt: "2026-07-15T05:01:00.000Z",
          },
        ],
        resourceId: POD_DETAIL.resource.inventoryKey,
        resourceType: "pod",
      }],
      snapshot: resourcesFilterPage().snapshot,
    });
    renderResources(
      resourcesPort(),
      "/resources?clusters=cluster-1&resources.types=pod" +
        "&detail=Pod%2Fshop%2Fcheckout-api-0&tab=metrics",
      undefined,
      undefined,
      "ko",
      undefined,
      undefined,
      resourcesMetricHistoryPort({ loadResourceMetricsHistory }),
    );

    const dialog = await screen.findByRole("dialog", { name: "checkout-api-0 상세" });
    expect(await within(dialog).findByText("CPU 사용량")).toBeTruthy();
    expect(within(dialog).getByText("메모리 사용량")).toBeTruthy();
    expect(within(dialog).getAllByText("40.0m").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("86.0m").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("160MiB").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("192MiB").length).toBeGreaterThan(0);
    expect(dialog.querySelectorAll('[data-slot="chart"]')).toHaveLength(2);
    await waitFor(() => expect(loadResourceMetricsHistory).toHaveBeenCalled());
    await user.click(within(dialog).getByRole("tab", { name: "개요" }));
    expect(dialog.querySelector('[data-slot="resource-history-unavailable"]')).toBeNull();
  });
});

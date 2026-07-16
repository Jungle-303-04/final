// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  POD_DETAIL,
  renderResources,
  resourcesFilterPage,
  resourcesMetricHistoryPort,
  resourcesPort,
} from "./ResourcesPage.testSupport";
import { I18nProvider } from "../../shared/i18n";
import { ResourceMetricsCharts } from "./ResourceMetricsCharts";

afterEach(cleanup);

describe("resource detail metrics", () => {
  it("renders measured CPU and memory history in the metrics tab", async () => {
    const user = userEvent.setup();
    const loadResourceMetricsHistory = vi.fn().mockResolvedValue({
      refreshPolicyKey: "metrics_kubernetes",
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
    await waitFor(() => expect(loadResourceMetricsHistory).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ range: "1h" }),
      expect.any(AbortSignal),
    ));
    await user.click(within(dialog).getByRole("combobox", { name: "시간 범위" }));
    await user.click(await screen.findByRole("option", { name: "6시간" }));
    await waitFor(() => expect(screen.getByTestId("resources-location").textContent)
      .toContain("t.range=6h"));
    await waitFor(() => expect(loadResourceMetricsHistory).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ range: "6h" }),
      expect.any(AbortSignal),
    ));
    await user.click(within(dialog).getByRole("tab", { name: "개요" }));
    expect(dialog.querySelector('[data-slot="resource-history-unavailable"]')).toBeNull();
    expect(within(dialog).getByText("CPU 사용량")).toBeTruthy();
    expect(dialog.querySelectorAll('[data-slot="chart"]')).toHaveLength(2);
  });

  it("renders a real PVC volume observation without inventing CPU or memory", () => {
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <ResourceMetricsCharts
          frame={{
            phase: "ready",
            failure: null,
            refreshFailure: null,
            refreshing: false,
            unavailableRetry: null,
            data: {
              completeness: "exact",
              partialReasonCodes: [],
              refreshPolicyKey: "metrics_pvc",
              series: [{
                clusterId: "cluster-1",
                completeness: "exact",
                hasSparklinePoints: true,
                name: "cache",
                namespace: "shop",
                partialReasonCodes: [],
                points: [
                  {
                    cpuMillicores: null,
                    memoryMebibytes: null,
                    observedAt: "2026-07-17T00:00:00Z",
                    volumeUsagePercent: 64,
                  },
                  {
                    cpuMillicores: null,
                    memoryMebibytes: null,
                    observedAt: "2026-07-17T00:01:00Z",
                    volumeUsagePercent: 74,
                  },
                ],
                resourceId: "pvc:shop/cache",
                resourceType: "pvc",
              }],
              snapshot: resourcesFilterPage().snapshot,
            },
          }}
          onRangeChange={vi.fn()}
          range="1h"
          resourceId="pvc:shop/cache"
          wide={false}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("Volume usage")).toBeTruthy();
    expect(screen.queryByText("CPU usage")).toBeNull();
    expect(screen.queryByText("Memory usage")).toBeNull();
    expect(screen.getAllByText("74.0%").length).toBeGreaterThan(0);
  });
});

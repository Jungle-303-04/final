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
        currentObservation: {
          observedAt: "2026-07-15T05:00:58.000Z",
          measurementWindow: "30s",
          cpuMillicores: 40,
          memoryMebibytes: 160,
          containerMetricsComplete: true,
          containers: [
            {
              name: "app",
              cpuMillicores: 30,
              memoryMebibytes: 128,
            },
            {
              name: "sidecar",
              cpuMillicores: 10,
              memoryMebibytes: 32,
            },
          ],
        },
        containerSeries: [
          {
            name: "app",
            completeness: "exact",
            partialReasonCodes: [],
            points: [
              {
                cpuMillicores: 28,
                memoryMebibytes: 124,
                observedAt: "2026-07-15T05:00:00.000Z",
              },
              {
                cpuMillicores: 30,
                memoryMebibytes: 128,
                observedAt: "2026-07-15T05:01:00.000Z",
              },
            ],
          },
          {
            name: "sidecar",
            completeness: "exact",
            partialReasonCodes: [],
            points: [
              {
                cpuMillicores: 8,
                memoryMebibytes: 30,
                observedAt: "2026-07-15T05:00:00.000Z",
              },
              {
                cpuMillicores: 10,
                memoryMebibytes: 32,
                observedAt: "2026-07-15T05:01:00.000Z",
              },
            ],
          },
        ],
        containerHistoryCompleteness: "exact",
        containerHistoryReasonCodes: [],
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
    expect((await within(dialog).findAllByText("CPU 사용량")).length).toBe(3);
    expect(within(dialog).getAllByText("메모리 사용량")).toHaveLength(3);
    expect(within(dialog).getAllByText("40.0m").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("86.0m").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("160MiB").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("192MiB").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("app")).toHaveLength(2);
    expect(within(dialog).getAllByText("sidecar")).toHaveLength(2);
    expect(within(dialog).getByText("30.0m · 128MiB")).toBeTruthy();
    expect(within(dialog).getByText("10.0m · 32.0MiB")).toBeTruthy();
    expect(within(dialog).getByText("컨테이너 사용 이력")).toBeTruthy();
    expect(dialog.querySelectorAll('[data-slot="chart"]')).toHaveLength(6);
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
    expect(within(dialog).getAllByText("CPU 사용량")).toHaveLength(3);
    expect(dialog.querySelectorAll('[data-slot="chart"]')).toHaveLength(6);
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

  it("renders the exact current Node observation time and measurement window", () => {
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
              refreshPolicyKey: "metrics_kubernetes",
              series: [{
                clusterId: "cluster-1",
                completeness: "exact",
                currentObservation: {
                  observedAt: "2026-07-17T00:00:30Z",
                  measurementWindow: "30s",
                  cpuMillicores: 640.5,
                  memoryMebibytes: 4096,
                  containerMetricsComplete: false,
                  containers: [],
                },
                hasSparklinePoints: true,
                name: "worker-a",
                namespace: null,
                partialReasonCodes: [],
                points: [{
                  cpuMillicores: 600,
                  memoryMebibytes: 4000,
                  observedAt: "2026-07-17T00:00:00Z",
                }],
                resourceId: "node-a",
                resourceType: "node",
              }],
              snapshot: resourcesFilterPage().snapshot,
            },
          }}
          onRangeChange={vi.fn()}
          range="1h"
          resourceId="node-a"
          wide={false}
        />
      </I18nProvider>,
    );

    expect(screen.getAllByText("641m").length).toBeGreaterThan(0);
    expect(screen.getAllByText("4096MiB").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Current observation .* · window 30s/u).length).toBeGreaterThan(0);
  });
});

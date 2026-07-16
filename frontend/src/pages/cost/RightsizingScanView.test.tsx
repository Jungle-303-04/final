// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RightsizingPort, RightsizingScan } from "../../features/rightsizing/rightsizingContract";
import { UnifiedFilterProvider } from "../../features/filters/UnifiedFilterProvider";
import { I18nProvider } from "../../shared/i18n";
import { RightsizingScanView } from "./RightsizingScanView";

afterEach(cleanup);

describe("RightsizingScanView", () => {
  it("runs only on explicit intent, preserves URL filters, and opens the exact workload identity", async () => {
    const port: RightsizingPort = {
      getScan: vi.fn().mockResolvedValue(observedScan()),
    };
    render(
      <I18nProvider navigatorLanguage="en" storage={null}>
        <MemoryRouter initialEntries={["/cost?clusters=cluster-a&rfClass=increase&rfQ=api"]}>
          <UnifiedFilterProvider>
            <RightsizingScanView
              port={port}
              scopes={[{ clusterId: "cluster-a", namespaces: ["shop"] }]}
            />
            <LocationProbe />
          </UnifiedFilterProvider>
        </MemoryRouter>
      </I18nProvider>,
    );

    expect(port.getScan).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: "Scan visible workloads" })[0]!);

    await waitFor(() => expect(port.getScan).toHaveBeenCalledWith({
      clusterId: "cluster-a",
      namespaces: ["shop"],
      limit: 200,
    }, expect.any(AbortSignal)));
    expect(await screen.findByText("api")).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toContain("rfClass=increase");
    expect(screen.getByTestId("location").textContent).toContain("rfQ=api");

    fireEvent.click(screen.getByRole("button", { name: "Open workload" }));
    expect(screen.getByTestId("location").textContent).toContain(
      "/workload/Deployment/shop/api?cluster=cluster-a&apiGroup=apps&apiVersion=v1",
    );
  });
});

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function observedScan(): RightsizingScan {
  return {
    scope: {
      workspaceId: "workspace-a",
      clusterId: "cluster-a",
      namespaces: ["shop"],
      freshness: "live",
    },
    namespaceScope: ["shop"],
    result: {
      availability: "available",
      observedAt: "2026-07-16T09:00:00Z",
      provenance: {
        collector: "metrics-repository",
        algorithmRevision: "revision-a",
        sourceRevision: "source-a",
        windowStartedAt: "2026-07-09T09:00:00Z",
        windowEndedAt: "2026-07-16T09:00:00Z",
        sampleIntervalSeconds: 60,
      },
      coverage: {
        workloadsDiscovered: 1,
        workloadsEvaluated: 1,
        workloadsWithData: 1,
        truncated: false,
      },
      workloads: [{
        availability: "available",
        resource: {
          apiGroup: "apps",
          version: "v1",
          kind: "Deployment",
          namespace: "shop",
          name: "api",
          uid: "uid-api",
        },
        observedAt: "2026-07-16T09:00:00Z",
        freshness: "live",
        provenance: {
          collector: "metrics-repository",
          algorithmRevision: "revision-a",
          sourceRevision: "source-a",
          windowStartedAt: "2026-07-09T09:00:00Z",
          windowEndedAt: "2026-07-16T09:00:00Z",
          sampleIntervalSeconds: 60,
        },
        replicas: 2,
        scaledToZero: false,
        classification: "increase",
        impact: {
          replicas: 2,
          cpuMillicoresChange: 400,
          memoryBytesChange: 0,
        },
        rows: [{
          container: "api",
          resource: "cpu",
          fit: "under_requested",
          action: "increase",
          confidence: "high",
          currentRequest: { unit: "millicores", value: 300 },
          observedDemand: { unit: "millicores", value: 430 },
          recommendedRequest: { unit: "millicores", value: 500 },
          sampleCount: 100,
          expectedSamples: 100,
          coverageBasisPoints: 10_000,
          signals: [],
          reasonCodes: [],
        }],
        reasonCodes: [],
      }],
      failures: [],
      reasonCodes: [],
    },
    refreshAfterSeconds: 60,
  };
}

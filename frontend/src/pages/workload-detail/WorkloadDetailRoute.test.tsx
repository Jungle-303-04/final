// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { EMPTY_WORKLOAD_DETAIL_PORT } from "../../features/workload-detail/workloadDetailContract";
import { WorkloadDetailRoute } from "./WorkloadDetailRoute";

afterEach(cleanup);

describe("WorkloadDetailRoute", () => {
  it("wraps a workload Logs deep link with the canonical full ResourceDetailSheet URL", async () => {
    renderRoute(
      "/workload/Deployment/shop/checkout?cluster=cluster-a&apiGroup=apps&apiVersion=v1&tab=logs",
    );

    expect((await screen.findByTestId("workload-location")).textContent).toBe(
      "/resources?clusters=cluster-a&namespaces=cluster-a%2Fshop&resources.types=workload" +
      "&detail=Deployment%2Fshop%2Fcheckout&tab=logs&full=true",
    );
  });

  it("maps route-only workload tabs into the shared overview without rendering unique UI", async () => {
    renderRoute(
      "/workload/Deployment/shop/checkout?cluster=cluster-a&apiGroup=apps&apiVersion=v1&tab=pods",
    );

    expect((await screen.findByTestId("workload-location")).textContent).toContain(
      "&detail=Deployment%2Fshop%2Fcheckout&tab=overview&full=true",
    );
  });

  it("keeps cluster-scoped workload identities namespace-free", async () => {
    renderRoute(
      "/workload/Node/_/worker-a?cluster=cluster-a&apiGroup=&apiVersion=v1",
    );

    const location = (await screen.findByTestId("workload-location")).textContent ?? "";
    expect(location).toContain("clusters=cluster-a&resources.types=workload");
    expect(location).not.toContain("namespaces=");
    expect(location).toContain("detail=Node%2F~%2Fworker-a");
  });
});

function renderRoute(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          element={<WorkloadDetailRoute port={EMPTY_WORKLOAD_DETAIL_PORT} />}
          path="/workload/:kind/:namespace/:name"
        />
        <Route element={<LocationProbe />} path="*" />
      </Routes>
    </MemoryRouter>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="workload-location">
      {location.pathname}{location.search}
    </output>
  );
}

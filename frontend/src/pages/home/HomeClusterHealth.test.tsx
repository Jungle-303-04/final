// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HomeClusterChoice } from "../../features/home/homeContract";
import { I18nProvider } from "../../shared/i18n/I18nProvider";
import { HomeClusterHealth } from "./HomeClusterHealth";
import { CLUSTERS, NODES, OVERVIEW } from "./HomePage.testSupport";
import type { HomeResourceState } from "./useHomePageState";

afterEach(cleanup);

describe("HomeClusterHealth loading geometry", () => {
  it("keeps the health body and its three rows stable while loading becomes ready", () => {
    const loading: HomeResourceState<typeof OVERVIEW> = {
      phase: "loading",
      data: null,
      failure: null,
    };
    const ready: HomeResourceState<typeof OVERVIEW> = {
      phase: "ready",
      data: OVERVIEW,
      failure: null,
      refreshing: false,
      refreshFailure: null,
    };
    const view = renderHealth(loading);
    const loadingBody = healthBody(view.container);

    expect(loadingBody.className).toContain("min-h-[20.75rem]");
    expect(loadingBody.className).toContain("sm:min-h-[17.75rem]");
    expect(loadingBody.className).toContain("lg:min-h-[12.75rem]");
    expect(rowSlots(loadingBody)).toEqual([
      "home-cluster-health-metrics",
      "home-cluster-health-usage",
      "home-cluster-health-meta",
    ]);

    view.rerender(healthElement(ready));
    const readyBody = healthBody(view.container);

    expect(readyBody.className).toBe(loadingBody.className);
    expect(rowSlots(readyBody)).toEqual(rowSlots(loadingBody));
  });
});

describe("HomeClusterHealth provider context", () => {
  const ready: HomeResourceState<typeof OVERVIEW> = {
    phase: "ready",
    data: OVERVIEW,
    failure: null,
    refreshing: false,
    refreshFailure: null,
  };

  it("renders the selected cluster provider exactly once in the section header", () => {
    const view = renderHealth(ready);

    expect(view.getAllByRole("img", {
      name: "Amazon Elastic Kubernetes Service",
    })).toHaveLength(1);
    expect(view.container.querySelectorAll(
      "[data-slot='cluster-provider-icon']",
    )).toHaveLength(1);
  });

  it("does not infer a provider icon when no cluster is selected", () => {
    const view = renderHealth(ready, null);

    expect(view.container.querySelector(
      "[data-slot='cluster-provider-icon']",
    )).toBeNull();
  });
});

function renderHealth(
  overview: HomeResourceState<typeof OVERVIEW>,
  cluster: HomeClusterChoice | null = CLUSTERS.clusters[0] ?? null,
) {
  return render(healthElement(overview, cluster));
}

function healthElement(
  overview: HomeResourceState<typeof OVERVIEW>,
  cluster: HomeClusterChoice | null = CLUSTERS.clusters[0] ?? null,
) {
  return (
    <I18nProvider navigatorLanguage="en-US" storage={null}>
      <HomeClusterHealth
        cluster={cluster}
        links={{
          incidents: "/issues?clusters=cluster-1",
          nodes: "/resources?clusters=cluster-1&resources.types=node",
          pods: "/resources?clusters=cluster-1&resources.types=pod",
          restarts: "/resources?clusters=cluster-1&resources.types=pod",
          warnings: "/timeline?clusters=cluster-1",
          workloads: "/resources?clusters=cluster-1&resources.types=workload",
        }}
        nodes={{
          phase: "ready",
          data: NODES,
          failure: null,
          refreshing: false,
          refreshFailure: null,
        }}
        onRefresh={vi.fn()}
        overview={overview}
      />
    </I18nProvider>
  );
}

function healthBody(container: HTMLElement): HTMLElement {
  const body = container.querySelector<HTMLElement>(
    "[data-slot='home-cluster-health-body']",
  );
  if (!body) throw new Error("Home cluster health body is missing");
  return body;
}

function rowSlots(body: HTMLElement): Array<string | null> {
  return Array.from(body.children, (child) => child.getAttribute("data-slot"));
}

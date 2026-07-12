// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../shared/i18n/I18nProvider";
import { HomeClusterHealth } from "./HomeClusterHealth";
import { CLUSTERS, OVERVIEW } from "./HomePage.testSupport";
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

function renderHealth(overview: HomeResourceState<typeof OVERVIEW>) {
  return render(healthElement(overview));
}

function healthElement(overview: HomeResourceState<typeof OVERVIEW>) {
  return (
    <I18nProvider navigatorLanguage="en-US" storage={null}>
      <HomeClusterHealth
        cluster={CLUSTERS.clusters[0] ?? null}
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

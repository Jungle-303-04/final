// @vitest-environment jsdom

import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  ProductDetailQuery,
  UnifiedFilterState,
} from "../features/filters/filterContract";
import { serializeProductFilterUrl } from "../features/filters/filterUrl";
import { installMatchMedia } from "./__tests__/ProductShellInteractionSupport";
import {
  currentLocation,
  emptyClusterScope,
  renderProductRouter,
} from "./ProductRouter.filterCutover.testSupport";

const FILTER_STATE: UnifiedFilterState = {
  common: {
    clusters: ["cluster-a", "cluster-b"],
    namespaces: [
      { clusterId: "cluster-a", namespace: "checkout" },
      { clusterId: "cluster-b", namespace: "payments" },
    ],
    applications: ["checkout", "payments"],
    labels: [
      { key: "team", value: "checkout" },
      { key: "tier", value: "critical" },
    ],
  },
  resources: {
    types: ["Deployment", "Pod"],
    health: ["degraded", "healthy"],
    includeDeleted: true,
    query: "edge api",
    view: "graph",
  },
  issues: {
    severity: ["critical", "warning"],
    category: ["container_restart", "scheduling"],
    status: ["open", "resolved"],
    environment: ["production", "staging"],
    query: "packet loss",
  },
  applicationSurface: {
    environment: ["production", "staging"],
    status: ["degraded", "synced"],
    pendingPromotion: true,
    query: "checkout app",
  },
  gitops: {
    environment: ["production", "staging"],
    approval: ["approved", "pending"],
    changeType: ["config", "image"],
    query: "release train",
  },
  checks: {
    severity: ["critical", "warning"],
    category: ["policy", "security"],
    query: "privileged pod",
  },
};

const DETAIL_QUERY: ProductDetailQuery = {
  detail: null,
  resource: "checkout/api",
  resourceKind: "Deployment",
  tab: "events",
  full: true,
  node: "worker-a",
};

const FILTER_SEARCH = serializeProductFilterUrl(FILTER_STATE, DETAIL_QUERY);
const FILTER_ONLY_SEARCH = serializeProductFilterUrl({ ...FILTER_STATE, resources: { ...FILTER_STATE.resources, view: "table" } });

beforeEach(() => {
  installMatchMedia(false);
});
afterEach(() => {
  cleanup();
  document.documentElement.className = "";
  window.localStorage.clear();
});

describe("ProductRouter unified filter cutover", () => {
  it("keeps one shell-owned filter in the same slot while detail is open", async () => {
    const { container, router } = renderProductRouter(
      `/resources${FILTER_SEARCH}#detail`,
      emptyClusterScope,
    );

    expect(currentLocation(router)).toBe(`/resources${FILTER_SEARCH}#detail`);
    expect(container.querySelectorAll("[data-slot='unified-filter-bar']")).toHaveLength(1);
    expect(screen.getByRole("button", {
      name: "Filter clusters, apps, labels, and resources",
    })).toBeTruthy();

    await waitFor(() => {
      expect(currentLocation(router)).toBe(`/resources${FILTER_SEARCH}#detail`);
    });
    expect(router.state.historyAction).toBe("POP");
  });

  it("preserves every filter and drops detail when the sidebar changes surfaces", async () => {
    const user = userEvent.setup();
    const { router } = renderProductRouter(
      `/resources${FILTER_SEARCH}#detail`,
      emptyClusterScope,
    );

    await user.click(await screen.findByRole("link", { name: "Incidents" }));

    expect(currentLocation(router)).toBe(`/issues${FILTER_ONLY_SEARCH}`);
    expect(router.state.historyAction).toBe("PUSH");
  });

  it("preserves every filter and drops detail when the Home shortcut changes surfaces", async () => {
    const user = userEvent.setup();
    const { router } = renderProductRouter(
      `/resources${FILTER_SEARCH}#detail`,
      emptyClusterScope,
    );

    await user.keyboard("gh");

    await waitFor(() => {
      expect(currentLocation(router)).toBe(`/home${FILTER_ONLY_SEARCH}`);
    });
    expect(router.state.historyAction).toBe("PUSH");
  });

  it("drops detail when a route shortcut targets the already active surface", async () => {
    const user = userEvent.setup();
    const { router } = renderProductRouter(
      `/resources${FILTER_SEARCH}#detail`,
      emptyClusterScope,
    );

    await user.keyboard("gr");

    await waitFor(() => {
      expect(currentLocation(router)).toBe(`/resources${FILTER_ONLY_SEARCH}`);
    });
    expect(router.state.historyAction).toBe("PUSH");
  });

  it("replaces an unknown path with the declared Home landing while preserving filters and dropping detail", async () => {
    const { router } = renderProductRouter(
      `/not-released${FILTER_SEARCH}#detail`,
      emptyClusterScope,
    );

    await waitFor(() => {
      expect(currentLocation(router)).toBe(`/home${FILTER_ONLY_SEARCH}`);
    });
    expect(router.state.historyAction).toBe("REPLACE");
  });

  it("redirects a legacy workflow alias directly to the Deploy repository section", async () => {
    const { router } = renderProductRouter(
      `/workflows${FILTER_SEARCH}#detail`,
      emptyClusterScope,
      true,
    );

    await waitFor(() => {
      expect(currentLocation(router)).toBe(
        `/deploy${FILTER_ONLY_SEARCH}&section=repositories`,
      );
    });
    expect(router.state.historyAction).toBe("REPLACE");
  });

  it("redirects Traffic directly to the Resources flow view without dropping filters", async () => {
    const { router } = renderProductRouter(
      `/traffic${FILTER_SEARCH}#detail`,
      emptyClusterScope,
    );

    await waitFor(() => {
      const location = router.state.location;
      expect(location.pathname).toBe("/resources");
      const parsed = new URLSearchParams(location.search);
      expect(parsed.get("view")).toBe("flow");
      expect(parsed.get("clusters")).toBe("cluster-a,cluster-b");
      expect(parsed.get("detail")).toBe("checkout/api");
    });
    expect(router.state.historyAction).toBe("REPLACE");
  });

  it("uses the declared Home landing at the bare root even when Clusters is released", async () => {
    const { router } = renderProductRouter(
      `/${FILTER_SEARCH}#detail`,
      emptyClusterScope,
    );

    await waitFor(() => {
      expect(currentLocation(router)).toBe(`/home${FILTER_ONLY_SEARCH}`);
    });
    expect(router.state.historyAction).toBe("REPLACE");
  });

  it("keeps the explicit Home route on Home even when Clusters is released", async () => {
    const { router } = renderProductRouter(
      `/home${FILTER_SEARCH}#detail`,
      emptyClusterScope,
    );

    await waitFor(() => {
      expect(screen.getByText("Home surface")).toBeTruthy();
    });
    expect(currentLocation(router)).toBe(`/home${FILTER_SEARCH}#detail`);
  });

  it("redirects the removed Topology route through the normal unknown-route fallback", async () => {
    const { router } = renderProductRouter(
      `/topology${FILTER_SEARCH}#detail`,
      emptyClusterScope,
    );

    await waitFor(() => {
      expect(currentLocation(router)).toBe(`/home${FILTER_ONLY_SEARCH}`);
    });
    expect(router.state.historyAction).toBe("REPLACE");
    expect(screen.queryByRole("heading", { name: "Topology is unavailable" })).toBeNull();
  });
});

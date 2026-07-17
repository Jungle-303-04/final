// @vitest-environment jsdom

import { ThemeProvider } from "next-themes";
import type { ComponentType } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMemoryRouter,
  RouterProvider,
  useLocation,
  useNavigationType,
} from "react-router-dom";
import { ProductRouter } from "./ProductRouter";
import { createProductComposition } from "./productComposition";
import { createProductSurfaceLoader } from "./surfaceLoader";
import { AuthSessionGateProvider } from "../features/auth/AuthSessionGate";
import type { AuthPort } from "../features/auth/authContract";
import type { ClusterScopePort } from "../features/cluster-scope/clusterScopeContract";
import type {
  ProductDetailQuery,
  UnifiedFilterState,
} from "../features/filters/filterContract";
import { serializeProductFilterUrl } from "../features/filters/filterUrl";
import { I18nProvider } from "../shared/i18n";
import {
  installMatchMedia,
  testAuth,
} from "./__tests__/ProductShellInteractionSupport";

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
const FILTER_ONLY_SEARCH = serializeProductFilterUrl(FILTER_STATE);

const authPort: AuthPort = {
  loadSession: async () => ({ status: "unauthenticated" }),
  signIn: async () => { throw new Error("not used"); },
  signOut: async () => undefined,
};

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

  it("redirects the previous workflow path to the current workflow surface", async () => {
    const { router } = renderProductRouter(
      `/workflows${FILTER_SEARCH}#detail`,
      emptyClusterScope,
      true,
    );

    await waitFor(() => {
      expect(currentLocation(router)).toBe(`/gitops${FILTER_ONLY_SEARCH}`);
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

const emptyClusterScope: ClusterScopePort = {
  listClusterChoices: async () => ({ completeness: "unknown", clusters: [] }),
};

function renderProductRouter(
  initialEntry: string,
  clusterScope: ClusterScopePort,
  includeWorkflows = false,
) {
  const composition = createProductComposition([
    { id: "home", loader: surfaceLoader(HomeSurface) },
    { id: "clusters", loader: surfaceLoader(ClustersSurface) },
    { id: "resources", loader: surfaceLoader(ResourcesSurface) },
    { id: "issues", loader: surfaceLoader(IssuesSurface) },
    ...(includeWorkflows ? [{ id: "gitops" as const, loader: surfaceLoader(WorkflowsSurface) }] : []),
  ], authPort, clusterScope);
  const router = createMemoryRouter([{
    path: "*",
    element: (
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <AuthSessionGateProvider reportUnauthorized={vi.fn()}>
            <ProductRouter auth={testAuth} composition={composition} />
            <LocationProbe />
          </AuthSessionGateProvider>
        </ThemeProvider>
      </I18nProvider>
    ),
  }], { initialEntries: [initialEntry] });

  return {
    ...render(<RouterProvider router={router} />),
    router,
  };
}

function surfaceLoader(Component: ComponentType) {
  return createProductSurfaceLoader(async () => ({ default: Component }));
}

function HomeSurface() {
  return <p>Home surface</p>;
}

function ResourcesSurface() {
  return <p>Resources surface</p>;
}

function ClustersSurface() {
  return <p>Clusters surface</p>;
}

function IssuesSurface() {
  return <p>Issues surface</p>;
}

function WorkflowsSurface() {
  return <p>Workflows surface</p>;
}

function LocationProbe() {
  const location = useLocation();
  const navigationType = useNavigationType();
  return (
    <output data-testid="router-location">
      {`${navigationType}:${location.pathname}${location.search}${location.hash}`}
    </output>
  );
}

function currentLocation(router: ReturnType<typeof createMemoryRouter>): string {
  const { hash, pathname, search } = router.state.location;
  return `${pathname}${search}${hash}`;
}

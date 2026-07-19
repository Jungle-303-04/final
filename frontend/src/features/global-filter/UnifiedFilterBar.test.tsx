// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMemoryRouter,
  RouterProvider,
  useLocation,
} from "react-router-dom";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { I18nProvider } from "../../shared/i18n";
import { AuthSessionGateProvider } from "../auth/AuthSessionGate";
import { ClusterScopeProvider } from "../cluster-scope/ClusterScopeProvider";
import type { ClusterScopePort } from "../cluster-scope/clusterScopeContract";
import { UnifiedFilterProvider } from "../filters/UnifiedFilterProvider";
import type {
  GlobalFilterPort,
  GlobalFilterSuggestion,
} from "./globalFilterContract";
import { UnifiedFilterBar } from "./UnifiedFilterBar";

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);
afterAll(() => vi.unstubAllGlobals());

describe("UnifiedFilterBar", () => {
  it("announces a pending search with the shared reduced-motion-safe spinner", async () => {
    const user = userEvent.setup();
    const pending = deferred<readonly GlobalFilterSuggestion[]>();
    renderFilter({ search: vi.fn(() => pending.promise) });

    await user.click(screen.getByRole("button", { name: filterPlaceholder }));

    const status = (await screen.findByText("Loading")).closest<HTMLElement>('[role="status"]');
    expect(status?.textContent).toContain("Loading");
    const spinner = status?.querySelector<HTMLElement>('[data-slot="spinner"]');
    expect(spinner?.classList.contains("motion-safe:animate-spin")).toBe(true);
    expect(spinner?.classList.contains("motion-reduce:animate-none")).toBe(true);
    expect(spinner?.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders server-defined groups and writes typed selections to the canonical URL", async () => {
    const user = userEvent.setup();
    const search = vi.fn<GlobalFilterPort["search"]>(async (query) =>
      query === "" ? structuralSuggestions : searchableSuggestions,
    );
    renderFilter({ search });

    await user.click(screen.getByRole("button", { name: filterPlaceholder }));
    await waitFor(() =>
      expect(search).toHaveBeenCalledWith(
        "",
        emptySelection,
        expect.any(AbortSignal),
      ),
    );
    expect(screen.getByText("Clusters")).toBeTruthy();
    expect(screen.getByText("Namespaces")).toBeTruthy();
    expect(screen.getByText("Applications")).toBeTruthy();
    expect(screen.getByText("Types")).toBeTruthy();
    expect(screen.queryByText("Labels")).toBeNull();
    expect(screen.getByText("at least 4")).toBeTruthy();
    expect(screen.getByText("unknown")).toBeTruthy();

    const input = screen.getByRole("textbox", { name: filterPlaceholder });
    await user.type(input, "check");
    await waitFor(() =>
      expect(search).toHaveBeenLastCalledWith(
        "check",
        emptySelection,
        expect.any(AbortSignal),
      ),
    );
    expect(
      screen.getByText("Same type: OR · different types: AND · labels: AND"),
    ).toBeTruthy();
    await user.click(screen.getByText("Checkout"));
    await waitFor(() =>
      expect(screen.getByTestId("filter-location").textContent).toBe(
        "/resources?applications=checkout",
      ),
    );
    expect(
      screen.getByRole("button", {
        name: "Remove Applications filter checkout",
      }),
    ).toBeTruthy();

    await waitFor(() =>
      expect(search).toHaveBeenLastCalledWith(
        "",
        { ...emptySelection, applications: ["checkout"] },
        expect.any(AbortSignal),
      ),
    );
    await user.type(input, "team");
    await waitFor(() =>
      expect(search).toHaveBeenLastCalledWith(
        "team",
        { ...emptySelection, applications: ["checkout"] },
        expect.any(AbortSignal),
      ),
    );
    await user.click(screen.getByText("team=platform"));
    await waitFor(() =>
      expect(screen.getByTestId("filter-location").textContent).toBe(
        "/resources?applications=checkout&labels=team%3Dplatform",
      ),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Remove Applications filter checkout",
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("filter-location").textContent).toBe(
        "/resources?labels=team%3Dplatform",
      ),
    );
  });

  it("turns a server-provided resource type into a removable type chip", async () => {
    const user = userEvent.setup();
    renderFilter({ search: vi.fn(async () => structuralSuggestions) });

    await user.click(screen.getByRole("button", { name: filterPlaceholder }));
    await user.click(await screen.findByText("Pod"));

    await waitFor(() =>
      expect(screen.getByTestId("filter-location").textContent).toBe(
        "/resources?resources.types=pod",
      ),
    );
    await user.click(screen.getByRole("button", { name: "Remove Types filter Pod" }));
    await waitFor(() =>
      expect(screen.getByTestId("filter-location").textContent).toBe("/resources"),
    );
  });

  it("opens the exact searched resource and replaces cluster/namespace scope", async () => {
    const user = userEvent.setup();
    renderFilter({ search: vi.fn(async (query) =>
      query ? searchableSuggestions : structuralSuggestions) });

    await user.click(screen.getByRole("button", { name: filterPlaceholder }));
    await user.type(screen.getByRole("textbox", { name: filterPlaceholder }), "checkout");
    await user.click(await screen.findByText("checkout-api"));

    await waitFor(() => {
      const location = screen.getByTestId("filter-location").textContent ?? "";
      const url = new URL(location, "https://console.example");
      expect(url.pathname).toBe("/resources");
      expect(url.searchParams.get("clusters")).toBe("cluster-a");
      expect(url.searchParams.get("namespaces")).toBe("cluster-a/shop");
      expect(url.searchParams.get("resources.types")).toBe("workload");
      expect(url.searchParams.get("detail")).toBe("Deployment/shop/checkout-api");
    });
  });

  it("keeps chips inside one fixed search border and removes the last chip with backspace", async () => {
    const user = userEvent.setup();
    renderFilter(
      { search: vi.fn(async () => structuralSuggestions) },
      "/resources?applications=checkout&resources.types=pod",
    );

    const control = document.querySelector<HTMLElement>('[data-slot="search-pill-input"]');
    expect(control?.className).toContain("h-(--product-global-search-height)");
    expect(control?.className).toContain("border");
    expect(control?.className).toContain("overflow-x-auto");
    expect(control?.className).not.toContain("flex-wrap");
    expect(within(control!).getByText("checkout")).toBeTruthy();
    expect(within(control!).getByText("Pod")).toBeTruthy();

    const input = within(control!).getByRole("textbox", { name: filterPlaceholder });
    await user.click(input);
    await user.keyboard("{Backspace}");

    await waitFor(() =>
      expect(screen.getByTestId("filter-location").textContent).toBe(
        "/resources?applications=checkout",
      ),
    );
    expect((input as HTMLInputElement).value).toBe("");
    expect(within(control!).queryByText("Pod")).toBeNull();
  });

  it("keeps cluster and namespace scope in one fixed-height row with agent-derived status", async () => {
    renderFilter(
      { search: vi.fn(async () => structuralSuggestions) },
      "/resources?clusters=cluster-a&namespaces=cluster-a%2Fshop,cluster-a%2Fpayments",
    );

    const control = document.querySelector<HTMLElement>('[data-slot="search-pill-input"]');
    expect(control?.className).toContain("h-(--product-global-search-height)");
    expect(control?.className).toContain("overflow-x-auto");
    expect(control?.className).not.toContain("flex-wrap");
    expect(await screen.findByText("prod-cluster · Production · cluster-a")).toBeTruthy();
    expect(within(control!).getByText("shop")).toBeTruthy();
    expect(within(control!).getByText("payments")).toBeTruthy();
    expect(control?.querySelector('[data-slot="status-mark"]')?.getAttribute("data-status"))
      .toBe("healthy");
  });

  it("refreshes only the existing cluster observation when an offline scope dot is activated", async () => {
    const user = userEvent.setup();
    const listClusterChoices = vi.fn(testClusterScope.listClusterChoices);
    renderFilter(
      { search: vi.fn(async () => structuralSuggestions) },
      "/resources?clusters=cluster-b",
      { listClusterChoices },
    );

    const refresh = await screen.findByRole("button", {
      name: "Refresh connection status for edge-cluster · Edge · cluster-b",
    });
    expect(refresh.className).toContain("motion-reduce:animate-none");
    expect(refresh.querySelector('[data-slot="status-mark"]')?.getAttribute("data-status"))
      .toBe("critical");
    await waitFor(() => expect(listClusterChoices).toHaveBeenCalledTimes(1));

    await user.click(refresh);
    await waitFor(() => expect(listClusterChoices).toHaveBeenCalledTimes(2));
    expect(screen.getByText("edge-cluster · Edge · cluster-b")).toBeTruthy();
  });

  it("clears every canonical chip from the same search control", async () => {
    const user = userEvent.setup();
    renderFilter(
      { search: vi.fn(async () => structuralSuggestions) },
      "/resources?clusters=cluster-a&applications=checkout&labels=team%3Dplatform",
    );

    const control = document.querySelector<HTMLElement>('[data-slot="search-pill-input"]')!;
    await user.click(within(control).getByRole("button", { name: "Clear all filters" }));

    await waitFor(() =>
      expect(screen.getByTestId("filter-location").textContent).toBe("/resources"),
    );
    expect(within(control).queryByText("cluster-a")).toBeNull();
    expect(within(control).queryByText("checkout")).toBeNull();
    expect(within(control).queryByText("team=platform")).toBeNull();
  });

  it("closes the non-modal popover when Tab leaves the filter controls", async () => {
    const user = userEvent.setup();
    renderFilter(
      { search: vi.fn(async () => structuralSuggestions) },
      "/resources?clusters=cluster-a",
    );

    await user.click(screen.getByRole("textbox", { name: filterPlaceholder }));
    expect(await screen.findByRole("dialog")).toBeTruthy();

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Clear all filters" }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Next content" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("aborts superseded requests and never paints a stale response", async () => {
    const user = userEvent.setup();
    const first = deferred<readonly GlobalFilterSuggestion[]>();
    const current = deferred<readonly GlobalFilterSuggestion[]>();
    const signals: AbortSignal[] = [];
    const search = vi.fn<GlobalFilterPort["search"]>(
      (query, _selection, signal) => {
        signals.push(signal!);
        return query === "" ? first.promise : current.promise;
      },
    );
    renderFilter({ search });

    await user.click(screen.getByRole("button", { name: filterPlaceholder }));
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    await user.type(
      screen.getByRole("textbox", { name: filterPlaceholder }),
      "fresh",
    );
    await waitFor(() => expect(search).toHaveBeenCalledTimes(2));
    expect(signals[0].aborted).toBe(true);

    current.resolve([searchableSuggestions[0]]);
    expect(await screen.findByText("Checkout")).toBeTruthy();
    first.resolve([
      {
        type: "resource",
        id: "stale",
        label: "stale-result",
        clusterId: "cluster-a",
        resourceType: "pod",
        resource: {
          apiGroup: "",
          version: "v1",
          kind: "Pod",
          namespace: "default",
          name: "stale-result",
          uid: "uid-stale",
        },
        matchedFields: ["name"],
        count: 1,
        count_completeness: "exact",
      },
    ]);
    await Promise.resolve();
    expect(screen.queryByText("stale-result")).toBeNull();
  });
});

const filterPlaceholder = "Filter clusters, apps, labels, and resources";
const emptySelection = {
  clusters: [],
  namespaces: [],
  applications: [],
  resourceTypes: [],
  labels: [],
};
const structuralSuggestions = [
  counted({ type: "cluster", id: "cluster-a", label: "Production", count: 8 }),
  counted({
    type: "namespace",
    id: "cluster-a/shop",
    label: "shop",
    clusterId: "cluster-a",
    resourceType: "workload",
    count: 4,
    count_completeness: "partial",
  }),
  counted({
    type: "application",
    id: "catalog",
    label: "Catalog",
    count: null,
    count_completeness: "unavailable",
  }),
  counted({ type: "resourceType", id: "pod", label: "Pod", count: 12 }),
] satisfies GlobalFilterSuggestion[];
const searchableSuggestions = [
  counted({ type: "application", id: "checkout", label: "Checkout", count: 3 }),
  counted({
    type: "label",
    id: "team=platform",
    label: "team=platform",
    key: "team",
    value: "platform",
    count: 2,
  }),
  counted({
    type: "resource",
    id: "deployment:checkout",
    label: "checkout-api",
    clusterId: "cluster-a",
    resourceType: "workload",
    resource: {
      apiGroup: "apps",
      version: "v1",
      kind: "Deployment",
      namespace: "shop",
      name: "checkout-api",
      uid: "uid-checkout",
    },
    matchedFields: ["name"],
    count: 1,
  }),
] satisfies GlobalFilterSuggestion[];

function counted<T extends Omit<GlobalFilterSuggestion, "count_completeness">>(
  item: T & {
    count_completeness?: GlobalFilterSuggestion["count_completeness"];
  },
): GlobalFilterSuggestion {
  return { count_completeness: "exact", ...item } as GlobalFilterSuggestion;
}

function renderFilter(
  port: GlobalFilterPort,
  initialEntry = "/resources",
  clusterScopePort: ClusterScopePort = testClusterScope,
) {
  const router = createMemoryRouter(
    [
      {
        path: "/resources",
        element: (
          <I18nProvider navigatorLanguage="en-US" storage={null}>
            <AuthSessionGateProvider reportUnauthorized={vi.fn()}>
              <UnifiedFilterProvider>
                <ClusterScopeProvider authorityKey="workspace-a:user-a" port={clusterScopePort}>
                  <UnifiedFilterBar port={port} />
                  <LocationProbe />
                  <button type="button">Next content</button>
                </ClusterScopeProvider>
              </UnifiedFilterProvider>
            </AuthSessionGateProvider>
          </I18nProvider>
        ),
      },
    ],
    { initialEntries: [initialEntry] },
  );
  return render(<RouterProvider router={router} />);
}

const testClusterScope: ClusterScopePort = {
  listClusterChoices: async () => ({
    completeness: "unknown",
    clusters: [
      {
        id: "cluster-a",
        workspaceId: "workspace-a",
        name: "prod-cluster",
        environment: "Production",
        provider: "eks",
        connectionStage: "ready",
        registrationState: "active",
        connectionState: "online",
        lastObservedAt: "2026-07-17T00:00:00Z",
        nodeCount: 4,
        podCount: 24,
        incidentCount: 0,
      },
      {
        id: "cluster-b",
        workspaceId: "workspace-a",
        name: "edge-cluster",
        environment: "Edge",
        provider: "onprem",
        connectionStage: "error",
        registrationState: "active",
        connectionState: "offline",
        lastObservedAt: "2026-07-16T23:00:00Z",
        nodeCount: 2,
        podCount: 8,
        incidentCount: 1,
      },
    ],
  }),
};

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="filter-location">
      {location.pathname}
      {location.search}
    </output>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve;
  });
  return { promise, resolve };
}

class TestResizeObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

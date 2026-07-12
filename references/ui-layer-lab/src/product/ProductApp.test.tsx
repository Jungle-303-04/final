// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { PRODUCT_LOCALE_STORAGE_KEY } from "./shared/i18n/locale";
import ProductApp from "./ProductApp";

beforeEach(() => {
  vi.useRealTimers();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
  document.documentElement.className = "";
  document.documentElement.removeAttribute("lang");
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  vi.useRealTimers();
  window.localStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
});

describe("ProductApp root recovery", () => {
  it("owns locale resolution at the application root", () => {
    const language = vi.spyOn(window.navigator, "language", "get").mockReturnValue("ko-KR");
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => undefined));

    const first = render(<ProductApp />);
    expect(document.documentElement.lang).toBe("ko");
    first.unmount();

    window.localStorage.setItem(PRODUCT_LOCALE_STORAGE_KEY, "en");
    language.mockReturnValue("ko-KR");
    render(<ProductApp />);
    expect(document.documentElement.lang).toBe("en");
  });

  it("loads exactly one session in StrictMode and keeps unauthenticated navigation hidden", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "Not authenticated" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );
    render(
      <StrictMode>
        <ProductApp />
      </StrictMode>,
    );

    expect(await screen.findByRole("heading", { name: "Sign in to KubeHeal" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/session",
      expect.objectContaining({ credentials: "include", method: "GET" }),
    );
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.queryByRole("navigation")).toBeNull();
  }, 15_000);

  it("loads the real Home contract once in StrictMode and drills into Node Pods", async () => {
    window.history.replaceState({}, "", "/product?cluster=cluster-1");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = typeof input === "string" ? input : input.toString();
      return homeApiResponse(path);
    });

    render(<StrictMode><ProductApp /></StrictMode>);

    expect(await screen.findByRole("heading", { name: "Cluster status" }, { timeout: 5_000 }))
      .toBeTruthy();
    await screen.findByRole("button", { name: /worker-b/u }, { timeout: 5_000 });
    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Home" })).toBeTruthy();
    expect(requestCount(fetchMock, "/api/auth/session")).toBe(1);
    expect(requestCount(fetchMock, "/api/clusters?limit=100")).toBe(1);
    await waitFor(() => expect(requestCount(fetchMock, "/api/clusters/cluster-1/summary")).toBe(1));
    await waitFor(() => expect(requestCount(fetchMock, "/api/clusters/cluster-1/nodes/summary")).toBe(1));

    await userEvent.setup().click(await screen.findByRole("button", { name: /worker-b/u }, { timeout: 5_000 }));
    expect(await screen.findByText("checkout-api-0", {}, { timeout: 5_000 })).toBeTruthy();
    expect(requestCount(
      fetchMock,
      "/api/clusters/cluster-1/nodes/worker-b/pods/summary",
    )).toBe(1);
  }, 15_000);

  it("loads the approved Resources contracts and keeps detail on the same route", async () => {
    window.history.replaceState({}, "", "/product/resources/pod?cluster=cluster-1");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = typeof input === "string" ? input : input.toString();
      return homeApiResponse(path);
    });

    render(<StrictMode><ProductApp /></StrictMode>);

    expect(await screen.findByRole("table", { name: "Resource list" }, { timeout: 5_000 }))
      .toBeTruthy();
    expect(screen.getByRole("link", { name: "Resources" }).getAttribute("aria-current"))
      .toBe("page");
    const resource = await screen.findByRole(
      "button",
      { name: "Open details for checkout-api-0" },
      { timeout: 5_000 },
    );
    expect(requestCount(
      fetchMock,
      "/api/clusters/cluster-1/inventory/resources?resource_type=pod&include_deleted=false&limit=200",
    )).toBe(1);

    await userEvent.setup().click(resource);
    const dialog = await screen.findByRole(
      "dialog",
      { name: "checkout-api-0 details" },
      { timeout: 5_000 },
    );
    expect(dialog.textContent).toContain("Running");
    expect(window.location.pathname).toBe("/product/resources/pod");
    expect(window.location.search).toContain("resource=shop%2Fcheckout-api-0");
    expect(requestCount(
      fetchMock,
      "/api/clusters/cluster-1/inventory/resource-detail?resource_type=pod&kind=Pod&name=checkout-api-0&namespace=shop&related_limit=100&event_limit=50",
    )).toBe(1);
  }, 15_000);
});

function requestCount(fetchMock: MockInstance<typeof globalThis.fetch>, path: string) {
  return fetchMock.mock.calls.filter(([input]) => (
    (typeof input === "string" ? input : input.toString()) === path
  )).length;
}

function homeApiResponse(path: string): Response {
  const responses: Record<string, unknown> = {
    "/api/auth/session": {
      authenticated: true,
      user_id: "test-user",
      roles: ["viewer"],
      workspace_id: "test-workspace",
    },
    "/api/clusters?limit=100": {
      clusters: [{
        workspace_id: "test-workspace",
        cluster_id: "cluster-1",
        name: "cluster-1",
        environment: "production",
        status: "connected",
        settings: {},
        connection_status: "online",
        last_agent_id: "agent-1",
        last_agent_seen_at: "2026-07-12T10:00:00Z",
        node_count: 2,
        pod_count: 18,
        incident_count: 0,
        created_at: null,
        updated_at: "2026-07-12T10:00:01Z",
      }],
    },
    "/api/clusters/cluster-1/summary": {
      cluster_id: "cluster-1",
      name: "cluster-1",
      health: "healthy",
      workloads: {},
      warning_events: [],
      open_incidents: [],
      usage: {
        sampled_at: "2026-07-12T10:00:00Z",
        pods_running: 18,
        pods_total: 18,
        nodes_ready: 2,
        nodes_total: 2,
        restart_total: 0,
        cpu_pct: 36,
        mem_pct: 48,
      },
    },
    "/api/clusters/cluster-1/nodes/summary": {
      cluster_id: "cluster-1",
      nodes: [{
        name: "worker-b",
        ready: true,
        health: "healthy",
        pods_running: 9,
        pods_capacity: 110,
        cpu_pct: 35,
        mem_pct: 47,
        restarts_recent: 0,
        conditions: [],
      }],
    },
    "/api/clusters/cluster-1/nodes/worker-b/pods/summary": {
      cluster_id: "cluster-1",
      node_name: "worker-b",
      pods: [{
        name: "checkout-api-0",
        namespace: "shop",
        phase: "Running",
        health: "healthy",
        ready: "1/1",
        restarts: 0,
        owner_kind: "Deployment",
        owner_name: "checkout-api",
        cpu_mcores: 120,
        mem_mib: 256,
        incident_correlation_id: null,
      }],
    },
    "/api/clusters/cluster-1/inventory/summary": {
      cluster_id: "cluster-1",
      latest_snapshot: { collected_at: "2026-07-12T10:00:00Z" },
      counts: [{ resource_type: "pod", health: "healthy", count: 1 }],
    },
    "/api/clusters/cluster-1/inventory/resources?resource_type=pod&include_deleted=false&limit=200": {
      cluster_id: "cluster-1",
      resource_type: "pod",
      resources: [inventoryResource()],
    },
    "/api/clusters/cluster-1/inventory/resource-detail?resource_type=pod&kind=Pod&name=checkout-api-0&namespace=shop&related_limit=100&event_limit=50": {
      cluster_id: "cluster-1",
      identity: {
        resource_type: "pod",
        kind: "Pod",
        namespace: "shop",
        name: "checkout-api-0",
      },
      resource: inventoryResource(),
      related: {},
      events: [],
    },
  };
  if (!(path in responses)) throw new Error(`Unexpected test request: ${path}`);
  return new Response(JSON.stringify(responses[path]), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function inventoryResource() {
  return {
    inventory_key: "inventory-pod-checkout",
    snapshot_id: "snapshot-1",
    workspace_id: "test-workspace",
    cluster_id: "cluster-1",
    resource_type: "pod",
    api_version: "v1",
    kind: "Pod",
    namespace: "shop",
    name: "checkout-api-0",
    uid: "uid-checkout-api-0",
    resource_version: "10",
    status: "Running",
    health: "healthy",
    labels: { app: "checkout" },
    annotations: {},
    summary: {
      phase: "Running",
      node_name: "worker-b",
      restart_total: 0,
      cpu_mcores: 120,
      mem_mib: 256,
    },
    observed_at: "2026-07-12T10:00:00Z",
    first_seen_at: "2026-07-12T09:00:00Z",
    last_seen_at: "2026-07-12T10:00:00Z",
    deleted_at: null,
    created_at: "2026-07-12T09:00:00Z",
    updated_at: "2026-07-12T10:00:00Z",
  };
}

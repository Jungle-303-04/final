// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import ProductApp from "./ProductApp";

beforeEach(() => {
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
  window.localStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
});

describe("ProductApp root recovery", () => {
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

    expect(await screen.findByRole("heading", { name: "KubeHeal에 로그인" })).toBeTruthy();
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

    expect(await screen.findByRole("heading", { name: "클러스터 상태" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "주요 메뉴" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Home" })).toBeTruthy();
    expect(requestCount(fetchMock, "/api/auth/session")).toBe(1);
    expect(requestCount(fetchMock, "/api/clusters?limit=100")).toBe(1);
    expect(requestCount(fetchMock, "/api/clusters/cluster-1/summary")).toBe(1);
    expect(requestCount(fetchMock, "/api/clusters/cluster-1/nodes/summary")).toBe(1);

    await userEvent.setup().click(await screen.findByRole("button", { name: /worker-b/u }));
    expect(await screen.findByText("checkout-api-0")).toBeTruthy();
    expect(requestCount(
      fetchMock,
      "/api/clusters/cluster-1/nodes/worker-b/pods/summary",
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
  };
  if (!(path in responses)) throw new Error(`Unexpected test request: ${path}`);
  return new Response(JSON.stringify(responses[path]), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

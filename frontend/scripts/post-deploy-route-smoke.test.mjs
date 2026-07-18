import { describe, expect, it, vi } from "vitest";

import {
  ROUTE_CRITICAL_API_CONTRACTS,
  assertRouteReleaseBudget,
  classifyRouteApiRequest,
  createRouteNetworkObserver,
  createRouteSmokeDiagnostics,
  formatRouteSmokeFailureDiagnostics,
  isApiErrorResponse,
  isBenignNavigationAbort,
  isChangeTimelineLimitResponse,
  isFailureProductState,
  isObservedRouteApiRequest,
  isRouteNetworkSettled,
  isSuccessfulLongLivedApiResponse,
  isStableRouteSurfaceSample,
  normalizeSurfaceText,
  orderRoutesForTraversal,
  parseNetscapeSessionCookie,
  readRouteReleaseBudget,
  verifyCurrentWorkspaceEvidence,
  verifyWorkspaceSwitcherPlacement,
  withRouteSmokeDiagnostics,
} from "./post-deploy-route-smoke.mjs";

function createNetworkHarness(startedAt = 1_000) {
  let now = startedAt;
  const dateNow = vi.spyOn(Date, "now").mockImplementation(() => now);
  const listeners = new Map();
  const page = {
    off(event, listener) {
      listeners.get(event)?.delete(listener);
    },
    on(event, listener) {
      const eventListeners = listeners.get(event) ?? new Set();
      eventListeners.add(listener);
      listeners.set(event, eventListeners);
    },
    async waitForTimeout(durationMs) {
      now += durationMs;
    },
  };
  return {
    advance(durationMs) {
      now += durationMs;
    },
    emit(event, value) {
      listeners.get(event)?.forEach((listener) => listener(value));
    },
    now: () => now,
    page,
    restore() {
      dateNow.mockRestore();
    },
  };
}

describe("post-deploy route smoke helpers", () => {
  it("verifies the workspace in the product header and rejects a sidebar duplicate", async () => {
    const calls = [];
    const page = {
      locator(selector) {
        return {
          getByText(text, options) {
            calls.push({ options, selector, text });
            return {
              async count() {
                return selector.includes("sidebar") ? 0 : 1;
              },
              async waitFor(options) {
                calls.push({ options, selector, wait: true });
              },
            };
          },
        };
      },
    };

    await verifyWorkspaceSwitcherPlacement(page, "workspace-demo", 1_234);

    expect(calls).toEqual([
      {
        options: { exact: true },
        selector: 'header[data-slot="product-header"] [data-slot="product-header-workspace"]',
        text: "workspace-demo",
      },
      {
        options: { state: "visible", timeout: 1_234 },
        selector: 'header[data-slot="product-header"] [data-slot="product-header-workspace"]',
        wait: true,
      },
      {
        options: { exact: true },
        selector: 'aside[data-slot="sidebar"]',
        text: "workspace-demo",
      },
    ]);
  });

  it("fails when the workspace switcher remains duplicated in the sidebar", async () => {
    const page = {
      locator(selector) {
        return {
          getByText() {
            return {
              async count() {
                return selector.includes("sidebar") ? 1 : 0;
              },
              async waitFor() {},
            };
          },
        };
      },
    };

    await expect(
      verifyWorkspaceSwitcherPlacement(page, "workspace-demo", 1_234),
    ).rejects.toThrow("workspace switcher must not remain in the product sidebar");
  });

  it("orders the currently rendered route last so every DOM route receives a transition", () => {
    const routes = [
      { pathname: "/alpha" },
      { pathname: "/beta" },
      { pathname: "/gamma" },
    ];

    expect(
      orderRoutesForTraversal(routes, "/beta").map(({ pathname }) => pathname),
    ).toEqual(["/alpha", "/gamma", "/beta"]);
  });

  it("keeps one critical API contract entry for every released navigation route", () => {
    expect(Object.keys(ROUTE_CRITICAL_API_CONTRACTS)).toEqual([
      "/home",
      "/resources",
      "/issues",
      "/applications",
      "/timeline",
      "/traffic",
      "/helm",
      "/gitops",
      "/checks",
      "/cost",
      "/clusters",
      "/alerts",
      "/settings",
    ]);
    expect(Object.values(ROUTE_CRITICAL_API_CONTRACTS).every(
      (contracts) => contracts.length > 0,
    )).toBe(true);
  });

  it("preserves DOM order when the current URL is not a released navigation route", () => {
    const routes = [{ pathname: "/alpha" }, { pathname: "/beta" }];

    expect(orderRoutesForTraversal(routes, "/outside")).toEqual(routes);
  });

  it("normalizes volatile numbers without hiding a stale body", () => {
    expect(
      normalizeSurfaceText("Live 1.2s · updated 21:49\nPods 27"),
    ).toBe(normalizeSurfaceText("Live 1.8s · updated 21:50\nPods 31"));
    expect(normalizeSurfaceText("Resource inventory 27")).not.toBe(
      normalizeSurfaceText("Incident timeline 27"),
    );
  });

  it("waits for the localized route surface to stabilize after hydration", () => {
    const english = {
      bodyFingerprint: "Resources Pods #",
      routeTitle: "Resources",
    };
    const korean = {
      bodyFingerprint: "리소스 파드 #",
      routeTitle: "리소스",
    };

    expect(isStableRouteSurfaceSample(english, korean)).toBe(false);
    expect(isStableRouteSurfaceSample(korean, { ...korean })).toBe(true);
  });

  it("recognizes only the bounded change timeline response", () => {
    expect(
      isChangeTimelineLimitResponse(
        422,
        "https://example.test/api/changes?clusters=cluster-1",
      ),
    ).toBe(true);
    expect(
      isChangeTimelineLimitResponse(
        422,
        "https://example.test/api/resources?clusters=cluster-1",
      ),
    ).toBe(false);
    expect(
      isChangeTimelineLimitResponse(
        500,
        "https://example.test/api/changes?clusters=cluster-1",
      ),
    ).toBe(false);
  });

  it("ignores only browser navigation cancellation failures", () => {
    expect(isBenignNavigationAbort("net::ERR_ABORTED")).toBe(true);
    expect(isBenignNavigationAbort("NS_BINDING_ABORTED")).toBe(true);
    expect(isBenignNavigationAbort("net::ERR_CONNECTION_RESET")).toBe(false);
    expect(isBenignNavigationAbort("unknown request failure")).toBe(false);
  });

  it("fails same-origin API errors without treating redirects or other origins as product errors", () => {
    expect(
      isApiErrorResponse(
        503,
        "https://example.test/api/resources",
        "https://example.test",
      ),
    ).toBe(true);
    expect(
      isApiErrorResponse(
        302,
        "https://example.test/api/resources",
        "https://example.test",
      ),
    ).toBe(false);
    expect(
      isApiErrorResponse(
        503,
        "https://agent.example.test/api/resources",
        "https://example.test",
      ),
    ).toBe(false);
  });

  it("distinguishes terminal failures from loading and valid empty states", () => {
    expect(isFailureProductState("error")).toBe(true);
    expect(isFailureProductState("forbidden")).toBe(true);
    expect(isFailureProductState("not-found")).toBe(true);
    expect(isFailureProductState("offline")).toBe(true);
    expect(isFailureProductState("release")).toBe(true);
    expect(isFailureProductState("loading")).toBe(false);
    expect(isFailureProductState("empty")).toBe(false);
  });

  it("observes only same-origin API traffic for route completion", () => {
    expect(isObservedRouteApiRequest(
      "https://example.test/api/applications?cluster=one",
      "https://example.test",
    )).toBe(true);
    expect(isObservedRouteApiRequest(
      "https://agent.example.test/api/applications",
      "https://example.test",
    )).toBe(false);
    expect(isObservedRouteApiRequest(
      "https://example.test/assets/applications.js",
      "https://example.test",
    )).toBe(false);
  });

  it("classifies route-owned APIs separately from common background traffic", () => {
    expect(classifyRouteApiRequest(
      "/timeline",
      "https://example.test/api/timeline/snapshots?cluster=one",
      "https://example.test",
    )).toBe("critical");
    expect(classifyRouteApiRequest(
      "/cost",
      "https://example.test/api/cost/nodes?cluster=one",
      "https://example.test",
    )).toBe("critical");
    expect(classifyRouteApiRequest(
      "/timeline",
      "https://example.test/api/alert-events?limit=200",
      "https://example.test",
    )).toBe("background-common");
    expect(classifyRouteApiRequest(
      "/alerts",
      "https://example.test/api/alert-events?limit=200",
      "https://example.test",
    )).toBe("background-common");
    expect(classifyRouteApiRequest(
      "/cost",
      "https://agent.example.test/api/cost/nodes",
      "https://example.test",
    )).toBe("ignored");
  });

  it("requires both API completion and a bounded quiet window", () => {
    const observation = {
      lastActivityAt: 1_000,
      now: 1_500,
      pendingRequestCount: 0,
      quietWindowMs: 500,
    };
    expect(isRouteNetworkSettled(observation)).toBe(true);
    expect(isRouteNetworkSettled({
      ...observation,
      now: 1_499,
    })).toBe(false);
    expect(isRouteNetworkSettled({
      ...observation,
      pendingRequestCount: 1,
    })).toBe(false);
  });

  it("recognizes successful streaming media without accepting failed or ordinary responses", () => {
    expect(isSuccessfulLongLivedApiResponse(200, {
      "content-type": "application/x-ndjson; charset=utf-8",
    })).toBe(true);
    expect(isSuccessfulLongLivedApiResponse(204, {
      "Content-Type": "text/event-stream",
    })).toBe(false);
    expect(isSuccessfulLongLivedApiResponse(503, {
      "content-type": "text/event-stream",
    })).toBe(false);
    expect(isSuccessfulLongLivedApiResponse(200, {
      "content-type": "application/json",
    })).toBe(false);
  });

  it("waits for the API response body before settling and reports its full duration", async () => {
    let now = 1_000;
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => now);
    const listeners = new Map();
    const page = {
      off(event, listener) {
        listeners.get(event)?.delete(listener);
      },
      on(event, listener) {
        const eventListeners = listeners.get(event) ?? new Set();
        eventListeners.add(listener);
        listeners.set(event, eventListeners);
      },
      async waitForTimeout(durationMs) {
        now += durationMs;
      },
    };
    const emit = (event, value) => {
      listeners.get(event)?.forEach((listener) => listener(value));
    };
    const request = {
      url: () => "https://example.test/api/checks?secret=redacted",
    };
    const observer = createRouteNetworkObserver(page, "https://example.test");

    try {
      const phase = observer.beginPhase("/checks");
      now += 25;
      emit("request", request);
      now += 125;
      emit("response", { request: () => request, status: () => 200 });

      await expect(observer.waitForSettled(phase, 300)).rejects.toThrow(
        "route critical API requests did not settle",
      );
      expect(observer.summarize(
        phase,
        now - phase.startedAt,
      )).toMatchObject({
        criticalApiRequestCount: 1,
        criticalInFlightRequestCount: 1,
      });

      emit("requestfinished", request);
      await observer.waitForSettled(phase, 1_000);
      expect(observer.summarize(phase, now - phase.startedAt)).toEqual({
        backgroundApiRequestCount: 0,
        backgroundInFlightRequestCount: 0,
        criticalApiRequestCount: 1,
        criticalInFlightRequestCount: 0,
        durationMs: 950,
        successfulCriticalApiRequestCount: 1,
        slowBackgroundApi: [],
        slowCriticalApi: [{
          durationMs: 425,
          in_flight: false,
          path: "/api/checks",
          status: 200,
        }],
      });

      observer.dispose();
      expect([...listeners.values()].every((eventListeners) => eventListeners.size === 0)).toBe(true);
    } finally {
      dateNow.mockRestore();
    }
  });

  it("settles after a successful streaming response while retaining in-flight evidence", async () => {
    const harness = createNetworkHarness();
    const request = { url: () => "https://example.test/api/timeline/stream" };
    const observer = createRouteNetworkObserver(harness.page, "https://example.test");

    try {
      const phase = observer.beginPhase("/timeline");
      harness.advance(25);
      harness.emit("request", request);
      harness.advance(25);
      harness.emit("response", {
        headers: () => ({ "content-type": "application/x-ndjson; charset=utf-8" }),
        request: () => request,
        status: () => 200,
      });

      await observer.waitForSettled(phase, 1_000);

      expect(observer.summarize(
        phase,
        harness.now() - phase.startedAt,
      )).toMatchObject({
        backgroundApiRequestCount: 0,
        criticalApiRequestCount: 1,
        criticalInFlightRequestCount: 1,
        slowCriticalApi: [{
          in_flight: true,
          path: "/api/timeline/stream",
          status: 200,
        }],
      });
    } finally {
      observer.dispose();
      harness.restore();
    }
  });

  it("keeps a failed streaming handshake in the critical completion gate", async () => {
    const harness = createNetworkHarness();
    const request = { url: () => "https://example.test/api/timeline/stream" };
    const observer = createRouteNetworkObserver(harness.page, "https://example.test");

    try {
      const phase = observer.beginPhase("/timeline");
      harness.advance(25);
      harness.emit("request", request);
      harness.advance(25);
      harness.emit("response", {
        headers: () => ({ "content-type": "application/x-ndjson" }),
        request: () => request,
        status: () => 503,
      });

      await expect(observer.waitForSettled(phase, 700)).rejects.toThrow(
        "route critical API requests did not settle",
      );
    } finally {
      observer.dispose();
      harness.restore();
    }
  });

  it.each([
    ["/timeline", "/api/timeline/snapshots"],
    ["/cost", "/api/cost/nodes"],
  ])("keeps delayed %s route data in the requestfinished gate", async (route, apiPath) => {
    const harness = createNetworkHarness();
    const request = { url: () => `https://example.test${apiPath}` };
    const observer = createRouteNetworkObserver(harness.page, "https://example.test");

    try {
      const phase = observer.beginPhase(route);
      harness.advance(25);
      harness.emit("request", request);
      harness.advance(25);
      harness.emit("response", { request: () => request, status: () => 200 });

      await expect(observer.waitForSettled(phase, 400)).rejects.toThrow(
        "route critical API requests did not settle",
      );
      harness.emit("requestfinished", request);
      await observer.waitForSettled(phase, 1_000);

      expect(observer.summarize(
        phase,
        harness.now() - phase.startedAt,
      )).toMatchObject({
        backgroundApiRequestCount: 0,
        backgroundInFlightRequestCount: 0,
        criticalApiRequestCount: 1,
        slowBackgroundApi: [],
        slowCriticalApi: [{ path: apiPath, status: 200 }],
      });
    } finally {
      observer.dispose();
      harness.restore();
    }
  });

  it("measures a delayed global alert poll without blocking route readiness", async () => {
    const harness = createNetworkHarness();
    const request = {
      url: () => "https://example.test/api/alert-events?limit=200",
    };
    const observer = createRouteNetworkObserver(harness.page, "https://example.test");

    try {
      const phase = observer.beginPhase("/timeline");
      harness.advance(25);
      harness.emit("request", request);
      harness.advance(25);
      harness.emit("response", { request: () => request, status: () => 200 });

      await observer.waitForSettled(phase, 600);
      expect(observer.summarize(
        phase,
        harness.now() - phase.startedAt,
      )).toMatchObject({
        backgroundApiRequestCount: 1,
        backgroundInFlightRequestCount: 1,
        criticalApiRequestCount: 0,
        slowBackgroundApi: [{
          in_flight: true,
          path: "/api/alert-events",
          status: 200,
        }],
      });

      harness.emit("requestfinished", request);
      expect(observer.summarize(
        phase,
        harness.now() - phase.startedAt,
      )).toMatchObject({
        backgroundApiRequestCount: 1,
        backgroundInFlightRequestCount: 0,
        criticalApiRequestCount: 0,
        slowBackgroundApi: [{
          in_flight: false,
          path: "/api/alert-events",
          status: 200,
        }],
        slowCriticalApi: [],
      });
    } finally {
      observer.dispose();
      harness.restore();
    }
  });

  it("requires the authenticated real workspace in both catalog and session", async () => {
    const calls = [];
    const result = await verifyCurrentWorkspaceEvidence({
      async loadCatalog() {
        calls.push("catalog");
        return {
          current_workspace_id: "workspace-original",
          items: [
            { name: "Production", workspace_id: "workspace-original" },
            { name: "Engineering", workspace_id: "workspace-other" },
          ],
        };
      },
      async loadSession() {
        calls.push("session");
        return { workspace_id: "workspace-original" };
      },
    });

    expect(calls).toEqual(["catalog", "session"]);
    expect(result).toEqual({
      name: "Production",
      workspace_id: "workspace-original",
    });
  });

  it("rejects a real workspace session that disagrees with the catalog", async () => {
    await expect(verifyCurrentWorkspaceEvidence({
      loadCatalog: async () => ({
        current_workspace_id: "workspace-original",
        items: [
          { name: "Production", workspace_id: "workspace-original" },
        ],
      }),
      loadSession: async () => ({ workspace_id: "workspace-other" }),
    })).rejects.toThrow("current workspace session workspace mismatch");
  });

  it("uses configurable fail-closed route release budgets", () => {
    expect(readRouteReleaseBudget({})).toEqual({
      maxPhaseMs: 12_000,
      maxRouteMs: 24_000,
      minCriticalApiRequests: 1,
    });
    expect(readRouteReleaseBudget({
      ROUTE_SMOKE_MAX_PHASE_MS: "4000",
      ROUTE_SMOKE_MAX_ROUTE_MS: "7000",
      ROUTE_SMOKE_MIN_CRITICAL_API_REQUESTS: "2",
    })).toEqual({
      maxPhaseMs: 4_000,
      maxRouteMs: 7_000,
      minCriticalApiRequests: 2,
    });
    expect(() => readRouteReleaseBudget({
      ROUTE_SMOKE_MAX_PHASE_MS: "0",
    })).toThrow("ROUTE_SMOKE_MAX_PHASE_MS must be a positive integer");
  });

  it("fails slow routes and routes without successful critical API evidence", () => {
    const budget = {
      maxPhaseMs: 4_000,
      maxRouteMs: 7_000,
      minCriticalApiRequests: 1,
    };
    const passing = {
      durationMs: 2_000,
      successfulCriticalApiRequestCount: 1,
    };
    expect(() => assertRouteReleaseBudget({
      budget,
      direct: passing,
      pathname: "/resources",
      spa: { ...passing, successfulCriticalApiRequestCount: 0 },
      totalDurationMs: 4_000,
    })).not.toThrow();
    expect(() => assertRouteReleaseBudget({
      budget,
      direct: { ...passing, durationMs: 4_001 },
      pathname: "/resources",
      spa: passing,
      totalDurationMs: 6_001,
    })).toThrow("direct load exceeded 4000ms");
    expect(() => assertRouteReleaseBudget({
      budget,
      direct: { ...passing, successfulCriticalApiRequestCount: 0 },
      pathname: "/resources",
      spa: { ...passing, successfulCriticalApiRequestCount: 0 },
      totalDurationMs: 4_000,
    })).toThrow("successful critical API request(s)");
  });

  it("accepts one HttpOnly root handoff and leaves transport security to the public browser origin", () => {
    const cookie = parseNetscapeSessionCookie([
      "# Netscape HTTP Cookie File",
      "#HttpOnly_127.0.0.1\tFALSE\t/\tFALSE\t0\topsia_session\tsecret-token",
    ].join("\n"));

    expect(cookie).toEqual({ name: "opsia_session", value: "secret-token" });
    expect(() => parseNetscapeSessionCookie("# empty")).toThrow(
      "exactly one HttpOnly root cookie",
    );
    expect(() => parseNetscapeSessionCookie(
      "127.0.0.1\tFALSE\t/\tFALSE\t0\topsia_session\tsecret-token",
    )).toThrow("exactly one HttpOnly root cookie");
    expect(() => parseNetscapeSessionCookie([
      "#HttpOnly_127.0.0.1\tFALSE\t/\tTRUE\t0\tone\ttoken-one",
      "#HttpOnly_127.0.0.1\tFALSE\t/\tTRUE\t0\ttwo\ttoken-two",
    ].join("\n"))).toThrow("exactly one HttpOnly root cookie");
  });

  it("emits bounded structured route diagnostics before preserving the smoke failure", async () => {
    const diagnostics = createRouteSmokeDiagnostics();
    diagnostics.failingRoute = "/traffic";
    diagnostics.requestFailures.push({
      error: "net::ERR_CONNECTION_RESET",
      method: "GET",
      url: "/api/traffic",
    });
    diagnostics.apiErrors.push({ status: 503, url: "/api/traffic" });
    diagnostics.pageErrors.push("Traffic surface crashed");
    const emitted = [];

    await expect(
      withRouteSmokeDiagnostics(
        async () => {
          throw new Error("route /traffic rendered product state error");
        },
        diagnostics,
        (message) => emitted.push(message),
      ),
    ).rejects.toThrow("route /traffic rendered product state error");

    expect(emitted).toHaveLength(1);
    expect(JSON.parse(emitted[0])).toEqual({
      event: "authenticated_route_smoke_failure",
      failingRoute: "/traffic",
      error: "route /traffic rendered product state error",
      requestFailures: [{
        error: "net::ERR_CONNECTION_RESET",
        method: "GET",
        url: "/api/traffic",
      }],
      apiErrors: [{ status: 503, url: "/api/traffic" }],
      pageErrors: ["Traffic surface crashed"],
      changeTimelineLimits: [],
    });
    expect(formatRouteSmokeFailureDiagnostics(
      new Error("same failure"),
      diagnostics,
    )).toContain('"failingRoute":"/traffic"');
  });

  it("redacts credentials from structured browser diagnostics", () => {
    const diagnostics = createRouteSmokeDiagnostics();
    diagnostics.failingRoute = "/resources";
    diagnostics.pageErrors.push("token=page-secret");
    diagnostics.requestFailures.push({
      error: "password=request-secret",
      method: "GET",
      url: "/api/resources",
    });

    const rendered = formatRouteSmokeFailureDiagnostics(
      new Error("Authorization: Bearer header-secret"),
      diagnostics,
    );

    expect(rendered).not.toContain("page-secret");
    expect(rendered).not.toContain("request-secret");
    expect(rendered).not.toContain("header-secret");
    expect(rendered.match(/<redacted>/gu)).toHaveLength(3);
  });
});

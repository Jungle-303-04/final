import { describe, expect, it, vi } from "vitest";

import {
  createRouteNetworkObserver,
  createRouteSmokeDiagnostics,
  formatRouteSmokeFailureDiagnostics,
  isApiErrorResponse,
  isBenignNavigationAbort,
  isChangeTimelineLimitResponse,
  isFailureProductState,
  isObservedRouteApiRequest,
  isRouteNetworkSettled,
  isStableRouteSurfaceSample,
  normalizeSurfaceText,
  orderRoutesForTraversal,
  parseNetscapeSessionCookie,
  withRouteSmokeDiagnostics,
} from "./post-deploy-route-smoke.mjs";

describe("post-deploy route smoke helpers", () => {
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

  it("settles on API response completion and reports bounded request timing", async () => {
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
      const phase = observer.beginPhase();
      now += 25;
      emit("request", request);
      now += 125;
      emit("response", { request: () => request, status: () => 200 });

      await observer.waitForSettled(phase, 1_000);
      expect(observer.summarize(phase, now - phase.startedAt)).toEqual({
        apiRequestCount: 1,
        durationMs: 650,
        slowApi: [{ durationMs: 125, path: "/api/checks", status: 200 }],
      });

      observer.dispose();
      expect([...listeners.values()].every((eventListeners) => eventListeners.size === 0)).toBe(true);
    } finally {
      dateNow.mockRestore();
    }
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

import { describe, expect, it } from "vitest";

import {
  isApiErrorResponse,
  isBenignNavigationAbort,
  isChangeTimelineLimitResponse,
  isFailureProductState,
  normalizeSurfaceText,
  orderRoutesForTraversal,
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
});

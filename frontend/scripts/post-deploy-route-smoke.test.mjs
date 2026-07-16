import assert from "node:assert/strict";
import test from "node:test";

import {
  isBenignNavigationAbort,
  isChangeTimelineLimitResponse,
  normalizeSurfaceText,
  orderRoutesForTraversal,
} from "./post-deploy-route-smoke.mjs";

test("orders the currently rendered route last so every DOM route receives a transition", () => {
  const routes = [
    { pathname: "/alpha" },
    { pathname: "/beta" },
    { pathname: "/gamma" },
  ];

  assert.deepEqual(
    orderRoutesForTraversal(routes, "/beta").map(({ pathname }) => pathname),
    ["/alpha", "/gamma", "/beta"],
  );
});

test("preserves DOM order when the current URL is not a released navigation route", () => {
  const routes = [{ pathname: "/alpha" }, { pathname: "/beta" }];

  assert.deepEqual(orderRoutesForTraversal(routes, "/outside"), routes);
});

test("normalizes volatile numbers without hiding a stale body", () => {
  assert.equal(
    normalizeSurfaceText("Live 1.2s · updated 21:49\nPods 27"),
    normalizeSurfaceText("Live 1.8s · updated 21:50\nPods 31"),
  );
  assert.notEqual(
    normalizeSurfaceText("Resource inventory 27"),
    normalizeSurfaceText("Incident timeline 27"),
  );
});

test("recognizes only the bounded change timeline response", () => {
  assert.equal(
    isChangeTimelineLimitResponse(
      422,
      "https://example.test/api/changes?clusters=cluster-1",
    ),
    true,
  );
  assert.equal(
    isChangeTimelineLimitResponse(
      422,
      "https://example.test/api/resources?clusters=cluster-1",
    ),
    false,
  );
  assert.equal(
    isChangeTimelineLimitResponse(
      500,
      "https://example.test/api/changes?clusters=cluster-1",
    ),
    false,
  );
});

test("ignores only browser navigation cancellation failures", () => {
  assert.equal(isBenignNavigationAbort("net::ERR_ABORTED"), true);
  assert.equal(isBenignNavigationAbort("NS_BINDING_ABORTED"), true);
  assert.equal(isBenignNavigationAbort("net::ERR_CONNECTION_RESET"), false);
  assert.equal(isBenignNavigationAbort("unknown request failure"), false);
});

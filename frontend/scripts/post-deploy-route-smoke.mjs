import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { chromium } from "playwright";

const SIDEBAR_SELECTOR = 'aside[data-slot="sidebar"]';
const NAVIGATION_LINK_SELECTOR = `${SIDEBAR_SELECTOR} nav a[href]`;
const AUTH_BOOTSTRAP_TIMEOUT_MS = 60_000;
const ROUTE_SETTLE_TIMEOUT_MS = 20_000;
const NETWORK_OBSERVATION_MS = 3_000;
const ROUTE_STABLE_SAMPLE_COUNT = 3;
const DIAGNOSTIC_ITEM_LIMIT = 50;
const SENSITIVE_ASSIGNMENT_PATTERN = /\b(authorization|bearer|credential|password|passwd|private[_ -]?key|secret|token|api[_ -]?key|apikey|cookie|set[_ -]?cookie)\s*([:=])\s*(?:Bearer\s+)?[^\s,"']+/giu;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+\/=-]+/giu;
const FAILURE_PRODUCT_STATES = new Set([
  "error",
  "forbidden",
  "not-found",
  "offline",
  "release",
]);

export function normalizeSurfaceText(value) {
  return value
    .normalize("NFKC")
    .replace(/\p{Number}+/gu, "#")
    .replace(/\s+/g, " ")
    .trim();
}

export function orderRoutesForTraversal(routes, currentPathname) {
  const otherRoutes = routes.filter(({ pathname }) => pathname !== currentPathname);
  const currentRoutes = routes.filter(({ pathname }) => pathname === currentPathname);
  return [...otherRoutes, ...currentRoutes];
}

export function isStableRouteSurfaceSample(previous, current) {
  return previous !== null
    && current.routeTitle === previous.routeTitle
    && current.bodyFingerprint === previous.bodyFingerprint;
}

export function isChangeTimelineLimitResponse(status, rawUrl) {
  if (status !== 422) return false;
  try {
    return new URL(rawUrl).pathname.endsWith("/api/changes");
  } catch {
    return false;
  }
}

export function isBenignNavigationAbort(errorText) {
  const normalized = errorText.trim().toUpperCase();
  return normalized === "NET::ERR_ABORTED" || normalized === "NS_BINDING_ABORTED";
}

export function isApiErrorResponse(status, rawUrl, baseUrl) {
  if (status < 400) return false;
  try {
    const responseUrl = new URL(rawUrl);
    const applicationUrl = new URL(baseUrl);
    return (
      responseUrl.origin === applicationUrl.origin
      && (
        responseUrl.pathname === "/api"
        || responseUrl.pathname.startsWith("/api/")
      )
    );
  } catch {
    return false;
  }
}

export function isFailureProductState(state) {
  return FAILURE_PRODUCT_STATES.has(state);
}

export function createRouteSmokeDiagnostics() {
  return {
    apiErrors: [],
    changeTimelineLimits: [],
    failingRoute: "<bootstrap>",
    pageErrors: [],
    requestFailures: [],
  };
}

export function formatRouteSmokeFailureDiagnostics(error, diagnostics) {
  const bounded = (items) => items.slice(-DIAGNOSTIC_ITEM_LIMIT);
  return JSON.stringify({
    event: "authenticated_route_smoke_failure",
    failingRoute: diagnostics.failingRoute,
    error: redactDiagnosticText(error instanceof Error ? error.message : error),
    requestFailures: bounded(diagnostics.requestFailures).map((failure) => ({
      ...failure,
      error: redactDiagnosticText(failure.error),
    })),
    apiErrors: bounded(diagnostics.apiErrors),
    pageErrors: bounded(diagnostics.pageErrors).map(redactDiagnosticText),
    changeTimelineLimits: bounded(diagnostics.changeTimelineLimits),
  });
}

export async function withRouteSmokeDiagnostics(
  action,
  diagnostics,
  emit = (message) => process.stderr.write(`${message}\n`),
) {
  try {
    return await action();
  } catch (error) {
    emit(formatRouteSmokeFailureDiagnostics(error, diagnostics));
    throw error;
  }
}

function redactDiagnosticText(value) {
  return String(value)
    .replace(BEARER_PATTERN, "Bearer <redacted>")
    .replace(
      SENSITIVE_ASSIGNMENT_PATTERN,
      (_match, key, separator) => `${key}${separator}<redacted>`,
    );
}

export function parseNetscapeSessionCookie(rawCookieJar) {
  const candidates = [];
  for (const rawLine of rawCookieJar.split(/\r?\n/u)) {
    const httpOnly = rawLine.startsWith("#HttpOnly_");
    if (!rawLine || (rawLine.startsWith("#") && !httpOnly)) continue;
    const line = httpOnly ? rawLine.slice("#HttpOnly_".length) : rawLine;
    const fields = line.split("\t");
    if (fields.length < 7) continue;
    const [, , path, , , name, value] = fields;
    if (
      httpOnly
      && path === "/"
      && name
      && value
    ) {
      candidates.push({ name, value });
    }
  }
  assert.equal(
    candidates.length,
    1,
    "authentication handoff must contain exactly one HttpOnly root cookie",
  );
  return candidates[0];
}

async function run() {
  const diagnostics = createRouteSmokeDiagnostics();
  return withRouteSmokeDiagnostics(
    () => runWithDiagnostics(diagnostics),
    diagnostics,
  );
}

async function runWithDiagnostics(diagnostics) {
  const baseUrl = requiredEnvironment("BASE_URL");
  const email = requiredEnvironment("AUTH_EMAIL");
  const password = requiredEnvironment("AUTH_PASSWORD", { trim: false });
  diagnostics.failingRoute = new URL(baseUrl).pathname;
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage", "--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on("pageerror", (error) => {
    diagnostics.pageErrors.push(error.message);
  });
  page.on("requestfailed", (request) => {
    const error = request.failure()?.errorText ?? "unknown request failure";
    if (isBenignNavigationAbort(error)) return;
    diagnostics.requestFailures.push({
      error,
      method: request.method(),
      url: safeUrl(request.url()),
    });
  });
  page.on("response", (response) => {
    if (isApiErrorResponse(response.status(), response.url(), baseUrl)) {
      diagnostics.apiErrors.push({
        status: response.status(),
        url: safeUrl(response.url()),
      });
    }
    if (isChangeTimelineLimitResponse(response.status(), response.url())) {
      diagnostics.changeTimelineLimits.push({
        status: response.status(),
        url: safeUrl(response.url()),
      });
    }
  });

  try {
    await authenticate(page, baseUrl, email, password);
    const initial = await waitForRouteSurface(page, null, new URL(page.url()).pathname);
    const routes = await collectReleasedRoutes(page);
    const traversal = orderRoutesForTraversal(routes, new URL(page.url()).pathname);

    assert.ok(routes.length > 1, "released navigation must expose multiple DOM routes");

    let previous = initial;
    for (const route of traversal) {
      diagnostics.failingRoute = route.pathname;
      const link = await releasedRouteLink(page, route.pathname);
      const observedHref = await link.getAttribute("href");
      assert.ok(observedHref, `released route ${route.pathname} lost its href`);
      assert.equal(
        new URL(observedHref, page.url()).pathname,
        route.pathname,
        `released route DOM order changed before ${route.pathname}`,
      );

      await Promise.all([
        page.waitForURL(
          (url) => url.pathname === route.pathname,
          { timeout: ROUTE_SETTLE_TIMEOUT_MS },
        ),
        link.click(),
      ]);
      await waitForRouteSurface(page, previous, route.pathname);
      await page.waitForTimeout(NETWORK_OBSERVATION_MS);
      const spaFrame = await waitForRouteSurface(page, previous, route.pathname);
      assertDiagnostics(diagnostics);

      const directUrl = new URL(observedHref, baseUrl);
      await page.goto(directUrl.href, { waitUntil: "domcontentloaded" });
      await waitForRouteSurface(
        page,
        null,
        route.pathname,
        AUTH_BOOTSTRAP_TIMEOUT_MS,
      );
      await page.waitForTimeout(NETWORK_OBSERVATION_MS);
      previous = await waitForRouteSurface(page, null, route.pathname);
      assert.equal(
        previous.routeTitle,
        spaFrame.routeTitle,
        `direct route title changed for ${route.pathname}`,
      );
      assertDiagnostics(diagnostics);
      process.stdout.write(`route smoke passed: ${route.pathname} (spa+direct)\n`);
    }

    assertDiagnostics(diagnostics);
    process.stdout.write(`authenticated route smoke passed: ${routes.length} routes\n`);
  } finally {
    await browser.close();
  }
}

async function authenticate(page, baseUrl, email, password) {
  const handoffPath = process.env.AUTH_COOKIE_JAR?.trim() ?? "";
  const handoff = handoffPath ? await readCookieHandoff(handoffPath) : null;
  if (handoff === null) {
    const loginResponse = await page.request.post(
      new URL("/api/auth/login", baseUrl).href,
      {
        data: { email, password },
        failOnStatusCode: false,
        headers: { "x-service-csrf": "same-origin" },
      },
    );
    assert.ok(
      loginResponse.ok(),
      `browser authentication failed with status ${loginResponse.status()}`,
    );
  } else {
    const cookie = parseNetscapeSessionCookie(handoff);
    await page.context().addCookies([{
      httpOnly: true,
      name: cookie.name,
      sameSite: "Lax",
      secure: new URL(baseUrl).protocol === "https:",
      url: new URL("/", baseUrl).href,
      value: cookie.value,
    }]);
  }

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  const sidebar = page.locator(SIDEBAR_SELECTOR);
  await sidebar.waitFor({ state: "visible", timeout: AUTH_BOOTSTRAP_TIMEOUT_MS });
}

async function readCookieHandoff(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return null;
    throw error;
  }
}

async function collectReleasedRoutes(page) {
  const rawRoutes = await page.locator(NAVIGATION_LINK_SELECTOR).evaluateAll((links) =>
    links.map((link) => ({
      href: link.getAttribute("href") ?? "",
    })),
  );
  const routes = [];
  const seen = new Set();

  for (const { href } of rawRoutes) {
    if (!href) continue;
    const url = new URL(href, page.url());
    if (url.origin !== new URL(page.url()).origin || seen.has(url.pathname)) continue;
    seen.add(url.pathname);
    routes.push({ pathname: url.pathname });
  }

  return routes;
}

async function releasedRouteLink(page, pathname) {
  const links = page.locator(NAVIGATION_LINK_SELECTOR);
  const count = await links.count();
  for (let index = 0; index < count; index += 1) {
    const link = links.nth(index);
    const href = await link.getAttribute("href");
    if (href && new URL(href, page.url()).pathname === pathname) return link;
  }
  throw new Error(`released route link disappeared: ${pathname}`);
}

async function waitForRouteSurface(
  page,
  previous,
  expectedPathname,
  timeoutMs = ROUTE_SETTLE_TIMEOUT_MS,
) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  let stable = null;
  let stableSamples = 0;

  while (Date.now() < deadline) {
    last = await readRouteSurface(page);
    const failureState = last.productStates.find(isFailureProductState);
    if (last.pathname === expectedPathname && failureState) {
      throw new Error(
        `route ${expectedPathname} rendered product state ${failureState}`,
      );
    }
    const transitioned = previous === null
      || (
        last.routeTitle !== previous.routeTitle
        && last.bodyFingerprint !== previous.bodyFingerprint
      );
    const ready = (
      last.pathname === expectedPathname
      && last.documentTitle
      && last.routeTitle
      && last.mainText
      && !last.productStates.includes("loading")
      && transitioned
    );
    if (ready) {
      stableSamples = isStableRouteSurfaceSample(stable, last)
        ? stableSamples + 1
        : 1;
      stable = last;
      if (stableSamples >= ROUTE_STABLE_SAMPLE_COUNT) return last;
    } else {
      stable = null;
      stableSamples = 0;
    }
    await page.waitForTimeout(200);
  }

  throw new Error(
    `route surface did not transition to ${expectedPathname}: ${JSON.stringify({
      bodyChanged: previous ? last?.bodyFingerprint !== previous.bodyFingerprint : null,
      observedPathname: last?.pathname ?? null,
      productStates: last?.productStates ?? [],
      routeTitle: last?.routeTitle ?? null,
      titleChanged: previous ? last?.routeTitle !== previous.routeTitle : null,
    })}`,
  );
}

async function readRouteSurface(page) {
  const main = page.locator("#product-main");
  const [documentTitle, routeTitle, mainText, productStates] = await Promise.all([
    page.title(),
    page.locator("header h1").first().innerText().catch(() => ""),
    main.innerText().catch(() => ""),
    page
      .locator("#product-main[data-product-state], #product-main [data-product-state]")
      .evaluateAll((states) => (
        states
          .map((state) => state.getAttribute("data-product-state") ?? "")
          .filter(Boolean)
      ))
      .catch(() => []),
  ]);
  return {
    bodyFingerprint: normalizeSurfaceText(mainText),
    documentTitle: documentTitle.trim(),
    mainText: mainText.trim(),
    pathname: new URL(page.url()).pathname,
    productStates,
    routeTitle: routeTitle.trim(),
  };
}

function assertDiagnostics(diagnostics) {
  const failures = [];
  if (diagnostics.apiErrors.length > 0) {
    failures.push(`api_error=${JSON.stringify(diagnostics.apiErrors)}`);
  }
  if (diagnostics.pageErrors.length > 0) {
    failures.push(`pageerror=${JSON.stringify(diagnostics.pageErrors)}`);
  }
  if (diagnostics.requestFailures.length > 0) {
    failures.push(`requestfailed=${JSON.stringify(diagnostics.requestFailures)}`);
  }
  if (diagnostics.changeTimelineLimits.length > 0) {
    failures.push(
      `change_timeline_422=${JSON.stringify(diagnostics.changeTimelineLimits)}`,
    );
  }
  assert.equal(failures.length, 0, failures.join("; "));
}

function requiredEnvironment(name, { trim = true } = {}) {
  const rawValue = process.env[name];
  const value = trim ? rawValue?.trim() : rawValue;
  if (value === undefined || value.length === 0) {
    throw new Error(`missing required environment variable: ${name}`);
  }
  return value;
}

function safeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.pathname;
  } catch {
    return "<invalid-url>";
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => {
    process.stderr.write(`authenticated route smoke failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

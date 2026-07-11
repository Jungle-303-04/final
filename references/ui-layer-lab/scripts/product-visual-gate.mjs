import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const port = 5195;
const baseUrl = `http://127.0.0.1:${port}`;
const productUrl = `${baseUrl}/product`;
const stateHarnessUrl = `${baseUrl}/scripts/fixtures/product-state-visual-harness.html`;
const outputDir = new URL("../output/playwright/", import.meta.url).pathname;
const releaseSelectors = ["[data-slot='empty']", "[data-slot='badge']", "h1", "p"];
const stateSelectors = [
  "[data-slot='empty']",
  "[data-slot='surface']",
  "[data-slot='button']",
  "[data-slot='status-mark']",
  "[role='alert']",
  "h1",
  "h2",
  "p",
  "code",
];
const visualScenarios = [
  {
    id: "release-desktop-light",
    url: productUrl,
    heading: "API 연결 계층을 검증하고 있습니다",
    requiredSelectors: releaseSelectors,
    viewport: { width: 1440, height: 1000 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
  },
  {
    id: "release-mobile-dark",
    url: productUrl,
    heading: "API 연결 계층을 검증하고 있습니다",
    requiredSelectors: releaseSelectors,
    viewport: { width: 390, height: 844 },
    theme: "dark",
    colorScheme: "dark",
    forcedColors: "none",
  },
  {
    id: "release-reflow-320-light",
    url: productUrl,
    heading: "API 연결 계층을 검증하고 있습니다",
    requiredSelectors: releaseSelectors,
    viewport: { width: 320, height: 800 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
  },
  {
    id: "release-text-resize-200-light",
    url: productUrl,
    heading: "API 연결 계층을 검증하고 있습니다",
    requiredSelectors: releaseSelectors,
    viewport: { width: 640, height: 800 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
    rootFontScale: 2,
  },
  {
    id: "state-reflow-320-light",
    url: stateHarnessUrl,
    heading: "공통 상태·작업 접근성 검증",
    requiredSelectors: stateSelectors,
    viewport: { width: 320, height: 900 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
  },
  {
    id: "state-text-resize-200-light",
    url: stateHarnessUrl,
    heading: "공통 상태·작업 접근성 검증",
    requiredSelectors: stateSelectors,
    viewport: { width: 640, height: 900 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
    rootFontScale: 2,
  },
  {
    id: "state-forced-colors",
    url: stateHarnessUrl,
    heading: "공통 상태·작업 접근성 검증",
    requiredSelectors: stateSelectors,
    viewport: { width: 1024, height: 900 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "active",
  },
];

const server = spawn(
  "npm",
  ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  { stdio: ["ignore", "pipe", "pipe"] },
);
let output = "";
let browser;
server.stdout.on("data", (chunk) => { output += chunk.toString(); });
server.stderr.on("data", (chunk) => { output += chunk.toString(); });

try {
  await mkdir(outputDir, { recursive: true });
  await waitForServer(productUrl);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  const apiRequests = [];
  const sockets = [];

  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("favicon")) errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (isApiPath(request.url())) apiRequests.push(request.url());
  });
  page.on("websocket", (socket) => {
    if (isApiPath(socket.url())) sockets.push(socket.url());
  });

  await page.goto(productUrl, { waitUntil: "networkidle" });
  for (const scenario of visualScenarios) {
    await captureScenario(page, scenario);
  }

  if (errors.length) throw new Error(`product visual console errors\n${errors.join("\n")}`);
  if (apiRequests.length) throw new Error(`visual gate made API requests\n${apiRequests.join("\n")}`);
  if (sockets.length) throw new Error(`visual gate opened API WebSockets\n${sockets.join("\n")}`);
  console.log(
    `product visual gate passed (${visualScenarios.map(({ id }) => id).join(", ")}; network-silent)`,
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  if (output.includes("error")) process.stderr.write(output);
}

async function captureScenario(page, scenario) {
  await page.setViewportSize(scenario.viewport);
  await page.emulateMedia({
    colorScheme: scenario.colorScheme,
    forcedColors: scenario.forcedColors,
    reducedMotion: "reduce",
  });
  await page.evaluate((theme) => localStorage.setItem("kubeheal-theme", theme), scenario.theme);
  await page.goto(scenario.url, { waitUntil: "networkidle" });
  const baselineRootFontSize = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
  if (scenario.rootFontScale) {
    await page.evaluate((scale) => {
      const baseline = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
      document.documentElement.style.fontSize = `${baseline * scale}px`;
    }, scenario.rootFontScale);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
  }

  await page.getByRole("heading", { name: scenario.heading }).waitFor();
  await assertScenarioEnvironment(page, scenario, baselineRootFontSize);
  await page.keyboard.press("?");
  if (await page.getByRole("dialog").count()) {
    throw new Error(`${scenario.id}: release-only shortcut dialog mounted unexpectedly`);
  }
  if (await page.getByRole("main").count() !== 1) {
    throw new Error(`${scenario.id}: visual surface must expose one main landmark`);
  }

  await assertNoOverflow(page, scenario.id, scenario.requiredSelectors);
  if (scenario.forcedColors === "active") await assertForcedColors(page, scenario.id);
  await page.screenshot({
    path: `${outputDir}product-${scenario.id}.png`,
    fullPage: true,
  });
}

async function assertScenarioEnvironment(page, scenario, baselineRootFontSize) {
  const result = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    light: matchMedia("(prefers-color-scheme: light)").matches,
    dark: matchMedia("(prefers-color-scheme: dark)").matches,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    forcedColors: matchMedia("(forced-colors: active)").matches,
    rootFontSize: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
    themeClasses: [...document.documentElement.classList],
  }));
  const expectedRootFontSize = baselineRootFontSize * (scenario.rootFontScale ?? 1);

  if (result.viewportWidth !== scenario.viewport.width) {
    throw new Error(`${scenario.id}: viewport ${result.viewportWidth}px != ${scenario.viewport.width}px`);
  }
  if (!result.reducedMotion) throw new Error(`${scenario.id}: reduced-motion is not active`);
  if ((scenario.forcedColors === "active") !== result.forcedColors) {
    throw new Error(`${scenario.id}: forced-colors state does not match the scenario`);
  }
  if ((scenario.colorScheme === "dark" && !result.dark)
    || (scenario.colorScheme === "light" && !result.light)) {
    throw new Error(`${scenario.id}: color scheme does not match the scenario`);
  }
  if (!result.themeClasses.includes(scenario.theme)) {
    throw new Error(`${scenario.id}: ${scenario.theme} theme class is not active`);
  }
  if (Math.abs(result.rootFontSize - expectedRootFontSize) > 0.1) {
    throw new Error(
      `${scenario.id}: root font ${result.rootFontSize}px != ${expectedRootFontSize}px`,
    );
  }
}

async function assertNoOverflow(page, label, requiredSelectors) {
  const result = await page.evaluate((required) => {
    const viewportWidth = document.documentElement.clientWidth;
    const documentOverflow = document.documentElement.scrollWidth - viewportWidth;
    const selectors = new Set([
      ...required,
      "[data-slot='empty']",
      "[data-slot='surface']",
      "[data-slot='button']",
      "[role='alert']",
      "h1",
      "h2",
      "p",
      "code",
      "dd",
    ]);
    const missingSelectors = required.filter((selector) => document.querySelectorAll(selector).length === 0);
    const violations = [];

    for (const element of document.querySelectorAll([...selectors].join(","))) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      const ownOverflow = element.scrollWidth - element.clientWidth;
      if (!element.hasAttribute("data-reflow-exempt") && ownOverflow > 1) {
        violations.push(`${element.tagName.toLowerCase()} own overflow ${ownOverflow}px`);
      }
      if (rect.left < -1 || rect.right > viewportWidth + 1) {
        violations.push(
          `${element.tagName.toLowerCase()} viewport bounds ${rect.left.toFixed(1)}..${rect.right.toFixed(1)}`,
        );
      }
    }

    return { documentOverflow, missingSelectors, violations };
  }, requiredSelectors);

  if (result.missingSelectors.length) {
    throw new Error(`${label}: required reflow selectors are missing\n${result.missingSelectors.join("\n")}`);
  }
  if (result.documentOverflow > 1 || result.violations.length) {
    throw new Error(
      `${label} reflow failure: document=${result.documentOverflow}px\n${result.violations.join("\n")}`,
    );
  }
}

async function assertForcedColors(page, label) {
  const result = await page.evaluate(() => {
    const elements = {
      main: document.querySelector("main"),
      empty: document.querySelector("[data-slot='empty']"),
      surface: document.querySelector("[data-slot='surface']"),
      badge: document.querySelector("[data-slot='badge']"),
      alert: document.querySelector("[role='alert']"),
      heading: document.querySelector("h1"),
      status: document.querySelector("[data-slot='status-mark']"),
      focusTarget: document.querySelector("[data-visual-focus-target]"),
      disabledButton: document.querySelector("[data-slot='button'][disabled]"),
    };
    if (Object.values(elements).some((element) => !(element instanceof HTMLElement))) {
      return { missing: true };
    }

    const { main, empty, surface, badge, alert, heading, status, focusTarget, disabledButton } = elements;
    focusTarget.focus();
    const mainStyle = getComputedStyle(main);
    const emptyStyle = getComputedStyle(empty);
    const surfaceStyle = getComputedStyle(surface);
    const badgeStyle = getComputedStyle(badge);
    const alertStyle = getComputedStyle(alert);
    const headingStyle = getComputedStyle(heading);
    const focusStyle = getComputedStyle(focusTarget);
    const disabledStyle = getComputedStyle(disabledButton);
    const selectionStyle = getComputedStyle(heading, "::selection");
    const marker = status.querySelector("[aria-hidden='true']");
    if (!(marker instanceof HTMLElement)) return { missing: true };
    const markerStyle = getComputedStyle(marker);

    return {
      missing: false,
      active: matchMedia("(forced-colors: active)").matches,
      mainBackground: mainStyle.backgroundColor,
      emptyBackground: emptyStyle.backgroundColor,
      emptyBorderColor: emptyStyle.borderTopColor,
      emptyBorderStyle: emptyStyle.borderTopStyle,
      emptyBorderWidth: Number.parseFloat(emptyStyle.borderTopWidth),
      surfaceBackground: surfaceStyle.backgroundColor,
      surfaceBorderColor: surfaceStyle.borderTopColor,
      badgeBackground: badgeStyle.backgroundColor,
      badgeBorderColor: badgeStyle.borderTopColor,
      badgeBorderStyle: badgeStyle.borderTopStyle,
      badgeBorderWidth: Number.parseFloat(badgeStyle.borderTopWidth),
      alertBackground: alertStyle.backgroundColor,
      alertBorderColor: alertStyle.borderTopColor,
      headingColor: headingStyle.color,
      headingVisible: heading.getBoundingClientRect().width > 0,
      focusBackground: focusStyle.backgroundColor,
      focusOutlineColor: focusStyle.outlineColor,
      focusOutlineStyle: focusStyle.outlineStyle,
      focusOutlineWidth: Number.parseFloat(focusStyle.outlineWidth),
      disabledBackground: disabledStyle.backgroundColor,
      disabledColor: disabledStyle.color,
      disabledVisible: disabledButton.getBoundingClientRect().width > 0,
      markerBackground: markerStyle.backgroundColor,
      markerBorderColor: markerStyle.borderTopColor,
      markerBorderStyle: markerStyle.borderTopStyle,
      markerBorderWidth: Number.parseFloat(markerStyle.borderTopWidth),
      selectionBackground: selectionStyle.backgroundColor,
      selectionColor: selectionStyle.color,
      statusText: status.textContent?.trim() ?? "",
    };
  });

  if (result.missing) throw new Error(`${label}: required forced-colors elements are missing`);
  if (!result.active) throw new Error(`${label}: forced-colors media query is not active`);
  assertVisiblePair(label, "heading", result.headingColor, result.mainBackground);
  assertVisiblePair(label, "empty border", result.emptyBorderColor, result.emptyBackground);
  assertVisiblePair(label, "surface border", result.surfaceBorderColor, result.surfaceBackground);
  assertVisiblePair(label, "badge border", result.badgeBorderColor, result.badgeBackground);
  assertVisiblePair(label, "alert border", result.alertBorderColor, result.alertBackground);
  assertVisiblePair(label, "focus outline", result.focusOutlineColor, result.focusBackground);
  assertVisiblePair(label, "disabled text", result.disabledColor, result.disabledBackground);
  assertVisiblePair(label, "status marker", result.markerBorderColor, result.markerBackground);
  assertVisiblePair(label, "selection", result.selectionColor, result.selectionBackground);
  if (!result.headingVisible || !result.disabledVisible || !result.statusText) {
    throw new Error(`${label}: forced-colors text or controls are not visible`);
  }
  if (result.focusOutlineStyle === "none" || result.focusOutlineWidth < 2) {
    throw new Error(`${label}: focus outline is not preserved`);
  }
  if (result.emptyBorderStyle === "none" || result.emptyBorderWidth < 1
    || result.badgeBorderStyle === "none" || result.badgeBorderWidth < 1
    || result.markerBorderStyle === "none" || result.markerBorderWidth < 1) {
    throw new Error(`${label}: a required forced-colors border is not preserved`);
  }
}

function assertVisiblePair(label, element, foreground, background) {
  if (!foreground || !background || foreground === "rgba(0, 0, 0, 0)" || foreground === background) {
    throw new Error(`${label}: ${element} is not distinguishable (${foreground} on ${background})`);
  }
}

function isApiPath(url) {
  const pathname = new URL(url).pathname;
  return pathname === "/api" || pathname.startsWith("/api/");
}

async function waitForServer(url) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* vite is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Vite did not start at ${url}`);
}

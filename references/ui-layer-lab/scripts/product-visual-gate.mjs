import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { chromium } from "playwright";

const port = await findAvailablePort();
const runNonce = randomUUID();
const baseUrl = `http://127.0.0.1:${port}`;
const productUrl = `${baseUrl}/product`;
const stateHarnessUrl = `${baseUrl}/scripts/fixtures/product-state-visual-harness.html`;
const outputDir = new URL("../output/playwright/", import.meta.url).pathname;
const releaseSelectors = ["[data-slot='empty']", "[data-slot='badge']", "h1", "p"];
const stateSelectors = [
  "[data-slot='empty']",
  "[data-slot='surface']",
  "[data-slot='button']",
  "[data-slot='progress']",
  "[data-slot='progress-track']",
  "[data-slot='progress-indicator']",
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
  {
    detached: process.platform !== "win32",
    env: { ...process.env, VITE_VISUAL_GATE_NONCE: runNonce },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let output = "";
let browser;
let serverExit;
let serverReady = false;
let rejectStartup;
const startupFailure = new Promise((_, reject) => { rejectStartup = reject; });
server.stdout.on("data", (chunk) => { output += chunk.toString(); });
server.stderr.on("data", (chunk) => { output += chunk.toString(); });
server.on("error", (error) => {
  serverExit = { error };
  if (!serverReady) rejectStartup(error);
});
server.on("exit", (code, signal) => {
  serverExit = { code, signal };
  if (!serverReady) {
    rejectStartup(new Error(`visual Vite exited before ownership verification: code=${code} signal=${signal}`));
  }
});

try {
  await mkdir(outputDir, { recursive: true });
  await Promise.race([waitForOwnedServer(stateHarnessUrl, runNonce), startupFailure]);
  serverReady = true;
  assertServerAlive();
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
    assertServerAlive();
    await captureScenario(page, scenario);
  }
  assertServerAlive();

  if (errors.length) throw new Error(`product visual console errors\n${errors.join("\n")}`);
  if (apiRequests.length) throw new Error(`visual gate made API requests\n${apiRequests.join("\n")}`);
  if (sockets.length) throw new Error(`visual gate opened API WebSockets\n${sockets.join("\n")}`);
  console.log(
    `product visual gate passed (${visualScenarios.map(({ id }) => id).join(", ")}; network-silent)`,
  );
} finally {
  try {
    await browser?.close();
  } finally {
    try {
      await stopOwnedServer();
    } finally {
      if (output.includes("error")) process.stderr.write(output);
    }
  }
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
      const style = getComputedStyle(element);
      const ownOverflow = element.scrollWidth - element.clientWidth;
      const exemption = element.getAttribute("data-reflow-exempt");
      const isHorizontalScrollOwner = style.overflowX === "auto" || style.overflowX === "scroll";
      const labelledBy = element.getAttribute("aria-labelledby")
        ?.split(/\s+/)
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
        .join(" ")
        .trim();
      const hasAccessibleName = Boolean(element.getAttribute("aria-label")?.trim() || labelledBy);
      const isSuppressed = element.matches(":disabled,[aria-disabled='true'],[hidden]")
        || Boolean(element.closest("[aria-hidden='true'],[inert]"))
        || style.display === "none"
        || style.visibility === "hidden";
      let acceptsFocus = false;
      if (exemption !== null && !isSuppressed && element.tabIndex >= 0) {
        const previousFocus = document.activeElement;
        element.focus({ preventScroll: true });
        acceptsFocus = document.activeElement === element;
        if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
        else element.blur();
      }
      if (exemption !== null && (
        exemption.trim().length === 0
        || !isHorizontalScrollOwner
        || element.tabIndex < 0
        || isSuppressed
        || !acceptsFocus
        || !hasAccessibleName
      )) {
        violations.push(
          `${element.tagName.toLowerCase()} invalid reflow exemption: reason=${JSON.stringify(exemption)} overflow-x=${style.overflowX} tabIndex=${element.tabIndex} focus=${acceptsFocus} named=${hasAccessibleName} suppressed=${isSuppressed}`,
        );
      }
      if (exemption === null && ownOverflow > 1) {
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
      completeProgressIndicator: document.querySelector(
        "[data-visual-progress='complete'] [data-slot='progress-indicator']",
      ),
      indeterminateProgressIndicator: document.querySelector(
        "[data-visual-progress='indeterminate'] [data-slot='progress-indicator']",
      ),
    };
    if (Object.values(elements).some((element) => !(element instanceof HTMLElement))) {
      return { missing: true };
    }

    const {
      main,
      empty,
      surface,
      badge,
      alert,
      heading,
      status,
      focusTarget,
      disabledButton,
      completeProgressIndicator,
      indeterminateProgressIndicator,
    } = elements;
    focusTarget.focus();
    const emptyStyle = getComputedStyle(empty);
    const surfaceStyle = getComputedStyle(surface);
    const badgeStyle = getComputedStyle(badge);
    const alertStyle = getComputedStyle(alert);
    const headingStyle = getComputedStyle(heading);
    const focusStyle = getComputedStyle(focusTarget);
    const disabledStyle = getComputedStyle(disabledButton);
    const completeProgressStyle = getComputedStyle(completeProgressIndicator);
    const indeterminateProgressStyle = getComputedStyle(indeterminateProgressIndicator);
    const selectionStyle = getComputedStyle(heading, "::selection");
    const marker = status.querySelector("[aria-hidden='true']");
    if (!(marker instanceof HTMLElement)) return { missing: true };
    const markerStyle = getComputedStyle(marker);

    function parseColor(color) {
      const channels = color.match(/[\d.]+/g)?.map(Number) ?? [];
      return {
        alpha: color === "transparent" ? 0 : channels.length >= 4 ? channels[3] : 1,
        blue: channels[2] ?? 0,
        green: channels[1] ?? 0,
        red: channels[0] ?? 0,
      };
    }

    function composite(top, bottom) {
      const alpha = top.alpha + bottom.alpha * (1 - top.alpha);
      if (alpha === 0) return { alpha: 0, blue: 0, green: 0, red: 0 };
      return {
        alpha,
        blue: (top.blue * top.alpha + bottom.blue * bottom.alpha * (1 - top.alpha)) / alpha,
        green: (top.green * top.alpha + bottom.green * bottom.alpha * (1 - top.alpha)) / alpha,
        red: (top.red * top.alpha + bottom.red * bottom.alpha * (1 - top.alpha)) / alpha,
      };
    }

    function effectiveBackground(element) {
      const ancestry = [];
      let current = element;
      while (current instanceof HTMLElement) {
        ancestry.push(current);
        current = current.parentElement;
      }
      let result = { alpha: 0, blue: 0, green: 0, red: 0 };
      for (const ancestor of ancestry.reverse()) {
        const style = getComputedStyle(ancestor);
        const layer = parseColor(style.backgroundColor);
        result = composite(layer, result);
      }
      const alpha = Number(result.alpha.toFixed(4));
      return alpha >= 0.999
        ? `rgb(${result.red}, ${result.green}, ${result.blue})`
        : `rgba(${result.red}, ${result.green}, ${result.blue}, ${alpha})`;
    }

    function effectiveOpacity(element) {
      let opacity = 1;
      let current = element;
      while (current instanceof HTMLElement) {
        opacity *= Number.parseFloat(getComputedStyle(current).opacity || "1");
        current = current.parentElement;
      }
      return opacity;
    }

    return {
      missing: false,
      active: matchMedia("(forced-colors: active)").matches,
      mainBackground: effectiveBackground(main),
      emptyBackground: effectiveBackground(empty),
      emptyBorderColor: emptyStyle.borderTopColor,
      emptyOpacity: effectiveOpacity(empty),
      emptyBorderStyle: emptyStyle.borderTopStyle,
      emptyBorderWidth: Number.parseFloat(emptyStyle.borderTopWidth),
      surfaceBackground: effectiveBackground(surface),
      surfaceBorderColor: surfaceStyle.borderTopColor,
      surfaceOpacity: effectiveOpacity(surface),
      surfaceBorderStyle: surfaceStyle.borderTopStyle,
      surfaceBorderWidth: Number.parseFloat(surfaceStyle.borderTopWidth),
      badgeBackground: effectiveBackground(badge),
      badgeBorderColor: badgeStyle.borderTopColor,
      badgeOpacity: effectiveOpacity(badge),
      badgeBorderStyle: badgeStyle.borderTopStyle,
      badgeBorderWidth: Number.parseFloat(badgeStyle.borderTopWidth),
      alertBackground: effectiveBackground(alert),
      alertBorderColor: alertStyle.borderTopColor,
      alertOpacity: effectiveOpacity(alert),
      alertBorderStyle: alertStyle.borderTopStyle,
      alertBorderWidth: Number.parseFloat(alertStyle.borderTopWidth),
      headingColor: headingStyle.color,
      headingOpacity: effectiveOpacity(heading),
      headingVisible: heading.getBoundingClientRect().width > 0,
      focusBackground: effectiveBackground(focusTarget),
      focusOutlineColor: focusStyle.outlineColor,
      focusOpacity: effectiveOpacity(focusTarget),
      focusOutlineStyle: focusStyle.outlineStyle,
      focusOutlineWidth: Number.parseFloat(focusStyle.outlineWidth),
      disabledBackground: effectiveBackground(disabledButton),
      disabledColor: disabledStyle.color,
      disabledOpacity: effectiveOpacity(disabledButton),
      disabledVisible: disabledButton.getBoundingClientRect().width > 0,
      completeProgressWidth: completeProgressIndicator.getBoundingClientRect().width,
      indeterminateProgressAnimationName: indeterminateProgressStyle.animationName,
      indeterminateProgressBorderStyle: indeterminateProgressStyle.borderTopStyle,
      indeterminateProgressBorderWidth: Number.parseFloat(indeterminateProgressStyle.borderTopWidth),
      indeterminateProgressOpacity: effectiveOpacity(indeterminateProgressIndicator),
      indeterminateProgressWidth: indeterminateProgressIndicator.getBoundingClientRect().width,
      progressTrackWidth: completeProgressIndicator.parentElement?.getBoundingClientRect().width ?? 0,
      completeProgressVisible: completeProgressStyle.display !== "none"
        && completeProgressStyle.visibility !== "hidden",
      markerBackground: effectiveBackground(marker),
      markerBorderColor: markerStyle.borderTopColor,
      markerOpacity: effectiveOpacity(marker),
      markerBorderStyle: markerStyle.borderTopStyle,
      markerBorderWidth: Number.parseFloat(markerStyle.borderTopWidth),
      selectionBackground: selectionStyle.backgroundColor,
      selectionColor: selectionStyle.color,
      selectionOpacity: effectiveOpacity(heading),
      selectionUnderlay: effectiveBackground(heading),
      statusText: status.textContent?.trim() ?? "",
    };
  });

  if (result.missing) throw new Error(`${label}: required forced-colors elements are missing`);
  if (!result.active) throw new Error(`${label}: forced-colors media query is not active`);
  const opacityChecks = {
    alert: result.alertOpacity,
    badge: result.badgeOpacity,
    disabled: result.disabledOpacity,
    empty: result.emptyOpacity,
    focus: result.focusOpacity,
    heading: result.headingOpacity,
    indeterminateProgress: result.indeterminateProgressOpacity,
    selection: result.selectionOpacity,
    status: result.markerOpacity,
    surface: result.surfaceOpacity,
  };
  for (const [element, opacity] of Object.entries(opacityChecks)) {
    if (Math.abs(opacity - 1) > 0.001) {
      throw new Error(`${label}: ${element} uses group opacity ${opacity}; forced-colors contrast must be opaque`);
    }
  }
  assertContrast(label, "heading", result.headingColor, result.mainBackground, 4.5);
  assertContrast(label, "empty border", result.emptyBorderColor, result.emptyBackground, 3);
  assertContrast(label, "surface border", result.surfaceBorderColor, result.surfaceBackground, 3);
  assertContrast(label, "badge border", result.badgeBorderColor, result.badgeBackground, 3);
  assertContrast(label, "alert border", result.alertBorderColor, result.alertBackground, 3);
  assertContrast(label, "focus outline", result.focusOutlineColor, result.focusBackground, 3);
  assertContrast(label, "disabled text", result.disabledColor, result.disabledBackground, 3);
  assertContrast(label, "status marker", result.markerBorderColor, result.markerBackground, 3);
  assertContrast(
    label,
    "selection",
    result.selectionColor,
    result.selectionBackground,
    4.5,
    result.selectionUnderlay,
  );
  if (!result.headingVisible || !result.disabledVisible || !result.statusText) {
    throw new Error(`${label}: forced-colors text or controls are not visible`);
  }
  const indeterminateRatio = result.progressTrackWidth > 0
    ? result.indeterminateProgressWidth / result.progressTrackWidth
    : 0;
  const completeRatio = result.progressTrackWidth > 0
    ? result.completeProgressWidth / result.progressTrackWidth
    : 0;
  if (!result.completeProgressVisible
    || completeRatio < 0.98
    || indeterminateRatio < 0.25
    || indeterminateRatio > 0.45
    || result.indeterminateProgressBorderStyle !== "dashed"
    || result.indeterminateProgressBorderWidth < 1
    || result.indeterminateProgressAnimationName !== "none") {
    throw new Error(
      `${label}: indeterminate progress must remain a static partial dashed shape in reduced-motion forced-colors `
      + JSON.stringify({
        animationName: result.indeterminateProgressAnimationName,
        borderStyle: result.indeterminateProgressBorderStyle,
        borderWidth: result.indeterminateProgressBorderWidth,
        completeRatio,
        completeWidth: result.completeProgressWidth,
        ratio: indeterminateRatio,
        trackWidth: result.progressTrackWidth,
      }),
    );
  }
  if (result.focusOutlineStyle === "none" || result.focusOutlineWidth < 2) {
    throw new Error(`${label}: focus outline is not preserved`);
  }
  if (result.emptyBorderStyle === "none" || result.emptyBorderWidth < 1
    || result.surfaceBorderStyle === "none" || result.surfaceBorderWidth < 1
    || result.badgeBorderStyle === "none" || result.badgeBorderWidth < 1
    || result.alertBorderStyle === "none" || result.alertBorderWidth < 1
    || result.markerBorderStyle === "none" || result.markerBorderWidth < 1) {
    throw new Error(`${label}: a required forced-colors border is not preserved`);
  }
}

function assertContrast(label, element, foreground, background, minimum, underlay) {
  const ratio = contrastRatio(foreground, background, underlay);
  if (ratio < minimum) {
    throw new Error(
      `${label}: ${element} contrast ${ratio.toFixed(2)} < ${minimum} (${foreground} on ${background})`,
    );
  }
}

function contrastRatio(foreground, background, underlay) {
  const underlayColor = underlay ? opaqueColor(parseCssColor(underlay), underlay) : undefined;
  const parsedBackground = parseCssColor(background);
  if (parsedBackground.alpha < 0.99 && !underlayColor) {
    throw new Error(`Semi-transparent background requires an opaque underlay: ${background}`);
  }
  const backgroundColor = parsedBackground.alpha >= 0.99
    ? parsedBackground.channels
    : blendColor(parsedBackground, underlayColor);
  const parsedForeground = parseCssColor(foreground);
  const foregroundColor = parsedForeground.alpha >= 0.99
    ? parsedForeground.channels
    : blendColor(parsedForeground, backgroundColor);
  const lighter = Math.max(relativeLuminance(foregroundColor), relativeLuminance(backgroundColor));
  const darker = Math.min(relativeLuminance(foregroundColor), relativeLuminance(backgroundColor));
  return (lighter + 0.05) / (darker + 0.05);
}

function parseCssColor(color) {
  const channels = color?.match(/[\d.]+/g)?.map(Number) ?? [];
  if (channels.length < 3) {
    throw new Error(`forced-colors value is not RGB: ${color}`);
  }
  return {
    alpha: channels.length >= 4 ? channels[3] : 1,
    channels: channels.slice(0, 3),
  };
}

function opaqueColor(color, source) {
  if (color.alpha < 0.99) throw new Error(`forced-colors underlay is not opaque: ${source}`);
  return color.channels;
}

function blendColor(foreground, background) {
  return foreground.channels.map(
    (channel, index) => channel * foreground.alpha + background[index] * (1 - foreground.alpha),
  );
}

function relativeLuminance([red, green, blue]) {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isApiPath(url) {
  const pathname = new URL(url).pathname;
  return pathname === "/api" || pathname.startsWith("/api/");
}

async function stopOwnedServer() {
  if (serverExit && !(await isOwnedServerResponding())) return;
  await signalOwnedServer("SIGTERM");
  if (await waitForOwnedServerStop(3_000)) return;

  await signalOwnedServer("SIGKILL");
  if (await waitForOwnedServerStop(1_000)) return;
  throw new Error("Owned visual Vite did not exit after SIGTERM and SIGKILL");
}

async function signalOwnedServer(signal) {
  if (!server.pid) throw new Error(`Owned visual Vite has no pid for ${signal}`);
  if (process.platform === "win32") {
    await runWindowsTreeKill(signal);
    return;
  }
  try {
    process.kill(-server.pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

async function runWindowsTreeKill(signal) {
  const args = ["/PID", String(server.pid), "/T"];
  if (signal === "SIGKILL") args.push("/F");
  await new Promise((resolve, reject) => {
    const killer = spawn("taskkill", args, { stdio: "ignore" });
    killer.once("error", reject);
    killer.once("exit", resolve);
  });
}

async function waitForOwnedServerStop(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (serverExit && !(await isOwnedServerResponding())) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return false;
}

async function isOwnedServerResponding() {
  try {
    const response = await fetch(stateHarnessUrl);
    return response.ok && (await response.text()).includes(runNonce);
  } catch {
    return false;
  }
}

function assertServerAlive() {
  if (!serverExit) return;
  const detail = serverExit.error?.message
    ?? `code=${serverExit.code ?? "unknown"} signal=${serverExit.signal ?? "none"}`;
  throw new Error(`owned visual Vite is not running: ${detail}`);
}

async function findAvailablePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const address = listener.address();
  if (!address || typeof address === "string") {
    listener.close();
    throw new Error("Could not reserve a visual gate port");
  }
  await new Promise((resolve, reject) => {
    listener.close((error) => error ? reject(error) : resolve());
  });
  return address.port;
}

async function waitForOwnedServer(url, nonce) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok && (await response.text()).includes(nonce)) return;
    } catch { /* vite is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Owned visual Vite did not publish nonce ${nonce} at ${url}`);
}

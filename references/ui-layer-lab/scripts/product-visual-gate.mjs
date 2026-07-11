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
const shellHarnessUrl = `${baseUrl}/scripts/fixtures/product-shell-visual-harness.html`;
const outputDir = new URL("../output/playwright/", import.meta.url).pathname;
const authLoginSelectors = [
  "[data-slot='card']",
  "[data-slot='card-header']",
  "[data-slot='card-content']",
  "[data-slot='field-group']",
  "[data-slot='field']",
  "[data-slot='input']",
  "[data-slot='button']",
  "form",
  "h1",
  "label",
];
const authStateSelectors = [
  "[data-slot='empty']",
  "[data-slot='badge']",
  "h1",
  "p",
];
const stateSelectors = [
  "[data-slot='empty']",
  "[data-slot='surface']",
  "[data-slot='button']",
  "[data-slot='button-group']",
  "[data-slot='button-group-separator']",
  "[data-slot='button-group-text']",
  "[data-slot='item']",
  "[data-slot='item-title']",
  "[data-slot='item-description']",
  "[data-slot='progress']",
  "[data-slot='progress-track']",
  "[data-slot='progress-indicator']",
  "[data-slot='scroll-area']",
  "[data-slot='scroll-area-viewport']",
  "[data-slot='scroll-area-scrollbar']",
  "[data-slot='scroll-area-thumb']",
  "[data-slot='status-mark']",
  "[data-slot='tabs']",
  "[data-slot='tabs-list']",
  "[data-slot='tabs-trigger']",
  "[data-slot='tabs-content']",
  "[role='alert']",
  "h1",
  "h2",
  "p",
  "code",
];
const shellSelectors = [
  "[data-slot='sidebar-provider']",
  "[data-slot='sidebar-inset']",
  "[data-slot='sidebar-navigation']",
  "[data-slot='sidebar-menu']",
  "[data-slot='sidebar-trigger']",
  "[data-shell-harness-outlet]",
  "header",
  "main",
];
const visualScenarios = [
  {
    id: "auth-unauthenticated-desktop-light",
    url: productUrl,
    authSession: "unauthenticated",
    heading: "KubeHeal에 로그인",
    requiredSelectors: authLoginSelectors,
    viewport: { width: 1440, height: 1000 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
  },
  {
    id: "auth-unauthenticated-mobile-dark",
    url: productUrl,
    authSession: "unauthenticated",
    heading: "KubeHeal에 로그인",
    requiredSelectors: authLoginSelectors,
    viewport: { width: 390, height: 844 },
    theme: "dark",
    colorScheme: "dark",
    forcedColors: "none",
  },
  {
    id: "auth-unauthenticated-reflow-320-light",
    url: productUrl,
    authSession: "unauthenticated",
    heading: "KubeHeal에 로그인",
    requiredSelectors: authLoginSelectors,
    viewport: { width: 320, height: 800 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
  },
  {
    id: "auth-unauthenticated-text-resize-200-light",
    url: productUrl,
    authSession: "unauthenticated",
    heading: "KubeHeal에 로그인",
    requiredSelectors: authLoginSelectors,
    viewport: { width: 640, height: 800 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
    rootFontScale: 2,
  },
  {
    id: "auth-unauthenticated-forced-colors",
    url: productUrl,
    authSession: "unauthenticated",
    heading: "KubeHeal에 로그인",
    requiredSelectors: authLoginSelectors,
    viewport: { width: 1024, height: 900 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "active",
  },
  {
    id: "auth-authenticated-release-light",
    url: productUrl,
    authSession: "authenticated",
    heading: "API 연결 계층을 검증하고 있습니다",
    requiredSelectors: authStateSelectors,
    viewport: { width: 1440, height: 1000 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
  },
  {
    id: "auth-session-error-light",
    url: productUrl,
    authSession: "error",
    heading: "검증된 응답을 읽지 못했습니다",
    requiredSelectors: [...authStateSelectors, "[role='alert']", "[data-slot='button']"],
    viewport: { width: 1024, height: 900 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
  },
  {
    id: "auth-session-loading-light",
    url: productUrl,
    authSession: "loading",
    heading: "운영 상태를 확인하는 중입니다",
    requiredSelectors: [...authStateSelectors, "[data-slot='loading-preview']"],
    viewport: { width: 1024, height: 900 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
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
    stateAssertions: true,
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
    stateAssertions: true,
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
    stateAssertions: true,
  },
  {
    id: "shell-desktop-expanded-light",
    url: shellHarnessUrl,
    heading: "Home",
    requiredSelectors: [...shellSelectors, "[data-slot='sidebar']"],
    viewport: { width: 1440, height: 900 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
    shellMode: "desktop-expanded",
  },
  {
    id: "shell-desktop-collapsed-forced-colors",
    url: shellHarnessUrl,
    heading: "Home",
    requiredSelectors: [...shellSelectors, "[data-slot='sidebar']"],
    viewport: { width: 1440, height: 900 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "active",
    shellMode: "desktop-collapsed",
  },
  {
    id: "shell-mobile-drawer-dark-390",
    url: shellHarnessUrl,
    heading: "Home",
    requiredSelectors: [
      ...shellSelectors,
      "[data-slot='sidebar-mobile']",
      "[data-slot='dialog-content']",
      "[data-slot='dialog-overlay']",
    ],
    viewport: { width: 390, height: 844 },
    theme: "dark",
    colorScheme: "dark",
    forcedColors: "none",
    shellMode: "mobile-open",
  },
  {
    id: "shell-mobile-drawer-dark-320",
    url: shellHarnessUrl,
    heading: "Home",
    requiredSelectors: [
      ...shellSelectors,
      "[data-slot='sidebar-mobile']",
      "[data-slot='dialog-content']",
      "[data-slot='dialog-overlay']",
    ],
    viewport: { width: 320, height: 800 },
    theme: "dark",
    colorScheme: "dark",
    forcedColors: "none",
    shellMode: "mobile-open",
  },
  {
    id: "shell-text-resize-200-light",
    url: shellHarnessUrl,
    heading: "Home",
    requiredSelectors: [
      ...shellSelectors,
      "[data-slot='sidebar-mobile']",
      "[data-slot='dialog-content']",
      "[data-slot='dialog-overlay']",
    ],
    viewport: { width: 640, height: 900 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
    rootFontScale: 2,
    shellMode: "mobile-open",
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
  for (const scenario of visualScenarios) {
    assertServerAlive();
    await runVisualScenario(browser, scenario);
  }
  assertServerAlive();

  console.log(
    `product visual gate passed (${visualScenarios.map(({ id }) => id).join(", ")}; isolated contexts; exact auth-session request; feature-network/websocket-silent)`,
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

async function runVisualScenario(browserInstance, scenario) {
  const context = await browserInstance.newContext({
    colorScheme: scenario.colorScheme,
    forcedColors: scenario.forcedColors,
    reducedMotion: "reduce",
    viewport: scenario.viewport,
  });
  await context.addInitScript((theme) => {
    localStorage.setItem("kubeheal-theme", theme);
  }, scenario.theme);

  const page = await context.newPage();
  const errors = [];
  const apiRequests = [];
  const networkRequests = [];
  const sockets = [];
  const authStub = await installAuthSessionStub(page, scenario.authSession);

  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error"
      && !text.includes("favicon")
      && !isExpectedAuthSessionConsoleNoise(text, scenario.authSession)) {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const record = `${request.method()} ${request.url()} (${request.resourceType()})`;
    const authSessionRequest = isExactAuthSessionRequest(request);
    if (isApiPath(request.url())) {
      apiRequests.push({
        method: request.method(),
        resourceType: request.resourceType(),
        url: request.url(),
      });
    }
    if (!authSessionRequest && isUnexpectedFeatureNetworkRequest(request)) {
      networkRequests.push(record);
    }
  });
  page.on("websocket", (socket) => {
    if (!isViteDevelopmentSocket(socket.url())) sockets.push(socket.url());
  });

  try {
    await captureScenario(page, scenario);
    assertScenarioNetworkContract(scenario, {
      apiRequests,
      errors,
      networkRequests,
      sockets,
    });
  } finally {
    await authStub.release();
    await context.close();
  }
}

async function installAuthSessionStub(page, authSession) {
  if (!authSession) return { release: async () => {} };

  let releaseLoading = () => {};
  let loadingRouteCompletion = null;
  const loadingGate = authSession === "loading"
    ? new Promise((resolve) => { releaseLoading = resolve; })
    : null;

  await page.route("**/api/auth/session", async (route) => {
    if (authSession === "loading") {
      loadingRouteCompletion = (async () => {
        await loadingGate;
        try {
          await route.abort("timedout");
        } catch {
          // The isolated context may already be closing after the loading screenshot.
        }
      })();
      await loadingRouteCompletion;
      return;
    }

    if (authSession === "authenticated") {
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify({
          authenticated: true,
          user_id: "visual-gate-user",
          roles: ["viewer"],
          workspace_id: "visual-gate-workspace",
        }),
      });
      return;
    }

    if (authSession === "unauthenticated") {
      await route.fulfill({
        contentType: "application/json",
        status: 401,
        body: JSON.stringify({ detail: "visual gate unauthenticated session" }),
      });
      return;
    }

    if (authSession === "error") {
      await route.fulfill({
        contentType: "application/json",
        status: 503,
        body: JSON.stringify({ detail: "visual gate session unavailable" }),
      });
      return;
    }

    throw new Error(`Unsupported visual auth session state: ${authSession}`);
  });

  return {
    async release() {
      releaseLoading();
      await loadingRouteCompletion;
    },
  };
}

function assertScenarioNetworkContract(
  scenario,
  { apiRequests, errors, networkRequests, sockets },
) {
  const authSessionRequests = apiRequests.filter((request) => (
    request.method === "GET" && isExactAuthSessionUrl(request.url)
  ));
  const unexpectedApiRequests = apiRequests.filter((request) => (
    request.method !== "GET" || !isExactAuthSessionUrl(request.url)
  ));
  const formatRequests = (requests) => requests.map((request) => (
    typeof request === "string"
      ? request
      : `${request.method} ${request.url} (${request.resourceType})`
  )).join("\n");

  if (errors.length) {
    throw new Error(`${scenario.id}: visual console errors\n${errors.join("\n")}`);
  }
  if (unexpectedApiRequests.length) {
    throw new Error(
      `${scenario.id}: visual gate made unexpected API requests\n${formatRequests(unexpectedApiRequests)}`,
    );
  }
  const expectedAuthSessionRequests = scenario.authSession ? 1 : 0;
  if (authSessionRequests.length !== expectedAuthSessionRequests) {
    throw new Error(
      `${scenario.id}: expected ${expectedAuthSessionRequests} exact GET /api/auth/session request, `
      + `received ${authSessionRequests.length}\n${formatRequests(apiRequests)}`,
    );
  }
  if (networkRequests.length) {
    throw new Error(
      `${scenario.id}: visual gate made unexpected feature or external network requests\n`
      + formatRequests(networkRequests),
    );
  }
  if (sockets.length) {
    throw new Error(
      `${scenario.id}: visual gate opened unexpected WebSockets\n${sockets.join("\n")}`,
    );
  }
}

async function captureScenario(page, scenario) {
  await page.goto(scenario.url, {
    waitUntil: scenario.authSession === "loading" ? "domcontentloaded" : "networkidle",
  });
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
  if (scenario.shellMode) {
    await prepareProductShellScenario(page, scenario);
  } else if (!scenario.authSession || scenario.authSession === "authenticated") {
    await page.keyboard.press("?");
    if (await page.getByRole("dialog").count()) {
      throw new Error(`${scenario.id}: release-only shortcut dialog mounted unexpectedly`);
    }
  }
  const mainCount = scenario.shellMode
    ? await page.locator("main").count()
    : await page.getByRole("main").count();
  if (mainCount !== 1) {
    throw new Error(`${scenario.id}: visual surface must expose one main landmark`);
  }

  if (scenario.stateAssertions) {
    await assertStatePrimitiveContracts(page, scenario.id);
    await assertInteractionPrimitiveContracts(page, scenario.id);
  }
  if (scenario.shellMode) {
    await assertProductShellContracts(page, scenario);
  }
  await assertNoOverflow(page, scenario.id, scenario.requiredSelectors);
  if (scenario.forcedColors === "active") {
    if (scenario.shellMode) await assertProductShellForcedColors(page, scenario.id);
    else if (scenario.authSession === "unauthenticated") {
      await assertAuthForcedColors(page, scenario.id);
    }
    else await assertForcedColors(page, scenario.id);
  }
  await page.screenshot({
    path: `${outputDir}product-${scenario.id}.png`,
    fullPage: true,
  });
}

async function prepareProductShellScenario(page, scenario) {
  if (scenario.shellMode === "desktop-collapsed") {
    const trigger = page.getByRole("button", { name: "사이드바 접기" });
    await trigger.click();
    await page.getByRole("button", { name: "사이드바 펼치기" }).waitFor();
  }
  if (scenario.shellMode === "mobile-open") {
    await page.getByRole("button", { name: "모바일 사이드바 열기" }).click();
    const dialog = page.getByRole("dialog", { name: "제품 탐색" });
    await dialog.waitFor();
    await page.waitForFunction(() => {
      const popup = document.querySelector("[data-slot='dialog-content']");
      return popup instanceof HTMLElement
        && popup.contains(document.activeElement)
        && popup.getBoundingClientRect().width > 0;
    });
  }
}

async function assertProductShellContracts(page, scenario) {
  if (scenario.shellMode === "mobile-open") await assertMobileFocusTrap(page, scenario.id);
  const result = await page.evaluate((mode) => {
    const provider = document.querySelector("[data-slot='sidebar-provider']");
    const inset = document.querySelector("[data-slot='sidebar-inset']");
    const main = document.querySelector("main");
    const navigation = document.querySelector("[data-slot='sidebar-navigation']");
    const menu = document.querySelector("[data-slot='sidebar-menu']");
    const desktopSidebar = document.querySelector("[data-slot='sidebar']");
    const mobileSidebar = document.querySelector("[data-slot='sidebar-mobile']");
    const trigger = document.querySelector("[data-slot='sidebar-trigger']");
    const dialog = document.querySelector("[data-slot='dialog-content']");
    const overlay = document.querySelector("[data-slot='dialog-overlay']");
    const required = [provider, inset, main, navigation, menu, trigger];
    if (required.some((element) => !(element instanceof HTMLElement))) return { missing: true };

    const rect = (element) => {
      const bounds = element.getBoundingClientRect();
      return {
        bottom: bounds.bottom,
        height: bounds.height,
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        width: bounds.width,
      };
    };
    const links = [...menu.querySelectorAll("a[href]")];
    const items = [...menu.children];
    const currentLinks = links.filter((link) => link.getAttribute("aria-current") === "page");
    const motion = [desktopSidebar, mobileSidebar, trigger, dialog, overlay, ...links]
      .filter((element) => element instanceof HTMLElement)
      .map((element) => {
        const style = getComputedStyle(element);
        return {
          animationDuration: style.animationDuration,
          animationName: style.animationName,
          slot: element.getAttribute("data-slot") ?? element.tagName.toLowerCase(),
          transitionDuration: style.transitionDuration,
          transitionProperty: style.transitionProperty,
        };
      });
    const rootStyle = getComputedStyle(document.documentElement);
    return {
      missing: false,
      currentHref: currentLinks[0]?.getAttribute("href") ?? null,
      currentLabel: currentLinks[0]?.textContent?.trim() ?? null,
      currentLinks: currentLinks.length,
      desktopSidebarCount: desktopSidebar ? 1 : 0,
      dialogRect: dialog instanceof HTMLElement ? rect(dialog) : null,
      insetRect: rect(inset),
      itemCount: items.length,
      itemTags: items.map((item) => item.tagName),
      linkCount: links.length,
      linkLabels: links.map((link) => link.getAttribute("aria-label") ?? link.textContent?.trim()),
      mainRect: rect(main),
      mobileSidebarCount: mobileSidebar ? 1 : 0,
      motion,
      navigationLabel: navigation.getAttribute("aria-label"),
      navigationRole: navigation.getAttribute("role") ?? navigation.tagName.toLowerCase(),
      overlayRect: overlay instanceof HTMLElement ? rect(overlay) : null,
      providerRect: rect(provider),
      rootFontSize: Number.parseFloat(rootStyle.fontSize),
      sidebarRect: desktopSidebar instanceof HTMLElement ? rect(desktopSidebar) : null,
      sidebarState: (desktopSidebar ?? mobileSidebar)?.getAttribute("data-state") ?? null,
      sidebarWidthCollapsed: rootStyle.getPropertyValue("--product-sidebar-width-collapsed").trim(),
      sidebarWidthExpanded: rootStyle.getPropertyValue("--product-sidebar-width").trim(),
      sidebarWidthMobile: rootStyle.getPropertyValue("--product-sidebar-width-mobile").trim(),
      triggerControls: trigger.getAttribute("aria-controls"),
      triggerExpanded: trigger.getAttribute("aria-expanded"),
      triggerFocused: document.activeElement === trigger,
      triggerLabel: trigger.getAttribute("aria-label"),
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      mode,
    };
  }, scenario.shellMode);

  if (result.missing) throw new Error(`${scenario.id}: ProductShell fixture is incomplete`);
  if (result.navigationRole !== "nav" || result.navigationLabel !== "주요 메뉴"
    || result.itemCount !== 3 || result.linkCount !== 3
    || result.currentLinks !== 1 || result.currentHref !== "/product"
    || result.currentLabel !== "Home"
    || result.itemTags.some((tag) => tag !== "LI")
    || result.linkLabels.join("|") !== "Home|Issues|Timeline") {
    throw new Error(`${scenario.id}: navigation/list/current semantics failed ${JSON.stringify(result)}`);
  }
  if (result.sidebarWidthExpanded !== "11rem"
    || result.sidebarWidthCollapsed !== "3.5rem"
    || result.sidebarWidthMobile !== "17rem") {
    throw new Error(`${scenario.id}: sidebar token contract changed ${JSON.stringify(result)}`);
  }
  if (!rectContains(result.providerRect, result.insetRect, 1)
    || !rectContains(result.insetRect, result.mainRect, 1)) {
    throw new Error(`${scenario.id}: provider/inset/main containment failed ${JSON.stringify(result)}`);
  }

  if (scenario.shellMode.startsWith("desktop")) {
    const collapsed = scenario.shellMode === "desktop-collapsed";
    const expectedWidth = result.rootFontSize * (collapsed ? 3.5 : 11);
    if (!result.sidebarRect || Math.abs(result.sidebarRect.width - expectedWidth) > 1
      || result.desktopSidebarCount !== 1 || result.mobileSidebarCount !== 0
      || result.sidebarState !== (collapsed ? "collapsed" : "expanded")
      || result.triggerExpanded !== String(!collapsed)
      || result.triggerLabel !== (collapsed ? "사이드바 펼치기" : "사이드바 접기")
      || result.triggerControls !== "product-primary-navigation") {
      throw new Error(`${scenario.id}: desktop sidebar geometry/state failed ${JSON.stringify(result)}`);
    }
    if (collapsed && !result.triggerFocused) {
      throw new Error(`${scenario.id}: collapse action must retain focus on its trigger`);
    }
  } else {
    const expectedWidth = Math.min(result.rootFontSize * 17, result.viewportWidth - result.rootFontSize);
    if (result.desktopSidebarCount !== 0 || result.mobileSidebarCount !== 1
      || !result.dialogRect || Math.abs(result.dialogRect.width - expectedWidth) > 1
      || !result.overlayRect || result.overlayRect.left > 1 || result.overlayRect.top > 1
      || result.overlayRect.width < result.viewportWidth - 1
      || result.overlayRect.height < result.viewportHeight - 1
      || result.triggerLabel !== "모바일 사이드바 닫기"
      || result.triggerExpanded !== "true") {
      throw new Error(`${scenario.id}: mobile dialog geometry/state failed ${JSON.stringify(result)}`);
    }
  }
  for (const motion of result.motion) {
    if (motion.transitionProperty !== "none"
      && maxCssTimeMilliseconds(motion.transitionDuration) > 1) {
      throw new Error(`${scenario.id}: ${motion.slot} reduced-motion transition remains ${motion.transitionDuration}`);
    }
    if (motion.animationName !== "none"
      && maxCssTimeMilliseconds(motion.animationDuration) > 1) {
      throw new Error(`${scenario.id}: ${motion.slot} reduced-motion animation remains ${motion.animationDuration}`);
    }
  }
}

async function assertMobileFocusTrap(page, label) {
  const dialog = page.getByRole("dialog", { name: "제품 탐색" });
  const focusable = dialog.locator("a[href], button:not(:disabled), [tabindex]:not([tabindex='-1'])");
  const count = await focusable.count();
  if (count < 2) throw new Error(`${label}: mobile dialog needs multiple focusable controls`);
  const last = focusable.nth(count - 1);
  await last.focus();
  await page.keyboard.press("Tab");
  const forwardStayedInside = await isInDialogFocusScope(dialog);
  const forwardMoved = !(await last.evaluate(
    (element) => element === document.activeElement,
  ));
  if (!forwardStayedInside || !forwardMoved) {
    throw new Error(`${label}: Tab did not move within the dialog focus trap`);
  }
  const first = focusable.nth(0);
  await first.focus();
  await page.keyboard.press("Shift+Tab");
  const backwardStayedInside = await isInDialogFocusScope(dialog);
  const backwardMoved = !(await first.evaluate(
    (element) => element === document.activeElement,
  ));
  if (!backwardStayedInside || !backwardMoved) {
    throw new Error(`${label}: Shift+Tab did not move within the dialog focus trap`);
  }
}

async function isInDialogFocusScope(dialog) {
  return dialog.evaluate((element) => {
    const active = document.activeElement;
    return element.contains(active)
      || (active instanceof HTMLElement && active.hasAttribute("data-base-ui-focus-guard"));
  });
}

async function assertProductShellForcedColors(page, label) {
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  const result = await page.evaluate(() => {
    const sidebar = document.querySelector("[data-slot='sidebar']");
    const trigger = document.querySelector("[data-slot='sidebar-trigger']");
    const current = document.querySelector("[data-slot='sidebar-menu-button'][aria-current='page'], [data-slot='sidebar-menu-link'][aria-current='page']");
    if (!(sidebar instanceof HTMLElement)
      || !(trigger instanceof HTMLElement)
      || !(current instanceof HTMLElement)) return { missing: true };
    const sidebarStyle = getComputedStyle(sidebar);
    const triggerStyle = getComputedStyle(trigger);
    const currentStyle = getComputedStyle(current);
    return {
      missing: false,
      active: matchMedia("(forced-colors: active)").matches,
      currentBackground: currentStyle.backgroundColor,
      currentColor: currentStyle.color,
      currentOpacity: Number.parseFloat(currentStyle.opacity),
      sidebarBackground: sidebarStyle.backgroundColor,
      sidebarBorderColor: sidebarStyle.borderRightColor,
      sidebarBorderStyle: sidebarStyle.borderRightStyle,
      sidebarBorderWidth: Number.parseFloat(sidebarStyle.borderRightWidth),
      triggerFocused: document.activeElement === trigger,
      triggerOpacity: Number.parseFloat(triggerStyle.opacity),
      triggerOutlineColor: triggerStyle.outlineColor,
      triggerOutlineStyle: triggerStyle.outlineStyle,
      triggerOutlineWidth: Number.parseFloat(triggerStyle.outlineWidth),
    };
  });
  if (result.missing || !result.active || !result.triggerFocused
    || result.sidebarBorderStyle === "none" || result.sidebarBorderWidth < 1
    || result.triggerOutlineStyle === "none" || result.triggerOutlineWidth < 2
    || result.currentOpacity !== 1 || result.triggerOpacity !== 1
    || result.currentBackground === result.sidebarBackground) {
    throw new Error(`${label}: forced-colors sidebar state is not preserved ${JSON.stringify(result)}`);
  }
  assertContrast(label, "sidebar border", result.sidebarBorderColor, result.sidebarBackground, 3);
  assertContrast(label, "sidebar trigger focus", result.triggerOutlineColor, result.sidebarBackground, 3);
  assertContrast(
    label,
    "current navigation",
    result.currentColor,
    result.currentBackground,
    4.5,
    result.sidebarBackground,
  );
}

async function assertStatePrimitiveContracts(page, label) {
  await page.waitForFunction(() => {
    const viewport = document.querySelector("[data-slot='scroll-area-viewport']");
    const scrollbar = document.querySelector("[data-slot='scroll-area-scrollbar']");
    const thumb = document.querySelector("[data-slot='scroll-area-thumb']");
    if (!(viewport instanceof HTMLElement)
      || !(scrollbar instanceof HTMLElement)
      || !(thumb instanceof HTMLElement)) return false;
    const scrollbarRect = scrollbar.getBoundingClientRect();
    const thumbRect = thumb.getBoundingClientRect();
    return viewport.hasAttribute("data-has-overflow-y")
      && scrollbar.hasAttribute("data-has-overflow-y")
      && viewport.tabIndex === 0
      && scrollbarRect.width > 0
      && scrollbarRect.height > 0
      && thumbRect.width > 0
      && thumbRect.height > 0;
  });

  const result = await page.evaluate(() => {
    const item = document.querySelector("[data-visual-disabled-item]");
    const viewport = document.querySelector("[data-slot='scroll-area-viewport']");
    const scrollbar = document.querySelector("[data-slot='scroll-area-scrollbar']");
    const thumb = document.querySelector("[data-slot='scroll-area-thumb']");
    if (!(item instanceof HTMLButtonElement)
      || !(viewport instanceof HTMLElement)
      || !(scrollbar instanceof HTMLElement)
      || !(thumb instanceof HTMLElement)) return { missing: true };

    const itemStyle = getComputedStyle(item);
    const viewportStyle = getComputedStyle(viewport);
    const scrollbarStyle = getComputedStyle(scrollbar);
    const scrollbarRect = scrollbar.getBoundingClientRect();
    const thumbRect = thumb.getBoundingClientRect();
    return {
      missing: false,
      itemDisabled: item.disabled,
      itemTransitionDuration: itemStyle.transitionDuration,
      itemTransitionProperty: itemStyle.transitionProperty,
      scrollbarDisplay: scrollbarStyle.display,
      scrollbarHasOverflowY: scrollbar.hasAttribute("data-has-overflow-y"),
      scrollbarHeight: scrollbarRect.height,
      scrollbarTransitionDuration: scrollbarStyle.transitionDuration,
      scrollbarTransitionProperty: scrollbarStyle.transitionProperty,
      scrollbarVisibility: scrollbarStyle.visibility,
      scrollbarWidth: scrollbarRect.width,
      thumbHeight: thumbRect.height,
      thumbWidth: thumbRect.width,
      viewportClientHeight: viewport.clientHeight,
      viewportHasOverflowY: viewport.hasAttribute("data-has-overflow-y"),
      viewportScrollHeight: viewport.scrollHeight,
      viewportTabIndex: viewport.tabIndex,
      viewportTransitionDuration: viewportStyle.transitionDuration,
      viewportTransitionProperty: viewportStyle.transitionProperty,
    };
  });

  if (result.missing) throw new Error(`${label}: Item or ScrollArea visual fixture is missing`);
  if (!result.itemDisabled) throw new Error(`${label}: Item fixture must be a disabled button`);
  if (!result.viewportHasOverflowY
    || !result.scrollbarHasOverflowY
    || result.viewportTabIndex !== 0
    || result.viewportScrollHeight <= result.viewportClientHeight + 1) {
    throw new Error(
      `${label}: ScrollArea must expose real vertical overflow and a keyboard viewport `
      + JSON.stringify(result),
    );
  }
  if (result.scrollbarDisplay === "none"
    || result.scrollbarVisibility === "hidden"
    || result.scrollbarWidth < 1
    || result.scrollbarHeight < 1
    || result.thumbWidth < 1
    || result.thumbHeight < 1
    || result.thumbHeight >= result.scrollbarHeight) {
    throw new Error(
      `${label}: ScrollArea scrollbar and thumb need visible overflow geometry `
      + JSON.stringify(result),
    );
  }
  for (const [name, property, duration] of [
    ["Item", result.itemTransitionProperty, result.itemTransitionDuration],
    ["ScrollArea viewport", result.viewportTransitionProperty, result.viewportTransitionDuration],
    ["ScrollArea scrollbar", result.scrollbarTransitionProperty, result.scrollbarTransitionDuration],
  ]) {
    if (property !== "none" && maxCssTimeMilliseconds(duration) > 1) {
      throw new Error(`${label}: ${name} reduced-motion transition remains ${duration}`);
    }
  }
}

async function assertInteractionPrimitiveContracts(page, label) {
  await page.waitForFunction(() => {
    const horizontal = document.querySelector("[data-visual-button-group='horizontal']");
    const vertical = document.querySelector("[data-visual-button-group='vertical']");
    const defaultTabs = document.querySelector("[data-visual-tabs='default']");
    const lineTabs = document.querySelector("[data-visual-tabs='line']");
    const defaultContent = document.querySelector("[data-visual-tabs-content='default']");
    const lineContent = document.querySelector("[data-visual-tabs-content='line']");
    return horizontal instanceof HTMLElement
      && vertical instanceof HTMLElement
      && defaultTabs instanceof HTMLElement
      && lineTabs instanceof HTMLElement
      && defaultContent instanceof HTMLElement
      && lineContent instanceof HTMLElement
      && defaultContent.getBoundingClientRect().height > 0
      && lineContent.getBoundingClientRect().height > 0;
  });

  const result = await page.evaluate(() => {
    const horizontal = document.querySelector("[data-visual-button-group='horizontal']");
    const vertical = document.querySelector("[data-visual-button-group='vertical']");
    const defaultTabs = document.querySelector("[data-visual-tabs='default']");
    const lineTabs = document.querySelector("[data-visual-tabs='line']");
    const defaultList = document.querySelector("[data-visual-tabs-list='default']");
    const lineList = document.querySelector("[data-visual-tabs-list='line']");
    const defaultActive = document.querySelector("[data-visual-tabs-active='default']");
    const defaultFocus = document.querySelector("[data-visual-tabs-focus]");
    const defaultDisabled = document.querySelector("[data-visual-tabs-disabled]");
    const lineActive = document.querySelector("[data-visual-tabs-active='line']");
    const lineInactive = lineList?.querySelector("[data-slot='tabs-trigger']:not([data-active]):not(:disabled)");
    const defaultContent = document.querySelector("[data-visual-tabs-content='default']");
    const lineContent = document.querySelector("[data-visual-tabs-content='line']");
    const required = [
      horizontal,
      vertical,
      defaultTabs,
      lineTabs,
      defaultList,
      lineList,
      defaultActive,
      defaultFocus,
      defaultDisabled,
      lineActive,
      lineInactive,
      defaultContent,
      lineContent,
    ];
    if (required.some((element) => !(element instanceof HTMLElement))) {
      return { missing: true };
    }

    const horizontalChildren = [...horizontal.children].filter(
      (element) => element instanceof HTMLElement,
    );
    const verticalChildren = [...vertical.children].filter(
      (element) => element instanceof HTMLElement,
    );
    if (horizontalChildren.length !== 4 || verticalChildren.length !== 4) {
      return { missing: true };
    }

    const rect = (element) => {
      const bounds = element.getBoundingClientRect();
      return {
        bottom: bounds.bottom,
        height: bounds.height,
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        width: bounds.width,
      };
    };
    const motionTargets = [
      ...horizontalChildren,
      ...verticalChildren,
      defaultList,
      lineList,
      defaultActive,
      defaultFocus,
      defaultDisabled,
      lineActive,
      lineInactive,
      defaultContent,
      lineContent,
    ];
    const motion = motionTargets.map((element) => {
      const style = getComputedStyle(element);
      return {
        animationDuration: style.animationDuration,
        animationName: style.animationName,
        slot: element.getAttribute("data-slot") ?? element.tagName.toLowerCase(),
        transitionDuration: style.transitionDuration,
        transitionProperty: style.transitionProperty,
      };
    });
    const horizontalSecondStyle = getComputedStyle(horizontalChildren[1]);
    const verticalSecondStyle = getComputedStyle(verticalChildren[1]);
    const lineActiveIndicatorStyle = getComputedStyle(lineActive, "::after");
    const lineInactiveIndicatorStyle = getComputedStyle(lineInactive, "::after");
    motion.push({
      animationDuration: lineActiveIndicatorStyle.animationDuration,
      animationName: lineActiveIndicatorStyle.animationName,
      slot: "tabs-trigger::after",
      transitionDuration: lineActiveIndicatorStyle.transitionDuration,
      transitionProperty: lineActiveIndicatorStyle.transitionProperty,
    });

    return {
      missing: false,
      defaultActiveData: defaultActive.hasAttribute("data-active"),
      defaultActiveSelected: defaultActive.getAttribute("aria-selected"),
      defaultContentRole: defaultContent.getAttribute("role"),
      defaultContentVisible: defaultContent.getBoundingClientRect().height > 0
        && !defaultContent.hidden,
      defaultDisabled: defaultDisabled instanceof HTMLButtonElement
        && (defaultDisabled.disabled || defaultDisabled.getAttribute("aria-disabled") === "true"),
      defaultListLabel: defaultList.getAttribute("aria-label"),
      defaultListRole: defaultList.getAttribute("role"),
      defaultListVariant: defaultList.getAttribute("data-variant"),
      defaultListRect: rect(defaultList),
      defaultRootOrientation: defaultTabs.getAttribute("data-orientation"),
      defaultTriggerRects: [...defaultList.querySelectorAll("[data-slot='tabs-trigger']")].map(rect),
      horizontalLabel: horizontal.getAttribute("aria-label"),
      horizontalOrientation: horizontal.getAttribute("data-orientation"),
      horizontalRects: horizontalChildren.map(rect),
      horizontalRole: horizontal.getAttribute("role"),
      horizontalRootRect: rect(horizontal),
      horizontalSeparatorOrientation: horizontalChildren[1].getAttribute("aria-orientation"),
      horizontalSecondBorderLeftWidth: Number.parseFloat(horizontalSecondStyle.borderLeftWidth),
      lineActiveData: lineActive.hasAttribute("data-active"),
      lineActiveIndicatorBackground: lineActiveIndicatorStyle.backgroundColor,
      lineActiveIndicatorHeight: Number.parseFloat(lineActiveIndicatorStyle.height),
      lineActiveIndicatorOpacity: Number.parseFloat(lineActiveIndicatorStyle.opacity),
      lineActiveIndicatorWidth: Number.parseFloat(lineActiveIndicatorStyle.width),
      lineActiveSelected: lineActive.getAttribute("aria-selected"),
      lineContentRole: lineContent.getAttribute("role"),
      lineContentVisible: lineContent.getBoundingClientRect().height > 0 && !lineContent.hidden,
      lineInactiveIndicatorBackground: lineInactiveIndicatorStyle.backgroundColor,
      lineInactiveIndicatorOpacity: Number.parseFloat(lineInactiveIndicatorStyle.opacity),
      lineListLabel: lineList.getAttribute("aria-label"),
      lineListRole: lineList.getAttribute("role"),
      lineListVariant: lineList.getAttribute("data-variant"),
      lineListRect: rect(lineList),
      lineRootOrientation: lineTabs.getAttribute("data-orientation"),
      lineTriggerRects: [...lineList.querySelectorAll("[data-slot='tabs-trigger']")].map(rect),
      motion,
      verticalLabel: vertical.getAttribute("aria-label"),
      verticalOrientation: vertical.getAttribute("data-orientation"),
      verticalRects: verticalChildren.map(rect),
      verticalRole: vertical.getAttribute("role"),
      verticalRootRect: rect(vertical),
      verticalSeparatorOrientation: verticalChildren[1].getAttribute("aria-orientation"),
      verticalSecondBorderTopWidth: Number.parseFloat(verticalSecondStyle.borderTopWidth),
    };
  });

  if (result.missing) {
    throw new Error(`${label}: ButtonGroup or Tabs visual fixture is missing`);
  }
  if (result.horizontalRole !== "group"
    || result.horizontalLabel !== "기간 선택"
    || result.horizontalOrientation !== "horizontal"
    || result.horizontalSeparatorOrientation !== "vertical"
    || result.verticalRole !== "group"
    || result.verticalLabel !== "표시 방식"
    || result.verticalOrientation !== "vertical"
    || result.verticalSeparatorOrientation !== "horizontal") {
    throw new Error(`${label}: ButtonGroup semantics are incomplete ${JSON.stringify(result)}`);
  }
  for (const [name, rootRect, childRects] of [
    ["horizontal ButtonGroup", result.horizontalRootRect, result.horizontalRects],
    ["vertical ButtonGroup", result.verticalRootRect, result.verticalRects],
    ["default TabsList", result.defaultListRect, result.defaultTriggerRects],
    ["line TabsList", result.lineListRect, result.lineTriggerRects],
  ]) {
    for (const childRect of childRects) {
      if (!rectContains(rootRect, childRect, 1)) {
        throw new Error(`${label}: ${name} does not contain child geometry ${JSON.stringify({ childRect, rootRect })}`);
      }
    }
  }
  for (let index = 1; index < result.horizontalRects.length; index += 1) {
    const previous = result.horizontalRects[index - 1];
    const current = result.horizontalRects[index];
    if (Math.abs(previous.right - current.left) > 1) {
      throw new Error(`${label}: horizontal ButtonGroup is not edge-joined ${JSON.stringify(result.horizontalRects)}`);
    }
  }
  for (let index = 1; index < result.verticalRects.length; index += 1) {
    const previous = result.verticalRects[index - 1];
    const current = result.verticalRects[index];
    if (Math.abs(previous.bottom - current.top) > 1) {
      throw new Error(`${label}: vertical ButtonGroup is not edge-joined ${JSON.stringify(result.verticalRects)}`);
    }
  }
  if (result.horizontalSecondBorderLeftWidth > 0.1
    || result.verticalSecondBorderTopWidth > 0.1) {
    throw new Error(`${label}: ButtonGroup adjacent borders were not collapsed ${JSON.stringify(result)}`);
  }
  if (result.defaultListRole !== "tablist"
    || result.defaultListLabel !== "기본 리소스 탭"
    || result.defaultListVariant !== "default"
    || result.defaultRootOrientation !== "horizontal"
    || result.defaultActiveSelected !== "true"
    || !result.defaultActiveData
    || !result.defaultDisabled
    || result.defaultContentRole !== "tabpanel"
    || !result.defaultContentVisible) {
    throw new Error(`${label}: default Tabs state contract failed ${JSON.stringify(result)}`);
  }
  if (result.lineListRole !== "tablist"
    || result.lineListLabel !== "선형 트래픽 탭"
    || result.lineListVariant !== "line"
    || result.lineRootOrientation !== "horizontal"
    || result.lineActiveSelected !== "true"
    || !result.lineActiveData
    || result.lineContentRole !== "tabpanel"
    || !result.lineContentVisible
    || result.lineActiveIndicatorOpacity < 0.99
    || result.lineInactiveIndicatorOpacity > 0.01
    || result.lineActiveIndicatorHeight < 1
    || result.lineActiveIndicatorWidth < 1) {
    throw new Error(`${label}: line Tabs visual distinction failed ${JSON.stringify(result)}`);
  }
  for (const motion of result.motion) {
    if (motion.transitionProperty !== "none"
      && maxCssTimeMilliseconds(motion.transitionDuration) > 1) {
      throw new Error(
        `${label}: ${motion.slot} reduced-motion transition remains ${motion.transitionDuration}`,
      );
    }
    if (motion.animationName !== "none"
      && maxCssTimeMilliseconds(motion.animationDuration) > 1) {
      throw new Error(
        `${label}: ${motion.slot} reduced-motion animation remains ${motion.animationDuration}`,
      );
    }
  }
}

function rectContains(outer, inner, tolerance = 0) {
  return inner.left >= outer.left - tolerance
    && inner.right <= outer.right + tolerance
    && inner.top >= outer.top - tolerance
    && inner.bottom <= outer.bottom + tolerance;
}

function maxCssTimeMilliseconds(value) {
  return Math.max(...value.split(",").map((part) => {
    const token = part.trim();
    if (token.endsWith("ms")) return Number.parseFloat(token);
    if (token.endsWith("s")) return Number.parseFloat(token) * 1_000;
    return Number.POSITIVE_INFINITY;
  }));
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
  const result = await page.evaluate(({ required, scenarioId }) => {
    const ignoreShellOutletText = scenarioId.startsWith("shell-mobile-")
      || scenarioId.startsWith("shell-text-resize-");
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
    let checkedVisibleDisabled = 0;

    for (const element of document.querySelectorAll([...selectors].join(","))) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (ignoreShellOutletText && element.closest("[data-shell-harness-outlet]")) continue;
      if (element.closest(".sr-only")) continue;
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
      const isInteractionDisabled = element.matches(":disabled,[aria-disabled='true']");
      const isLayoutSuppressed = element.matches("[hidden]")
        || Boolean(element.closest("[aria-hidden='true'],[inert]"))
        || style.display === "none"
        || style.visibility === "hidden";
      const isFocusSuppressed = isInteractionDisabled || isLayoutSuppressed;
      if (isInteractionDisabled && !isLayoutSuppressed) checkedVisibleDisabled += 1;
      let acceptsFocus = false;
      if (exemption !== null && !isFocusSuppressed && element.tabIndex >= 0) {
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
        || isFocusSuppressed
        || !acceptsFocus
        || !hasAccessibleName
      )) {
        violations.push(
          `${element.tagName.toLowerCase()} invalid reflow exemption: reason=${JSON.stringify(exemption)} overflow-x=${style.overflowX} tabIndex=${element.tabIndex} focus=${acceptsFocus} named=${hasAccessibleName} focus-suppressed=${isFocusSuppressed}`,
        );
      }
      if (isLayoutSuppressed) continue;
      if (exemption === null && ownOverflow > 1) {
        violations.push(`${element.tagName.toLowerCase()} own overflow ${ownOverflow}px`);
      }
      if (rect.left < -1 || rect.right > viewportWidth + 1) {
        violations.push(
          `${element.tagName.toLowerCase()} viewport bounds ${rect.left.toFixed(1)}..${rect.right.toFixed(1)}`,
        );
      }
    }

    return { checkedVisibleDisabled, documentOverflow, missingSelectors, violations };
  }, { required: requiredSelectors, scenarioId: label });

  if (result.missingSelectors.length) {
    throw new Error(`${label}: required reflow selectors are missing\n${result.missingSelectors.join("\n")}`);
  }
  if (label.startsWith("state-") && result.checkedVisibleDisabled < 1) {
    throw new Error(`${label}: visual gate did not inspect a visible disabled element`);
  }
  if (result.documentOverflow > 1 || result.violations.length) {
    throw new Error(
      `${label} reflow failure: document=${result.documentOverflow}px\n${result.violations.join("\n")}`,
    );
  }
}

async function assertAuthForcedColors(page, label) {
  const result = await page.evaluate(() => {
    const main = document.querySelector("main");
    const card = document.querySelector("[data-slot='card']");
    const heading = document.querySelector("h1");
    const email = document.querySelector("#product-auth-email");
    const password = document.querySelector("#product-auth-password");
    const submit = document.querySelector("form [data-slot='button']");
    if (!(main instanceof HTMLElement)
      || !(card instanceof HTMLElement)
      || !(heading instanceof HTMLElement)
      || !(email instanceof HTMLInputElement)
      || !(password instanceof HTMLInputElement)
      || !(submit instanceof HTMLButtonElement)) {
      return { missing: true };
    }

    email.focus();
    const mainStyle = getComputedStyle(main);
    const cardStyle = getComputedStyle(card);
    const headingStyle = getComputedStyle(heading);
    const emailStyle = getComputedStyle(email);
    const passwordStyle = getComputedStyle(password);
    const submitStyle = getComputedStyle(submit);
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    return {
      missing: false,
      active: matchMedia("(forced-colors: active)").matches,
      cardVisible: visible(card),
      emailBackground: emailStyle.backgroundColor,
      emailBorderStyle: emailStyle.borderTopStyle,
      emailBorderWidth: Number.parseFloat(emailStyle.borderTopWidth),
      emailColor: emailStyle.color,
      emailFocused: document.activeElement === email,
      emailOpacity: Number.parseFloat(emailStyle.opacity),
      emailOutlineColor: emailStyle.outlineColor,
      emailOutlineStyle: emailStyle.outlineStyle,
      emailOutlineWidth: Number.parseFloat(emailStyle.outlineWidth),
      emailVisible: visible(email),
      headingColor: headingStyle.color,
      headingOpacity: Number.parseFloat(headingStyle.opacity),
      headingVisible: visible(heading),
      mainBackground: mainStyle.backgroundColor,
      passwordBorderStyle: passwordStyle.borderTopStyle,
      passwordBorderWidth: Number.parseFloat(passwordStyle.borderTopWidth),
      passwordVisible: visible(password),
      submitBackground: submitStyle.backgroundColor,
      submitBorderStyle: submitStyle.borderTopStyle,
      submitBorderWidth: Number.parseFloat(submitStyle.borderTopWidth),
      submitColor: submitStyle.color,
      submitOpacity: Number.parseFloat(submitStyle.opacity),
      submitVisible: visible(submit),
      cardBackground: cardStyle.backgroundColor,
    };
  });

  if (result.missing || !result.active
    || !result.cardVisible || !result.headingVisible
    || !result.emailVisible || !result.passwordVisible || !result.submitVisible
    || !result.emailFocused) {
    throw new Error(`${label}: forced-colors login surface is incomplete ${JSON.stringify(result)}`);
  }
  if (result.emailBorderStyle === "none" || result.emailBorderWidth < 1
    || result.passwordBorderStyle === "none" || result.passwordBorderWidth < 1
    || result.emailOutlineStyle === "none" || result.emailOutlineWidth < 2) {
    throw new Error(`${label}: forced-colors login borders or focus are missing ${JSON.stringify(result)}`);
  }
  if (Math.abs(result.emailOpacity - 1) > 0.001
    || Math.abs(result.headingOpacity - 1) > 0.001
    || Math.abs(result.submitOpacity - 1) > 0.001) {
    throw new Error(`${label}: forced-colors login controls use group opacity ${JSON.stringify(result)}`);
  }
  assertContrast(label, "login heading", result.headingColor, result.mainBackground, 4.5);
  assertContrast(label, "login input", result.emailColor, result.emailBackground, 4.5);
  assertContrast(label, "login input focus", result.emailOutlineColor, result.emailBackground, 3);
  assertContrast(label, "login action", result.submitColor, result.submitBackground, 4.5);
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
      disabledItem: document.querySelector("[data-visual-disabled-item]"),
      disabledItemTitle: document.querySelector(
        "[data-visual-disabled-item] [data-slot='item-title']",
      ),
      disabledItemDescription: document.querySelector(
        "[data-visual-disabled-item] [data-slot='item-description']",
      ),
      scrollArea: document.querySelector("[data-visual-scroll-area]"),
      scrollViewport: document.querySelector("[data-slot='scroll-area-viewport']"),
      scrollBar: document.querySelector("[data-slot='scroll-area-scrollbar']"),
      scrollThumb: document.querySelector("[data-slot='scroll-area-thumb']"),
      completeProgressIndicator: document.querySelector(
        "[data-visual-progress='complete'] [data-slot='progress-indicator']",
      ),
      completeProgressTrack: document.querySelector(
        "[data-visual-progress='complete'] [data-slot='progress-track']",
      ),
      indeterminateProgressIndicator: document.querySelector(
        "[data-visual-progress='indeterminate'] [data-slot='progress-indicator']",
      ),
      tabsActive: document.querySelector("[data-visual-tabs-active='default']"),
      tabsFocus: document.querySelector("[data-visual-tabs-focus]"),
      tabsDisabled: document.querySelector("[data-visual-tabs-disabled]"),
      groupFocus: document.querySelector("[data-visual-button-group-focus]"),
      groupDisabled: document.querySelector(
        "[data-visual-button-group='horizontal'] [data-slot='button']:disabled",
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
      disabledItem,
      disabledItemTitle,
      disabledItemDescription,
      scrollArea,
      scrollViewport,
      scrollBar,
      scrollThumb,
      completeProgressIndicator,
      completeProgressTrack,
      indeterminateProgressIndicator,
      tabsActive,
      tabsFocus,
      tabsDisabled,
      groupFocus,
      groupDisabled,
    } = elements;
    focusTarget.focus();
    const emptyStyle = getComputedStyle(empty);
    const surfaceStyle = getComputedStyle(surface);
    const badgeStyle = getComputedStyle(badge);
    const alertStyle = getComputedStyle(alert);
    const headingStyle = getComputedStyle(heading);
    const focusStyle = getComputedStyle(focusTarget);
    const focusOutlineColor = focusStyle.outlineColor;
    const focusOutlineStyle = focusStyle.outlineStyle;
    const focusOutlineWidth = Number.parseFloat(focusStyle.outlineWidth);
    const disabledStyle = getComputedStyle(disabledButton);
    const disabledItemStyle = getComputedStyle(disabledItem);
    const disabledItemTitleStyle = getComputedStyle(disabledItemTitle);
    const disabledItemDescriptionStyle = getComputedStyle(disabledItemDescription);
    const scrollAreaStyle = getComputedStyle(scrollArea);
    const scrollViewportStyle = getComputedStyle(scrollViewport);
    const scrollBarStyle = getComputedStyle(scrollBar);
    const scrollThumbStyle = getComputedStyle(scrollThumb);
    const scrollBarRect = scrollBar.getBoundingClientRect();
    const scrollThumbRect = scrollThumb.getBoundingClientRect();
    const completeProgressStyle = getComputedStyle(completeProgressIndicator);
    const completeProgressTrackStyle = getComputedStyle(completeProgressTrack);
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

    const tabsActiveStyle = getComputedStyle(tabsActive);
    const tabsDisabledStyle = getComputedStyle(tabsDisabled);
    const groupDisabledStyle = getComputedStyle(groupDisabled);
    tabsFocus.focus();
    const tabsFocusStyle = getComputedStyle(tabsFocus);
    const tabsFocusOutline = {
      color: tabsFocusStyle.outlineColor,
      style: tabsFocusStyle.outlineStyle,
      width: Number.parseFloat(tabsFocusStyle.outlineWidth),
    };
    groupFocus.focus();
    const groupFocusStyle = getComputedStyle(groupFocus);
    const groupFocusOutline = {
      color: groupFocusStyle.outlineColor,
      style: groupFocusStyle.outlineStyle,
      width: Number.parseFloat(groupFocusStyle.outlineWidth),
    };

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
      focusOutlineColor,
      focusOpacity: effectiveOpacity(focusTarget),
      focusOutlineStyle,
      focusOutlineWidth,
      disabledBackground: effectiveBackground(disabledButton),
      disabledColor: disabledStyle.color,
      disabledOpacity: effectiveOpacity(disabledButton),
      disabledVisible: disabledButton.getBoundingClientRect().width > 0,
      disabledItemBackground: effectiveBackground(disabledItem),
      disabledItemBorderColor: disabledItemStyle.borderTopColor,
      disabledItemBorderStyle: disabledItemStyle.borderTopStyle,
      disabledItemBorderWidth: Number.parseFloat(disabledItemStyle.borderTopWidth),
      disabledItemDescriptionColor: disabledItemDescriptionStyle.color,
      disabledItemOpacity: effectiveOpacity(disabledItem),
      disabledItemTitleColor: disabledItemTitleStyle.color,
      disabledItemVisible: disabledItem.getBoundingClientRect().width > 0,
      scrollAreaBackground: effectiveBackground(scrollArea),
      scrollAreaBorderColor: scrollAreaStyle.borderTopColor,
      scrollAreaBorderStyle: scrollAreaStyle.borderTopStyle,
      scrollAreaBorderWidth: Number.parseFloat(scrollAreaStyle.borderTopWidth),
      scrollAreaOpacity: effectiveOpacity(scrollArea),
      scrollBarBackground: effectiveBackground(scrollBar),
      scrollBarBorderColor: scrollBarStyle.borderTopColor,
      scrollBarBorderStyle: scrollBarStyle.borderTopStyle,
      scrollBarBorderWidth: Number.parseFloat(scrollBarStyle.borderTopWidth),
      scrollBarDisplay: scrollBarStyle.display,
      scrollBarHasOverflowY: scrollBar.hasAttribute("data-has-overflow-y"),
      scrollBarHeight: scrollBarRect.height,
      scrollBarOpacity: effectiveOpacity(scrollBar),
      scrollBarVisibility: scrollBarStyle.visibility,
      scrollBarWidth: scrollBarRect.width,
      scrollThumbBackground: scrollThumbStyle.backgroundColor,
      scrollThumbHeight: scrollThumbRect.height,
      scrollThumbOpacity: effectiveOpacity(scrollThumb),
      scrollThumbWidth: scrollThumbRect.width,
      scrollViewportHasOverflowY: scrollViewport.hasAttribute("data-has-overflow-y"),
      scrollViewportOpacity: effectiveOpacity(scrollViewport),
      scrollViewportOverflowY: scrollViewportStyle.overflowY,
      scrollViewportTabIndex: scrollViewport.tabIndex,
      completeProgressWidth: completeProgressIndicator.getBoundingClientRect().width,
      indeterminateProgressAnimationName: indeterminateProgressStyle.animationName,
      indeterminateProgressBackgroundClip: indeterminateProgressStyle.backgroundClip,
      indeterminateProgressBorderColor: indeterminateProgressStyle.borderTopColor,
      indeterminateProgressBorderStyle: indeterminateProgressStyle.borderTopStyle,
      indeterminateProgressBorderWidth: Number.parseFloat(indeterminateProgressStyle.borderTopWidth),
      indeterminateProgressOpacity: effectiveOpacity(indeterminateProgressIndicator),
      indeterminateProgressWidth: indeterminateProgressIndicator.getBoundingClientRect().width,
      progressTrackWidth: completeProgressIndicator.parentElement?.getBoundingClientRect().width ?? 0,
      progressTrackBackground: effectiveBackground(completeProgressTrack),
      progressTrackBorderColor: completeProgressTrackStyle.borderTopColor,
      progressTrackBorderStyle: completeProgressTrackStyle.borderTopStyle,
      progressTrackBorderWidth: Number.parseFloat(completeProgressTrackStyle.borderTopWidth),
      progressTrackOpacity: effectiveOpacity(completeProgressTrack),
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
      tabsActiveBackground: effectiveBackground(tabsActive),
      tabsActiveColor: tabsActiveStyle.color,
      tabsActiveOpacity: effectiveOpacity(tabsActive),
      tabsDisabledBackground: effectiveBackground(tabsDisabled),
      tabsDisabledBorderColor: tabsDisabledStyle.borderTopColor,
      tabsDisabledBorderStyle: tabsDisabledStyle.borderTopStyle,
      tabsDisabledBorderWidth: Number.parseFloat(tabsDisabledStyle.borderTopWidth),
      tabsDisabledColor: tabsDisabledStyle.color,
      tabsDisabledOpacity: effectiveOpacity(tabsDisabled),
      tabsFocusBackground: effectiveBackground(tabsFocus),
      tabsFocusOutlineColor: tabsFocusOutline.color,
      tabsFocusOutlineStyle: tabsFocusOutline.style,
      tabsFocusOutlineWidth: tabsFocusOutline.width,
      groupDisabledBackground: effectiveBackground(groupDisabled),
      groupDisabledBorderColor: groupDisabledStyle.borderTopColor,
      groupDisabledBorderStyle: groupDisabledStyle.borderTopStyle,
      groupDisabledBorderWidth: Number.parseFloat(groupDisabledStyle.borderTopWidth),
      groupDisabledColor: groupDisabledStyle.color,
      groupDisabledOpacity: effectiveOpacity(groupDisabled),
      groupFocusBackground: effectiveBackground(groupFocus),
      groupFocusOutlineColor: groupFocusOutline.color,
      groupFocusOutlineStyle: groupFocusOutline.style,
      groupFocusOutlineWidth: groupFocusOutline.width,
    };
  });

  if (result.missing) throw new Error(`${label}: required forced-colors elements are missing`);
  if (!result.active) throw new Error(`${label}: forced-colors media query is not active`);
  const opacityChecks = {
    alert: result.alertOpacity,
    badge: result.badgeOpacity,
    disabled: result.disabledOpacity,
    disabledItem: result.disabledItemOpacity,
    groupDisabled: result.groupDisabledOpacity,
    empty: result.emptyOpacity,
    focus: result.focusOpacity,
    heading: result.headingOpacity,
    indeterminateProgress: result.indeterminateProgressOpacity,
    progressTrack: result.progressTrackOpacity,
    selection: result.selectionOpacity,
    scrollArea: result.scrollAreaOpacity,
    scrollBar: result.scrollBarOpacity,
    scrollThumb: result.scrollThumbOpacity,
    scrollViewport: result.scrollViewportOpacity,
    status: result.markerOpacity,
    surface: result.surfaceOpacity,
    tabsActive: result.tabsActiveOpacity,
    tabsDisabled: result.tabsDisabledOpacity,
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
  assertContrast(
    label,
    "disabled Item title",
    result.disabledItemTitleColor,
    result.disabledItemBackground,
    3,
  );
  assertContrast(
    label,
    "disabled Item description",
    result.disabledItemDescriptionColor,
    result.disabledItemBackground,
    3,
  );
  assertContrast(
    label,
    "disabled Item border",
    result.disabledItemBorderColor,
    result.disabledItemBackground,
    3,
  );
  assertContrast(
    label,
    "ScrollArea border",
    result.scrollAreaBorderColor,
    result.scrollAreaBackground,
    3,
  );
  assertContrast(
    label,
    "ScrollArea scrollbar border",
    result.scrollBarBorderColor,
    result.scrollBarBackground,
    3,
  );
  assertContrast(
    label,
    "ScrollArea thumb",
    result.scrollThumbBackground,
    result.scrollBarBackground,
    3,
  );
  assertContrast(label, "status marker", result.markerBorderColor, result.markerBackground, 3);
  assertContrast(
    label,
    "progress track border",
    result.progressTrackBorderColor,
    result.progressTrackBackground,
    3,
  );
  assertContrast(
    label,
    "indeterminate progress border",
    result.indeterminateProgressBorderColor,
    result.progressTrackBackground,
    3,
  );
  assertContrast(
    label,
    "selection",
    result.selectionColor,
    result.selectionBackground,
    4.5,
    result.selectionUnderlay,
  );
  for (const [name, foreground, background, minimum] of [
    ["Tabs active text", result.tabsActiveColor, result.tabsActiveBackground, 4.5],
    ["Tabs focus outline", result.tabsFocusOutlineColor, result.tabsFocusBackground, 3],
    ["Tabs disabled text", result.tabsDisabledColor, result.tabsDisabledBackground, 3],
    ["Tabs disabled border", result.tabsDisabledBorderColor, result.tabsDisabledBackground, 3],
    ["ButtonGroup focus outline", result.groupFocusOutlineColor, result.groupFocusBackground, 3],
    ["ButtonGroup disabled text", result.groupDisabledColor, result.groupDisabledBackground, 3],
    ["ButtonGroup disabled border", result.groupDisabledBorderColor, result.groupDisabledBackground, 3],
  ]) {
    assertContrast(label, name, foreground, background, minimum);
  }
  if (!result.headingVisible
    || !result.disabledVisible
    || !result.disabledItemVisible
    || !result.statusText) {
    throw new Error(`${label}: forced-colors text or controls are not visible`);
  }
  if (!result.scrollViewportHasOverflowY
    || !result.scrollBarHasOverflowY
    || result.scrollViewportTabIndex !== 0
    || result.scrollBarDisplay === "none"
    || result.scrollBarVisibility === "hidden"
    || result.scrollBarWidth < 1
    || result.scrollBarHeight < 1
    || result.scrollThumbWidth < 1
    || result.scrollThumbHeight < 1
    || result.scrollThumbHeight >= result.scrollBarHeight) {
    throw new Error(
      `${label}: forced-colors ScrollArea geometry or keyboard overflow contract failed `
      + JSON.stringify({
        barDisplay: result.scrollBarDisplay,
        barHasOverflowY: result.scrollBarHasOverflowY,
        barHeight: result.scrollBarHeight,
        barVisibility: result.scrollBarVisibility,
        barWidth: result.scrollBarWidth,
        thumbHeight: result.scrollThumbHeight,
        thumbWidth: result.scrollThumbWidth,
        viewportHasOverflowY: result.scrollViewportHasOverflowY,
        viewportOverflowY: result.scrollViewportOverflowY,
        viewportTabIndex: result.scrollViewportTabIndex,
      }),
    );
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
    || result.indeterminateProgressBackgroundClip !== "padding-box"
    || result.indeterminateProgressBorderStyle !== "dashed"
    || result.indeterminateProgressBorderWidth < 1
    || result.progressTrackBorderStyle === "none"
    || result.progressTrackBorderWidth < 1
    || result.indeterminateProgressAnimationName !== "none") {
    throw new Error(
      `${label}: indeterminate progress must remain a static partial dashed shape in reduced-motion forced-colors `
      + JSON.stringify({
        animationName: result.indeterminateProgressAnimationName,
        backgroundClip: result.indeterminateProgressBackgroundClip,
        borderStyle: result.indeterminateProgressBorderStyle,
        borderWidth: result.indeterminateProgressBorderWidth,
        completeRatio,
        completeWidth: result.completeProgressWidth,
        ratio: indeterminateRatio,
        trackWidth: result.progressTrackWidth,
        trackBorderStyle: result.progressTrackBorderStyle,
        trackBorderWidth: result.progressTrackBorderWidth,
      }),
    );
  }
  if (result.focusOutlineStyle === "none" || result.focusOutlineWidth < 2
    || result.tabsFocusOutlineStyle === "none" || result.tabsFocusOutlineWidth < 2
    || result.groupFocusOutlineStyle === "none" || result.groupFocusOutlineWidth < 2) {
    throw new Error(`${label}: focus outline is not preserved`);
  }
  if (result.emptyBorderStyle === "none" || result.emptyBorderWidth < 1
    || result.surfaceBorderStyle === "none" || result.surfaceBorderWidth < 1
    || result.badgeBorderStyle === "none" || result.badgeBorderWidth < 1
    || result.alertBorderStyle === "none" || result.alertBorderWidth < 1
    || result.disabledItemBorderStyle === "none" || result.disabledItemBorderWidth < 1
    || result.scrollAreaBorderStyle === "none" || result.scrollAreaBorderWidth < 1
    || result.scrollBarBorderStyle === "none" || result.scrollBarBorderWidth < 1
    || result.markerBorderStyle === "none" || result.markerBorderWidth < 1
    || result.tabsDisabledBorderStyle === "none" || result.tabsDisabledBorderWidth < 1
    || result.groupDisabledBorderStyle === "none" || result.groupDisabledBorderWidth < 1) {
    throw new Error(`${label}: a required forced-colors border is not preserved`);
  }
  if (result.tabsActiveBackground === result.tabsFocusBackground
    || result.tabsActiveBackground === result.tabsDisabledBackground
    || result.tabsDisabledColor === result.tabsActiveColor) {
    throw new Error(`${label}: Tabs active, focused, and disabled states are not distinct`);
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

function isExactAuthSessionRequest(request) {
  return request.method() === "GET" && isExactAuthSessionUrl(request.url());
}

function isExactAuthSessionUrl(url) {
  const parsed = new URL(url);
  return parsed.origin === baseUrl
    && parsed.pathname === "/api/auth/session"
    && parsed.search === "";
}

function isExpectedAuthSessionConsoleNoise(text, authSession) {
  if (!text.startsWith("Failed to load resource: the server responded with a status of ")) {
    return false;
  }
  if (authSession === "unauthenticated") return text.includes("401 (Unauthorized)");
  if (authSession === "error") return text.includes("503 (Service Unavailable)");
  return false;
}

function isUnexpectedFeatureNetworkRequest(request) {
  const parsed = new URL(request.url());
  return parsed.origin !== baseUrl
    || ["eventsource", "fetch", "xhr"].includes(request.resourceType());
}

function isViteDevelopmentSocket(url) {
  const parsed = new URL(url);
  const serverUrl = new URL(baseUrl);
  return parsed.hostname === serverUrl.hostname
    && parsed.port === serverUrl.port
    && parsed.pathname === "/"
    && parsed.searchParams.has("token");
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

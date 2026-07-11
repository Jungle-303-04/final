import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const port = 5195;
const baseUrl = `http://127.0.0.1:${port}`;
const productUrl = `${baseUrl}/product`;
const outputDir = new URL("../output/playwright/", import.meta.url).pathname;
const visualScenarios = [
  {
    id: "desktop-light",
    viewport: { width: 1440, height: 1000 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
  },
  {
    id: "mobile-dark",
    viewport: { width: 390, height: 844 },
    theme: "dark",
    colorScheme: "dark",
    forcedColors: "none",
  },
  {
    id: "reflow-320-light",
    viewport: { width: 320, height: 800 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
  },
  {
    id: "text-200-light",
    viewport: { width: 640, height: 800 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
    rootFontSize: "200%",
  },
  {
    id: "forced-colors",
    viewport: { width: 1024, height: 768 },
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
    if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url());
  });
  page.on("websocket", (socket) => {
    if (new URL(socket.url()).pathname.startsWith("/api/")) sockets.push(socket.url());
  });

  await page.goto(productUrl, { waitUntil: "networkidle" });
  for (const scenario of visualScenarios) {
    await captureScenario(page, scenario);
  }

  if (errors.length) throw new Error(`product visual console errors\n${errors.join("\n")}`);
  if (apiRequests.length) throw new Error(`release gate made API requests\n${apiRequests.join("\n")}`);
  if (sockets.length) throw new Error(`release gate opened WebSockets\n${sockets.join("\n")}`);
  console.log(
    `product visual gate passed (${visualScenarios.map(({ id }) => id).join(", ")}; network-silent release gate)`,
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
  await page.reload({ waitUntil: "networkidle" });
  if (scenario.rootFontSize) {
    await page.evaluate((rootFontSize) => {
      document.documentElement.style.fontSize = rootFontSize;
    }, scenario.rootFontSize);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
  }

  await page.getByRole("heading", { name: "API 연결 계층을 검증하고 있습니다" }).waitFor();
  await page.keyboard.press("?");
  if (await page.getByRole("dialog").count()) {
    throw new Error(`${scenario.id}: release gate mounted shortcut dialog`);
  }
  if (await page.getByRole("main").count() !== 1) {
    throw new Error(`${scenario.id}: release gate must expose one main landmark`);
  }

  await assertNoOverflow(page, scenario.id);
  if (scenario.forcedColors === "active") await assertForcedColors(page, scenario.id);
  await page.screenshot({
    path: `${outputDir}product-release-${scenario.id}.png`,
    fullPage: true,
  });
}

async function assertNoOverflow(page, label) {
  const result = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const documentOverflow = document.documentElement.scrollWidth - viewportWidth;
    const selectors = [
      "[data-slot='empty']",
      "[data-slot='surface']",
      "[data-slot='button']",
      "[role='alert']",
      "h1",
      "h2",
      "p",
      "code",
      "dd",
    ];
    const violations = [];

    for (const element of document.querySelectorAll(selectors.join(","))) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      const style = getComputedStyle(element);
      const scrollOwner = style.overflowX === "auto" || style.overflowX === "scroll";
      const ownOverflow = element.scrollWidth - element.clientWidth;
      if (!scrollOwner && ownOverflow > 1) {
        violations.push(`${element.tagName.toLowerCase()} own overflow ${ownOverflow}px`);
      }
      if (rect.left < -1 || rect.right > viewportWidth + 1) {
        violations.push(
          `${element.tagName.toLowerCase()} viewport bounds ${rect.left.toFixed(1)}..${rect.right.toFixed(1)}`,
        );
      }
    }

    return { documentOverflow, violations };
  });

  if (result.documentOverflow > 1 || result.violations.length) {
    throw new Error(
      `${label} reflow failure: document=${result.documentOverflow}px\n${result.violations.join("\n")}`,
    );
  }
}

async function assertForcedColors(page, label) {
  const result = await page.evaluate(() => {
    const main = document.querySelector("main");
    const empty = document.querySelector("[data-slot='empty']");
    const badge = document.querySelector("[data-slot='badge']");
    const heading = document.querySelector("h1");
    if (!(main instanceof HTMLElement) || !(empty instanceof HTMLElement)
      || !(badge instanceof HTMLElement) || !(heading instanceof HTMLElement)) {
      return { missing: true };
    }

    main.focus();
    const mainStyle = getComputedStyle(main);
    const emptyStyle = getComputedStyle(empty);
    const badgeStyle = getComputedStyle(badge);
    const headingStyle = getComputedStyle(heading);
    return {
      missing: false,
      active: matchMedia("(forced-colors: active)").matches,
      focusOutlineStyle: mainStyle.outlineStyle,
      focusOutlineWidth: Number.parseFloat(mainStyle.outlineWidth),
      emptyBorderStyle: emptyStyle.borderTopStyle,
      emptyBorderWidth: Number.parseFloat(emptyStyle.borderTopWidth),
      badgeBorderStyle: badgeStyle.borderTopStyle,
      badgeBorderWidth: Number.parseFloat(badgeStyle.borderTopWidth),
      headingColor: headingStyle.color,
      headingVisible: heading.getBoundingClientRect().width > 0,
    };
  });

  if (result.missing) throw new Error(`${label}: required forced-colors elements are missing`);
  if (!result.active) throw new Error(`${label}: forced-colors media query is not active`);
  if (result.focusOutlineStyle === "none" || result.focusOutlineWidth < 2) {
    throw new Error(`${label}: main focus outline is not preserved`);
  }
  if (result.emptyBorderStyle === "none" || result.emptyBorderWidth < 1) {
    throw new Error(`${label}: empty surface border is not preserved`);
  }
  if (result.badgeBorderStyle === "none" || result.badgeBorderWidth < 1) {
    throw new Error(`${label}: badge border is not preserved`);
  }
  if (!result.headingVisible || result.headingColor === "rgba(0, 0, 0, 0)") {
    throw new Error(`${label}: heading is not visible`);
  }
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

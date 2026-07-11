import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const port = 5195;
const baseUrl = `http://127.0.0.1:${port}`;
const outputDir = new URL("../output/playwright/", import.meta.url).pathname;
const server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { stdio: ["ignore", "pipe", "pipe"] });
let output = "";
let browser;
server.stdout.on("data", (chunk) => { output += chunk.toString(); });
server.stderr.on("data", (chunk) => { output += chunk.toString(); });

try {
  await mkdir(outputDir, { recursive: true });
  await waitForServer(`${baseUrl}/product`);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
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
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto(`${baseUrl}/product`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "API 연결 계층을 검증하고 있습니다" }).waitFor();
  await page.keyboard.press("?");
  if (await page.getByRole("dialog").count()) throw new Error("release gate mounted shortcut dialog");
  if (await page.getByRole("main").count() !== 1) throw new Error("release gate must expose one main landmark");
  await assertNoOverflow(page, "desktop");
  await page.screenshot({ path: `${outputDir}product-release-desktop-light.png`, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => localStorage.setItem("kubeheal-theme", "dark"));
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "API 연결 계층을 검증하고 있습니다" }).waitFor();
  await assertNoOverflow(page, "mobile");
  await page.screenshot({ path: `${outputDir}product-release-mobile-dark.png`, fullPage: true });

  if (errors.length) throw new Error(`product visual console errors\n${errors.join("\n")}`);
  if (apiRequests.length) throw new Error(`release gate made API requests\n${apiRequests.join("\n")}`);
  if (sockets.length) throw new Error(`release gate opened WebSockets\n${sockets.join("\n")}`);
  console.log("product visual gate passed (desktop light + mobile dark, network-silent release gate)");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  if (output.includes("error")) process.stderr.write(output);
}

async function assertNoOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) throw new Error(`${label} horizontal overflow: ${overflow}px`);
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

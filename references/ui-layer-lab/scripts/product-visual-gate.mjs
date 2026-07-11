import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const port = 5195;
const baseUrl = `http://127.0.0.1:${port}`;
const outputDir = new URL("../output/playwright/", import.meta.url).pathname;
const server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { stdio: ["ignore", "pipe", "pipe"] });
let output = "";
server.stdout.on("data", (chunk) => { output += chunk.toString(); });
server.stderr.on("data", (chunk) => { output += chunk.toString(); });

try {
  await mkdir(outputDir, { recursive: true });
  await waitForServer(`${baseUrl}/product`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("favicon")) errors.push(message.text());
  });
  await mockApi(page);
  await page.goto(`${baseUrl}/product`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "무엇을 먼저 봐야 하나요?" }).waitFor();
  await assertNoOverflow(page, "desktop");
  await page.screenshot({ path: `${outputDir}product-desktop.png`, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "무엇을 먼저 봐야 하나요?" }).waitFor();
  await assertNoOverflow(page, "mobile");
  await page.screenshot({ path: `${outputDir}product-mobile.png`, fullPage: true });
  await browser.close();

  if (errors.length) throw new Error(`product visual console errors\n${errors.join("\n")}`);
  console.log("product visual gate passed (desktop + mobile, mocked backend contract)");
} finally {
  server.kill("SIGTERM");
  if (output.includes("error")) process.stderr.write(output);
}

async function mockApi(page) {
  await page.route("**/api/auth/session", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: true, user_id: "visual-user", roles: ["service_admin"], workspace_id: "visual" }) }));
  await page.route("**/api/fleet/summary", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ clusters: [{ cluster_id: "prod", name: "Production", health: "critical", pods_running: 42, pods_total: 48, nodes_ready: 5, nodes_total: 6, open_incidents: 2, restarts_recent: 4, cpu_pct: 78, mem_pct: 64, last_seen_at: "2026-07-10T07:30:00Z" }], totals: { clusters: 1, healthy: 0, warning: 0, critical: 1, stale: 0, unknown: 0, open_incidents: 2, pending_approvals: 1, running_workflows: 1, dead_letters: 0 } }) }));
  await page.route("**/api/dashboard/rca/timeline*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }) }));
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

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const root = process.cwd();
const outputDir = path.resolve(root, "output/playwright");
const port = 5190;
const baseUrl = `http://127.0.0.1:${port}`;

await fs.mkdir(outputDir, { recursive: true });

const server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  await waitForServer(baseUrl);
  const result = await runGate(baseUrl);
  console.log(JSON.stringify(result, null, 2));
} finally {
  server.kill("SIGTERM");
}

async function runGate(url) {
  const browser = await chromium.launch({ headless: true });
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });

  const catalog = await inspectCatalog();
  const light = await inspectTheme(desktop, url, "light");
  const dark = await inspectTheme(desktop, url, "dark");
  const codePanel = await inspectCodePanel(desktop);
  const flow = await inspectReactFlow(desktop, url);
  const mobileOverflow = await inspectMobile(mobile, url);

  await browser.close();

  const counts = light.categoryCounts;
  const exposedTotal = counts.reduce((sum, count) => sum + count, 0);
  const failures = [
    counts.length !== 8 ? `카테고리 수 ${counts.length}` : "",
    counts.some((count) => count < 6) ? `카테고리 count 부족: ${counts.join(",")}` : "",
    counts.every((count) => count === 2) ? "카테고리 count가 2로 고정됨" : "",
    catalog.duplicateIds.length ? `중복 example id: ${catalog.duplicateIds.join(",")}` : "",
    exposedTotal !== catalog.exampleFiles ? `노출 수 ${exposedTotal}개가 파일 수 ${catalog.exampleFiles}개와 다름` : "",
    codePanel.closedPreExists ? "닫힌 코드 패널에 pre가 남음" : "",
    !codePanel.sourceVisible ? "코드 보기 후 source line 미표시" : "",
    codePanel.closedHeight > 72 ? `닫힌 코드 패널 높이 과대: ${codePanel.closedHeight}` : "",
    light.commandPreviewIsDark ? `라이트 모드 command preview dark 고정: ${light.commandPreviewBg}` : "",
    !dark.commandPreviewReadable ? `다크 모드 command preview 판독 실패: ${dark.commandPreviewBg}` : "",
    flow.dragDeltaX < 90 ? `React Flow 드래그 이동 부족: ${flow.dragDeltaX}` : "",
    flow.edgeDelta < 1 ? `React Flow edge 증가 없음: ${flow.edgeBefore}->${flow.edgeAfter}` : "",
    mobileOverflow > 1 ? `모바일 가로 overflow ${mobileOverflow}px` : ""
  ].filter(Boolean);

  if (failures.length) {
    throw new Error(`visual-quality 실패\n${failures.join("\n")}`);
  }

  return {
    categoryCounts: counts,
    exposedTotal,
    catalog,
    codePanel,
    light,
    dark,
    flow,
    mobileOverflow,
    screenshots: {
      light: path.relative(root, path.join(outputDir, "visual-light-command.png")),
      dark: path.relative(root, path.join(outputDir, "visual-dark-command.png")),
      flow: path.relative(root, path.join(outputDir, "visual-flow.png")),
      mobile: path.relative(root, path.join(outputDir, "visual-mobile.png"))
    }
  };
}

async function inspectCatalog() {
  const exampleDir = path.join(root, "src/examples");
  const files = (await fs.readdir(exampleDir)).filter((file) => file.endsWith(".example.tsx"));
  const ids = files.map((file) => file.replace(/^\d+-/, "").replace(/\.example\.tsx$/, ""));
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];

  return {
    exampleFiles: files.length,
    duplicateIds
  };
}

async function inspectTheme(page, url, theme) {
  await page.addInitScript((nextTheme) => localStorage.setItem("ui-layer-lab-theme", nextTheme), theme);
  await openCategory(page, url, "오버레이/명령");
  await page.waitForSelector('[data-testid="example-command-basic"]');
  await page.screenshot({ path: path.join(outputDir, `visual-${theme}-command.png`), fullPage: false });

  return page.evaluate(() => {
    const counts = [...document.querySelectorAll(".example-nav nav small")]
      .map((node) => Number(node.textContent?.trim()))
      .filter(Number.isFinite);
    const demo = document.querySelector('[data-testid="example-command-basic"] .demo-window');
    const text = document.querySelector('[data-testid="example-command-basic"]')?.textContent ?? "";
    const bg = demo ? getComputedStyle(demo).backgroundColor : "rgb(0, 0, 0)";
    const rgb = bg.match(/\d+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
    const luminance = rgb.reduce((sum, value) => sum + value, 0) / 3;
    return {
      categoryCounts: counts,
      commandPreviewBg: bg,
      commandPreviewIsDark: luminance < 64,
      commandPreviewReadable: text.includes("명령 검색") && text.includes("대시보드")
    };
  });
}

async function inspectCodePanel(page) {
  await openCategory(page, baseUrl, "오버레이/명령");
  await page.waitForSelector('[data-testid="example-command-basic"]');
  const before = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="example-command-basic"] [data-testid="code-panel"]');
    const pre = document.querySelector('[data-testid="example-command-basic"] pre');
    return {
      closedHeight: panel?.getBoundingClientRect().height ?? 0,
      closedPreExists: Boolean(pre)
    };
  });
  const started = Date.now();
  await page.locator('[data-testid="example-command-basic"] [data-stable-control="code-toggle"]').click();
  await page.getByText('import { Command } from "cmdk";').waitFor({ timeout: 5000 });
  const elapsedMs = Date.now() - started;
  const after = await page.evaluate(() => ({
    sourceVisible: document.body.innerText.includes('import { Command } from "cmdk";')
  }));

  return { ...before, ...after, elapsedMs };
}

async function inspectReactFlow(page, url) {
  await openCategory(page, url, "플로우 빌더");
  await page.waitForSelector('[data-testid="example-react-flow-workflow"]');
  await page.locator('[data-testid="example-react-flow-workflow"]').scrollIntoViewIfNeeded();
  await page.waitForSelector('[data-testid="example-react-flow-workflow"] .react-flow__node[data-id="input"]');

  const beforeBox = await page.locator('[data-testid="example-react-flow-workflow"] .react-flow__node[data-id="input"]').boundingBox();
  if (!beforeBox) throw new Error("React Flow input node를 찾지 못했습니다.");
  await page.mouse.move(beforeBox.x + beforeBox.width / 2, beforeBox.y + beforeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(beforeBox.x + beforeBox.width / 2 + 120, beforeBox.y + beforeBox.height / 2 + 24, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(180);
  const afterBox = await page.locator('[data-testid="example-react-flow-workflow"] .react-flow__node[data-id="input"]').boundingBox();

  const edgeBefore = await page.locator('[data-testid="example-react-flow-workflow"] .react-flow__edge').count();
  const source = await page.locator('[data-testid="flow-handle-input-source"]').boundingBox();
  const target = await page.locator('[data-testid="flow-handle-log-target"]').boundingBox();
  if (!source || !target) throw new Error("React Flow handle을 찾지 못했습니다.");
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(240);
  const edgeAfter = await page.locator('[data-testid="example-react-flow-workflow"] .react-flow__edge').count();
  await page.screenshot({ path: path.join(outputDir, "visual-flow.png"), fullPage: false });

  return {
    dragDeltaX: Math.round((afterBox?.x ?? 0) - beforeBox.x),
    edgeBefore,
    edgeAfter,
    edgeDelta: edgeAfter - edgeBefore
  };
}

async function inspectMobile(page, url) {
  await openCategory(page, url, "오버레이/명령");
  await page.waitForSelector(".docs-page");
  await page.screenshot({ path: path.join(outputDir, "visual-mobile.png"), fullPage: false });
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

async function openCategory(page, url, label) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: new RegExp(label) }).click();
}

async function waitForServer(url) {
  const deadline = Date.now() + 30_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError ?? new Error("Vite server did not start");
}

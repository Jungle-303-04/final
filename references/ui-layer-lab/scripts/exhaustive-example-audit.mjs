import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const root = process.cwd();
const outputDir = path.resolve(root, "output/playwright");
const reportPath = path.join(outputDir, "exhaustive-audit.json");
const port = 5192;
const baseUrl = `http://127.0.0.1:${port}`;

const controlSelector = [
  "button",
  "input",
  "select",
  "textarea",
  '[role="button"]',
  '[role="tab"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="combobox"]',
  '[contenteditable="true"]'
].join(",");

await fs.mkdir(outputDir, { recursive: true });

const server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"]
});

let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput = `${serverOutput}${chunk}`.slice(-8000);
});
server.stderr.on("data", (chunk) => {
  serverOutput = `${serverOutput}${chunk}`.slice(-8000);
});

try {
  await waitForServer(baseUrl);
  const result = await runExhaustiveAudit(baseUrl);
  await fs.writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result.summary, null, 2));
  if (result.failures.length) {
    throw new Error(`exhaustive-audit 실패 ${result.failures.length}건\n${result.failures.slice(0, 40).join("\n")}`);
  }
} catch (error) {
  if (error instanceof Error) {
    error.message = `${error.message}\n\nVite output:\n${serverOutput}`;
  }
  throw error;
} finally {
  server.kill("SIGTERM");
}

async function runExhaustiveAudit(url) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(5000);

  const failures = [];
  const consoleIssues = [];
  const requestFailures = [];
  const categories = [];
  const examples = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      const location = message.location();
      consoleIssues.push(`${location.url || "page"}:${location.lineNumber || 0}:${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    consoleIssues.push(`pageerror:${error.message}`);
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure();
    const requestUrl = request.url();
    if (!requestUrl.startsWith("data:")) {
      requestFailures.push(`${requestUrl}:${failure?.errorText ?? "request failed"}`);
    }
  });

  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.setItem("ui-layer-lab-theme", "dark"));
  await page.reload({ waitUntil: "networkidle" });

  const navLabels = await page.locator(".example-nav nav button").evaluateAll((buttons) =>
    buttons.map((button) => button.textContent?.replace(/\d+$/, "").trim()).filter(Boolean)
  );

  for (const label of navLabels) {
    console.log(`[audit] category ${label}`);
    await cleanupOpenLayers(page, `before category ${label}`, failures, false);
    await page.getByRole("button", { name: new RegExp(`^${escapeRegExp(label)}`) }).click().catch(async (error) => {
      failures.push(`category nav blocked ${label}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
      await cleanupOpenLayers(page, `retry category ${label}`, failures, true);
      await page.getByRole("button", { name: new RegExp(`^${escapeRegExp(label)}`) }).click({ force: true });
    });
    await page.waitForTimeout(150);
    const categoryInfo = await inspectCategory(page, label, failures);
    categories.push(categoryInfo);

    const sectionIds = await page.locator(".example-section").evaluateAll((sections) =>
      sections.map((section) => section.getAttribute("data-example-id")).filter(Boolean)
    );

    for (const exampleId of sectionIds) {
      const section = page.locator(`[data-example-id="${cssAttr(exampleId)}"]`);
      const exampleResult = await auditExample(page, section, exampleId, failures);
      examples.push({ category: label, ...exampleResult });
    }
  }

  await browser.close();

  failures.push(...consoleIssues.map((issue) => `console error: ${issue}`));
  failures.push(...requestFailures.map((issue) => `request failed: ${issue}`));

  const controlsClicked = examples.reduce((sum, example) => sum + example.controls.clicked, 0);
  const controlsFilled = examples.reduce((sum, example) => sum + example.controls.filled, 0);
  const controlsSelected = examples.reduce((sum, example) => sum + example.controls.selected, 0);
  const controlsAdjusted = examples.reduce((sum, example) => sum + example.controls.adjusted, 0);
  const controlsSkipped = examples.reduce((sum, example) => sum + example.controls.skipped, 0);
  const flowDragChecks = examples.reduce((sum, example) => sum + example.flow.dragChecks, 0);

  return {
    summary: {
      categories: categories.length,
      examples: examples.length,
      codePanelsOpened: examples.filter((example) => example.codePanel.opened).length,
      controls: {
        total: examples.reduce((sum, example) => sum + example.controls.total, 0),
        clicked: controlsClicked,
        filled: controlsFilled,
        selected: controlsSelected,
        adjusted: controlsAdjusted,
        skipped: controlsSkipped
      },
      flowDragChecks,
      consoleErrors: consoleIssues.length,
      requestFailures: requestFailures.length,
      failures: failures.length,
      report: path.relative(root, reportPath)
    },
    categories,
    examples,
    failures
  };
}

async function inspectCategory(page, label, failures) {
  const activeHeading = await page.locator(".category-summary h2").textContent();
  const exampleCount = await page.locator(".example-section").count();
  const pageOverflow = await horizontalOverflow(page);
  if (activeHeading?.trim() !== label) {
    failures.push(`${label}: active heading mismatch ${activeHeading}`);
  }
  if (exampleCount <= 0) {
    failures.push(`${label}: example section 없음`);
  }
  if (pageOverflow > 1) {
    failures.push(`${label}: page horizontal overflow ${pageOverflow}px`);
  }

  return { label, activeHeading: activeHeading?.trim() ?? "", exampleCount, pageOverflow };
}

async function auditExample(page, section, exampleId, failures) {
  const result = {
    id: exampleId,
    title: "",
    previewVisible: false,
    codePanel: { opened: false, closed: false, lineCount: 0 },
    controls: { total: 0, clicked: 0, filled: 0, selected: 0, adjusted: 0, skipped: 0 },
    flow: { present: false, dragChecks: 0, dragDeltaX: 0 },
    textFitIssues: 0,
    pageOverflow: 0
  };

  try {
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(20);
    result.title = (await section.locator("h3").first().textContent())?.trim() ?? "";
    await waitForPreview(section);

    const preview = section.locator('[data-testid="preview-area"]');
    const previewState = await preview.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const loading = Boolean(node.querySelector(".preview-loading"));
      const text = node.textContent?.trim() ?? "";
      return { width: rect.width, height: rect.height, loading, textLength: text.length, childCount: node.children.length };
    });
    result.previewVisible = previewState.width > 0 && previewState.height > 0 && !previewState.loading && previewState.childCount > 0;
    if (!result.previewVisible) {
      failures.push(`${exampleId}: preview not ready ${JSON.stringify(previewState)}`);
    }

    result.flow = await auditReactFlow(page, section, exampleId, failures);
    result.codePanel = await auditCodePanel(section, exampleId, failures);
    result.controls = await exercisePreviewControls(page, section, exampleId, failures);
    result.textFitIssues = await inspectTextFit(section, exampleId, failures);
    result.cleanup = await cleanupOpenLayers(page, exampleId, failures, true);
    result.pageOverflow = await horizontalOverflow(page);
    if (result.pageOverflow > 1) {
      failures.push(`${exampleId}: page horizontal overflow ${result.pageOverflow}px`);
    }
  } catch (error) {
    failures.push(`${exampleId}: audit crashed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await cleanupOpenLayers(page, `${exampleId}:finally`, failures, false).catch(() => undefined);
  }

  return result;
}

async function cleanupOpenLayers(page, context, failures, failOnEscapeMiss) {
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForTimeout(30);

  const lingeringAfterEscape = await visibleTopLayers(page);
  if (!lingeringAfterEscape.length) {
    return { lingeringAfterEscape: [], clickedCloseButtons: 0, remaining: [] };
  }

  if (failOnEscapeMiss) {
    failures.push(`${context}: Escape 후에도 레이어 잔류 ${lingeringAfterEscape.join(", ")}`);
  }

  const clickedCloseButtons = await page.evaluate(() => {
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };

    const buttons = Array.from(document.querySelectorAll("button")).filter((button) => {
      const label = `${button.getAttribute("aria-label") ?? ""} ${button.textContent ?? ""}`;
      return isVisible(button) && /닫기|닫음|취소|적용|계속 실행/.test(label);
    });

    buttons.forEach((button) => button.click());
    return buttons.length;
  });
  await page.waitForTimeout(50);

  const remaining = await visibleTopLayers(page);
  if (remaining.length && failOnEscapeMiss) {
    failures.push(`${context}: 닫기 정리 후에도 레이어 잔류 ${remaining.join(", ")}`);
  }

  return { lingeringAfterEscape, clickedCloseButtons, remaining };
}

async function visibleTopLayers(page) {
  return page.evaluate(() => {
    const selectors = [
      ".command-layer",
      ".overlay",
      ".approval-layer",
      ".component-modal-layer",
      ".drawer-sheet",
      ".animated-layer"
    ];
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };

    return selectors.flatMap((selector) =>
      Array.from(document.querySelectorAll(selector))
        .filter(isVisible)
        .map((element) => `${selector}:${(element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80)}`)
    );
  });
}

async function waitForPreview(section) {
  const preview = section.locator('[data-testid="preview-area"]');
  await preview.scrollIntoViewIfNeeded();
  await preview.waitFor({ state: "visible", timeout: 5000 });
  await preview.locator(".preview-loading").first().waitFor({ state: "detached", timeout: 5000 }).catch(() => undefined);
}

async function auditCodePanel(section, exampleId, failures) {
  const toggle = section.locator('[data-stable-control="code-toggle"]').first();
  const panelResult = { opened: false, closed: false, lineCount: 0 };

  await toggle.click();
  const pre = section.locator('[data-testid="code-panel"] pre').first();
  await pre.waitFor({ state: "visible", timeout: 5000 });
  panelResult.opened = true;
  panelResult.lineCount = await section.locator(".code-line").count();
  if (panelResult.lineCount <= 0) {
    failures.push(`${exampleId}: code panel line count 0`);
  }

  await toggle.click();
  await pre.waitFor({ state: "detached", timeout: 5000 });
  panelResult.closed = true;

  return panelResult;
}

async function exercisePreviewControls(page, section, exampleId, failures) {
  const preview = section.locator('[data-testid="preview-area"]');
  const controls = { total: 0, clicked: 0, filled: 0, selected: 0, adjusted: 0, skipped: 0 };
  const controlInfos = await preview.evaluate(
    (root, { selector, idPrefix }) => {
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };

      return Array.from(root.querySelectorAll(selector))
        .filter((element) => isVisible(element) && !element.closest(".react-flow__minimap"))
        .map((element, index) => {
          const auditId = `${idPrefix}-${index}`;
          element.setAttribute("data-audit-control", auditId);
          return {
            auditId,
            tag: element.tagName.toLowerCase(),
            role: element.getAttribute("role") ?? "",
            type: element.getAttribute("type") ?? "",
            label: (
              element.getAttribute("aria-label") ??
              element.getAttribute("placeholder") ??
              element.textContent ??
              element.getAttribute("value") ??
              element.tagName
            )
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 90),
            disabled: element.disabled === true || element.getAttribute("aria-disabled") === "true",
            readOnly: element.readOnly === true || element.getAttribute("readonly") !== null
          };
        });
    },
    { selector: controlSelector, idPrefix: exampleId }
  );

  controls.total = controlInfos.length;

  for (const info of controlInfos) {
    const control = page.locator(`[data-audit-control="${cssAttr(info.auditId)}"]`).first();
    if (info.disabled || info.readOnly || !(await control.count()) || !(await control.isVisible().catch(() => false))) {
      controls.skipped += 1;
      continue;
    }

    try {
      const action = await interactWithControl(page, control, info);
      controls[action] += 1;
      await page.waitForTimeout(35);
      await page.keyboard.press("Escape").catch(() => undefined);
    } catch (error) {
      failures.push(`${exampleId}: control failed [${info.tag}:${info.type}:${info.role}:${info.label}] ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return controls;
}

async function interactWithControl(page, control, info) {
  await control.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => undefined);

  if (info.tag === "select") {
    const value = await control.evaluate((element) => {
      const options = Array.from(element.options ?? []);
      return options[1]?.value ?? options[0]?.value ?? "";
    });
    if (value) {
      await control.selectOption(value, { timeout: 1500 });
      return "selected";
    }
    return "skipped";
  }

  if (info.tag === "textarea" || info.role === "textbox" || info.tag === "input") {
    const type = info.type.toLowerCase();
    if (["button", "submit", "reset"].includes(type)) {
      await control.click({ timeout: 2000 });
      return "clicked";
    }
    if (["checkbox", "radio"].includes(type) || info.role === "switch" || info.role === "checkbox") {
      await control.click({ timeout: 2000 });
      return "clicked";
    }
    if (type === "range") {
      await control.focus();
      await page.keyboard.press("ArrowRight");
      return "adjusted";
    }
    if (!["file", "color", "hidden"].includes(type)) {
      await control.fill("검수", { timeout: 1500 });
      await page.keyboard.press("Enter").catch(() => undefined);
      return "filled";
    }
    return "skipped";
  }

  if (await control.getAttribute("contenteditable").catch(() => "") === "true") {
    await control.fill("검수", { timeout: 1500 });
    return "filled";
  }

  await control.click({ timeout: 2000 });
  return "clicked";
}

async function auditReactFlow(page, section, exampleId, failures) {
  const flow = section.locator(".react-flow").first();
  const result = { present: false, dragChecks: 0, dragDeltaX: 0 };
  if (!(await flow.count())) return result;

  result.present = true;
  const nodes = section.locator(".react-flow__node");
  const count = await nodes.count();
  if (!count) return result;

  for (let index = 0; index < Math.min(count, 5); index += 1) {
    const node = nodes.nth(index);
    const className = (await node.getAttribute("class").catch(() => "")) ?? "";
    if (count > 1 && className.includes("react-flow__node-group")) continue;

    const before = await node.boundingBox();
    if (!before) continue;

    const dragHandle = node.locator(".drag-handle").first();
    const target = (await dragHandle.count()) ? dragHandle : node;
    const targetBox = await target.boundingBox();
    if (!targetBox) continue;

    const startX = targetBox.x + targetBox.width / 2;
    const startY = targetBox.y + targetBox.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 72, startY + 28, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(120);

    const after = await node.boundingBox();
    const deltaX = after ? Math.round(after.x - before.x) : 0;
    result.dragChecks += 1;
    result.dragDeltaX = Math.abs(deltaX) > Math.abs(result.dragDeltaX) ? deltaX : result.dragDeltaX;
    if (Math.abs(result.dragDeltaX) >= 8) break;
  }

  if (!result.dragChecks || Math.abs(result.dragDeltaX) < 8) {
    failures.push(`${exampleId}: React Flow node drag delta too small ${result.dragDeltaX}`);
  }

  return result;
}

async function inspectTextFit(section, exampleId, failures) {
  const issues = await section.locator('[data-testid="preview-area"]').evaluate((root, selector) => {
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };

    return Array.from(root.querySelectorAll(selector))
      .filter((element) => isVisible(element))
      .map((element) => {
        const overflowX = element.scrollWidth - element.clientWidth;
        const overflowY = element.scrollHeight - element.clientHeight;
        return {
          label: (element.textContent ?? element.getAttribute("aria-label") ?? element.tagName).replace(/\s+/g, " ").trim().slice(0, 80),
          overflowX,
          overflowY
        };
      })
      .filter((item) => item.label && (item.overflowX > 2 || item.overflowY > 2));
  }, "button,input,select,textarea,[role='button'],[role='tab'],[role='switch'],[role='checkbox'],[contenteditable='true']");

  for (const issue of issues) {
    failures.push(`${exampleId}: control text overflow ${JSON.stringify(issue)}`);
  }

  return issues.length;
}

async function horizontalOverflow(page) {
  return page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
}

async function waitForServer(url) {
  const started = Date.now();
  while (Date.now() - started < 120000) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`dev server did not become ready: ${url}`);
}

function cssAttr(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

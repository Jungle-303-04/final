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
let serverExited = false;
let serverOutput = "";

server.stdout.on("data", (chunk) => {
  serverOutput = `${serverOutput}${chunk}`.slice(-6000);
});
server.stderr.on("data", (chunk) => {
  serverOutput = `${serverOutput}${chunk}`.slice(-6000);
});
server.on("exit", (code, signal) => {
  serverExited = true;
  serverOutput = `${serverOutput}\n[vite-exit code=${code} signal=${signal}]`.slice(-6000);
});

try {
  await waitForServer(baseUrl);
  const result = await runGate(baseUrl);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  if (error instanceof Error) {
    error.message = `${error.message}\n\nVite output:\n${serverOutput}`;
  }
  throw error;
} finally {
  server.kill("SIGTERM");
}

async function runGate(url) {
  const browser = await chromium.launch({ headless: true });
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });

  const catalog = await inspectCatalog();
  const sourceEnglish = await inspectSourceEnglishGuard();
  const light = await inspectTheme(desktop, url, "light");
  const dark = await inspectTheme(desktop, url, "dark");
  const navigation = await inspectNavigationAndSearch(desktop, url);
  const stableControls = await inspectStableControls(desktop, url);
  const visibleKorean = await inspectVisibleKoreanGuard(desktop, url);
  const codePanel = await inspectCodePanel(desktop);
  const flow = await inspectReactFlow(desktop, url);
  const englishSamples = await inspectEnglishSamples(desktop, url);
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
    sourceEnglish.matches.length ? `핵심 예제 영어 회귀: ${sourceEnglish.matches.join(", ")}` : "",
    visibleKorean.forbiddenVisible.length ? `주요 화면 영어 노출: ${visibleKorean.forbiddenVisible.join(", ")}` : "",
    navigation.activeHeading !== "데이터 시각화" ? `카테고리 전환 실패: ${navigation.activeHeading}` : "",
    !navigation.searchInputPresent ? "검색 입력을 찾지 못함" : "",
    navigation.filteredCount <= 0 || navigation.filteredCount >= navigation.dataVizCount
      ? `검색 필터 실패: ${navigation.dataVizCount}->${navigation.filteredCount}, term=${navigation.searchTerm}`
      : "",
    stableControls.themeWidthDelta > 1 || stableControls.themeHeightDelta > 1
      ? `테마 토글 크기 변동: ${stableControls.themeWidthDelta}x${stableControls.themeHeightDelta}`
      : "",
    stableControls.codeWidthDelta > 1 || stableControls.codeHeightDelta > 1
      ? `코드 토글 크기 변동: ${stableControls.codeWidthDelta}x${stableControls.codeHeightDelta}`
      : "",
    stableControls.themeBefore === stableControls.themeAfter
      ? `테마 토글 상태 전환 실패: ${stableControls.themeBefore}->${stableControls.themeAfter}`
      : "",
    navigation.scrollDelta > 8 ? `카테고리 전환 scrollY 흔들림: ${navigation.scrollDelta}` : "",
    codePanel.closedPreExists ? "닫힌 코드 패널에 pre가 남음" : "",
    !codePanel.sourceVisible ? "코드 보기 후 source line 미표시" : "",
    codePanel.closedHeight > 72 ? `닫힌 코드 패널 높이 과대: ${codePanel.closedHeight}` : "",
    light.commandPreviewIsDark ? `라이트 모드 command preview dark 고정: ${light.commandPreviewBg}` : "",
    !dark.commandPreviewReadable ? `다크 모드 command preview 판독 실패: ${dark.commandPreviewBg}` : "",
    flow.dragDeltaX < 90 ? `React Flow 드래그 이동 부족: ${flow.dragDeltaX}` : "",
    flow.edgeDelta < 1 ? `React Flow edge 증가 없음: ${flow.edgeBefore}->${flow.edgeAfter}` : "",
    englishSamples.violations.length ? `영어 UI 잔여: ${englishSamples.violations.join(" / ")}` : "",
    mobileOverflow > 1 ? `모바일 가로 overflow ${mobileOverflow}px` : ""
  ].filter(Boolean);

  if (failures.length) {
    throw new Error(`visual-quality 실패\n${failures.join("\n")}`);
  }

  return {
    categoryCounts: counts,
    exposedTotal,
    catalog,
    sourceEnglish,
    visibleKorean,
    navigation,
    stableControls,
    codePanel,
    light,
    dark,
    flow,
    englishSamples,
    mobileOverflow,
    screenshots: {
      light: path.relative(root, path.join(outputDir, "visual-light-command.png")),
      dark: path.relative(root, path.join(outputDir, "visual-dark-command.png")),
      flow: path.relative(root, path.join(outputDir, "visual-flow.png")),
      mobile: path.relative(root, path.join(outputDir, "visual-mobile.png"))
    }
  };
}

async function inspectSourceEnglishGuard() {
  const checks = [
    {
      file: "src/examples/01-command-basic.example.tsx",
      fragments: ["Dashboard", "Repositories", "Search commands", "Type a command", "No results found", "Pages"]
    },
    {
      file: "src/examples/392-animated-command-search-skeleton.example.tsx",
      fragments: ["Search remote actions", "Loading remote actions", "Show Results", "Show Loading", "Remote"]
    },
    {
      file: "src/examples/321-command-approval-matrix.example.tsx",
      fragments: ["Deploy preview", "Push production", "Rotate secret", "Check action permission", "Approval matrix"]
    },
    {
      file: "src/examples/323-command-recent-filter-pills.example.tsx",
      fragments: ["failed", "mine", "visual", "deploy", "Apply filter", "Filters"]
    },
    {
      file: "src/examples/403-job-command-palette-launch.example.tsx",
      fragments: ["Run typecheck", "Build frontend", "Deploy preview", "No job launched", "Launch a job", "Jobs"]
    },
    {
      file: "src/examples/420-react-flow-edge-health-filter.example.tsx",
      fragments: ["Show all", "Failed edge", "edges visible"]
    },
    {
      file: "src/examples/14-command-scrollable.example.tsx",
      fragments: ["Search repositories", "No repositories found", "Repositories", "Repository", "healthy"]
    },
    {
      file: "src/examples/20-sonner-types.example.tsx",
      fragments: ["Default toast", "Saved successfully", "Warning", "Deploy failed", "Syncing repository"]
    },
    {
      file: "src/examples/23-sonner-action.example.tsx",
      fragments: ["Deployment failed", "Visual smoke did not pass", "Retry queued", "Show Action Toast"]
    },
    {
      file: "src/examples/25-command-pages.example.tsx",
      fragments: ["Search actions", ">← Back<", 'heading="Pages"', "AI Actions", "Git Actions", "Pull latest"]
    },
    {
      file: "src/examples/35-sonner-loading-dismiss.example.tsx",
      fragments: ["Running cluster sync", "Cluster sync completed", "Start Loading Toast"]
    },
    {
      file: "src/examples/46-command-empty-state.example.tsx",
      fragments: ["Search project", "Projects", "No project found", "Create a new project"]
    },
    {
      file: "src/examples/47-command-value-preview.example.tsx",
      fragments: ["Ask AI", "Open Logs", "Search action", "Actions", "Jump into the latest workflow log"]
    },
    {
      file: "src/examples/48-command-filter-tags.example.tsx",
      fragments: ["Open package.json", "Run typecheck", "Toggle dark mode", "Filter commands", "No commands found"]
    },
    {
      file: "src/examples/53-animated-accordion.example.tsx",
      fragments: ["Fetching origin", "Test run", "Uploading branch"]
    },
    {
      file: "src/examples/54-animated-layout-switch.example.tsx",
      fragments: ['"Command"', '"Overlay"', '"Compact"', '"Expand"', "Detailed state", "Collapsed"]
    },
    {
      file: "src/examples/66-react-flow-edge-toolbar.example.tsx",
      fragments: ["Failing Step", "Open Logs", 'action: "View"']
    },
    {
      file: "src/examples/69-react-flow-animated-edge.example.tsx",
      fragments: ["Queued", "Running", "Done", "Stop animation", "Start animation"]
    },
    {
      file: "src/examples/97-command-quick-create.example.tsx",
      fragments: ["Investigate deploy failure", "Search or create task", 'heading="Tasks"']
    },
    {
      file: "src/examples/98-command-pinned-actions.example.tsx",
      fragments: ["Ask AI", "Open Logs", "Run Tests", "Push Branch", "Pin important actions", 'heading="Pinned"']
    },
    {
      file: "src/examples/99-command-density-toggle.example.tsx",
      fragments: ["Open file", "Run check", "Summarize logs", "Search actions", '"Comfortable"', '"Dense"']
    },
    {
      file: "src/examples/101-sonner-cancel-job.example.tsx",
      fragments: ["Generating summary", 'label: "Cancel"', "Summary cancelled", "Start Summary"]
    },
    {
      file: "src/examples/102-sonner-action-chain.example.tsx",
      fragments: ["Branch pushed", "Open PR", "Pull request opened", "Push Branch"]
    },
    {
      file: "src/examples/105-animated-focus-ring.example.tsx",
      fragments: ["Logs", "Preview", "Focused", "Idle"]
    },
    {
      file: "src/examples/56-ai-inline-rewrite.example.tsx",
      fragments: ["Route smoke failed", "preview route", "Restore /preview", "The test failed"]
    },
    {
      file: "src/examples/57-ai-diff-review.example.tsx",
      fragments: ["Before", "Run failed", "AI Suggestion", "Visual smoke failed", "Accept Suggestion"]
    },
    {
      file: "src/examples/68-react-flow-save-restore.example.tsx",
      fragments: ['label: "Draft"', 'label: "Ship"', ">Save<", ">Restore<"]
    },
    {
      file: "src/examples/84-job-floating-center.example.tsx",
      fragments: ["Dashboard content", "Global work", "2 jobs running", "Close", "Pulling origin", "Show Job Center"]
    },
    {
      file: "src/examples/85-drilldown-log-search.example.tsx",
      fragments: ["install completed", "visual smoke failed", "matching lines", "Search stays"]
    },
    {
      file: "src/examples/43-react-flow-node-toolbar.example.tsx",
      fragments: ["Select me", "Open logs", "Focus", "Click the nodes"]
    },
    {
      file: "src/examples/74-sonner-report-error.example.tsx",
      fragments: ["Push failed", "origin rejected", "View logs", "Opening push logs", "Report Error"]
    },
    {
      file: "src/examples/78-animated-resize-panel.example.tsx",
      fragments: ["Toggle Panel", "Expanded context", "Compact context", "Panel width and content density"]
    },
    {
      file: "src/examples/92-react-flow-update-node-data.example.tsx",
      fragments: ['label: "Queued"', 'label: "Waiting"', 'label: "Running"', "Mark Running"]
    },
    {
      file: "src/examples/94-react-flow-computing-flows.example.tsx",
      fragments: ['label: "Input"', 'label: "Lint"', 'label: "Test"', 'label: "Ship"', "outgoing:", "none"]
    },
    {
      file: "src/examples/103-animated-kanban-card.example.tsx",
      fragments: ['"Queued"', '"Running"', '"Review"', "visual smoke"]
    },
    {
      file: "src/examples/03-assistant-drawer.example.tsx",
      fragments: ["Why did the latest run fail", "Deploy Preview", "Open assistant", "AI Assistant", "Context:"]
    },
    {
      file: "src/examples/05-job-log-drawer.example.tsx",
      fragments: ["remote: Enumerating", "receiving objects", "resolving deltas", "checking workspace"]
    },
    {
      file: "src/examples/11-react-flow-subflow.example.tsx",
      fragments: ["Quality stage", "Typecheck", "Visual smoke", "Deploy", "passed", "failed", "waiting"]
    },
    {
      file: "src/examples/18-animated-timeline.example.tsx",
      fragments: ["Pull started", "Objects received", "Deltas resolved", "Workspace checked", "Ready"]
    },
    {
      file: "src/examples/106-ai-selection-toolbar.example.tsx",
      fragments: ["Select text to ask AI", "The visual smoke job failed", "Explain", "Missing route", "Fix"]
    },
    {
      file: "src/examples/107-ai-context-chips.example.tsx",
      fragments: ["current page", "git diff", "workflow log", "screenshot", "AI context"]
    },
    {
      file: "src/examples/108-ai-sidecar-tabs.example.tsx",
      fragments: ["The failure is caused", "Restore route", "What changed", "route-level regression"]
    },
    {
      file: "src/examples/109-job-phase-ring.example.tsx",
      fragments: ['name: "fetch"', 'name: "build"', 'name: "verify"', "Next Phase", "#fafafa", "#27272a"]
    },
    {
      file: "src/examples/110-job-sla-alert.example.tsx",
      fragments: ["SLA breached", "remaining", "Escalate if deploy"]
    },
    {
      file: "src/examples/111-job-waterfall.example.tsx",
      fragments: ['name: "install"', 'name: "typecheck"', 'name: "build"', 'name: "smoke"']
    },
    {
      file: "src/examples/112-drilldown-metric-breakdown.example.tsx",
      fragments: ["Latency rose after deploy", "Stable route checks", "Queue is draining slowly"]
    },
    {
      file: "src/examples/113-drilldown-status-filters.example.tsx",
      fragments: ['name: "preview"', '["all", "failed", "running", "success"]', "filtered.length} runs", "Filtered by"]
    },
    {
      file: "src/examples/37-job-retry-failure.example.tsx",
      fragments: ["visual smoke", ">Retry<"]
    },
    {
      file: "src/examples/58-job-cancel-action.example.tsx",
      fragments: [">Cancel<"]
    },
    {
      file: "src/examples/61-tree-drilldown.example.tsx",
      fragments: ["Workflow run", "Build job", "Visual smoke job", "Route check", "Screenshot diff", "ID:"]
    },
    {
      file: "src/examples/122-command-result-preview.example.tsx",
      fragments: ["Runs install", "Failed in visual-smoke", "Target registration", "Search everything", "Results"]
    },
    {
      file: "src/examples/123-command-inline-actions.example.tsx",
      fragments: ["Choose a row action", "Search runs", 'heading="Runs"', "Opening", "Retrying", ">Open<", ">Retry<"]
    },
    {
      file: "src/examples/124-command-disabled-items.example.tsx",
      fragments: ["Push branch", "Deploy production", "Open logs", "Search guarded actions", 'heading="Actions"', "locked", "ready"]
    },
    {
      file: "src/examples/125-sonner-copy-action.example.tsx",
      fragments: ["Command copied", "Copy again", "Copied to clipboard", "Copy Build Command"]
    },
    {
      file: "src/examples/126-sonner-persistent-status.example.tsx",
      fragments: ["Waiting for CI", "This toast stays until dismissed", "Show Persistent Status"]
    },
    {
      file: "src/examples/127-sonner-multi-action.example.tsx",
      fragments: ["Workflow failed", "Choose the next action", "Opening logs", "Retry queued", "Show Multi Action Toast"]
    },
    {
      file: "src/examples/128-animated-filter-list.example.tsx",
      fragments: ['"visual-smoke"', '"typecheck"', '"build"', '"failed"', '"running"', '"success"', '"all"']
    },
    {
      file: "src/examples/129-animated-command-bar.example.tsx",
      fragments: ["Toggle Bar", "Ask AI anything", "Send</button>"]
    },
    {
      file: "src/examples/130-animated-swipe-list.example.tsx",
      fragments: ["Review logs", "Fix route", "Rerun smoke", "Done</button>", "All clear"]
    },
    {
      file: "src/examples/131-ai-floating-copilot.example.tsx",
      fragments: ["Current app screen", "The copilot floats above", "How can I help", "Ask about this page"]
    },
    {
      file: "src/examples/132-ai-artifact-preview.example.tsx",
      fragments: ["The deploy failed", "restore preview route", "Restore route", "Rerun smoke", "Push branch", "I generated three artifacts", ">summary<", ">patch<", ">checklist<"]
    },
    {
      file: "src/examples/133-ai-reasoning-progress.example.tsx",
      fragments: ["Reading diff", "Checking logs", "Mapping failure", "Drafting answer", ">Continue<"]
    },
    {
      file: "src/examples/134-job-top-layer-tray.example.tsx",
      fragments: ["git pull", "typecheck", "preview build", "App workspace", "Top-level tray", "3 running jobs"]
    },
    {
      file: "src/examples/135-job-stage-accordion.example.tsx",
      fragments: ["Prepare", "Validate", "Publish", "fetch origin", "install dependencies", "unit test", "upload artifact"]
    },
    {
      file: "src/examples/136-job-log-level-filter.example.tsx",
      fragments: ['"info"', '"warn"', '"error"', '"all"', "build started", "slow dependency install", "route smoke failed", "artifact uploaded"]
    },
    {
      file: "src/examples/144-react-flow-temporary-edge.example.tsx",
      fragments: ['label: "Draft"', 'label: "Ghost target"', "Temporary Edge", ">Hide<", ">Show<"]
    },
    {
      file: "src/examples/145-react-flow-whiteboard-rectangle.example.tsx",
      fragments: ['label: "Node A"', 'label: "Node B"', ">Hide<", ">Show<"]
    },
    {
      file: "src/examples/146-command-history-stack.example.tsx",
      fragments: ["Open logs", "Explain failure", "Create patch", "Rerun job", "Run an action", 'heading="Actions"']
    },
    {
      file: "src/examples/147-command-error-state.example.tsx",
      fragments: ["Search remote actions", "Remote search failed", "Try again", 'heading="Local"', "Open logs", "Run build"]
    },
    {
      file: "src/examples/148-command-page-breadcrumb.example.tsx",
      fragments: ['root: ["Jobs"', "Failed runs", "Running jobs", "Changed files", "Config files", "Search page", ">root<", "Summarize"]
    },
    {
      file: "src/examples/150-sonner-queued-toasts.example.tsx",
      fragments: ['"Queued"', '"Running"', '"Completed"', "Queue Toasts"]
    },
    {
      file: "src/examples/151-sonner-inline-link.example.tsx",
      fragments: ["Workflow failed", "Open the run detail", 'label: "Open"', "Run detail opened", "Show Linked Toast"]
    },
    {
      file: "src/examples/152-sonner-countdown.example.tsx",
      fragments: ["Retrying in 3", "Retrying in 2", "Retrying in 1", "Retry started", "Start Countdown"]
    },
    {
      file: "src/examples/154-animated-collapsible-log.example.tsx",
      fragments: ["install complete", "typecheck complete", "visual smoke failed", ">Hide<", ">Show<"]
    },
    {
      file: "src/examples/137-drilldown-column-browser.example.tsx",
      fragments: ["workflows", '"deploy"', '"test"', '"build"', '"smoke"', '"unit"', '"e2e"', '"install"', '"bundle"', '"route"', '"screenshot"']
    },
    {
      file: "src/examples/138-drilldown-error-stack.example.tsx",
      fragments: ["Expected /preview to load", "Route no longer registered", "Routes rendered from config", "line {frame.line}"]
    },
    {
      file: "src/examples/139-drilldown-pivot-matrix.example.tsx",
      fragments: ['"api"', '"web"', '"worker"', '"failed"', '"running"', '"success"', "Pivot cell selected"]
    },
    {
      file: "src/examples/140-heatmap-weekday-labels.example.tsx",
      fragments: ['"Mon"', '"Tue"', '"Wed"', '"Thu"', '"Fri"']
    },
    {
      file: "src/examples/141-heatmap-cluster-bands.example.tsx",
      fragments: ['name: "frontend"', 'name: "agent"', 'name: "gateway"']
    },
    {
      file: "src/examples/142-react-flow-edge-types.example.tsx",
      fragments: ['label: "A"', 'label: "B"', 'label: "C"', 'label: "D"', 'label: "straight"', 'label: "smoothstep"']
    },
    {
      file: "src/examples/143-react-flow-reconnect-edge.example.tsx",
      fragments: ["Source", "Target A", "Target B", "Reconnect to"]
    },
    {
      file: "src/examples/160-job-parallel-lanes.example.tsx",
      fragments: ["frontend", "backend", "agent", "install", "build", "smoke", "package"]
    },
    {
      file: "src/examples/161-job-paused-state.example.tsx",
      fragments: ["Waiting for approval", "Job resumed", ">Resume<", ">Pause<"]
    },
    {
      file: "src/examples/162-drilldown-saved-view.example.tsx",
      fragments: ["Failures", "Running", "Mine", "visual-smoke", "deploy-preview", "api-build", "saved items"]
    },
    {
      file: "src/examples/163-drilldown-tag-cloud.example.tsx",
      fragments: ["route", "smoke", "deploy", "docs", "Filtering by"]
    },
    {
      file: "src/examples/165-heatmap-delta-mode.example.tsx",
      fragments: ["Show Delta", "Show Absolute"]
    },
    {
      file: "src/examples/166-react-flow-floating-edge.example.tsx",
      fragments: ["Floating source", "Floating target"]
    },
    {
      file: "src/examples/167-react-flow-intersections.example.tsx",
      fragments: ['label: "A"', 'label: "B"', ">Clear<", ">Mark<"]
    },
    {
      file: "src/examples/168-react-flow-lasso-selection.example.tsx",
      fragments: ['label: "One"', 'label: "Two"', ">Hide<", ">Show<"]
    },
    {
      file: "src/examples/169-react-flow-freehand-draw.example.tsx",
      fragments: ["Sketch note", ">Hide<", ">Show<"]
    },
    {
      file: "src/examples/170-react-flow-download-panel.example.tsx",
      fragments: ["Exportable flow", "Ready to export", "PNG export queued", "JSON export queued"]
    },
    {
      file: "src/examples/171-command-federated-search.example.tsx",
      fragments: ["Files", "Issues", "Docs", "All", "Search files, issues, and docs", "Preview route returns 404", "Build cache is stale", "Command composition", "Sonner position API"]
    },
    {
      file: "src/examples/172-command-confirm-danger.example.tsx",
      fragments: ["No destructive action selected", "Run an action", "Open logs", "Start dry run", "Danger zone", "Delete preview environment", "Confirm delete", "This action removes the preview environment", "Preview environment deleted", ">Confirm<"]
    },
    {
      file: "src/examples/173-command-tokenized-query.example.tsx",
      fragments: ["repo:web status:failed", "repo:api owner:me", "tag:ai file:diff.tsx", "Parsed results"]
    },
    {
      file: "src/examples/174-command-object-search.example.tsx",
      fragments: ["Deploy preview", "Unit tests", "Visual smoke", "Search structured records", 'heading="Runs"', "Owner:", "Status:"]
    },
    {
      file: "src/examples/175-command-inline-progress.example.tsx",
      fragments: ["Choose a job command", 'heading="Jobs"', "Pull latest changes", '"Ready"', "Open workflow logs"]
    },
    {
      file: "src/examples/176-sonner-optimistic-save.example.tsx",
      fragments: ["Draft has local edits", "Saved locally. Syncing remote", "Saving draft", "Draft saved", "Remote save completed", "Optimistic save", "Save Draft"]
    },
    {
      file: "src/examples/177-sonner-bulk-result.example.tsx",
      fragments: ["3 files formatted", "Show Bulk Result"]
    },
    {
      file: "src/examples/178-sonner-network-reconnect.example.tsx",
      fragments: ["You are offline", "Connection restored", "Background jobs will pause", "Queued jobs are resuming", '"Online"', '"Offline"', "Realtime updates are active", "Waiting for reconnect", "Go Offline", '"Reconnect"']
    },
    {
      file: "src/examples/179-sonner-validation-stack.example.tsx",
      fragments: ["Project name is required", "Fill the highlighted field", "Project created", "Project name", ">Create<"]
    },
    {
      file: "src/examples/180-sonner-deep-link-toast.example.tsx",
      fragments: ["Run finished", 'label: "Open"', "Toast action updates", "Show Toast"]
    },
    {
      file: "src/examples/181-animated-scroll-progress.example.tsx",
      fragments: ["event ${String", "workflow log line"]
    },
    {
      file: "src/examples/182-animated-shared-indicator.example.tsx",
      fragments: ['"Summary"', '"Logs"', '"Artifacts"', "selected"]
    },
    {
      file: "src/examples/183-animated-drag-card.example.tsx",
      fragments: ["Drag me"]
    },
    {
      file: "src/examples/185-animated-view-transition-tabs.example.tsx",
      fragments: ["Timeline", "Queued", "Pulled", "Built", "Review", "comments", "suggestion", "blockers"]
    },
    {
      file: "src/examples/186-ai-model-picker-chat.example.tsx",
      fragments: ["Explain failure", "Suggest patch", "Summarize run", "Choose a model and prompt", ">Fast<", ">Reasoning<", ">Code<"]
    },
    {
      file: "src/examples/187-ai-attachment-preview.example.tsx",
      fragments: ["Prompt attachments", "Explain the failure using", "no files"]
    },
    {
      file: "src/examples/188-ai-reasoning-collapse.example.tsx",
      fragments: ["Read workflow logs", "Compare failing step", "Draft smallest patch", ">Hide<", ">Show<", "Reasoning collapsed"]
    },
    {
      file: "src/examples/189-ai-tool-result-card.example.tsx",
      fragments: ["Tool has not run", "Tool call", "Tool returned 2 changed hunks", "Result attached to chat", ">Run<", ">Attach<"]
    },
    {
      file: "src/examples/198-react-flow-helper-lines.example.tsx",
      fragments: ['label: "Source"', 'label: "Target"', ">Hide<", ">Show<", "Helper Lines"]
    },
    {
      file: "src/examples/199-react-flow-copy-paste.example.tsx",
      fragments: ["Selected nodes", "Duplicate Node", "Copy ${items.length}"]
    },
    {
      file: "src/examples/200-react-flow-dark-mode-toggle.example.tsx",
      fragments: ["Color mode", ">Dark<", ">Light<", "{mode} mode"]
    },
    {
      file: "src/examples/201-command-filter-builder.example.tsx",
      fragments: ["status:failed", "owner:me", "type:deploy", "Add filter", 'heading="Filters"', ">on<", ">off<"]
    },
    {
      file: "src/examples/202-command-progressive-disclosure.example.tsx",
      fragments: ["Search actions", "Open logs", "Explain failure", "advanced commands", "Reset cache", "Force rebuild"]
    },
    {
      file: "src/examples/203-command-audit-log-action.example.tsx",
      fragments: ["Deploy approved", "Cache purged", "Secret rotated", "No audit event selected", "Search audit actions", "Audit trail"]
    },
    {
      file: "src/examples/204-command-variable-insert.example.tsx",
      fragments: ["Explain {{failed.step}} in", "Insert variable", 'heading="Variables"']
    },
    {
      file: "src/examples/205-command-shortcut-cheatsheet.example.tsx",
      fragments: ["Open command", "Open logs", "Toggle AI", "Focus jobs", "Search shortcuts", 'heading="Keyboard"']
    },
    {
      file: "src/examples/206-sonner-upload-progress.example.tsx",
      fragments: ["Uploading artifact", "Upload complete", "Artifact upload", ">Upload<"]
    },
    {
      file: "src/examples/207-sonner-destructive-confirm.example.tsx",
      fragments: ["Preview environment is running", "Delete preview", "Delete", "low-risk confirmation"]
    },
    {
      file: "src/examples/208-sonner-snooze-reminder.example.tsx",
      fragments: ["No reminder scheduled", "Review failed run", 'label: "Snooze"', "Run reminder", "Show Reminder"]
    },
    {
      file: "src/examples/209-sonner-autosave-status.example.tsx",
      fragments: ["Draft note", "Saving...", "Saved just now", "Autosaved"]
    },
    {
      file: "src/examples/210-sonner-rate-limit.example.tsx",
      fragments: ["Rate limit reached", "attempts remaining", "Run Action"]
    },
    {
      file: "src/examples/211-animated-exit-list.example.tsx",
      fragments: ["Complete First", ">running<", '"lint"', '"typecheck"', '"build"', '"smoke"']
    },
    {
      file: "src/examples/212-animated-parallax-panel.example.tsx",
      fragments: ["Scroll-linked layer"]
    },
    {
      file: "src/examples/213-animated-step-morph.example.tsx",
      fragments: ['"Idle"', '"Running"', '"Done"', "Next State"]
    },
    {
      file: "src/examples/214-animated-countdown-ring.example.tsx",
      fragments: ["#fafafa", "#27272a", ">Tick<"]
    },
    {
      file: "src/examples/215-animated-reorder-grid.example.tsx",
      fragments: [">Rotate<", "layout slot"]
    },
    {
      file: "src/examples/216-ai-stream-controls.example.tsx",
      fragments: ["Assistant stream", "Streaming paused", "Generating explanation", ">Resume<", ">Pause<"]
    },
    {
      file: "src/examples/217-ai-memory-toggle.example.tsx",
      fragments: ["repo conventions", "preferred branch", "test command", "Memory context", "memories attached"]
    },
    {
      file: "src/examples/218-ai-suggestion-cards.example.tsx",
      fragments: ["Explain logs", "Create patch", "Open failing file", "selected</span>"]
    },
    {
      file: "src/examples/219-ai-agent-handoff-map.example.tsx",
      fragments: ["Planner", "Coder", "Reviewer", ">active<", ">waiting<"]
    },
    {
      file: "src/examples/220-ai-error-recovery-panel.example.tsx",
      fragments: ["Tool call failed", "AI recovery", "Recovery prompt queued", "Retry With Context"]
    },
    {
      file: "src/examples/221-job-concurrency-limit.example.tsx",
      fragments: ['"build"', '"test"', '"deploy"', '"smoke"', ">running<", ">queued<", "Toggle Limit"]
    },
    {
      file: "src/examples/222-job-secret-mask.example.tsx",
      fragments: [">Mask<", ">Reveal<", "Safe Value"]
    },
    {
      file: "src/examples/223-job-deployment-gates.example.tsx",
      fragments: ['"review"', '"staging"', '"production"', ">approved<", ">waiting<", ">Approve<"]
    },
    {
      file: "src/examples/224-job-log-bookmarks.example.tsx",
      fragments: ["install dependencies", "run build", "visual smoke failed", "upload artifacts", "bookmarks</span>"]
    },
    {
      file: "src/examples/225-job-result-summary-tabs.example.tsx",
      fragments: ["Passed", "Failed", "Skipped", "checks passed", "jobs skipped"]
    },
    {
      file: "src/examples/226-drilldown-query-builder.example.tsx",
      fragments: ['"status"', '"owner"', '"branch"', ">Query<", "Click a field"]
    },
    {
      file: "src/examples/227-drilldown-permission-scope.example.tsx",
      fragments: ["Admin", "Member", "Guest", "secrets", "billing"]
    },
    {
      file: "src/examples/228-heatmap-threshold-editor.example.tsx",
      fragments: ["Hot threshold"]
    },
    {
      file: "src/examples/229-heatmap-selection-summary.example.tsx",
      fragments: ["selected</strong>", "Total {selected"]
    }
  ];
  const matches = [];

  for (const check of checks) {
    const source = await fs.readFile(path.join(root, check.file), "utf8");
    for (const fragment of check.fragments) {
      if (source.includes(fragment)) {
        matches.push(`${check.file}:${fragment}`);
      }
    }
  }

  return { matches };
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

async function inspectNavigationAndSearch(page, url) {
  await openCategory(page, url, "오버레이/명령");
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await page.getByRole("button", { name: /데이터 시각화/ }).click();
  await page.waitForSelector('[data-active-category="data-viz"]');
  const scrollAfter = await page.evaluate(() => window.scrollY);
  const dataVizCount = await page.locator(".example-section").count();
  const activeHeading = await page.evaluate(() => document.querySelector(".category-summary h2")?.textContent?.trim() ?? "");
  const searchTerm = "차트";
  const searchInputPresent = await page.evaluate(() => {
    const input = document.querySelector("#example-search");
    if (!(input instanceof HTMLInputElement)) return false;
    return true;
  });
  if (searchInputPresent) {
    await page.locator("#example-search").fill(searchTerm, { timeout: 5000 });
  }
  await page.waitForTimeout(240);
  const filteredCount = await page.locator(".example-section").count();
  const firstFilteredTitle = await page.evaluate(() => document.querySelector(".example-section h3")?.textContent?.trim() ?? "");

  return {
    activeHeading,
    searchTerm,
    searchInputPresent,
    dataVizCount,
    filteredCount,
    firstFilteredTitle,
    scrollDelta: Math.abs(scrollAfter - scrollBefore)
  };
}

async function inspectStableControls(page, url) {
  await openCategory(page, url, "오버레이/명령");
  const themeButton = page.locator('[data-stable-control="theme-toggle"]').first();
  const themeBeforeState = await page.evaluate(() => document.documentElement.dataset.theme ?? "");
  const themeBefore = await themeButton.boundingBox();
  await themeButton.click();
  await page.waitForTimeout(120);
  const themeAfter = await themeButton.boundingBox();
  const themeAfterState = await page.evaluate(() => document.documentElement.dataset.theme ?? "");

  const codeButton = page.locator('[data-testid="example-command-basic"] [data-stable-control="code-toggle"]').first();
  const codeBefore = await codeButton.boundingBox();
  await codeButton.click();
  await page.getByText('import { Command } from "cmdk";').waitFor({ timeout: 5000 });
  const codeAfter = await codeButton.boundingBox();

  return {
    themeWidthDelta: delta(themeBefore?.width, themeAfter?.width),
    themeHeightDelta: delta(themeBefore?.height, themeAfter?.height),
    themeBefore: themeBeforeState,
    themeAfter: themeAfterState,
    codeWidthDelta: delta(codeBefore?.width, codeAfter?.width),
    codeHeightDelta: delta(codeBefore?.height, codeAfter?.height)
  };
}

async function inspectVisibleKoreanGuard(page, url) {
  await openCategory(page, url, "오버레이/명령");
  await page.locator('[data-testid="example-command-basic"] [data-stable-control="command-open"]').click();
  await page.waitForSelector('[data-testid="example-command-basic"] .command-dialog');
  const text = await page.locator('[data-testid="example-command-basic"]').innerText();
  const forbidden = ["Dashboard", "Repositories", "Search commands", "Type a command", "No results found", "Pages"];

  return {
    forbiddenVisible: forbidden.filter((fragment) => text.includes(fragment))
  };
}

function delta(before = 0, after = 0) {
  return Math.round(Math.abs(after - before) * 100) / 100;
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

async function inspectEnglishSamples(page, url) {
  const samples = [
    ["오버레이/명령", "example-command-approval-matrix"],
    ["오버레이/명령", "example-command-recent-filter-pills"],
    ["모션/상태 전환", "example-animated-command-search-skeleton"],
    ["작업 진행/로그", "example-job-command-palette-launch"],
    ["플로우 빌더", "example-react-flow-edge-health-filter"],
    ["AI 작업 레이어", "example-assistant-drawer"],
    ["AI 작업 레이어", "example-ai-sidecar-tabs"],
    ["작업 진행/로그", "example-job-sla-alert"],
    ["드릴다운 탐색", "example-drilldown-status-filters"],
    ["플로우 빌더", "example-react-flow-subflow"],
    ["오버레이/명령", "example-command-disabled-items"],
    ["모션/상태 전환", "example-animated-filter-list"],
    ["모션/상태 전환", "example-animated-command-bar"],
    ["모션/상태 전환", "example-animated-swipe-list"],
    ["AI 작업 레이어", "example-ai-floating-copilot"],
    ["AI 작업 레이어", "example-ai-artifact-preview"],
    ["AI 작업 레이어", "example-ai-reasoning-progress"],
    ["작업 진행/로그", "example-job-top-layer-tray"],
    ["작업 진행/로그", "example-job-stage-accordion"],
    ["작업 진행/로그", "example-job-log-level-filter"],
    ["플로우 빌더", "example-react-flow-temporary-edge"],
    ["플로우 빌더", "example-react-flow-whiteboard-rectangle"],
    ["오버레이/명령", "example-command-history-stack"],
    ["오버레이/명령", "example-command-error-state"],
    ["오버레이/명령", "example-command-page-breadcrumb"],
    ["작업 진행/로그", "example-sonner-queued-toasts"],
    ["작업 진행/로그", "example-sonner-inline-link"],
    ["작업 진행/로그", "example-sonner-countdown"],
    ["모션/상태 전환", "example-animated-collapsible-log"],
    ["드릴다운 탐색", "example-drilldown-column-browser"],
    ["드릴다운 탐색", "example-drilldown-error-stack"],
    ["드릴다운 탐색", "example-drilldown-pivot-matrix"],
    ["데이터 시각화", "example-heatmap-weekday-labels"],
    ["데이터 시각화", "example-heatmap-cluster-bands"],
    ["플로우 빌더", "example-react-flow-edge-types"],
    ["플로우 빌더", "example-react-flow-reconnect-edge"],
    ["작업 진행/로그", "example-job-parallel-lanes"],
    ["작업 진행/로그", "example-job-paused-state"],
    ["드릴다운 탐색", "example-drilldown-saved-view"],
    ["드릴다운 탐색", "example-drilldown-tag-cloud"],
    ["데이터 시각화", "example-heatmap-delta-mode"],
    ["플로우 빌더", "example-react-flow-floating-edge"],
    ["플로우 빌더", "example-react-flow-intersections"],
    ["플로우 빌더", "example-react-flow-lasso-selection"],
    ["플로우 빌더", "example-react-flow-freehand-draw"],
    ["플로우 빌더", "example-react-flow-download-panel"],
    ["오버레이/명령", "example-command-federated-search"],
    ["오버레이/명령", "example-command-confirm-danger"],
    ["오버레이/명령", "example-command-tokenized-query"],
    ["오버레이/명령", "example-command-object-search"],
    ["오버레이/명령", "example-command-inline-progress"],
    ["작업 진행/로그", "example-sonner-optimistic-save"],
    ["작업 진행/로그", "example-sonner-bulk-result"],
    ["작업 진행/로그", "example-sonner-network-reconnect"],
    ["작업 진행/로그", "example-sonner-validation-stack"],
    ["작업 진행/로그", "example-sonner-deep-link-toast"],
    ["모션/상태 전환", "example-animated-scroll-progress"],
    ["모션/상태 전환", "example-animated-shared-indicator"],
    ["모션/상태 전환", "example-animated-drag-card"],
    ["모션/상태 전환", "example-animated-skeleton-to-content"],
    ["모션/상태 전환", "example-animated-view-transition-tabs"],
    ["AI 작업 레이어", "example-ai-model-picker-chat"],
    ["AI 작업 레이어", "example-ai-attachment-preview"],
    ["AI 작업 레이어", "example-ai-reasoning-collapse"],
    ["AI 작업 레이어", "example-ai-tool-result-card"],
    ["플로우 빌더", "example-react-flow-helper-lines"],
    ["플로우 빌더", "example-react-flow-copy-paste"],
    ["플로우 빌더", "example-react-flow-dark-mode-toggle"],
    ["오버레이/명령", "example-command-filter-builder"],
    ["오버레이/명령", "example-command-progressive-disclosure"],
    ["오버레이/명령", "example-command-audit-log-action"],
    ["오버레이/명령", "example-command-variable-insert"],
    ["오버레이/명령", "example-command-shortcut-cheatsheet"],
    ["작업 진행/로그", "example-sonner-upload-progress"],
    ["작업 진행/로그", "example-sonner-destructive-confirm"],
    ["작업 진행/로그", "example-sonner-snooze-reminder"],
    ["작업 진행/로그", "example-sonner-autosave-status"],
    ["작업 진행/로그", "example-sonner-rate-limit"],
    ["모션/상태 전환", "example-animated-exit-list"],
    ["모션/상태 전환", "example-animated-parallax-panel"],
    ["모션/상태 전환", "example-animated-step-morph"],
    ["모션/상태 전환", "example-animated-countdown-ring"],
    ["모션/상태 전환", "example-animated-reorder-grid"],
    ["AI 작업 레이어", "example-ai-stream-controls"],
    ["AI 작업 레이어", "example-ai-memory-toggle"],
    ["AI 작업 레이어", "example-ai-suggestion-cards"],
    ["AI 작업 레이어", "example-ai-agent-handoff-map"],
    ["AI 작업 레이어", "example-ai-error-recovery-panel"],
    ["작업 진행/로그", "example-job-concurrency-limit"],
    ["작업 진행/로그", "example-job-secret-mask"],
    ["작업 진행/로그", "example-job-deployment-gates"],
    ["작업 진행/로그", "example-job-log-bookmarks"],
    ["작업 진행/로그", "example-job-result-summary-tabs"],
    ["드릴다운 탐색", "example-drilldown-query-builder"],
    ["드릴다운 탐색", "example-drilldown-permission-scope"],
    ["데이터 시각화", "example-heatmap-threshold-editor"],
    ["데이터 시각화", "example-heatmap-selection-summary"]
  ];
  const forbidden = /\b(Open|Close|Show|Hide|Search|Loading|Current|Selected|Dashboard|Create|Cancel|Retry|Next|Previous|Expand|Collapse|Focus|Input|Logs|Answer|Status|Resources|Jobs|Steps|Command|Filter|Recent|Approval|Matrix|Launch|Health|Edge|Done|Running|Failed|Pending|Allowed|Blocked|Owner|Online|Offline|Reconnect|Confirm|Delete|Danger|Safe|Ready|Exportable|Draft|Save)\b/i;
  const violations = [];

  for (const [category, testId] of samples) {
    await openCategory(page, url, category);
    const locator = page.locator(`[data-testid="${testId}"]`);
    await locator.scrollIntoViewIfNeeded();
    await page.waitForTimeout(180);
    const text = compactText(await locator.innerText());
    const match = text.match(forbidden);
    if (match) {
      violations.push(`${testId}: ${match[0]}`);
    }
  }

  return {
    checked: samples.length,
    violations
  };
}

async function inspectMobile(page, url) {
  await openCategory(page, url, "오버레이/명령");
  await page.waitForSelector(".docs-page");
  await page.screenshot({ path: path.join(outputDir, "visual-mobile.png"), fullPage: false });
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

function compactText(value) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

async function openCategory(page, url, label) {
  if (serverExited) {
    throw new Error(`Vite server exited before navigation.\n${serverOutput}`);
  }
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: new RegExp(label) }).click();
}

async function waitForServer(url) {
  const deadline = Date.now() + 30_000;
  let lastError;
  while (Date.now() < deadline) {
    if (serverExited) {
      throw new Error(`Vite server exited before ready.\n${serverOutput}`);
    }
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

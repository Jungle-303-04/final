import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dashboardRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const finalRoot = path.resolve(dashboardRoot, "..");
const wikiRoot = path.resolve(finalRoot, "../WIKI");
const reportPath = path.join(dashboardRoot, "test-results/source-sync-report.json");
const ignored = new Set([".git", ".vite", ".venv", "__pycache__", "dist", "live-state", "node_modules", "test-results"]);
const sourceExt = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".yaml", ".yml", ".json", ".toml", ".md"]);
const allowedSourceBranches = new Set(["dev", "main", "codex/dashboard"]);
function run(cmd, args, cwd) { try { return execFileSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 1024 * 1024 * 8, timeout: 5000 }).trim(); } catch { return ""; } }
function count(root, current = root, acc = { files: 0, source: 0, docs: 0, bytes: 0 }) {
  if (!existsSync(current)) return acc;
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if (ignored.has(entry.name) || entry.name.endsWith(".tsbuildinfo") || entry.name.endsWith(".pyc")) continue;
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) count(root, full, acc);
    else { const ext = path.extname(entry.name); const st = statSync(full); acc.files += 1; acc.bytes += st.size; if (sourceExt.has(ext)) acc.source += 1; if (ext === ".md") acc.docs += 1; }
  }
  return acc;
}
function repo(label, root) { const branch = run("git", ["branch", "--show-current"], root) || "unknown"; return { label, root, branch, head: run("git", ["rev-parse", "--short=12", "HEAD"], root) || "unknown", dirty: run("git", ["status", "--porcelain"], root).split("\n").filter(Boolean).length, counts: count(root) }; }
const report = { generatedAt: new Date().toISOString(), repositories: [repo("final", finalRoot), repo("WIKI", wikiRoot), repo("dashboard", dashboardRoot)], runtime: { gateway: run("curl", ["-sS", "-m", "2", "http://localhost:18080/healthz"], finalRoot) } };
mkdirSync(path.dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (process.argv.includes("--check")) {
  if (!allowedSourceBranches.has(report.repositories[0].branch)) {
    console.error(`unexpected source branch: ${report.repositories[0].branch}`);
    process.exit(1);
  }
  if (report.repositories[2].counts.source < 5) {
    console.error("dashboard source sync report has too few source files.");
    process.exit(1);
  }
  console.log("source sync report is current.");
} else {
  console.log(`wrote ${path.relative(dashboardRoot, reportPath)}`);
}

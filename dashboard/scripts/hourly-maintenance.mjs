import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const dashboardRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(dashboardRoot, "..");
const reportPath = path.join(dashboardRoot, "test-results/hourly-maintenance-report.json");
function run(cmd, args, cwd = repoRoot) { return execFileSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 1024 * 1024 * 12 }).trim(); }
try { if (run("git", ["branch", "--show-current"]) !== "codex/dashboard") run("git", ["switch", "codex/dashboard"]); run("git", ["fetch", "--all", "--prune"]); run("npm", ["run", "sync:sources"], dashboardRoot); run("npm", ["run", "build"], dashboardRoot); mkdirSync(path.dirname(reportPath), { recursive: true }); writeFileSync(reportPath, JSON.stringify({ status: "ok", generatedAt: new Date().toISOString() }, null, 2)); } catch (error) { mkdirSync(path.dirname(reportPath), { recursive: true }); writeFileSync(reportPath, JSON.stringify({ status: "failed", error: error instanceof Error ? error.message : String(error) }, null, 2)); process.exit(1); }

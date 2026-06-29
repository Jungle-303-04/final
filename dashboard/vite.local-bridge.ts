import { execFile } from "node:child_process";
import { access, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { Plugin } from "vite";

const execFileAsync = promisify(execFile);
const dashboardRoot = path.dirname(fileURLToPath(import.meta.url));
const finalRoot = path.resolve(dashboardRoot, "..");
const wikiRoot = path.resolve(finalRoot, "../WIKI");
const stateDir = path.join(dashboardRoot, "live-state");
const manifestPath = path.join(dashboardRoot, "config/kubernetes/desired-manifest.yaml");
const gatewayTarget = process.env.VITE_GATEWAY_TARGET ?? "http://localhost:18081";
const gatewayPort = Number.parseInt(new URL(gatewayTarget).port || "80", 10);
const mgmt = ["--context", "kind-management", "-n", "management"];
type Status = "정상" | "대기" | "주의" | "오류";
type Event = { id: number; at: string; type: string; status: Status; message: string; detail?: string };
const clients = new Set<{ write: (event: Event) => void }>();
let nextId = 1;
let busy = false;

function now() { return new Date().toISOString(); }
function emit(type: string, status: Status, message: string, detail = "") {
  const event = { id: nextId++, at: now(), type, status, message, detail };
  for (const client of clients) client.write(event);
  return event;
}
async function cmd(name: string, args: string[], cwd = finalRoot, timeout = 120000) {
  try {
    const r = await execFileAsync(name, args, { cwd, encoding: "utf8", maxBuffer: 1024 * 1024 * 16, timeout });
    return { ok: true, command: `${name} ${args.join(" ")}`, cwd, stdout: r.stdout.trim(), stderr: r.stderr.trim() };
  } catch (error) {
    const e = error as Error & { stdout?: string; stderr?: string; code?: number };
    throw new Error(`${name} ${args.join(" ")} failed${e.code ? ` (${e.code})` : ""}: ${e.stderr?.trim() || e.stdout?.trim() || e.message}`);
  }
}
async function opt(name: string, args: string[], cwd = finalRoot, fallback = "", timeout = 5000) {
  try { return (await cmd(name, args, cwd, timeout)).stdout || fallback; } catch { return fallback; }
}
async function exists(file: string) { try { await access(file); return true; } catch { return false; } }
function parseImage(yaml: string) { return yaml.match(/image:\s*["']?([^"'\s]+)/)?.[1] ?? ""; }
function parseReplicas(yaml: string) { return Number.parseInt(yaml.match(/(?:replicaCount|replicas):\s*(\d+)/)?.[1] ?? "1", 10) || 1; }
function parseMeta(yaml: string, key: "name" | "namespace", fallback: string) {
  let meta = false;
  for (const line of yaml.split("\n")) {
    if (/^metadata:\s*$/.test(line)) { meta = true; continue; }
    if (meta && /^\S/.test(line)) meta = false;
    const m = meta ? line.match(new RegExp(`^\\s{2}${key}:\\s*([^\\s]+)`)) : null;
    if (m) return m[1];
  }
  return fallback;
}
function version() { return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"); }
function versioned(yaml: string, v: string) { return `# releasegraph-version: ${v}\n${yaml.replace(/^# releasegraph-version: .*\n/, "").trimEnd()}\n`; }
function rel(file: string) { return path.relative(finalRoot, file); }
function parseCommits(text: string) {
  return text.split("\n").filter(Boolean).map((line) => {
    const [hash, date, ...subject] = line.split("\t");
    return { hash, date, subject: subject.join("\t") };
  });
}
async function repo(label: "final" | "WIKI", root: string) {
  const branch = await opt("git", ["branch", "--show-current"], root, "unknown");
  const status = (await opt("git", ["status", "--porcelain=v1"], root)).split("\n").filter(Boolean);
  const upstream = await opt("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], root);
  return {
    label, root, exists: await exists(path.join(root, ".git")), status: status.length || !upstream ? "주의" as Status : "정상" as Status,
    branch, head: await opt("git", ["rev-parse", "--short=12", "HEAD"], root, "unknown"), upstream,
    remote: await opt("git", ["remote", "get-url", "origin"], root), ahead: 0, behind: 0,
    dirty: status.filter((s) => !s.startsWith("??")).length, untracked: status.filter((s) => s.startsWith("??")).length,
    subject: await opt("git", ["log", "-1", "--pretty=%s"], root), committedAt: await opt("git", ["log", "-1", "--pretty=%cI"], root),
    statusLines: status,
    recentCommits: parseCommits(await opt("git", ["log", "--date=iso-strict", "--pretty=format:%h%x09%cI%x09%s", "-n", "5"], root)),
  };
}
async function count(root: string, current = root, acc = { files: 0, source: 0, docs: 0, bytes: 0 }) {
  const ignored = new Set([".git", ".vite", ".venv", "__pycache__", "dist", "live-state", "node_modules", "test-results"]);
  const src = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".yaml", ".yml", ".json", ".toml", ".md"]);
  for (const e of await readdir(current, { withFileTypes: true })) {
    if (ignored.has(e.name) || e.name.endsWith(".tsbuildinfo")) continue;
    const f = path.join(current, e.name);
    if (e.isDirectory()) await count(root, f, acc);
    else { const s = await stat(f); const ext = path.extname(e.name); acc.files++; acc.bytes += s.size; if (src.has(ext)) acc.source++; if (ext === ".md") acc.docs++; }
  }
  return acc;
}
async function svc(id: string, name: string, port: number) {
  const line = (await opt("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], finalRoot, "", 3000)).split("\n").filter(Boolean)[1] ?? "";
  return { id, name, port, status: line ? "정상" as Status : "오류" as Status, detail: line || `:${port} 리슨 없음` };
}
async function health() {
  try { const r = await cmd("curl", ["-sS", "-m", "3", `${gatewayTarget}/healthz`], finalRoot, 5000); return { status: r.stdout.includes("ok") ? "정상" as Status : "주의" as Status, detail: `${gatewayTarget} ${r.stdout}` }; }
  catch (e) { return { status: "오류" as Status, detail: e instanceof Error ? e.message : String(e) }; }
}
async function kctx(context: string) {
  const nodes = await opt("kubectl", ["--context", context, "get", "nodes", "--no-headers", "--request-timeout=5s"], finalRoot, "", 7000);
  const pods = await opt("kubectl", ["--context", context, "get", "pods", "-A", "--no-headers", "--request-timeout=5s"], finalRoot, "", 7000);
  return { context, status: nodes ? "정상" as Status : "오류" as Status, nodes: nodes.split("\n").filter(Boolean).length, pods: pods.split("\n").filter(Boolean).length, detail: nodes ? "kubectl API 수집 성공" : "kubectl 접근 실패" };
}
async function workloads(context: string, namespace: string) {
  const out = await opt("kubectl", ["--context", context, "-n", namespace, "get", "deploy", "-o", "jsonpath={range .items[*]}{.metadata.name}|{.status.readyReplicas}|{.status.replicas}{\"\\n\"}{end}", "--request-timeout=5s"], finalRoot, "", 7000);
  return out.split("\n").filter(Boolean).map((line) => {
    const [name, ready = "0", replicas = "0"] = line.split("|");
    return { id: `${context}-${namespace}-${name}`, context, namespace, name, ready: Number(ready) || 0, replicas: Number(replicas) || 0, status: ready === replicas && Number(replicas) > 0 ? "정상" as Status : "주의" as Status, detail: `${ready || 0}/${replicas || 0} ready` };
  });
}
async function config() {
  const yaml = await readFile(manifestPath, "utf8");
  return { path: manifestPath, relativePath: rel(manifestPath), yaml, version: yaml.match(/^# releasegraph-version:\s*(.+)$/m)?.[1] ?? "", image: parseImage(yaml), replicas: parseReplicas(yaml), resource: { name: parseMeta(yaml, "name", "checkout-api"), namespace: parseMeta(yaml, "namespace", "sandbox") }, lastCommit: await opt("git", ["log", "-1", "--pretty=format:%h%x09%cI%x09%s", "--", rel(manifestPath)], finalRoot), diff: await opt("git", ["diff", "--", rel(manifestPath)], finalRoot), ghStatus: await opt("gh", ["auth", "status"], finalRoot, "gh auth 확인 필요") };
}
async function overview() {
  const [finalRepo, wikiRepo, gateway, vite, pf, pg, redis, nats, management, target, mw, tw] = await Promise.all([
    repo("final", finalRoot), repo("WIKI", wikiRoot), health(), svc("vite", "Vite 대시보드", 5173), svc("gateway-portforward", "Gateway port-forward", gatewayPort), svc("postgres", "PostgreSQL", 15432), svc("redis", "Redis", 16379), svc("nats", "NATS JetStream", 14222), kctx("kind-management"), kctx("kind-target"), workloads("kind-management", "management"), workloads("kind-target", "sandbox"),
  ]);
  return { generatedAt: now(), busy, repositories: [finalRepo, wikiRepo], sourceSummary: [{ label: "final", root: finalRoot, branch: finalRepo.branch, head: finalRepo.head, counts: await count(finalRoot) }, { label: "WIKI", root: wikiRoot, branch: wikiRepo.branch, head: wikiRepo.head, counts: await count(wikiRoot) }, { label: "dashboard", root: dashboardRoot, branch: finalRepo.branch, head: finalRepo.head, counts: await count(dashboardRoot) }], services: [vite, { id: "gateway", name: "API Gateway", port: gatewayPort, ...gateway }, pf, pg, redis, nats], clusters: [management, target], workloads: [...mw, ...tw] };
}
async function fetchRepos() { emit("repo.fetch.start", "주의", "git fetch 시작"); const a = await cmd("git", ["fetch", "--all", "--prune"], finalRoot); const b = await cmd("git", ["fetch", "--all", "--prune"], wikiRoot); emit("repo.fetch.done", "정상", "git fetch 완료"); return { a, b, overview: await overview() }; }
async function build(reason: string) { emit("build.start", "주의", "대시보드 build", reason); const sync = await cmd("npm", ["run", "sync:sources"], dashboardRoot); const built = await cmd("npm", ["run", "build"], dashboardRoot); emit("build.done", "정상", "build 완료"); return { sync, built }; }
async function pullBuild() { if (busy) throw new Error("파이프라인 실행 중"); busy = true; try { const fetch = await fetchRepos(); const built = await build("manual"); return { fetch, built, overview: await overview() }; } finally { busy = false; } }
async function dryRun(yaml: string) { await mkdir(stateDir, { recursive: true }); const f = path.join(stateDir, "dry-run.yaml"); await writeFile(f, yaml); const r = await cmd("kubectl", ["apply", "--dry-run=client", "-f", f], finalRoot); emit("yaml.dry_run", "정상", "YAML dry-run 성공", r.stdout); return { path: f, image: parseImage(yaml), replicas: parseReplicas(yaml), ...r }; }
async function diff(yaml: string) { await mkdir(stateDir, { recursive: true }); const f = path.join(stateDir, "proposed.yaml"); await writeFile(f, yaml); const out = await opt("git", ["diff", "--no-index", "--", manifestPath, f], finalRoot, "", 10000); emit("gitops.diff", out ? "주의" : "정상", "diff 계산", out ? "변경 있음" : "변경 없음"); return { diff: out, image: parseImage(yaml), replicas: parseReplicas(yaml) }; }
async function saveVersion(yaml: string) { const v = version(); await mkdir(path.dirname(manifestPath), { recursive: true }); await writeFile(manifestPath, versioned(yaml, v)); await cmd("kubectl", ["apply", "--dry-run=client", "-f", manifestPath], finalRoot); await cmd("git", ["add", "--", rel(manifestPath)], finalRoot); const commit = await cmd("git", ["commit", "-m", `dashboard: update kubernetes manifest ${v}`, "--", rel(manifestPath)], finalRoot); emit("gitops.versioned", "정상", "버전 커밋 완료", commit.stdout); return { version: v, commit, state: await config() }; }
async function pr(base: string, title: string, body: string) { const branch = await opt("git", ["branch", "--show-current"], finalRoot, "codex/프론트엔드-데모"); emit("gitops.pr.start", "주의", "PR 생성", `${branch} -> ${base}`); await cmd("git", ["push", "-u", "origin", branch], finalRoot); const created = await cmd("gh", ["pr", "create", "--base", base, "--head", branch, "--title", title, "--body", body], finalRoot); emit("gitops.pr.done", "정상", "PR 생성 완료", created.stdout); return { branch, base, prUrl: created.stdout }; }
async function deploy() { const c = await config(); emit("deploy.start", "주의", "target 배포", c.relativePath); const apply = await cmd("kubectl", ["--context", "kind-target", "apply", "-f", manifestPath], finalRoot); const rollout = await cmd("kubectl", ["--context", "kind-target", "-n", c.resource.namespace, "rollout", "status", `deploy/${c.resource.name}`, "--timeout=180s"], finalRoot); emit("deploy.done", "정상", "target 배포 완료", `${c.resource.namespace}/${c.resource.name}`); return { apply, rollout, overview: await overview() }; }
async function scale(namespace: string, name: string, replicas: number) { const safe = Math.max(0, Math.min(10, replicas)); emit("cluster.scale.start", "주의", "scale 시작", `${namespace}/${name} -> ${safe}`); const scaled = await cmd("kubectl", ["--context", "kind-target", "-n", namespace, "scale", `deploy/${name}`, `--replicas=${safe}`], finalRoot); if (safe > 0) await cmd("kubectl", ["--context", "kind-target", "-n", namespace, "rollout", "status", `deploy/${name}`, "--timeout=180s"], finalRoot); emit("cluster.scale.done", "정상", "scale 완료", `${namespace}/${name} -> ${safe}`); return { scaled, overview: await overview() }; }
async function fault() { emit("fault.inject", "주의", "Gateway scale 0"); await cmd("kubectl", [...mgmt, "scale", "deploy/api-gateway", "--replicas=0"], finalRoot); return { health: await health(), overview: await overview() }; }
async function recover() { emit("recovery.start", "주의", "Gateway scale 1"); await cmd("kubectl", [...mgmt, "scale", "deploy/api-gateway", "--replicas=1"], finalRoot); await cmd("kubectl", [...mgmt, "rollout", "status", "deploy/api-gateway", "--timeout=180s"], finalRoot); return { health: await health(), overview: await overview() }; }
async function body(req: IncomingMessage) { const chunks: Buffer[] = []; for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)); const text = Buffer.concat(chunks).toString("utf8"); return text ? JSON.parse(text) : {}; }
function json(res: ServerResponse, code: number, data: unknown) { res.statusCode = code; res.setHeader("content-type", "application/json; charset=utf-8"); res.end(JSON.stringify(data, null, 2)); }
async function api(req: IncomingMessage, res: ServerResponse, p: string) {
  try {
    if (req.method === "GET" && p === "/overview") return json(res, 200, await overview());
    if (req.method === "GET" && p === "/gitops/config") return json(res, 200, await config());
    if (req.method === "GET" && p === "/state/yaml") return json(res, 200, { yaml: await readFile(manifestPath, "utf8") });
    if (req.method === "POST" && p === "/repositories/fetch") return json(res, 200, await fetchRepos());
    if (req.method === "POST" && p === "/repositories/pull-build") return json(res, 200, await pullBuild());
    if (req.method === "POST" && p === "/yaml/dry-run") return json(res, 200, await dryRun(String((await body(req)).content ?? "")));
    if (req.method === "POST" && p === "/gitops/diff") return json(res, 200, await diff(String((await body(req)).content ?? "")));
    if (req.method === "POST" && p === "/gitops/save-version") return json(res, 200, await saveVersion(String((await body(req)).content ?? "")));
    if (req.method === "POST" && p === "/gitops/pr") { const b = await body(req); return json(res, 200, await pr(String(b.base ?? "main"), String(b.title ?? "dashboard: update kubernetes manifest"), String(b.body ?? "Created from ReleaseGraph dashboard."))); }
    if (req.method === "POST" && p === "/gitops/pull-build-deploy") { const pipeline = await pullBuild(); const deployed = await deploy(); return json(res, 200, { pipeline, deployed, overview: await overview() }); }
    if (req.method === "POST" && p === "/cluster/deploy") return json(res, 200, await deploy());
    if (req.method === "POST" && p === "/cluster/scale") { const b = await body(req); return json(res, 200, await scale(String(b.namespace ?? "sandbox"), String(b.deployment ?? "checkout-api"), Number(b.replicas ?? 2))); }
    if (req.method === "POST" && p === "/fault/gateway/down") return json(res, 200, await fault());
    if (req.method === "POST" && p === "/fault/gateway/recover") return json(res, 200, await recover());
    return json(res, 404, { error: `unknown route ${p}` });
  } catch (e) { return json(res, 500, { error: e instanceof Error ? e.message : String(e) }); }
}
function events(req: IncomingMessage, res: ServerResponse) {
  res.statusCode = 200; res.setHeader("content-type", "text/event-stream; charset=utf-8"); res.setHeader("cache-control", "no-cache"); res.setHeader("connection", "keep-alive");
  const client = { write(event: Event) { res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`); } };
  clients.add(client); client.write({ id: nextId++, at: now(), type: "bridge.connected", status: "정상", message: "로컬 운영 브리지 SSE 연결" });
  const t = setInterval(() => client.write({ id: nextId++, at: now(), type: "bridge.heartbeat", status: "정상", message: "브리지 heartbeat" }), 15000);
  req.on("close", () => { clearInterval(t); clients.delete(client); });
}
export function localOperationsBridge(): Plugin {
  return { name: "releasegraph-local-operations-bridge", configureServer(server) { server.middlewares.use((req, res, next) => { if (!req.url?.startsWith("/local-api")) return next(); const p = new URL(req.url, "http://localhost").pathname.replace(/^\/local-api/, "") || "/"; if (req.method === "GET" && p === "/events") return events(req, res); void api(req, res, p); }); } };
}

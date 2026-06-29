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
const gatewayTarget = process.env.VITE_GATEWAY_TARGET ?? "http://localhost:18080";
const gatewayPort = Number.parseInt(new URL(gatewayTarget).port || "80", 10);
const portForwardSession = "releasegraph-gateway-portforward";
const mgmt = ["--context", "kind-management", "-n", "management"];
type Status = "정상" | "대기" | "주의" | "오류";
type BridgeEvent = { id: number; at: string; type: string; status: Status; message: string; detail?: string };
const clients = new Set<{ write: (event: BridgeEvent) => void }>();
let eventId = 1;
let pipelineBusy = false;

function now() { return new Date().toISOString(); }
function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function emit(type: string, status: Status, message: string, detail = "") { const event = { id: eventId++, at: now(), type, status, message, detail }; for (const client of clients) client.write(event); return event; }
async function cmd(name: string, args: string[], cwd = finalRoot, timeout = 120000) {
  try { const r = await execFileAsync(name, args, { cwd, encoding: "utf8", maxBuffer: 1024 * 1024 * 16, timeout }); return { ok: true, command: `${name} ${args.join(" ")}`, cwd, stdout: r.stdout.trim(), stderr: r.stderr.trim() }; }
  catch (error) { const e = error as Error & { stdout?: string; stderr?: string; code?: number }; throw new Error(`${name} ${args.join(" ")} failed${e.code ? ` (${e.code})` : ""}: ${e.stderr?.trim() || e.stdout?.trim() || e.message}`); }
}
async function opt(name: string, args: string[], cwd = finalRoot, fallback = "", timeout = 5000) { try { return (await cmd(name, args, cwd, timeout)).stdout || fallback; } catch { return fallback; } }
async function exists(file: string) { try { await access(file); return true; } catch { return false; } }
function rel(file: string) { return path.relative(finalRoot, file); }
function parseImage(yaml: string) { return yaml.match(/image:\s*["']?([^"'\s]+)/)?.[1] ?? ""; }
function parseReplicas(yaml: string) { return Number.parseInt(yaml.match(/(?:replicaCount|replicas):\s*(\d+)/)?.[1] ?? "1", 10) || 1; }
function parseMeta(yaml: string, key: "name" | "namespace", fallback: string) { let meta = false; for (const line of yaml.split("\n")) { if (/^metadata:\s*$/.test(line)) { meta = true; continue; } if (meta && /^\S/.test(line)) meta = false; const m = meta ? line.match(new RegExp(`^\\s{2}${key}:\\s*([^\\s]+)`)) : null; if (m) return m[1]; } return fallback; }
function releaseVersion() { return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"); }
function versioned(yaml: string, v: string) { return `# releasegraph-version: ${v}\n${yaml.replace(/^# releasegraph-version: .*\n/, "").trimEnd()}\n`; }
function commits(text: string) { return text.split("\n").filter(Boolean).map((line) => { const [hash, date, ...subject] = line.split("\t"); return { hash, date, subject: subject.join("\t") }; }); }
async function repo(label: "final" | "WIKI", root: string) {
  const branch = await opt("git", ["branch", "--show-current"], root, "unknown");
  const statusLines = (await opt("git", ["status", "--porcelain=v1"], root)).split("\n").filter(Boolean);
  const upstream = await opt("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], root);
  return { label, root, exists: await exists(path.join(root, ".git")), status: statusLines.length || !upstream ? "주의" as Status : "정상" as Status, branch, head: await opt("git", ["rev-parse", "--short=12", "HEAD"], root, "unknown"), upstream, remote: await opt("git", ["remote", "get-url", "origin"], root), ahead: 0, behind: 0, dirty: statusLines.filter((s) => !s.startsWith("??")).length, untracked: statusLines.filter((s) => s.startsWith("??")).length, subject: await opt("git", ["log", "-1", "--pretty=%s"], root), committedAt: await opt("git", ["log", "-1", "--pretty=%cI"], root), statusLines, recentCommits: commits(await opt("git", ["log", "--date=iso-strict", "--pretty=format:%h%x09%cI%x09%s", "-n", "5"], root)) };
}
async function count(root: string, current = root, acc = { files: 0, source: 0, docs: 0, bytes: 0 }) {
  const ignored = new Set([".git", ".vite", ".venv", "__pycache__", "dist", "live-state", "node_modules", "test-results"]);
  const src = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".yaml", ".yml", ".json", ".toml", ".md"]);
  for (const entry of await readdir(current, { withFileTypes: true })) { if (ignored.has(entry.name) || entry.name.endsWith(".tsbuildinfo")) continue; const full = path.join(current, entry.name); if (entry.isDirectory()) await count(root, full, acc); else { const s = await stat(full); const ext = path.extname(entry.name); acc.files++; acc.bytes += s.size; if (src.has(ext)) acc.source++; if (ext === ".md") acc.docs++; } }
  return acc;
}
async function service(id: string, name: string, port: number) { const line = (await opt("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], finalRoot, "", 3000)).split("\n").filter(Boolean)[1] ?? ""; return { id, name, port, status: line ? "정상" as Status : "오류" as Status, detail: line || `:${port} 리슨 없음` }; }
async function gatewayHealth() {
  let last = "";
  for (let i = 0; i < 3; i++) {
    try {
      const r = await cmd("curl", ["-sS", "-m", "5", `${gatewayTarget}/healthz`], finalRoot, 7000);
      return { status: r.stdout.includes("ok") ? "정상" as Status : "주의" as Status, detail: `${gatewayTarget} ${r.stdout}` };
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
      await sleep(400);
    }
  }
  return { status: "오류" as Status, detail: last };
}
async function context(context: string) { const nodes = await opt("kubectl", ["--context", context, "get", "nodes", "--no-headers", "--request-timeout=5s"], finalRoot, "", 7000); const pods = await opt("kubectl", ["--context", context, "get", "pods", "-A", "--no-headers", "--request-timeout=5s"], finalRoot, "", 7000); return { context, status: nodes ? "정상" as Status : "오류" as Status, nodes: nodes.split("\n").filter(Boolean).length, pods: pods.split("\n").filter(Boolean).length, detail: nodes ? "kubectl API 수집 성공" : "kubectl 접근 실패" }; }
async function workloads(context: string, namespace: string) { const out = await opt("kubectl", ["--context", context, "-n", namespace, "get", "deploy", "-o", "jsonpath={range .items[*]}{.metadata.name}|{.status.readyReplicas}|{.status.replicas}{\"\\n\"}{end}", "--request-timeout=5s"], finalRoot, "", 7000); return out.split("\n").filter(Boolean).map((line) => { const [name, ready = "0", replicas = "0"] = line.split("|"); return { id: `${context}-${namespace}-${name}`, context, namespace, name, ready: Number(ready) || 0, replicas: Number(replicas) || 0, status: ready === replicas && Number(replicas) > 0 ? "정상" as Status : "주의" as Status, detail: `${ready || 0}/${replicas || 0} ready` }; }); }
async function gitopsConfig() { const yaml = await readFile(manifestPath, "utf8"); return { path: manifestPath, relativePath: rel(manifestPath), yaml, version: yaml.match(/^# releasegraph-version:\s*(.+)$/m)?.[1] ?? "", image: parseImage(yaml), replicas: parseReplicas(yaml), resource: { name: parseMeta(yaml, "name", "checkout-api"), namespace: parseMeta(yaml, "namespace", "sandbox") }, lastCommit: await opt("git", ["log", "-1", "--pretty=format:%h%x09%cI%x09%s", "--", rel(manifestPath)], finalRoot), diff: await opt("git", ["diff", "--", rel(manifestPath)], finalRoot), ghStatus: await opt("gh", ["auth", "status"], finalRoot, "gh auth 확인 필요") }; }
async function overview() {
  const gatewayListenerName = gatewayPort === 18080 ? "Gateway NodePort 리스너" : "Gateway port-forward";
  const [fr, wr, gh, vite, pf, pg, redis, nats, km, kt, mw, tw] = await Promise.all([repo("final", finalRoot), repo("WIKI", wikiRoot), gatewayHealth(), service("vite", "Vite 대시보드", 5173), service("gateway-portforward", gatewayListenerName, gatewayPort), service("postgres", "PostgreSQL", 15432), service("redis", "Redis", 16379), service("nats", "NATS JetStream", 14222), context("kind-management"), context("kind-target"), workloads("kind-management", "management"), workloads("kind-target", "sandbox")]);
  return { generatedAt: new Date().toISOString(), busy: pipelineBusy, repositories: [fr, wr], sourceSummary: [{ label: "final", root: finalRoot, branch: fr.branch, head: fr.head, counts: await count(finalRoot) }, { label: "WIKI", root: wikiRoot, branch: wr.branch, head: wr.head, counts: await count(wikiRoot) }, { label: "dashboard", root: dashboardRoot, branch: fr.branch, head: fr.head, counts: await count(dashboardRoot) }], services: [vite, { id: "gateway", name: "API Gateway", port: gatewayPort, ...gh }, pf, pg, redis, nats], clusters: [km, kt], workloads: [...mw, ...tw] };
}
async function fetchRepos() { emit("repo.fetch.start", "주의", "git fetch 시작"); const final = await cmd("git", ["fetch", "--all", "--prune"], finalRoot); const wiki = await cmd("git", ["fetch", "--all", "--prune"], wikiRoot); emit("repo.fetch.done", "정상", "git fetch 완료"); return { final, wiki, overview: await overview() }; }
async function pullBuild() { if (pipelineBusy) throw new Error("파이프라인 실행 중"); pipelineBusy = true; try { const fetch = await fetchRepos(); emit("build.start", "주의", "대시보드 build"); const sync = await cmd("npm", ["run", "sync:sources"], dashboardRoot); const build = await cmd("npm", ["run", "build"], dashboardRoot); emit("build.done", "정상", "build 완료"); return { fetch, sync, build, overview: await overview() }; } finally { pipelineBusy = false; } }
async function dryRun(yaml: string) { await mkdir(stateDir, { recursive: true }); const file = path.join(stateDir, "dry-run.yaml"); await writeFile(file, yaml); const r = await cmd("kubectl", ["apply", "--dry-run=client", "-f", file], finalRoot); emit("yaml.dry_run", "정상", "YAML dry-run 성공", r.stdout); return { path: file, image: parseImage(yaml), replicas: parseReplicas(yaml), ...r }; }
async function diff(yaml: string) { await mkdir(stateDir, { recursive: true }); const file = path.join(stateDir, "proposed.yaml"); await writeFile(file, yaml); const out = await opt("git", ["diff", "--no-index", "--", manifestPath, file], finalRoot, "", 10000); emit("gitops.diff", out ? "주의" : "정상", "diff 계산", out ? "변경 있음" : "변경 없음"); return { diff: out, image: parseImage(yaml), replicas: parseReplicas(yaml) }; }
async function saveVersion(yaml: string) { const v = releaseVersion(); await mkdir(path.dirname(manifestPath), { recursive: true }); await writeFile(manifestPath, versioned(yaml, v)); await cmd("kubectl", ["apply", "--dry-run=client", "-f", manifestPath], finalRoot); await cmd("git", ["add", "--", rel(manifestPath)], finalRoot); const commit = await cmd("git", ["commit", "-m", "feat: Kubernetes 설정 / 버전 커밋 / 배포 manifest", "-m", `- 이유: 브라우저에서 수정한 manifest를 ${v} 버전으로 남김`, "-m", "- 영향: dashboard/config/kubernetes/desired-manifest.yaml", "-m", "- 검증: kubectl apply --dry-run=client", "--", rel(manifestPath)], finalRoot); emit("gitops.versioned", "정상", "버전 커밋 완료", commit.stdout); return { version: v, commit, state: await gitopsConfig() }; }
async function createPr(base: string, title: string, body: string) { const branch = await opt("git", ["branch", "--show-current"], finalRoot, "codex/dashboard"); emit("gitops.pr.start", "주의", "PR 생성", `${branch} -> ${base}`); await cmd("git", ["push", "-u", "origin", branch], finalRoot); const pr = await cmd("gh", ["pr", "create", "--base", base, "--head", branch, "--title", title, "--body", body], finalRoot); emit("gitops.pr.done", "정상", "PR 생성 완료", pr.stdout); return { branch, base, prUrl: pr.stdout }; }
async function deploy() { const cfg = await gitopsConfig(); emit("deploy.start", "주의", "target 배포", cfg.relativePath); const apply = await cmd("kubectl", ["--context", "kind-target", "apply", "-f", manifestPath], finalRoot); const rollout = await cmd("kubectl", ["--context", "kind-target", "-n", cfg.resource.namespace, "rollout", "status", `deploy/${cfg.resource.name}`, "--timeout=180s"], finalRoot); emit("deploy.done", "정상", "target 배포 완료", `${cfg.resource.namespace}/${cfg.resource.name}`); return { apply, rollout, overview: await overview() }; }
async function scale(namespace: string, name: string, replicas: number) { const safe = Math.max(0, Math.min(10, replicas)); emit("cluster.scale.start", "주의", "scale 시작", `${namespace}/${name} -> ${safe}`); const scaled = await cmd("kubectl", ["--context", "kind-target", "-n", namespace, "scale", `deploy/${name}`, `--replicas=${safe}`], finalRoot); if (safe > 0) await cmd("kubectl", ["--context", "kind-target", "-n", namespace, "rollout", "status", `deploy/${name}`, "--timeout=180s"], finalRoot); emit("cluster.scale.done", "정상", "scale 완료", `${namespace}/${name} -> ${safe}`); return { scaled, overview: await overview() }; }
async function fault() { emit("fault.inject", "주의", "Gateway scale 0"); await cmd("kubectl", [...mgmt, "scale", "deploy/api-gateway", "--replicas=0"], finalRoot); await sleep(2500); const health = await gatewayHealth(); emit("fault.done", health.status === "오류" ? "주의" : "오류", "Gateway 장애 주입 결과", health.detail); return { health, overview: await overview() }; }
async function recover() {
  emit("recovery.start", "주의", "Gateway scale 1");
  await cmd("kubectl", [...mgmt, "scale", "deploy/api-gateway", "--replicas=1"], finalRoot);
  await cmd("kubectl", [...mgmt, "rollout", "status", "deploy/api-gateway", "--timeout=180s"], finalRoot);
  let health = await gatewayHealth();
  if (health.status !== "정상") {
    emit("recovery.portforward", "주의", "Gateway Pod 복구 후 port-forward 재연결", health.detail);
    health = (await recoverPortForward()).health;
  }
  emit("recovery.done", health.status === "정상" ? "정상" : "주의", "Gateway 복구 결과", health.detail);
  return { health, overview: await overview() };
}
async function recoverPortForward() {
  if (gatewayPort === 18080) {
    const health = await gatewayHealth();
    emit(
      health.status === "정상" ? "gateway.nodeport.ready" : "gateway.nodeport.failed",
      health.status,
      "Gateway NodePort 확인",
      health.detail,
    );
    return { health, overview: await overview() };
  }
  emit("portforward.recover.start", "주의", "Gateway port-forward 재기동", `${gatewayTarget} (${portForwardSession})`);
  await opt("screen", ["-S", portForwardSession, "-X", "quit"], finalRoot, "", 3000);
  await sleep(800);
  await cmd("screen", ["-dmS", portForwardSession, "zsh", "-lc", `kubectl --context kind-management -n management port-forward svc/api-gateway ${gatewayPort}:8000`], finalRoot, 5000);
  let health = await gatewayHealth();
  for (let i = 0; i < 10 && health.status !== "정상"; i++) {
    await sleep(1000);
    health = await gatewayHealth();
  }
  emit(health.status === "정상" ? "portforward.recover.done" : "portforward.recover.failed", health.status, health.status === "정상" ? "Gateway port-forward 복구 완료" : "Gateway port-forward 복구 확인 필요", health.detail);
  return { health, overview: await overview() };
}
async function readJson(req: IncomingMessage) { const chunks: Buffer[] = []; for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)); const text = Buffer.concat(chunks).toString("utf8"); return text ? JSON.parse(text) : {}; }
function send(res: ServerResponse, status: number, data: unknown) { res.statusCode = status; res.setHeader("content-type", "application/json; charset=utf-8"); res.end(JSON.stringify(data, null, 2)); }
async function api(req: IncomingMessage, res: ServerResponse, pathName: string) { try {
  if (req.method === "GET" && pathName === "/overview") return send(res, 200, await overview());
  if (req.method === "GET" && pathName === "/gitops/config") return send(res, 200, await gitopsConfig());
  if (req.method === "GET" && pathName === "/state/yaml") return send(res, 200, { yaml: await readFile(manifestPath, "utf8") });
  if (req.method === "POST" && pathName === "/repositories/fetch") return send(res, 200, await fetchRepos());
  if (req.method === "POST" && pathName === "/repositories/pull-build") return send(res, 200, await pullBuild());
  if (req.method === "POST" && pathName === "/yaml/dry-run") return send(res, 200, await dryRun(String((await readJson(req)).content ?? "")));
  if (req.method === "POST" && pathName === "/gitops/diff") return send(res, 200, await diff(String((await readJson(req)).content ?? "")));
  if (req.method === "POST" && pathName === "/gitops/save-version") return send(res, 200, await saveVersion(String((await readJson(req)).content ?? "")));
  if (req.method === "POST" && pathName === "/gitops/pr") { const b = await readJson(req); return send(res, 200, await createPr(String(b.base ?? "main"), String(b.title ?? "dashboard: update kubernetes manifest"), String(b.body ?? "Created from ReleaseGraph dashboard."))); }
  if (req.method === "POST" && pathName === "/gitops/pull-build-deploy") { const pipeline = await pullBuild(); const deployed = await deploy(); return send(res, 200, { pipeline, deployed, overview: await overview() }); }
  if (req.method === "POST" && pathName === "/cluster/deploy") return send(res, 200, await deploy());
  if (req.method === "POST" && pathName === "/cluster/scale") { const b = await readJson(req); return send(res, 200, await scale(String(b.namespace ?? "sandbox"), String(b.deployment ?? "checkout-api"), Number(b.replicas ?? 2))); }
  if (req.method === "POST" && pathName === "/fault/gateway/down") return send(res, 200, await fault());
  if (req.method === "POST" && pathName === "/fault/gateway/recover") return send(res, 200, await recover());
  if (req.method === "POST" && pathName === "/gateway/port-forward/recover") return send(res, 200, await recoverPortForward());
  return send(res, 404, { error: `unknown route ${pathName}` });
} catch (e) { return send(res, 500, { error: e instanceof Error ? e.message : String(e) }); } }
function sse(req: IncomingMessage, res: ServerResponse) { res.statusCode = 200; res.setHeader("content-type", "text/event-stream; charset=utf-8"); res.setHeader("cache-control", "no-cache"); const client = { write(event: BridgeEvent) { res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`); } }; clients.add(client); client.write({ id: eventId++, at: now(), type: "bridge.connected", status: "정상", message: "로컬 운영 브리지 SSE 연결" }); const t = setInterval(() => client.write({ id: eventId++, at: now(), type: "bridge.heartbeat", status: "정상", message: "브리지 heartbeat" }), 15000); req.on("close", () => { clearInterval(t); clients.delete(client); }); }
export function localOperationsBridge(): Plugin { return { name: "releasegraph-local-operations-bridge", configureServer(server) { server.middlewares.use((req, res, next) => { if (!req.url?.startsWith("/local-api")) return next(); const p = new URL(req.url, "http://localhost").pathname.replace(/^\/local-api/, "") || "/"; if (req.method === "GET" && p === "/events") return sse(req, res); void api(req, res, p); }); } }; }

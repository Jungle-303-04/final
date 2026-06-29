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
const bundledManifestPath = path.join(dashboardRoot, "config/kubernetes/desired-manifest.yaml");
const demoRepoUrl = process.env.DEMO_REPO_URL ?? "https://github.com/Jungle-303-04/releasegraph-dashboard-demo.git";
const demoRepoRoot = path.join(stateDir, "demo-repo");
const demoManifestRel = "manifests/checkout-api.yaml";
const manifestPath = path.join(demoRepoRoot, demoManifestRel);
const gatewayTarget = process.env.VITE_GATEWAY_TARGET ?? "http://localhost:18080";
const gatewayPort = Number.parseInt(new URL(gatewayTarget).port || "80", 10);
const portForwardSession = "releasegraph-gateway-portforward";
const mgmt = ["--context", "kind-management", "-n", "management"];
type Status = "정상" | "대기" | "주의" | "오류";
type BridgeEvent = { id: number; at: string; type: string; status: Status; message: string; detail?: string };
type ControlPlaneComponent = { name: string; status: Status; ready: string; restarts: number; detail: string };
const clients = new Set<{ write: (event: BridgeEvent) => void }>();
const recentEvents: BridgeEvent[] = [];
let eventId = 1;
let visualSequence = 1;
let pipelineBusy = false;

function now() { return new Date().toISOString(); }
function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function remember(event: BridgeEvent) { recentEvents.unshift(event); recentEvents.splice(80); return event; }
function emit(type: string, status: Status, message: string, detail = "") { const event = remember({ id: eventId++, at: now(), type, status, message, detail }); for (const client of clients) client.write(event); return event; }
async function cmd(name: string, args: string[], cwd = finalRoot, timeout = 120000) {
  try { const r = await execFileAsync(name, args, { cwd, encoding: "utf8", maxBuffer: 1024 * 1024 * 16, timeout }); return { ok: true, command: `${name} ${args.join(" ")}`, cwd, stdout: r.stdout.trim(), stderr: r.stderr.trim() }; }
  catch (error) { const e = error as Error & { stdout?: string; stderr?: string; code?: number }; throw new Error(`${name} ${args.join(" ")} failed${e.code ? ` (${e.code})` : ""}: ${e.stderr?.trim() || e.stdout?.trim() || e.message}`); }
}
async function opt(name: string, args: string[], cwd = finalRoot, fallback = "", timeout = 5000) { try { return (await cmd(name, args, cwd, timeout)).stdout || fallback; } catch { return fallback; } }
async function exists(file: string) { try { await access(file); return true; } catch { return false; } }
function rel(file: string) { return path.relative(finalRoot, file); }
function demoRel(file: string) { return path.relative(demoRepoRoot, file); }
function parseImage(yaml: string) { return yaml.match(/image:\s*["']?([^"'\s]+)/)?.[1] ?? ""; }
function parseReplicas(yaml: string) { return Number.parseInt(yaml.match(/(?:replicaCount|replicas):\s*(\d+)/)?.[1] ?? "1", 10) || 1; }
function parseMeta(yaml: string, key: "name" | "namespace", fallback: string) { let meta = false; for (const line of yaml.split("\n")) { if (/^metadata:\s*$/.test(line)) { meta = true; continue; } if (meta && /^\S/.test(line)) meta = false; const m = meta ? line.match(new RegExp(`^\\s{2}${key}:\\s*([^\\s]+)`)) : null; if (m) return m[1]; } return fallback; }
function releaseVersion() { return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"); }
function versioned(yaml: string, v: string) { return `# releasegraph-version: ${v}\n${yaml.replace(/^# releasegraph-version: .*\n/, "").trimEnd()}\n`; }
function commits(text: string) { return text.split("\n").filter(Boolean).map((line) => { const [hash, date, ...subject] = line.split("\t"); return { hash, date, subject: subject.join("\t") }; }); }
function statusRank(status: Status) { return { 정상: 0, 대기: 1, 주의: 2, 오류: 3 }[status]; }
function worstStatus(...statuses: Status[]) {
  return statuses.reduce((worst, status) => statusRank(status) > statusRank(worst) ? status : worst, "정상" as Status);
}
async function ensureDemoRepo() {
  await mkdir(stateDir, { recursive: true });
  if (!(await exists(path.join(demoRepoRoot, ".git")))) {
    await cmd("git", ["clone", demoRepoUrl, demoRepoRoot], dashboardRoot, 120000);
  }
  await mkdir(path.dirname(manifestPath), { recursive: true });
  if (!(await exists(manifestPath))) {
    const seed = await readFile(bundledManifestPath, "utf8");
    await writeFile(manifestPath, seed);
  }
  const hasHead = await opt("git", ["rev-parse", "--verify", "HEAD"], demoRepoRoot);
  if (!hasHead) {
    await writeFile(path.join(demoRepoRoot, "README.md"), "# ReleaseGraph Dashboard Demo\n\nGitOps 데모용 Kubernetes manifest 저장소입니다.\n");
    await cmd("git", ["add", "README.md", demoManifestRel], demoRepoRoot);
    await cmd("git", ["commit", "-m", "feat: 데모 manifest / 초기 GitOps 상태"], demoRepoRoot);
    await cmd("git", ["branch", "-M", "main"], demoRepoRoot);
    await cmd("git", ["push", "-u", "origin", "main"], demoRepoRoot);
    await cmd("git", ["checkout", "-b", "codex/dashboard-demo"], demoRepoRoot);
  } else {
    const branch = await opt("git", ["branch", "--show-current"], demoRepoRoot, "unknown");
    if (branch === "main" || branch === "master" || branch === "unknown") {
      await cmd("git", ["checkout", "-B", "codex/dashboard-demo"], demoRepoRoot);
    }
  }
}
async function repo(label: "final" | "WIKI" | "demo", root: string) {
  if (label === "demo") await ensureDemoRepo();
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
async function gatewayHealth(attempts = 2, maxSeconds = 2) {
  let last = "";
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await cmd("curl", ["-sS", "-m", String(maxSeconds), `${gatewayTarget}/healthz`], finalRoot, Math.ceil(maxSeconds * 1000) + 1000);
      return { status: r.stdout.includes("ok") ? "정상" as Status : "주의" as Status, detail: `${gatewayTarget} ${r.stdout}` };
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
      await sleep(250);
    }
  }
  return { status: "오류" as Status, detail: last };
}
async function context(context: string) { const nodes = await opt("kubectl", ["--context", context, "get", "nodes", "--no-headers", "--request-timeout=5s"], finalRoot, "", 7000); const pods = await opt("kubectl", ["--context", context, "get", "pods", "-A", "--no-headers", "--request-timeout=5s"], finalRoot, "", 7000); return { context, status: nodes ? "정상" as Status : "오류" as Status, nodes: nodes.split("\n").filter(Boolean).length, pods: pods.split("\n").filter(Boolean).length, detail: nodes ? "kubectl API 수집 성공" : "kubectl 접근 실패" }; }
async function workloads(context: string, namespace: string) { const out = await opt("kubectl", ["--context", context, "-n", namespace, "get", "deploy", "-o", "jsonpath={range .items[*]}{.metadata.name}|{.status.readyReplicas}|{.status.replicas}{\"\\n\"}{end}", "--request-timeout=5s"], finalRoot, "", 7000); return out.split("\n").filter(Boolean).map((line) => { const [name, ready = "0", replicas = "0"] = line.split("|"); return { id: `${context}-${namespace}-${name}`, context, namespace, name, ready: Number(ready) || 0, replicas: Number(replicas) || 0, status: ready === replicas && Number(replicas) > 0 ? "정상" as Status : "주의" as Status, detail: `${ready || 0}/${replicas || 0} ready` }; }); }
async function kubectlJson(args: string[]) { const out = await cmd("kubectl", args, finalRoot, 20000); return JSON.parse(out.stdout || "{}") as Record<string, unknown>; }
function asList(value: unknown) { return Array.isArray(value) ? value as Array<Record<string, unknown>> : []; }
function get(obj: unknown, pathName: string, fallback: unknown = "") {
  return pathName.split(".").reduce((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), obj) ?? fallback;
}
function podReady(pod: Record<string, unknown>) {
  const statuses = asList(get(pod, "status.containerStatuses", []));
  return statuses.length > 0 && statuses.every((s) => Boolean(s.ready));
}
function podRestarts(pod: Record<string, unknown>) {
  return asList(get(pod, "status.containerStatuses", [])).reduce((sum, s) => sum + Number(s.restartCount ?? 0), 0);
}
function annotation(item: Record<string, unknown>, key: string) {
  const annotations = get(item, "metadata.annotations", {}) as Record<string, unknown>;
  return String(annotations[key] ?? "");
}
function controlPlaneComponent(pod: Record<string, unknown>): ControlPlaneComponent {
  const name = String(get(pod, "metadata.name", "unknown"));
  const phase = String(get(pod, "status.phase", "Unknown"));
  const statuses = asList(get(pod, "status.containerStatuses", []));
  const readyCount = statuses.filter((s) => Boolean(s.ready)).length;
  const total = Math.max(statuses.length, 1);
  const restarts = podRestarts(pod);
  const waitingReason = statuses.map((s) => String(get(s, "state.waiting.reason", ""))).find(Boolean);
  const terminatedReason = statuses.map((s) => String(get(s, "lastState.terminated.reason", ""))).find(Boolean);
  const running = phase === "Running" && readyCount === total;
  const status: Status = running ? restarts >= 50 ? "주의" : "정상" : "오류";
  const reason = waitingReason ? ` · ${waitingReason}` : terminatedReason ? ` · last ${terminatedReason}` : "";
  return {
    name: name.replace(/-target-control-plane|-management-control-plane/, ""),
    status,
    ready: `${readyCount}/${total}`,
    restarts,
    detail: `${readyCount}/${total} ready · ${phase}${reason} · restart ${restarts}`,
  };
}
async function controlPlane(contextName: string) {
  try {
    const data = await kubectlJson(["--context", contextName, "-n", "kube-system", "get", "pods", "-o", "json", "--request-timeout=5s"]);
    const prefixes = ["kube-apiserver", "kube-controller-manager", "kube-scheduler", "etcd", "coredns", "kube-proxy"];
    const components = asList(data.items)
      .filter((pod) => prefixes.some((prefix) => String(get(pod, "metadata.name", "")).startsWith(prefix)))
      .map(controlPlaneComponent)
      .sort((a, b) => a.name.localeCompare(b.name));
    const critical = components.filter((component) => /^(etcd|kube-apiserver|kube-controller-manager|kube-scheduler)/.test(component.name));
    const status = critical.length ? worstStatus(...critical.map((component) => component.status)) : "오류";
    const degraded = critical.filter((component) => component.status !== "정상");
    return {
      status,
      components,
      detail: degraded.length ? degraded.map((component) => `${component.name} ${component.detail}`).join("; ") : "control-plane critical components ready",
    };
  } catch (e) {
    return {
      status: "오류" as Status,
      components: [],
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}
async function liveWorkload(namespace = "sandbox", name = "checkout-api") {
  const list = await kubectlJson(["--context", "kind-target", "-n", namespace, "get", "deploy,rs,pod,svc,endpoints", "-l", `app=${name}`, "-o", "json"]);
  const items = asList(list.items);
  const deployment = items.find((item) => item.kind === "Deployment") ?? {};
  const replicaSets = items.filter((item) => item.kind === "ReplicaSet").map((rs) => ({
    name: String(get(rs, "metadata.name")),
	    desired: Number(get(rs, "spec.replicas", 0)),
	    ready: Number(get(rs, "status.readyReplicas", 0)),
	    available: Number(get(rs, "status.availableReplicas", 0)),
	    revision: annotation(rs, "deployment.kubernetes.io/revision"),
	    createdAt: String(get(rs, "metadata.creationTimestamp", "")),
	  })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pods = items.filter((item) => item.kind === "Pod").map((pod) => ({
    name: String(get(pod, "metadata.name")),
    phase: String(get(pod, "status.phase")),
    ready: podReady(pod),
    restarts: podRestarts(pod),
    ip: String(get(pod, "status.podIP")),
    node: String(get(pod, "spec.nodeName")),
    image: String(get(pod, "spec.containers.0.image")),
    startedAt: String(get(pod, "status.startTime")),
    owner: String(get(pod, "metadata.ownerReferences.0.name")),
  })).sort((a, b) => a.name.localeCompare(b.name));
  const service = items.find((item) => item.kind === "Service") ?? {};
  const endpoints = items.find((item) => item.kind === "Endpoints") ?? {};
  const addresses = asList(get(endpoints, "subsets.0.addresses", [])).map((a) => ({
    ip: String(a.ip ?? ""),
    pod: String(get(a, "targetRef.name", "")),
    node: String(a.nodeName ?? ""),
  }));
  const generation = Number(get(deployment, "metadata.generation", 0));
  const observedGeneration = Number(get(deployment, "status.observedGeneration", 0));
  const replicas = Number(get(deployment, "spec.replicas", 0));
  const ready = Number(get(deployment, "status.readyReplicas", 0));
  const updated = Number(get(deployment, "status.updatedReplicas", 0));
  const available = Number(get(deployment, "status.availableReplicas", 0));
  const converged = generation > 0 && observedGeneration === generation && replicas === ready && replicas === updated && replicas === available;
  return {
    deployment: {
      name,
      namespace,
      generation,
      observedGeneration,
      revision: annotation(deployment, "deployment.kubernetes.io/revision"),
      replicas,
      ready,
      updated,
      available,
      image: String(get(deployment, "spec.template.spec.containers.0.image")),
      status: converged ? "정상" as Status : "주의" as Status,
    },
    replicaSets,
    pods,
    service: {
      name: String(get(service, "metadata.name", name)),
      type: String(get(service, "spec.type", "")),
      clusterIP: String(get(service, "spec.clusterIP", "")),
      port: String(get(service, "spec.ports.0.port", "")),
      targetPort: String(get(service, "spec.ports.0.targetPort", "")),
    },
    endpoints: addresses,
  };
}
function promValue(result: Array<Record<string, unknown>>) {
  const values = result
    .map((row) => Array.isArray(row.value) ? Number(row.value[1]) : Number.NaN)
    .filter(Number.isFinite);
  if (!values.length) return "";
  const total = values.reduce((sum, value) => sum + value, 0);
  return Number.isInteger(total) ? String(total) : total.toFixed(3);
}
async function promQuery(query: string) {
  const pathQuery = `/api/v1/namespaces/target/services/http:prometheus:9090/proxy/api/v1/query?query=${encodeURIComponent(query)}`;
  try {
	    const json = await kubectlJson(["--context", "kind-target", "get", "--raw", pathQuery]);
	    const result = asList(get(json, "data.result", []));
	    return { status: "정상" as Status, query, count: result.length, value: promValue(result), result: result.slice(0, 8) };
	  } catch (e) {
	    return { status: "오류" as Status, query, count: 0, value: "", result: [], error: e instanceof Error ? e.message : String(e) };
	  }
}
async function dashboardCards() {
  try {
	    const r = await cmd("curl", ["-sS", "-m", "2", `${gatewayTarget}/dashboard/query`], finalRoot, 3000);
    const json = JSON.parse(r.stdout || "{}") as { cards?: unknown[] };
    return { status: "정상" as Status, count: json.cards?.length ?? 0, sample: json.cards?.slice(0, 3) ?? [] };
  } catch (e) {
    return { status: "오류" as Status, count: 0, sample: [], error: e instanceof Error ? e.message : String(e) };
  }
}
async function visualState(proposedYaml?: string) {
  const cfg = await gitopsConfig();
  const yaml = proposedYaml ?? cfg.yaml;
  const desired = { image: parseImage(yaml), replicas: parseReplicas(yaml), namespace: cfg.resource.namespace, name: cfg.resource.name, yaml, version: cfg.version };
  const [demo, km, kt, kmControl, ktControl, live, metricUp, metricPods, metricReplicas, cards] = await Promise.all([
    repo("demo", demoRepoRoot),
    context("kind-management"),
    context("kind-target"),
    controlPlane("kind-management"),
    controlPlane("kind-target"),
    liveWorkload(desired.namespace, desired.name),
    promQuery("up"),
    promQuery(`max(kube_deployment_status_replicas_ready{namespace="${desired.namespace}",deployment="${desired.name}"})`),
    promQuery(`max(kube_deployment_spec_replicas{namespace="${desired.namespace}",deployment="${desired.name}"})`),
    dashboardCards(),
  ]);
  const prometheusReadyPods = Number(metricPods.value || 0);
  const targetStatus = worstStatus(kt.status, ktControl.status);
  const comparisons = [
    { key: "replicas", label: "선언 replicas", desired: desired.replicas, live: live.deployment.replicas, status: desired.replicas === live.deployment.replicas ? "정상" as Status : "주의" as Status },
    { key: "ready", label: "Ready Pod", desired: desired.replicas, live: live.deployment.ready, status: desired.replicas === live.deployment.ready ? "정상" as Status : "주의" as Status },
    { key: "generation", label: "Observed Gen", desired: live.deployment.generation, live: live.deployment.observedGeneration, status: live.deployment.generation === live.deployment.observedGeneration ? "정상" as Status : "주의" as Status },
    { key: "activePods", label: "실행 Pod", desired: desired.replicas, live: live.pods.length, status: desired.replicas === live.pods.length ? "정상" as Status : "주의" as Status },
    { key: "endpoints", label: "Service Endpoint", desired: live.deployment.ready, live: live.endpoints.length, status: live.deployment.ready === live.endpoints.length ? "정상" as Status : "주의" as Status },
    { key: "prometheusReady", label: "Prometheus Ready", desired: live.deployment.ready, live: prometheusReadyPods, status: live.deployment.ready === prometheusReadyPods ? "정상" as Status : "주의" as Status },
    { key: "controlPlane", label: "Control Plane", desired: "정상", live: targetStatus, status: targetStatus },
    { key: "image", label: "이미지", desired: desired.image, live: live.deployment.image, status: desired.image === live.deployment.image ? "정상" as Status : "오류" as Status },
  ];
  return {
    generatedAt: now(),
    demoRepo: demo,
    desired,
    live,
    comparisons,
    clusters: [
      { ...km, status: worstStatus(km.status, kmControl.status), detail: kmControl.status === "정상" ? km.detail : kmControl.detail, role: "Management", components: ["API Gateway", "NATS", "Redis", "PostgreSQL", "Processors"], componentStatus: kmControl.components },
      { ...kt, status: targetStatus, detail: ktControl.status === "정상" ? kt.detail : ktControl.detail, role: "Target", components: ["Target Agent", "Prometheus", "kube-state-metrics", "sandbox workload"], componentStatus: ktControl.components },
    ],
    metrics: { up: metricUp, sandboxPods: metricPods, replicas: metricReplicas },
    gateway: { health: await gatewayHealth(1, 1.5), cards },
	  sse: { localEvents: recentEvents.slice(0, 20), totalLocalEvents: recentEvents.length },
  };
}
function visualSummary(visual: Awaited<ReturnType<typeof visualState>>) {
  const driftKeys = new Set(["replicas", "ready", "generation", "activePods", "endpoints", "prometheusReady", "image"]);
  const mismatches = visual.comparisons.filter((comparison) => driftKeys.has(comparison.key) && comparison.status !== "정상").length;
  const alerts = visual.comparisons.filter((comparison) => comparison.status !== "정상").length;
  const targetCluster = visual.clusters.find((cluster) => cluster.role === "Target");
  return {
    desiredReplicas: visual.desired.replicas,
    liveReplicas: visual.live.deployment.replicas,
    readyPods: visual.live.deployment.ready,
    pods: visual.live.pods.length,
    endpoints: visual.live.endpoints.length,
    prometheusTargets: Number(visual.metrics.up.value || visual.metrics.up.count || 0),
    prometheusPods: Number(visual.metrics.sandboxPods.value || visual.metrics.sandboxPods.count || 0),
    deploymentMetric: Number(visual.metrics.replicas.value || visual.metrics.replicas.count || 0),
    mismatches,
    alerts,
    controlPlaneStatus: targetCluster?.status ?? "대기",
  };
}
async function gitopsConfig() {
  await ensureDemoRepo();
  const yaml = await readFile(manifestPath, "utf8");
  return {
    path: manifestPath,
    relativePath: demoRel(manifestPath),
    repoUrl: demoRepoUrl,
    yaml,
    version: yaml.match(/^# releasegraph-version:\s*(.+)$/m)?.[1] ?? "",
    image: parseImage(yaml),
    replicas: parseReplicas(yaml),
    resource: { name: parseMeta(yaml, "name", "checkout-api"), namespace: parseMeta(yaml, "namespace", "sandbox") },
    lastCommit: await opt("git", ["log", "-1", "--pretty=format:%h%x09%cI%x09%s", "--", demoRel(manifestPath)], demoRepoRoot),
    diff: await opt("git", ["diff", "--", demoRel(manifestPath)], demoRepoRoot),
    ghStatus: await opt("gh", ["auth", "status"], demoRepoRoot, "gh auth 확인 필요"),
  };
}
async function overview() {
  const gatewayListenerName = gatewayPort === 18080 ? "Gateway NodePort 리스너" : "Gateway port-forward";
  const [fr, wr, dr, gh, vite, pf, pg, redis, nats, km, kt, mw, tw] = await Promise.all([repo("final", finalRoot), repo("WIKI", wikiRoot), repo("demo", demoRepoRoot), gatewayHealth(), service("vite", "Vite 대시보드", 5173), service("gateway-portforward", gatewayListenerName, gatewayPort), service("postgres", "PostgreSQL", 15432), service("redis", "Redis", 16379), service("nats", "NATS JetStream", 14222), context("kind-management"), context("kind-target"), workloads("kind-management", "management"), workloads("kind-target", "sandbox")]);
  return { generatedAt: new Date().toISOString(), busy: pipelineBusy, repositories: [dr, fr, wr], sourceSummary: [{ label: "demo", root: demoRepoRoot, branch: dr.branch, head: dr.head, counts: await count(demoRepoRoot) }, { label: "dashboard", root: dashboardRoot, branch: fr.branch, head: fr.head, counts: await count(dashboardRoot) }, { label: "final", root: finalRoot, branch: fr.branch, head: fr.head, counts: await count(finalRoot) }, { label: "WIKI", root: wikiRoot, branch: wr.branch, head: wr.head, counts: await count(wikiRoot) }], services: [vite, { id: "gateway", name: "API Gateway", port: gatewayPort, ...gh }, pf, pg, redis, nats], clusters: [km, kt], workloads: [...mw, ...tw] };
}
async function fetchRepos() { await ensureDemoRepo(); emit("repo.fetch.start", "주의", "데모 GitOps 레포 fetch 시작", demoRepoUrl); const demo = await cmd("git", ["fetch", "--all", "--prune"], demoRepoRoot); emit("repo.fetch.done", "정상", "데모 GitOps 레포 fetch 완료"); return { demo, overview: await overview(), visual: await visualState() }; }
async function pullBuild() { if (pipelineBusy) throw new Error("파이프라인 실행 중"); pipelineBusy = true; try { const fetch = await fetchRepos(); emit("build.start", "주의", "대시보드 build"); const sync = await cmd("npm", ["run", "sync:sources"], dashboardRoot); const build = await cmd("npm", ["run", "build"], dashboardRoot); emit("build.done", "정상", "build 완료"); return { fetch, sync, build, overview: await overview(), visual: await visualState() }; } finally { pipelineBusy = false; } }
async function dryRun(yaml: string) { await mkdir(stateDir, { recursive: true }); const file = path.join(stateDir, "dry-run.yaml"); await writeFile(file, yaml); const r = await cmd("kubectl", ["apply", "--dry-run=client", "-f", file], finalRoot); emit("yaml.dry_run", "정상", "YAML dry-run 성공", r.stdout); return { path: file, image: parseImage(yaml), replicas: parseReplicas(yaml), ...r }; }
async function diff(yaml: string) { await ensureDemoRepo(); await mkdir(stateDir, { recursive: true }); const file = path.join(stateDir, "proposed.yaml"); await writeFile(file, yaml); const out = await opt("git", ["diff", "--no-index", "--", manifestPath, file], demoRepoRoot, "", 10000); emit("gitops.diff", out ? "주의" : "정상", "desired/live diff 계산", out ? "변경 있음" : "변경 없음"); return { diff: out, image: parseImage(yaml), replicas: parseReplicas(yaml), visual: await visualState(yaml) }; }
async function saveVersion(yaml: string) { await ensureDemoRepo(); const v = releaseVersion(); await mkdir(path.dirname(manifestPath), { recursive: true }); await writeFile(manifestPath, versioned(yaml, v)); await cmd("kubectl", ["apply", "--dry-run=client", "-f", manifestPath], finalRoot); await cmd("git", ["add", "--", demoRel(manifestPath)], demoRepoRoot); const hasChanges = await opt("git", ["diff", "--cached", "--quiet"], demoRepoRoot, "changed"); let commit = { ok: true, command: "git commit", cwd: demoRepoRoot, stdout: "변경 없음", stderr: "" }; if (hasChanges) commit = await cmd("git", ["commit", "-m", "feat: Kubernetes 설정 / 버전 커밋 / 데모 manifest", "-m", `- 이유: 브라우저에서 수정한 manifest를 ${v} 버전으로 남김`, "-m", `- 영향: ${demoManifestRel}`, "-m", "- 검증: kubectl apply --dry-run=client", "--", demoRel(manifestPath)], demoRepoRoot); emit("gitops.versioned", "정상", "데모 레포 버전 커밋 완료", commit.stdout); return { version: v, commit, state: await gitopsConfig(), visual: await visualState() }; }
async function createPr(base: string, title: string, body: string) {
  await ensureDemoRepo();
  const branch = await opt("git", ["branch", "--show-current"], demoRepoRoot, "codex/dashboard-demo");
  emit("gitops.pr.start", "주의", "데모 레포 PR 생성", `${branch} -> ${base}`);
  await cmd("git", ["push", "-u", "origin", branch], demoRepoRoot);
  const existing = await opt("gh", ["pr", "list", "--repo", "Jungle-303-04/releasegraph-dashboard-demo", "--head", branch, "--state", "open", "--json", "url", "--jq", ".[0].url"], demoRepoRoot);
  const prUrl = existing || (await cmd("gh", ["pr", "create", "--repo", "Jungle-303-04/releasegraph-dashboard-demo", "--base", base, "--head", branch, "--title", title, "--body", body], demoRepoRoot)).stdout;
  emit("gitops.pr.done", "정상", existing ? "기존 데모 PR 연결" : "데모 PR 생성 완료", prUrl);
  return { branch, base, prUrl, visual: await visualState() };
}
async function deploy() { const cfg = await gitopsConfig(); emit("deploy.start", "주의", "target 배포 시작", cfg.relativePath); const apply = await cmd("kubectl", ["--context", "kind-target", "apply", "-f", manifestPath], finalRoot); const rollout = await cmd("kubectl", ["--context", "kind-target", "-n", cfg.resource.namespace, "rollout", "status", `deploy/${cfg.resource.name}`, "--timeout=180s"], finalRoot); emit("deploy.done", "정상", "target 배포 완료", `${cfg.resource.namespace}/${cfg.resource.name}`); return { apply, rollout, overview: await overview(), visual: await visualState() }; }
async function scale(namespace: string, name: string, replicas: number) { const safe = Math.max(0, Math.min(10, replicas)); emit("cluster.scale.start", "주의", "scale 시작", `${namespace}/${name} -> ${safe}`); const before = await liveWorkload(namespace, name); const scaled = await cmd("kubectl", ["--context", "kind-target", "-n", namespace, "scale", `deploy/${name}`, `--replicas=${safe}`], finalRoot); if (safe > 0) await cmd("kubectl", ["--context", "kind-target", "-n", namespace, "rollout", "status", `deploy/${name}`, "--timeout=180s"], finalRoot); const after = await liveWorkload(namespace, name); emit("cluster.scale.done", "정상", "scale 완료", `${namespace}/${name}: ${before.deployment.ready}/${before.deployment.replicas} -> ${after.deployment.ready}/${after.deployment.replicas}`); return { scaled, before, after, overview: await overview(), visual: await visualState() }; }
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
  if (req.method === "GET" && pathName === "/visual-state") return send(res, 200, await visualState());
  if (req.method === "GET" && pathName === "/gitops/config") return send(res, 200, await gitopsConfig());
  if (req.method === "GET" && pathName === "/state/yaml") { await ensureDemoRepo(); return send(res, 200, { yaml: await readFile(manifestPath, "utf8") }); }
  if (req.method === "POST" && pathName === "/repositories/fetch") return send(res, 200, await fetchRepos());
  if (req.method === "POST" && pathName === "/repositories/pull-build") return send(res, 200, await pullBuild());
  if (req.method === "POST" && pathName === "/yaml/dry-run") return send(res, 200, await dryRun(String((await readJson(req)).content ?? "")));
  if (req.method === "POST" && pathName === "/gitops/diff") return send(res, 200, await diff(String((await readJson(req)).content ?? "")));
  if (req.method === "POST" && pathName === "/gitops/save-version") return send(res, 200, await saveVersion(String((await readJson(req)).content ?? "")));
  if (req.method === "POST" && pathName === "/gitops/pr") { const b = await readJson(req); return send(res, 200, await createPr(String(b.base ?? "main"), String(b.title ?? "dashboard: update kubernetes manifest"), String(b.body ?? "Created from ReleaseGraph dashboard."))); }
  if (req.method === "POST" && pathName === "/gitops/pull-build-deploy") { const pipeline = await pullBuild(); const deployed = await deploy(); return send(res, 200, { pipeline, deployed, overview: await overview(), visual: await visualState() }); }
  if (req.method === "POST" && pathName === "/cluster/deploy") return send(res, 200, await deploy());
  if (req.method === "POST" && pathName === "/cluster/scale") { const b = await readJson(req); return send(res, 200, await scale(String(b.namespace ?? "sandbox"), String(b.deployment ?? "checkout-api"), Number(b.replicas ?? 2))); }
  if (req.method === "POST" && pathName === "/fault/gateway/down") return send(res, 200, await fault());
  if (req.method === "POST" && pathName === "/fault/gateway/recover") return send(res, 200, await recover());
  if (req.method === "POST" && pathName === "/gateway/port-forward/recover") return send(res, 200, await recoverPortForward());
  return send(res, 404, { error: `unknown route ${pathName}` });
} catch (e) { return send(res, 500, { error: e instanceof Error ? e.message : String(e) }); } }
function sse(req: IncomingMessage, res: ServerResponse) { res.statusCode = 200; res.setHeader("content-type", "text/event-stream; charset=utf-8"); res.setHeader("cache-control", "no-cache"); const client = { write(event: BridgeEvent) { res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`); } }; clients.add(client); client.write(remember({ id: eventId++, at: now(), type: "bridge.connected", status: "정상", message: "로컬 운영 브리지 SSE 연결" })); const t = setInterval(() => client.write(remember({ id: eventId++, at: now(), type: "bridge.heartbeat", status: "정상", message: "브리지 heartbeat" })), 15000); req.on("close", () => { clearInterval(t); clients.delete(client); }); }
function writeStream(res: ServerResponse, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
function visualStream(req: IncomingMessage, res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader("content-type", "text/event-stream; charset=utf-8");
  res.setHeader("cache-control", "no-cache");
  res.setHeader("connection", "keep-alive");
  res.write("retry: 2000\n\n");
  let closed = false;
  let inFlight = false;
  const sendSnapshot = async () => {
    if (closed || inFlight) return;
    inFlight = true;
    try {
      const visual = await visualState();
      const summary = visualSummary(visual);
      const packet = {
        sequence: visualSequence++,
        at: now(),
        source: "kubectl(kind-target) + Prometheus(service proxy)",
        status: visual.comparisons.some((comparison) => comparison.status === "오류") ? "오류" as Status : summary.alerts ? "주의" as Status : "정상" as Status,
        summary,
        visual,
      };
      remember({ id: eventId++, at: packet.at, type: "visual.snapshot", status: packet.status, message: "SSE metric snapshot 수신", detail: `seq=${packet.sequence}; pods=${summary.pods}; up=${summary.prometheusTargets}` });
      writeStream(res, "visual.snapshot", packet);
    } catch (e) {
      const packet = { sequence: visualSequence++, at: now(), source: "kubectl(kind-target) + Prometheus(service proxy)", status: "오류" as Status, error: e instanceof Error ? e.message : String(e) };
      remember({ id: eventId++, at: packet.at, type: "visual.error", status: "오류", message: "SSE metric snapshot 실패", detail: packet.error });
      writeStream(res, "visual.error", packet);
    } finally {
      inFlight = false;
    }
  };
  void sendSnapshot();
  const t = setInterval(() => void sendSnapshot(), 3000);
  req.on("close", () => { closed = true; clearInterval(t); });
}
export function localOperationsBridge(): Plugin { return { name: "releasegraph-local-operations-bridge", configureServer(server) { server.middlewares.use((req, res, next) => { if (!req.url?.startsWith("/local-api")) return next(); const p = new URL(req.url, "http://localhost").pathname.replace(/^\/local-api/, "") || "/"; if (req.method === "GET" && p === "/events") return sse(req, res); if (req.method === "GET" && p === "/visual-stream") return visualStream(req, res); void api(req, res, p); }); } }; }

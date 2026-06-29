import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
const dashboardRoot = path.dirname(fileURLToPath(import.meta.url));
const finalRoot = path.resolve(dashboardRoot, "..");
const wikiRoot = path.resolve(finalRoot, "../WIKI");
const stateDir = path.join(dashboardRoot, "live-state");
const maxBuffer = 1024 * 1024 * 16;
let nextEventId = 1;
let pipelineBusy = false;
const clients = new Set();
function nowIso() {
    return new Date().toISOString();
}
function emit(type, status, message, detail, payload) {
    const event = { id: nextEventId++, at: nowIso(), type, status, message, detail, payload };
    for (const client of clients) {
        client.write(event);
    }
    return event;
}
async function command(commandName, args, cwd = finalRoot) {
    const startedAt = Date.now();
    try {
        const result = await execFileAsync(commandName, args, {
            cwd,
            encoding: "utf8",
            maxBuffer,
        });
        return {
            ok: true,
            command: `${commandName} ${args.join(" ")}`,
            cwd,
            stdout: result.stdout.trim(),
            stderr: result.stderr.trim(),
            durationMs: Date.now() - startedAt,
        };
    }
    catch (error) {
        const err = error;
        throw new Error(`${commandName} ${args.join(" ")} failed${err.code ? ` (${err.code})` : ""}: ${err.stderr?.trim() || err.stdout?.trim() || err.message}`);
    }
}
async function optionalCommand(commandName, args, cwd = finalRoot, fallback = "") {
    try {
        return (await command(commandName, args, cwd)).stdout || fallback;
    }
    catch {
        return fallback;
    }
}
async function exists(target) {
    try {
        await access(target);
        return true;
    }
    catch {
        return false;
    }
}
function parseAheadBehind(value) {
    const [aheadRaw, behindRaw] = value.trim().split(/\s+/);
    return {
        ahead: Number.parseInt(aheadRaw ?? "0", 10) || 0,
        behind: Number.parseInt(behindRaw ?? "0", 10) || 0,
    };
}
function parseRecentCommits(value) {
    return value
        .split("\n")
        .filter(Boolean)
        .map((line) => {
        const [hash, date, ...subject] = line.split("\t");
        return { hash, date, subject: subject.join("\t") };
    });
}
async function readRepo(label, root) {
    const repoExists = await exists(path.join(root, ".git"));
    if (!repoExists) {
        return {
            label,
            root,
            exists: false,
            status: "오류",
            branch: "없음",
            head: "없음",
            upstream: "",
            remote: "",
            ahead: 0,
            behind: 0,
            dirty: 0,
            untracked: 0,
            subject: "Git 저장소가 아닙니다",
            committedAt: "",
            statusLines: [],
            recentCommits: [],
        };
    }
    const [branch, head, upstream, remote, status, subject, committedAt, recent] = await Promise.all([
        optionalCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"], root, "unknown"),
        optionalCommand("git", ["rev-parse", "--short=12", "HEAD"], root, "unknown"),
        optionalCommand("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], root, ""),
        optionalCommand("git", ["remote", "get-url", "origin"], root, ""),
        optionalCommand("git", ["status", "--porcelain=v1"], root, ""),
        optionalCommand("git", ["log", "-1", "--pretty=%s"], root, "커밋 없음"),
        optionalCommand("git", ["log", "-1", "--pretty=%cI"], root, ""),
        optionalCommand("git", ["log", "--date=iso-strict", "--pretty=format:%h%x09%cI%x09%s", "-n", "5"], root, ""),
    ]);
    const aheadBehind = upstream
        ? parseAheadBehind(await optionalCommand("git", ["rev-list", "--left-right", "--count", "HEAD...@{u}"], root, "0 0"))
        : { ahead: 0, behind: 0 };
    const statusLines = status.split("\n").filter(Boolean);
    const untracked = statusLines.filter((line) => line.startsWith("??")).length;
    const dirty = statusLines.length - untracked;
    const repoStatus = aheadBehind.behind > 0 || dirty > 0 || untracked > 0 || !upstream ? "주의" : "정상";
    return {
        label,
        root,
        exists: true,
        status: repoStatus,
        branch,
        head,
        upstream,
        remote,
        ...aheadBehind,
        dirty,
        untracked,
        subject,
        committedAt,
        statusLines,
        recentCommits: parseRecentCommits(recent),
    };
}
async function portEvidence(id, name, port) {
    const output = await optionalCommand("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], finalRoot, "");
    const line = output.split("\n").filter(Boolean)[1] ?? "";
    return {
        id,
        name,
        port,
        status: line ? "정상" : "오류",
        detail: line ? line.trim().replace(/\s+/g, " ") : `localhost:${port} 리슨 없음`,
    };
}
async function gatewayHealth() {
    try {
        const result = await command("curl", ["-sS", "-m", "2", "http://localhost:18082/healthz"], finalRoot);
        return {
            status: result.stdout.includes('"ok"') ? "정상" : "주의",
            detail: result.stdout,
        };
    }
    catch (error) {
        return {
            status: "오류",
            detail: error instanceof Error ? error.message : String(error),
        };
    }
}
async function readDockerServices() {
    const output = await optionalCommand("docker", [
        "ps",
        "--filter",
        "name=releasegraph-dashboard",
        "--format",
        "{{.Names}}|{{.Status}}",
    ]);
    return output
        .split("\n")
        .filter(Boolean)
        .map((line) => {
        const [name, status] = line.split("|");
        return { id: `docker-${name}`, name, status: "정상", detail: status };
    });
}
async function readKindContext(context) {
    const nodes = await optionalCommand("kubectl", ["--context", context, "get", "nodes", "--no-headers"], finalRoot, "");
    const pods = await optionalCommand("kubectl", ["--context", context, "get", "pods", "-A", "--no-headers"], finalRoot, "");
    return {
        context,
        status: nodes ? "정상" : "오류",
        nodes: nodes.split("\n").filter(Boolean).length,
        pods: pods.split("\n").filter(Boolean).length,
        detail: nodes ? "kubectl API 수집 성공" : "kubectl context 접근 실패",
    };
}
async function readOverview() {
    const [finalRepo, wikiRepo, gateway, vite, postgres, redis, nats, natsMonitor, docker, management, target] = await Promise.all([
        readRepo("final", finalRoot),
        readRepo("WIKI", wikiRoot),
        gatewayHealth(),
        portEvidence("vite", "Vite 대시보드", 5173),
        portEvidence("postgres", "PostgreSQL", 15432),
        portEvidence("redis", "Redis", 16379),
        portEvidence("nats", "NATS JetStream", 14222),
        portEvidence("nats-monitor", "NATS 모니터링", 18222),
        readDockerServices(),
        readKindContext("kind-management"),
        readKindContext("kind-target"),
    ]);
    return {
        generatedAt: nowIso(),
        busy: pipelineBusy,
        repositories: [finalRepo, wikiRepo],
        services: [
            vite,
            { id: "gateway", name: "API Gateway", port: 18082, ...gateway },
            postgres,
            redis,
            nats,
            natsMonitor,
            ...docker,
        ],
        clusters: [management, target],
    };
}
async function fetchRepos() {
    emit("repo.fetch.start", "주의", "Final/WIKI git fetch 시작", "git fetch --all --prune");
    const results = [];
    for (const repo of [
        { label: "final", root: finalRoot },
        { label: "WIKI", root: wikiRoot },
    ]) {
        if (!(await exists(path.join(repo.root, ".git")))) {
            results.push({ repo: repo.label, skipped: true, reason: ".git 없음" });
            continue;
        }
        const result = await command("git", ["fetch", "--all", "--prune"], repo.root);
        results.push({ repo: repo.label, ...result });
        emit("repo.fetch.done", "정상", `${repo.label} fetch 완료`, `${result.durationMs}ms`);
    }
    return { results, overview: await readOverview() };
}
async function pullRepos() {
    const results = [];
    for (const repo of [
        { label: "final", root: finalRoot },
        { label: "WIKI", root: wikiRoot },
    ]) {
        const state = await readRepo(repo.label, repo.root);
        if (!state.exists || !state.upstream) {
            results.push({ repo: repo.label, skipped: true, reason: state.exists ? "upstream 없음" : ".git 없음" });
            continue;
        }
        emit("repo.pull.start", "주의", `${repo.label} pull --ff-only 시작`, state.upstream);
        const result = await command("git", ["pull", "--ff-only"], repo.root);
        results.push({ repo: repo.label, ...result });
        emit("repo.pull.done", "정상", `${repo.label} pull 완료`, result.stdout || "Already up to date.");
    }
    return results;
}
async function buildDashboard(reason) {
    emit("build.start", "주의", "대시보드 실제 빌드 시작", reason);
    const sync = await command("npm", ["run", "sync:sources"], dashboardRoot);
    emit("build.sync", "정상", "소스 스냅샷 갱신 완료", sync.stdout);
    const build = await command("npm", ["run", "build"], dashboardRoot);
    emit("build.done", "정상", "대시보드 빌드 완료", build.stdout.split("\n").slice(-4).join(" "));
    return { sync, build };
}
async function pullAndBuild(reason) {
    if (pipelineBusy) {
        throw new Error("이미 파이프라인이 실행 중입니다");
    }
    pipelineBusy = true;
    emit("pipeline.start", "주의", "pull/build 파이프라인 시작", reason);
    try {
        const fetch = await fetchRepos();
        const pull = await pullRepos();
        const build = await buildDashboard(reason);
        const overview = await readOverview();
        const result = { ok: true, fetch, pull, build, overview };
        emit("pipeline.done", "정상", "pull/build 파이프라인 완료", "fetch → pull --ff-only → sync:sources → build");
        return result;
    }
    catch (error) {
        emit("pipeline.failed", "오류", "pull/build 파이프라인 실패", error instanceof Error ? error.message : String(error));
        throw error;
    }
    finally {
        pipelineBusy = false;
    }
}
function parseImage(content) {
    return content.match(/image:\s*["']?([^"'\s]+)/)?.[1]
        ?? content.match(/repository:\s*["']?([^"'\s]+)[\s\S]*?tag:\s*["']?([^"'\s]+)/)?.slice(1, 3).join(":")
        ?? "ghcr.io/project/checkout-api:local";
}
function parseReplicas(content) {
    return Number.parseInt(content.match(/(?:replicaCount|replicas):\s*(\d+)/)?.[1] ?? "2", 10) || 2;
}
async function dryRunYaml(content) {
    await mkdir(stateDir, { recursive: true });
    const filePath = path.join(stateDir, "dry-run-desired-manifest.yaml");
    await writeFile(filePath, content, "utf8");
    const result = await command("kubectl", ["apply", "--dry-run=client", "-f", filePath], finalRoot);
    emit("yaml.dry_run", "정상", "YAML dry-run 성공", result.stdout);
    return { path: filePath, image: parseImage(content), replicas: parseReplicas(content), ...result };
}
async function saveYamlAndBuild(content) {
    await mkdir(stateDir, { recursive: true });
    const filePath = path.join(stateDir, "desired-manifest.yaml");
    await writeFile(filePath, content, "utf8");
    emit("yaml.saved", "정상", "YAML 저장 완료", filePath, { image: parseImage(content), replicas: parseReplicas(content) });
    const pipeline = await pullAndBuild("yaml-save");
    return { saved: { path: filePath, image: parseImage(content), replicas: parseReplicas(content) }, pipeline };
}
async function stopGateway() {
    emit("fault.inject", "주의", "Gateway 장애 주입 시작", "screen releasegraph-gateway 종료");
    await optionalCommand("screen", ["-S", "releasegraph-gateway", "-X", "quit"], finalRoot, "");
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const health = await gatewayHealth();
    emit("fault.injected", health.status === "오류" ? "정상" : "주의", "Gateway 장애 상태 확인", health.detail);
    return { health, overview: await readOverview() };
}
async function startGateway() {
    emit("recovery.start", "주의", "Gateway 복구 시작", "screen releasegraph-gateway 재기동");
    await optionalCommand("screen", ["-S", "releasegraph-gateway", "-X", "quit"], finalRoot, "");
    await command("screen", [
        "-dmS",
        "releasegraph-gateway",
        "zsh",
        "-lc",
        [
            `cd ${finalRoot}`,
            "&&",
            "PYTHONPATH=.",
            "PORT=18082",
            "DATABASE_URL=postgresql://service:service@localhost:15432/service",
            "REDIS_URL=redis://localhost:16379/0",
            "NATS_URL=nats://localhost:14222",
            "AUTH_COOKIE_SECURE=false",
            "uv run python services/api-gateway/app.py",
        ].join(" "),
    ], finalRoot);
    let health = await gatewayHealth();
    for (let index = 0; index < 15 && health.status !== "정상"; index += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        health = await gatewayHealth();
    }
    emit(health.status === "정상" ? "recovery.done" : "recovery.failed", health.status, "Gateway 복구 상태 확인", health.detail);
    return { health, overview: await readOverview() };
}
async function readJson(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const text = Buffer.concat(chunks).toString("utf8");
    return text ? JSON.parse(text) : {};
}
function sendJson(res, status, payload) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify(payload, null, 2));
}
async function handleApi(req, res, pathname) {
    try {
        if (req.method === "GET" && pathname === "/overview") {
            sendJson(res, 200, await readOverview());
            return;
        }
        if (req.method === "GET" && pathname === "/state/yaml") {
            const filePath = path.join(stateDir, "desired-manifest.yaml");
            sendJson(res, 200, { yaml: (await exists(filePath)) ? await readFile(filePath, "utf8") : "" });
            return;
        }
        if (req.method === "POST" && pathname === "/repositories/fetch") {
            sendJson(res, 200, await fetchRepos());
            return;
        }
        if (req.method === "POST" && pathname === "/repositories/pull-build") {
            sendJson(res, 200, await pullAndBuild("manual"));
            return;
        }
        if (req.method === "POST" && pathname === "/yaml/dry-run") {
            const body = await readJson(req);
            sendJson(res, 200, await dryRunYaml(String(body.content ?? "")));
            return;
        }
        if (req.method === "POST" && pathname === "/yaml/save-build") {
            const body = await readJson(req);
            sendJson(res, 200, await saveYamlAndBuild(String(body.content ?? "")));
            return;
        }
        if (req.method === "POST" && pathname === "/fault/gateway/down") {
            sendJson(res, 200, await stopGateway());
            return;
        }
        if (req.method === "POST" && pathname === "/fault/gateway/recover") {
            sendJson(res, 200, await startGateway());
            return;
        }
        sendJson(res, 404, { ok: false, error: `unknown route ${pathname}` });
    }
    catch (error) {
        sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
}
function handleEvents(req, res) {
    res.statusCode = 200;
    res.setHeader("content-type", "text/event-stream; charset=utf-8");
    res.setHeader("cache-control", "no-cache, no-transform");
    res.setHeader("connection", "keep-alive");
    const client = {
        write(event) {
            res.write(`event: ${event.type}\n`);
            res.write(`data: ${JSON.stringify(event)}\n\n`);
        },
    };
    clients.add(client);
    client.write({ id: nextEventId++, at: nowIso(), type: "bridge.connected", status: "정상", message: "로컬 운영 브리지 SSE 연결", detail: "/local-api/events" });
    const interval = setInterval(() => {
        client.write({ id: nextEventId++, at: nowIso(), type: "bridge.heartbeat", status: "정상", message: "브리지 heartbeat" });
    }, 15000);
    req.on("close", () => {
        clearInterval(interval);
        clients.delete(client);
    });
}
export function localOperationsBridge() {
    return {
        name: "releasegraph-local-operations-bridge",
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                if (!req.url?.startsWith("/local-api")) {
                    next();
                    return;
                }
                const url = new URL(req.url, "http://localhost");
                const pathname = url.pathname.replace(/^\/local-api/, "") || "/";
                if (req.method === "GET" && pathname === "/events") {
                    handleEvents(req, res);
                    return;
                }
                void handleApi(req, res, pathname);
            });
        },
    };
}

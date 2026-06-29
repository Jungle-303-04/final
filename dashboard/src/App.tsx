import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Activity, CheckCircle2, GitBranch, GitCommitHorizontal, GitPullRequest, Hammer, PlugZap, Radio, RefreshCcw, Save, Server, ShieldAlert, ShieldCheck, TerminalSquare, Undo2, Wifi } from "lucide-react";

type Status = "정상" | "대기" | "주의" | "오류";
type Repo = { label: "final" | "WIKI"; status: Status; branch: string; head: string; upstream: string; remote: string; dirty: number; untracked: number; subject: string; recentCommits: Array<{ hash: string; subject: string; date: string }> };
type Overview = { generatedAt: string; busy: boolean; repositories: Repo[]; sourceSummary: Array<{ label: string; branch: string; head: string; counts: { files: number; source: number; docs: number } }>; services: Array<{ id: string; name: string; port?: number; status: Status; detail: string }>; clusters: Array<{ context: string; status: Status; nodes: number; pods: number; detail: string }>; workloads: Array<{ id: string; context: string; namespace: string; name: string; ready: number; replicas: number; status: Status; detail: string }> };
type GitOps = { relativePath: string; yaml: string; version: string; image: string; replicas: number; resource: { name: string; namespace: string }; lastCommit: string; ghStatus: string };
type BridgeEvent = { id: number; at: string; type: string; status: Status; message: string; detail?: string };
type Log = { id: string; at: string; title: string; status: Status; detail: string };

const defaultYaml = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout-api
  namespace: sandbox
  labels:
    app: checkout-api
    managed-by: releasegraph-dashboard
spec:
  replicas: 2
  selector:
    matchLabels:
      app: checkout-api
  template:
    metadata:
      labels:
        app: checkout-api
    spec:
      containers:
        - name: checkout-api
          image: nginx:1.27-alpine
          ports:
            - name: http
              containerPort: 80
          readinessProbe:
            httpGet:
              path: /
              port: http
            initialDelaySeconds: 3
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /
              port: http
            initialDelaySeconds: 10
            periodSeconds: 10
          resources:
            requests:
              cpu: 25m
              memory: 32Mi
            limits:
              cpu: 100m
              memory: 128Mi
---
apiVersion: v1
kind: Service
metadata:
  name: checkout-api
  namespace: sandbox
  labels:
    app: checkout-api
    managed-by: releasegraph-dashboard
spec:
  type: ClusterIP
  selector:
    app: checkout-api
  ports:
    - name: http
      port: 80
      targetPort: http
`;
const steps = ["Gateway 확인", "Gateway 연결 복구", "로그인", "클러스터 연결", "설정 가져오기", "diff 보기", "버전 커밋", "PR 생성", "머지 반영", "YAML dry-run", "배포 명령", "SSE 조회", "스케일 조정", "장애 주입", "복구 확인"];
const eventNames = ["bridge.connected", "bridge.heartbeat", "repo.fetch.start", "repo.fetch.done", "build.start", "build.done", "yaml.dry_run", "gitops.diff", "gitops.versioned", "gitops.pr.start", "gitops.pr.done", "deploy.start", "deploy.done", "cluster.scale.start", "cluster.scale.done", "fault.inject", "fault.done", "recovery.start", "recovery.portforward", "recovery.done", "gateway.nodeport.ready", "gateway.nodeport.failed", "portforward.recover.start", "portforward.recover.done", "portforward.recover.failed"];

function time(v: string) { return v ? new Date(v).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "없음"; }
function short(v = "", n = 82) { return v.length > n ? `${v.slice(0, n)}...` : v; }
function num(v: number) { return v.toLocaleString("ko-KR"); }

export function App() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [gitops, setGitops] = useState<GitOps | null>(null);
  const [yaml, setYaml] = useState(defaultYaml);
  const [diff, setDiff] = useState("");
  const [logs, setLogs] = useState<Log[]>([]);
  const [events, setEvents] = useState<BridgeEvent[]>([]);
  const [busy, setBusy] = useState("");
  const [token, setToken] = useState(() => localStorage.getItem("releasegraph.token") ?? "");
  const [session, setSession] = useState(token ? "세션 복원됨" : "미인증");
  const [sse, setSse] = useState<"대기" | "연결" | "오류">("대기");
  const [cards, setCards] = useState(0);
  const [prBase, setPrBase] = useState("main");
  const [prTitle, setPrTitle] = useState("feat: Kubernetes 설정 / 버전 커밋 / 배포 manifest");
  const [scaleNs, setScaleNs] = useState("sandbox");
  const [scaleName, setScaleName] = useState("checkout-api");
  const [scaleReplicas, setScaleReplicas] = useState(2);
  const bridge = useRef<EventSource | null>(null);
  const stream = useRef<EventSource | null>(null);
  const completed = useMemo(() => new Set(logs.filter((l) => l.status === "정상").map((l) => l.title)), [logs]);
  const health = overview?.services.find((s) => s.id === "gateway");
  const finalRepo = overview?.repositories.find((r) => r.label === "final");
  const wikiRepo = overview?.repositories.find((r) => r.label === "WIKI");
  const completedCount = steps.filter((step) => completed.has(step)).length;
  const nextStep = steps.find((step) => !completed.has(step)) ?? "전체 흐름 검증됨";
  const targetWorkload = overview?.workloads.find((w) => w.context === "kind-target" && w.namespace === scaleNs && w.name === scaleName);

  useEffect(() => { void refresh(false); void loadConfig(false); openBridge(); return () => { bridge.current?.close(); bridge.current = null; stream.current?.close(); stream.current = null; }; }, []);
  function log(title: string, status: Status, detail: string) { setLogs((x) => [{ id: crypto.randomUUID(), at: new Date().toISOString(), title, status, detail }, ...x].slice(0, 60)); }
  async function local<T>(path: string, init: RequestInit = {}) { const h = new Headers(init.headers); if (init.body && !h.has("content-type")) h.set("content-type", "application/json"); const r = await fetch(`/local-api${path}`, { ...init, headers: h }); const text = await r.text(); const data = text ? JSON.parse(text) : {}; if (!r.ok) throw new Error(data.error ?? text); return data as T; }
  async function gateway<T>(path: string, init: RequestInit & { auth?: boolean } = {}) { const h = new Headers(init.headers); if (init.body && !h.has("content-type")) h.set("content-type", "application/json"); if (init.auth && token) h.set("authorization", `Bearer ${token}`); const r = await fetch(`/gateway${path}`, { ...init, headers: h, credentials: "include" }); const text = await r.text(); const data = text ? JSON.parse(text) : {}; if (!r.ok) throw new Error(`${r.status} ${data.detail ?? data.error ?? text}`); return data as T; }
  async function run(title: string, action: () => Promise<string>, shouldRefresh = true) { setBusy(title); try { const detail = await action(); log(title, "정상", detail); if (shouldRefresh) await refresh(false); } catch (e) { log(title, "오류", e instanceof Error ? e.message : String(e)); } finally { setBusy(""); } }
  async function refresh(write = true) { const data = await local<Overview>("/overview"); setOverview(data); if (write) log("상태 새로고침", "정상", `서비스 ${data.services.length}개, 워크로드 ${data.workloads.length}개`); }
  async function loadConfig(write = true) { const c = await local<GitOps>("/gitops/config"); setGitops(c); setYaml(c.yaml); setScaleNs(c.resource.namespace); setScaleName(c.resource.name); setScaleReplicas(c.replicas); if (write) log("설정 가져오기", "정상", `${c.relativePath}; version=${c.version || "없음"}`); }
  function openBridge() { if (bridge.current) return; const es = new EventSource("/local-api/events"); eventNames.forEach((n) => es.addEventListener(n, (e) => setEvents((x) => [JSON.parse((e as MessageEvent).data), ...x].slice(0, 80)))); es.onerror = () => setEvents((x) => [{ id: Date.now(), at: new Date().toISOString(), type: "bridge.error", status: "오류", message: "브리지 연결 오류" }, ...x]); bridge.current = es; }
  async function login() { await run("로그인", async () => { const start = await gateway<{ state: string; provider: string }>("/auth/oauth/github/start?user_id=dashboard-user&scopes=profile%2Cemail%2Crepo"); const r = await gateway<{ session?: { session_token?: string; user_id?: string } }>("/auth/oauth/github/callback", { method: "POST", body: JSON.stringify({ user_id: "dashboard-user", state: start.state, code: "dashboard-local-code", provider_user: "dashboard-user", scopes: ["profile", "email", "repo"] }) }); const t = r.session?.session_token ?? ""; setToken(t); setSession(`${r.session?.user_id ?? "dashboard-user"} 인증됨`); localStorage.setItem("releasegraph.token", t); document.cookie = `service_session=${encodeURIComponent(t)}; path=/; SameSite=Lax`; return `${start.provider} 세션 발급`; }); }
  function openGatewaySse() { stream.current?.close(); const es = new EventSource("/gateway/dashboard/stream", { withCredentials: true }); es.addEventListener("dashboard.updated", (e) => { const rows = JSON.parse((e as MessageEvent).data) as unknown[]; setCards(rows.length); log("Gateway SSE", "정상", `dashboard.updated ${rows.length}개 수신`); }); es.onopen = () => setSse("연결"); es.onerror = () => { setSse("오류"); es.close(); }; stream.current = es; }

  return (
    <main className="app">
      <header className="topbar"><div className="brand"><span>RG</span><div><h1>ReleaseGraph 운영 대시보드</h1><p>Git PR, Kubernetes 설정, pull/build/deploy, scale, SSE, 장애 복구를 실제 연결합니다.</p></div></div><div className="top-actions"><button onClick={() => void refresh(true)} disabled={!!busy}><RefreshCcw size={15} />새로고침</button><button onClick={openGatewaySse}><Radio size={15} />Gateway SSE</button></div></header>
      <section className="hero-grid"><article className="primary-status"><div className="status-title"><div><p className="eyebrow">실시간 운영 상태</p><h2>{health?.status === "정상" ? "Gateway와 target 클러스터가 실제로 연결되어 있습니다" : "Gateway 확인 또는 복구가 필요합니다"}</h2></div><strong>{completedCount}/{steps.length}</strong></div><div className="status-strip"><Badge s={health?.status ?? "대기"} t={`Gateway ${health?.status ?? "수집 전"}`} /><Badge s={overview?.busy ? "주의" : "정상"} t={overview?.busy ? "파이프라인 실행 중" : "파이프라인 대기"} /><Badge s={sse === "연결" ? "정상" : sse === "오류" ? "오류" : "대기"} t={`SSE ${sse}`} /><Badge s={token ? "정상" : "대기"} t={session} /></div><div className="proof-grid"><div><span>다음 액션</span><strong>{nextStep}</strong></div><div><span>Target workload</span><strong>{targetWorkload ? `${targetWorkload.namespace}/${targetWorkload.name} ${targetWorkload.ready}/${targetWorkload.replicas}` : "수집 전"}</strong></div><div><span>Manifest image</span><strong>{gitops?.image || "수집 전"}</strong></div><div><span>Read model</span><strong>{cards} cards</strong></div></div></article><article className="scenario"><div className="runbook-head"><div><p className="eyebrow">실행 런북</p><h2>버튼 조작과 실제 이벤트가 같은 타임라인에 남습니다</h2></div><Badge s={completedCount === steps.length ? "정상" : completedCount > 0 ? "주의" : "대기"} t={`${completedCount}개 완료`} /></div><div className="scenario-row">{steps.map((s, i) => <div className={completed.has(s) ? "scenario-step done" : "scenario-step"} key={s}><span>{String(i + 1).padStart(2, "0")}</span><Dot s={completed.has(s) ? "정상" : nextStep === s ? "주의" : "대기"} /><strong>{s}</strong></div>)}</div></article></section>
      <section className="main-grid"><div className="left-stack">
        <Panel title="실제 레포 연결" icon={<GitPullRequest size={18} />} action={<><button onClick={() => void run("레포 fetch", async () => { const r = await local<{ overview: Overview }>("/repositories/fetch", { method: "POST" }); setOverview(r.overview); return "Final/WIKI fetch 완료"; })} disabled={!!busy}><GitBranch size={15} />git fetch</button><button onClick={() => void run("pull/build", async () => { const r = await local<{ overview: Overview }>("/repositories/pull-build", { method: "POST" }); setOverview(r.overview); return "pull/build 완료"; })} disabled={!!busy}><Hammer size={15} />pull/build</button></>}>
          <div className="repo-grid">{[finalRepo, wikiRepo].filter(Boolean).map((r) => <article className="repo-card" key={r!.label}><div className="card-title"><Dot s={r!.status} /><strong>{r!.label === "final" ? "Final 레포" : "WIKI 레포"}</strong><code>{r!.head}</code></div><dl><div><dt>branch</dt><dd>{r!.branch}</dd></div><div><dt>upstream</dt><dd>{r!.upstream || "없음"}</dd></div><div><dt>dirty/untracked</dt><dd>{r!.dirty}/{r!.untracked}</dd></div><div className="wide"><dt>remote</dt><dd>{r!.remote}</dd></div></dl><p className="commit-line"><GitCommitHorizontal size={14} />{r!.subject}</p><div className="commit-list">{r!.recentCommits.slice(0, 3).map((c) => <code key={c.hash}>{c.hash} · {short(c.subject, 60)}</code>)}</div></article>)}</div>
        </Panel>
        <Panel title="Kubernetes 설정 파일 편집" icon={<TerminalSquare size={18} />} action={<><button onClick={() => void loadConfig(true)} disabled={!!busy}><RefreshCcw size={15} />가져오기</button><button onClick={() => void run("YAML dry-run", async () => { const r = await local<{ stdout: string; image: string; replicas: number }>("/yaml/dry-run", { method: "POST", body: JSON.stringify({ content: yaml }) }); return `${r.stdout}; image=${r.image}; replicas=${r.replicas}`; })} disabled={!!busy}><ShieldCheck size={15} />dry-run</button><button onClick={() => void run("diff 보기", async () => { const r = await local<{ diff: string; image: string; replicas: number }>("/gitops/diff", { method: "POST", body: JSON.stringify({ content: yaml }) }); setDiff(r.diff || "변경 없음"); return `image=${r.image}; replicas=${r.replicas}`; }, false)} disabled={!!busy}><GitCommitHorizontal size={15} />diff</button><button className="primary" onClick={() => void run("버전 커밋", async () => { const r = await local<{ version: string; state: GitOps }>("/gitops/save-version", { method: "POST", body: JSON.stringify({ content: yaml }) }); setGitops(r.state); setYaml(r.state.yaml); return `version=${r.version}`; })} disabled={!!busy}><Save size={15} />버전 커밋</button></>}><textarea value={yaml} onChange={(e) => setYaml(e.target.value)} spellCheck={false} /></Panel>
        <Panel title="GitOps PR / 머지 반영 / 배포" icon={<GitPullRequest size={18} />}><div className="form-grid"><label>PR base<input value={prBase} onChange={(e) => setPrBase(e.target.value)} /></label><label>PR title<input value={prTitle} onChange={(e) => setPrTitle(e.target.value)} /></label></div><div className="button-grid"><button onClick={() => void run("PR 생성", async () => { const r = await local<{ prUrl: string; branch: string; base: string }>("/gitops/pr", { method: "POST", body: JSON.stringify({ base: prBase, title: prTitle }) }); return `${r.branch} -> ${r.base}; ${r.prUrl}`; }, false)} disabled={!!busy}><GitPullRequest size={15} />PR 생성</button><button onClick={() => void run("머지 반영", async () => { const r = await local<{ overview: Overview }>("/gitops/pull-build-deploy", { method: "POST" }); setOverview(r.overview); await loadConfig(false); return "pull/build/deploy 완료"; })} disabled={!!busy}><Hammer size={15} />머지 반영</button><button className="primary" onClick={() => void run("target 배포", async () => { const r = await local<{ overview: Overview }>("/cluster/deploy", { method: "POST" }); setOverview(r.overview); return "target apply/rollout 완료"; })} disabled={!!busy}><Server size={15} />target 배포</button></div><Rows rows={[["파일", gitops?.version || "version 없음", `${gitops?.replicas ?? 0} replicas`, gitops?.relativePath ?? ""], ["GitHub", gitops?.ghStatus.includes("Logged in") ? "인증됨" : "확인 필요", gitops?.resource.namespace ?? "sandbox", short(gitops?.lastCommit || "커밋 없음", 80)]]} /><Diff text={diff} /></Panel>
      </div><div className="right-stack">
        <Panel title="Gateway / 배포 / 장애 복구" icon={<PlugZap size={18} />}><div className="button-grid"><button onClick={() => void run("Gateway 확인", async () => { const r = await gateway<{ status: string; service: string }>("/healthz"); return `${r.service}: ${r.status}`; })} disabled={!!busy}><Wifi size={15} />Gateway 확인</button><button onClick={() => void run("Gateway 연결 복구", async () => { const r = await local<{ health: { status: Status; detail: string }; overview: Overview }>("/gateway/port-forward/recover", { method: "POST" }); setOverview(r.overview); return `${r.health.status}; ${r.health.detail}`; })} disabled={!!busy}><RefreshCcw size={15} />연결 복구</button><button onClick={login} disabled={!!busy}><ShieldCheck size={15} />로그인</button><button onClick={() => void run("클러스터 연결", async () => { await gateway("/agent/connect", { method: "POST", body: JSON.stringify({ cluster_id: "target-cluster-01", agent_id: "dashboard-live-agent", capabilities: ["collector", "command_receiver"] }) }); return "target-cluster-01 연결"; })} disabled={!!busy}><Server size={15} />클러스터 연결</button><button onClick={() => void run("Git webhook", async () => { const r = await gateway<{ accepted: boolean }>("/github/webhook", { method: "POST", body: JSON.stringify({ commit_sha: finalRepo?.head ?? "dashboard", image: gitops?.image || "nginx:1.27-alpine", replicas: gitops?.replicas ?? scaleReplicas }) }); return `accepted=${r.accepted}; image=${gitops?.image || "nginx:1.27-alpine"}`; })} disabled={!!busy}><GitBranch size={15} />Git webhook</button><button onClick={() => void run("배포 명령", async () => { const r = await gateway<{ accepted: boolean; correlation_id?: string }>("/commands", { method: "POST", auth: true, body: JSON.stringify({ cluster_id: "target-cluster-01", action: "rollout_restart", namespace: scaleNs, reason: "dashboard live demo" }) }); return `accepted=${r.accepted}; ${r.correlation_id ?? ""}`; })} disabled={!!busy}><Activity size={15} />배포 명령</button><button onClick={() => void run("SSE 조회", async () => { const r = await gateway<{ cards: unknown[] }>("/dashboard/query", { auth: true }); setCards(r.cards?.length ?? 0); return `cards=${r.cards?.length ?? 0}`; })} disabled={!!busy}><Radio size={15} />read model 조회</button><button className="danger" onClick={() => void run("장애 주입", async () => { const r = await local<{ health: { status: Status; detail: string }; overview: Overview }>("/fault/gateway/down", { method: "POST" }); setOverview(r.overview); return `${r.health.status}; ${r.health.detail}`; })} disabled={!!busy}><ShieldAlert size={15} />Gateway 내리기</button><button className="primary" onClick={() => void run("복구 확인", async () => { const r = await local<{ health: { status: Status; detail: string }; overview: Overview }>("/fault/gateway/recover", { method: "POST" }); setOverview(r.overview); return `${r.health.status}; ${r.health.detail}`; })} disabled={!!busy}><Undo2 size={15} />Gateway 복구</button></div><p className="hint">장애 주입은 kind-management deploy/api-gateway replica를 0으로 만들고, 연결 복구는 현재 Gateway NodePort 또는 포트포워드 상태를 실제로 확인합니다.</p></Panel>
        <Panel title="Pod scale 실시간 조작" icon={<Server size={18} />}><div className="form-grid"><label>namespace<input value={scaleNs} onChange={(e) => setScaleNs(e.target.value)} /></label><label>deployment<input value={scaleName} onChange={(e) => setScaleName(e.target.value)} /></label><label>replicas<input type="number" min="0" max="10" value={scaleReplicas} onChange={(e) => setScaleReplicas(Number(e.target.value) || 0)} /></label><button className="primary" onClick={() => void run("스케일 조정", async () => { const r = await local<{ overview: Overview }>("/cluster/scale", { method: "POST", body: JSON.stringify({ namespace: scaleNs, deployment: scaleName, replicas: scaleReplicas }) }); setOverview(r.overview); return `${scaleNs}/${scaleName} -> ${scaleReplicas}`; })} disabled={!!busy}><Activity size={15} />스케일 조정</button></div></Panel>
        <Panel title="분석 범위" icon={<GitCommitHorizontal size={18} />}><Rows rows={(overview?.sourceSummary ?? []).map((r) => [r.label, `${num(r.counts.files)} files`, `${num(r.counts.source)} source`, `${r.branch} · ${r.head}`])} /></Panel>
        <Panel title="실행 중 서비스" icon={<Server size={18} />}><List rows={[...(overview?.services ?? []).map((s) => [s.status, s.name, s.port ? `:${s.port}` : "runtime", s.detail] as [Status, string, string, string]), ...(overview?.clusters ?? []).map((c) => [c.status, c.context, `${c.nodes} node / ${c.pods} pod`, c.detail] as [Status, string, string, string]), ...(overview?.workloads ?? []).map((w) => [w.status, `${w.namespace}/${w.name}`, `${w.ready}/${w.replicas} ready`, w.context] as [Status, string, string, string])]} /></Panel>
        <Panel title="실제 실행 이벤트" icon={<Activity size={18} />}><EventList events={events} /></Panel>
      </div></section>
      <section className="bottom-grid"><Panel title="운영 로그" icon={<CheckCircle2 size={18} />}><LogList logs={logs} /></Panel><Panel title="Gateway read model" icon={<Radio size={18} />}><div className="read-model"><strong>{cards}</strong><span>dashboard cards</span><p>로그인 후 read model 조회 또는 Gateway SSE로 갱신됩니다.</p></div></Panel></section>
    </main>
  );
}
function Badge({ s, t }: { s: Status; t: string }) { return <span className={`status ${s}`}>{t}</span>; }
function Dot({ s }: { s: Status }) { return <i className={`dot ${s}`} aria-label={s} />; }
function Panel({ title, icon, action, children }: { title: string; icon: ReactNode; action?: ReactNode; children: ReactNode }) { return <section className="panel"><div className="panel-head"><h2>{icon}{title}</h2><div className="panel-actions">{action}</div></div>{children}</section>; }
function Rows({ rows }: { rows: string[][] }) { return <div className="analysis-list">{rows.map((r, i) => <div className="analysis-row" key={i}><strong>{r[0]}</strong><span>{r[1]}</span><span>{r[2]}</span><code>{r[3]}</code></div>)}</div>; }
function List({ rows }: { rows: Array<[Status, string, string, string]> }) { return <div className="service-list">{rows.map((r, i) => <div className="service-row" key={i}><Dot s={r[0]} /><strong>{r[1]}</strong><span>{r[2]}</span><code>{short(r[3], 88)}</code></div>)}</div>; }
function Diff({ text }: { text: string }) { const rows = text ? text.split("\n").slice(0, 18) : ["diff를 실행하면 변경 과정이 여기에 표시됩니다."]; return <div className="diff-list">{rows.map((line, i) => <div className="diff-row" key={`${i}-${line}`}><Dot s={line.startsWith("+") ? "정상" : line.startsWith("-") ? "오류" : "대기"} /><strong>{line.startsWith("+") ? "추가" : line.startsWith("-") ? "삭제" : "정보"}</strong><code>{line}</code></div>)}</div>; }
function EventList({ events }: { events: BridgeEvent[] }) { return events.length ? <div className="event-list">{events.map((e) => <div className="event-row" key={`${e.id}-${e.type}`}><time>{time(e.at)}</time><Dot s={e.status} /><strong>{e.type}</strong><span>{e.message}</span><code>{e.detail ?? ""}</code></div>)}</div> : <p className="empty">아직 이벤트가 없습니다.</p>; }
function LogList({ logs }: { logs: Log[] }) { return logs.length ? <div className="log-list">{logs.map((l) => <div className="log-row" key={l.id}><time>{time(l.at)}</time><Dot s={l.status} /><strong>{l.title}</strong><span>{l.detail}</span></div>)}</div> : <p className="empty">아직 실행 로그가 없습니다.</p>; }

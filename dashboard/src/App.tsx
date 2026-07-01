import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Activity, CheckCircle2, GitBranch, GitCommitHorizontal, GitPullRequest, Hammer, PlugZap, Radio, RefreshCcw, Save, Server, ShieldAlert, ShieldCheck, TerminalSquare, Undo2, Wifi } from "lucide-react";

type Status = "정상" | "대기" | "주의" | "오류";
type DashboardTab = "control" | "gitops" | "kubernetes" | "events";
type Repo = { label: string; status: Status; branch: string; head: string; upstream: string; remote: string; dirty: number; untracked: number; subject: string; recentCommits: Array<{ hash: string; subject: string; date: string }> };
type Overview = { generatedAt: string; busy: boolean; repositories: Repo[]; sourceSummary: Array<{ label: string; branch: string; head: string; counts: { files: number; source: number; docs: number } }>; services: Array<{ id: string; name: string; port?: number; status: Status; detail: string }>; clusters: Array<{ context: string; status: Status; nodes: number; pods: number; detail: string }>; workloads: Array<{ id: string; context: string; namespace: string; name: string; ready: number; replicas: number; status: Status; detail: string }> };
type GitOps = { relativePath: string; yaml: string; version: string; image: string; replicas: number; resource: { name: string; namespace: string }; lastCommit: string; ghStatus: string };
type BridgeEvent = { id: number; at: string; type: string; status: Status; message: string; detail?: string };
type Log = { id: string; at: string; title: string; status: Status; detail: string };
type ControlComponent = { name: string; status: Status; ready: string; restarts: number; detail: string };
type VisualState = {
  generatedAt: string;
  demoRepo: Repo;
  desired: { image: string; replicas: number; namespace: string; name: string; yaml: string; version: string };
  live: {
    deployment: { name: string; namespace: string; generation: number; observedGeneration: number; revision: string; replicas: number; ready: number; updated: number; available: number; image: string; status: Status };
    replicaSets: Array<{ name: string; desired: number; ready: number; available: number; revision: string; createdAt: string }>;
    pods: Array<{ name: string; phase: string; ready: boolean; restarts: number; ip: string; node: string; image: string; startedAt: string; owner: string }>;
    service: { name: string; type: string; clusterIP: string; port: string; targetPort: string };
    endpoints: Array<{ ip: string; pod: string; node: string }>;
  };
  comparisons: Array<{ key: string; label: string; desired: string | number; live: string | number; status: Status }>;
  clusters: Array<{ role: string; context: string; status: Status; nodes: number; pods: number; detail: string; components: string[]; componentStatus?: ControlComponent[] }>;
  metrics: Record<string, { status: Status; query: string; count: number; value?: string; result: unknown[]; error?: string }>;
  gateway: { health: { status: Status; detail: string }; cards: { status: Status; count: number; sample: unknown[]; error?: string } };
  sse: { localEvents: BridgeEvent[]; totalLocalEvents: number };
};
type VisualPacket = {
  sequence: number;
  at: string;
  source: string;
  status: Status;
  summary?: {
    desiredReplicas: number;
    liveReplicas: number;
    readyPods: number;
    pods: number;
    endpoints: number;
    prometheusTargets: number;
	    prometheusPods: number;
	    deploymentMetric: number;
	    mismatches: number;
    alerts?: number;
    controlPlaneStatus?: Status;
	  };
  visual?: VisualState;
  error?: string;
};
type MetricSample = {
  sequence: number;
  at: string;
  readyPods: number;
  liveReplicas: number;
  activePods: number;
  endpoints: number;
  prometheusReadyPods: number;
  deploymentMetric: number;
  mismatches: number;
};

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
const tabs: Array<{ id: DashboardTab; label: string; desc: string }> = [
  { id: "control", label: "관제", desc: "SSE 시계열 · 헬스" },
  { id: "gitops", label: "GitOps", desc: "레포 · YAML · PR" },
  { id: "kubernetes", label: "Kubernetes", desc: "배포 · 스케일 · 서비스" },
  { id: "events", label: "이벤트/장애", desc: "런북 · 로그 · 복구" },
];
const driftKeys = new Set(["replicas", "ready", "generation", "activePods", "endpoints", "prometheusReady", "image"]);

function time(v: string) { return v ? new Date(v).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "없음"; }
function short(v = "", n = 82) { return v.length > n ? `${v.slice(0, n)}...` : v; }
function num(v: number) { return v.toLocaleString("ko-KR"); }
function sampleFromPacket(packet: VisualPacket): MetricSample | null {
  if (!packet.summary) return null;
  return {
    sequence: packet.sequence,
    at: packet.at,
    readyPods: packet.summary.readyPods,
    liveReplicas: packet.summary.liveReplicas,
    activePods: packet.summary.pods,
    endpoints: packet.summary.endpoints,
    prometheusReadyPods: packet.summary.prometheusPods,
    deploymentMetric: packet.summary.deploymentMetric,
    mismatches: packet.summary.mismatches,
  };
}

export function App() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [gitops, setGitops] = useState<GitOps | null>(null);
  const [visual, setVisual] = useState<VisualState | null>(null);
  const [yaml, setYaml] = useState(defaultYaml);
  const [diff, setDiff] = useState("");
  const [logs, setLogs] = useState<Log[]>([]);
  const [events, setEvents] = useState<BridgeEvent[]>([]);
  const [busy, setBusy] = useState("");
  const [sessionActive, setSessionActive] = useState(false);
  const [session, setSession] = useState("미인증");
  const [authEmail, setAuthEmail] = useState("admin@example.com");
  const [authPassword, setAuthPassword] = useState("");
  const [sse, setSse] = useState<"대기" | "연결" | "오류">("대기");
  const [metricSse, setMetricSse] = useState<"대기" | "연결" | "오류">("대기");
  const [metricFrames, setMetricFrames] = useState<VisualPacket[]>([]);
  const [metricHistory, setMetricHistory] = useState<MetricSample[]>([]);
  const [activeTab, setActiveTab] = useState<DashboardTab>("control");
  const [cards, setCards] = useState(0);
  const [prBase, setPrBase] = useState("main");
  const [prTitle, setPrTitle] = useState("feat: Kubernetes 설정 / 버전 커밋 / 배포 manifest");
  const [scaleNs, setScaleNs] = useState("sandbox");
  const [scaleName, setScaleName] = useState("checkout-api");
  const [scaleReplicas, setScaleReplicas] = useState(2);
  const bridge = useRef<EventSource | null>(null);
  const stream = useRef<EventSource | null>(null);
  const visualStream = useRef<EventSource | null>(null);
  const completed = useMemo(() => new Set(logs.filter((l) => l.status === "정상").map((l) => l.title)), [logs]);
  const health = overview?.services.find((s) => s.id === "gateway");
  const demoRepo = visual?.demoRepo ?? overview?.repositories.find((r) => r.label === "demo");
  const completedCount = steps.filter((step) => completed.has(step)).length;
  const nextStep = steps.find((step) => !completed.has(step)) ?? "전체 흐름 검증됨";
  const targetWorkload = overview?.workloads.find((w) => w.context === "kind-target" && w.namespace === scaleNs && w.name === scaleName);

  useEffect(() => { void refresh(false).catch((e) => log("초기 상태 수집", "오류", e instanceof Error ? e.message : String(e))); void loadConfig(false).catch((e) => log("초기 설정 수집", "오류", e instanceof Error ? e.message : String(e))); openBridge(); openVisualStream(); return () => { bridge.current?.close(); bridge.current = null; stream.current?.close(); stream.current = null; visualStream.current?.close(); visualStream.current = null; }; }, []);
  function log(title: string, status: Status, detail: string) { setLogs((x) => [{ id: crypto.randomUUID(), at: new Date().toISOString(), title, status, detail }, ...x].slice(0, 60)); }
  async function local<T>(path: string, init: RequestInit = {}) { const h = new Headers(init.headers); if (init.body && !h.has("content-type")) h.set("content-type", "application/json"); const r = await fetch(`/local-api${path}`, { ...init, headers: h }); const text = await r.text(); const data = text ? JSON.parse(text) : {}; if (!r.ok) throw new Error(data.error ?? text); return data as T; }
  async function gateway<T>(path: string, init: RequestInit & { auth?: boolean } = {}) { const h = new Headers(init.headers); if (init.body && !h.has("content-type")) h.set("content-type", "application/json"); const r = await fetch(`/gateway${path}`, { ...init, headers: h, credentials: "include" }); const text = await r.text(); const data = text ? JSON.parse(text) : {}; if (!r.ok) throw new Error(`${r.status} ${data.detail ?? data.error ?? text}`); return data as T; }
  async function run(title: string, action: () => Promise<string>, shouldRefresh = true) { setBusy(title); try { const detail = await action(); log(title, "정상", detail); if (shouldRefresh) await refresh(false); } catch (e) { log(title, "오류", e instanceof Error ? e.message : String(e)); } finally { setBusy(""); } }
  async function refreshVisual() { const data = await local<VisualState>("/visual-state"); setVisual(data); return data; }
  async function refresh(write = true) {
    const [data, visualData] = await Promise.allSettled([local<Overview>("/overview"), local<VisualState>("/visual-state")]);
    if (data.status === "fulfilled") setOverview(data.value);
    if (visualData.status === "fulfilled") setVisual(visualData.value);
    if (write && data.status === "fulfilled" && visualData.status === "fulfilled") log("상태 새로고침", "정상", `클러스터 ${data.value.clusters.length}개, pod ${visualData.value.live.pods.length}개, metric ${Object.keys(visualData.value.metrics).length}개`);
    if (write && data.status === "rejected") log("overview 수집", "오류", data.reason instanceof Error ? data.reason.message : String(data.reason));
    if (write && visualData.status === "rejected") log("visual-state 수집", "오류", visualData.reason instanceof Error ? visualData.reason.message : String(visualData.reason));
  }
  async function loadConfig(write = true) { const c = await local<GitOps>("/gitops/config"); setGitops(c); setYaml(c.yaml); setScaleNs(c.resource.namespace); setScaleName(c.resource.name); setScaleReplicas(c.replicas); await refreshVisual(); if (write) log("설정 가져오기", "정상", `${c.relativePath}; version=${c.version || "없음"}`); }
  function openBridge() { if (bridge.current) return; const es = new EventSource("/local-api/events"); eventNames.forEach((n) => es.addEventListener(n, (e) => { const event = JSON.parse((e as MessageEvent).data) as BridgeEvent; setEvents((x) => [event, ...x].slice(0, 80)); })); es.onerror = () => setEvents((x) => [{ id: Date.now(), at: new Date().toISOString(), type: "bridge.error", status: "오류", message: "브리지 연결 오류" }, ...x]); bridge.current = es; }
  function openVisualStream() {
    if (visualStream.current) return;
    const es = new EventSource("/local-api/visual-stream");
    es.addEventListener("visual.snapshot", (e) => {
      const packet = JSON.parse((e as MessageEvent).data) as VisualPacket;
      if (packet.visual) setVisual(packet.visual);
      setMetricSse("연결");
      setMetricFrames((frames) => [packet, ...frames].slice(0, 12));
      const sample = sampleFromPacket(packet);
      if (sample) setMetricHistory((history) => [...history.filter((x) => x.sequence !== sample.sequence), sample].slice(-48));
    });
    es.addEventListener("visual.error", (e) => {
      const packet = JSON.parse((e as MessageEvent).data) as VisualPacket;
      setMetricSse("오류");
      setMetricFrames((frames) => [packet, ...frames].slice(0, 12));
    });
    es.onopen = () => setMetricSse("연결");
    es.onerror = () => setMetricSse("오류");
    visualStream.current = es;
  }
  async function login() { await run("로그인", async () => { const r = await gateway<{ user_id: string; roles: string[]; workspace_id: string }>("/auth/login", { method: "POST", body: JSON.stringify({ email: authEmail, password: authPassword }) }); setSessionActive(true); setSession(`${r.user_id} · ${r.workspace_id} 인증됨`); localStorage.removeItem("releasegraph.token"); return `${r.roles.join(", ") || "member"} 세션 발급`; }); }
  function openGatewaySse() { stream.current?.close(); const es = new EventSource("/gateway/dashboard/stream", { withCredentials: true }); es.addEventListener("dashboard.updated", (e) => { const rows = JSON.parse((e as MessageEvent).data) as unknown[]; setCards(rows.length); log("Gateway SSE", "정상", `dashboard.updated ${rows.length}개 수신`); void refreshVisual(); }); es.onopen = () => setSse("연결"); es.onerror = () => { setSse("오류"); es.close(); }; stream.current = es; }
  async function deployTarget() { const r = await local<{ overview: Overview; visual: VisualState }>("/cluster/deploy", { method: "POST" }); setOverview(r.overview); setVisual(r.visual); return "target apply/rollout 완료"; }
  async function scaleTarget(replicas: number) { setScaleReplicas(replicas); const r = await local<{ overview: Overview; visual: VisualState }>("/cluster/scale", { method: "POST", body: JSON.stringify({ namespace: scaleNs, deployment: scaleName, replicas }) }); setOverview(r.overview); setVisual(r.visual); return `${scaleNs}/${scaleName} -> ${replicas}`; }

  return (
    <main className={`app tab-${activeTab}`}>
      <header className="topbar"><div className="brand"><span>RG</span><div><h1>ReleaseGraph 운영 대시보드</h1><p>Git PR, Kubernetes 설정, pull/build/deploy, scale, SSE, 장애 복구를 실제 연결합니다.</p></div></div><div className="top-actions"><button onClick={() => void refresh(true)} disabled={!!busy}><RefreshCcw size={15} />새로고침</button><button onClick={openGatewaySse}><Radio size={15} />Gateway SSE</button></div></header>
      <nav className="tabbar" aria-label="대시보드 화면">
        {tabs.map((tab) => <button className={activeTab === tab.id ? "selected" : ""} onClick={() => setActiveTab(tab.id)} key={tab.id}><strong>{tab.label}</strong><span>{tab.desc}</span></button>)}
      </nav>
      <VisualBoard visual={visual} events={events} cards={cards} sse={sse} metricSse={metricSse} frames={metricFrames} history={metricHistory} busy={busy} onRefresh={() => void refresh(true)} onDeploy={() => void run("target 배포", deployTarget)} onScaleUp={() => void run("스케일 조정", () => scaleTarget(3))} onScaleDesired={() => void run("스케일 조정", () => scaleTarget(visual?.desired.replicas ?? gitops?.replicas ?? 2))} onGatewaySse={openGatewaySse} />
      <section className="hero-grid"><article className="primary-status"><div className="status-title"><div><p className="eyebrow">실시간 운영 상태</p><h2>{health?.status === "정상" ? "Gateway와 target 클러스터가 실제로 연결되어 있습니다" : "Gateway 확인 또는 복구가 필요합니다"}</h2></div><strong>{completedCount}/{steps.length}</strong></div><div className="status-strip"><Badge s={health?.status ?? "대기"} t={`Gateway ${health?.status ?? "수집 전"}`} /><Badge s={overview?.busy ? "주의" : "정상"} t={overview?.busy ? "파이프라인 실행 중" : "파이프라인 대기"} /><Badge s={sse === "연결" ? "정상" : sse === "오류" ? "오류" : "대기"} t={`SSE ${sse}`} /><Badge s={sessionActive ? "정상" : "대기"} t={session} /></div><div className="proof-grid"><div><span>다음 액션</span><strong>{nextStep}</strong></div><div><span>Target workload</span><strong>{targetWorkload ? `${targetWorkload.namespace}/${targetWorkload.name} ${targetWorkload.ready}/${targetWorkload.replicas}` : "수집 전"}</strong></div><div><span>Manifest image</span><strong>{gitops?.image || "수집 전"}</strong></div><div><span>Read model</span><strong>{cards} cards</strong></div></div></article><article className="scenario"><div className="runbook-head"><div><p className="eyebrow">실행 런북</p><h2>버튼 조작과 실제 이벤트가 같은 타임라인에 남습니다</h2></div><Badge s={completedCount === steps.length ? "정상" : completedCount > 0 ? "주의" : "대기"} t={`${completedCount}개 완료`} /></div><div className="scenario-row">{steps.map((s, i) => <div className={completed.has(s) ? "scenario-step done" : "scenario-step"} key={s}><span>{String(i + 1).padStart(2, "0")}</span><Dot s={completed.has(s) ? "정상" : nextStep === s ? "주의" : "대기"} /><strong>{s}</strong></div>)}</div></article></section>
      <section className="main-grid"><div className="left-stack">
        <Panel className="gitops-panel" title="데모 GitOps 레포 연결" icon={<GitPullRequest size={18} />} action={<><button onClick={() => void run("레포 fetch", async () => { const r = await local<{ overview: Overview; visual: VisualState }>("/repositories/fetch", { method: "POST" }); setOverview(r.overview); setVisual(r.visual); return "데모 GitOps 레포 fetch 완료"; })} disabled={!!busy}><GitBranch size={15} />git fetch</button><button onClick={() => void run("pull/build", async () => { const r = await local<{ overview: Overview; visual: VisualState }>("/repositories/pull-build", { method: "POST" }); setOverview(r.overview); setVisual(r.visual); return "pull/build 완료"; })} disabled={!!busy}><Hammer size={15} />pull/build</button></>}>
          <div className="repo-grid">{[demoRepo].filter(Boolean).map((r) => <article className="repo-card" key={r!.label}><div className="card-title"><Dot s={r!.status} /><strong>Demo GitOps 레포</strong><code>{r!.head}</code></div><dl><div><dt>branch</dt><dd>{r!.branch}</dd></div><div><dt>upstream</dt><dd>{r!.upstream || "없음"}</dd></div><div><dt>dirty/untracked</dt><dd>{r!.dirty}/{r!.untracked}</dd></div><div className="wide"><dt>remote</dt><dd>{r!.remote}</dd></div></dl><p className="commit-line"><GitCommitHorizontal size={14} />{r!.subject}</p><div className="commit-list">{r!.recentCommits.slice(0, 3).map((c) => <code key={c.hash}>{c.hash} · {short(c.subject, 60)}</code>)}</div></article>)}</div>
        </Panel>
        <Panel className="gitops-panel" title="Kubernetes 설정 파일 편집" icon={<TerminalSquare size={18} />} action={<><button onClick={() => void loadConfig(true)} disabled={!!busy}><RefreshCcw size={15} />가져오기</button><button onClick={() => void run("YAML dry-run", async () => { const r = await local<{ stdout: string; image: string; replicas: number }>("/yaml/dry-run", { method: "POST", body: JSON.stringify({ content: yaml }) }); return `${r.stdout}; image=${r.image}; replicas=${r.replicas}`; })} disabled={!!busy}><ShieldCheck size={15} />dry-run</button><button onClick={() => void run("diff 보기", async () => { const r = await local<{ diff: string; image: string; replicas: number; visual: VisualState }>("/gitops/diff", { method: "POST", body: JSON.stringify({ content: yaml }) }); setDiff(r.diff || "변경 없음"); setVisual(r.visual); return `image=${r.image}; replicas=${r.replicas}`; }, false)} disabled={!!busy}><GitCommitHorizontal size={15} />diff</button><button className="primary" onClick={() => void run("버전 커밋", async () => { const r = await local<{ version: string; state: GitOps; visual: VisualState }>("/gitops/save-version", { method: "POST", body: JSON.stringify({ content: yaml }) }); setGitops(r.state); setVisual(r.visual); setYaml(r.state.yaml); return `version=${r.version}`; })} disabled={!!busy}><Save size={15} />버전 커밋</button></>}><textarea value={yaml} onChange={(e) => setYaml(e.target.value)} spellCheck={false} /></Panel>
        <Panel className="gitops-panel" title="GitOps PR / 머지 반영 / 배포" icon={<GitPullRequest size={18} />}><div className="form-grid"><label>PR base<input value={prBase} onChange={(e) => setPrBase(e.target.value)} /></label><label>PR title<input value={prTitle} onChange={(e) => setPrTitle(e.target.value)} /></label></div><div className="button-grid"><button onClick={() => void run("PR 생성", async () => { const r = await local<{ prUrl: string; branch: string; base: string; visual: VisualState }>("/gitops/pr", { method: "POST", body: JSON.stringify({ base: prBase, title: prTitle }) }); setVisual(r.visual); return `${r.branch} -> ${r.base}; ${r.prUrl}`; }, false)} disabled={!!busy}><GitPullRequest size={15} />PR 생성</button><button onClick={() => void run("머지 반영", async () => { const r = await local<{ overview: Overview; visual: VisualState }>("/gitops/pull-build-deploy", { method: "POST" }); setOverview(r.overview); setVisual(r.visual); await loadConfig(false); return "pull/build/deploy 완료"; })} disabled={!!busy}><Hammer size={15} />머지 반영</button><button className="primary" onClick={() => void run("target 배포", deployTarget)} disabled={!!busy}><Server size={15} />target 배포</button></div><Rows rows={[["파일", gitops?.version || "version 없음", `${gitops?.replicas ?? 0} replicas`, gitops?.relativePath ?? ""], ["GitHub", gitops?.ghStatus.includes("Logged in") ? "인증됨" : "확인 필요", gitops?.resource.namespace ?? "sandbox", short(gitops?.lastCommit || "커밋 없음", 80)]]} /><Diff text={diff} /></Panel>
      </div><div className="right-stack">
        <Panel className="kubernetes-panel events-panel" title="Gateway / 배포 / 장애 복구" icon={<PlugZap size={18} />}><div className="form-grid"><label>email<input value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} /></label><label>password<input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} /></label></div><div className="button-grid"><button onClick={() => void run("Gateway 확인", async () => { const r = await gateway<{ status: string; service: string }>("/healthz"); return `${r.service}: ${r.status}`; })} disabled={!!busy}><Wifi size={15} />Gateway 확인</button><button onClick={() => void run("Gateway 연결 복구", async () => { const r = await local<{ health: { status: Status; detail: string }; overview: Overview }>("/gateway/port-forward/recover", { method: "POST" }); setOverview(r.overview); return `${r.health.status}; ${r.health.detail}`; })} disabled={!!busy}><RefreshCcw size={15} />연결 복구</button><button onClick={login} disabled={!!busy}><ShieldCheck size={15} />로그인</button><button onClick={() => void run("클러스터 연결", async () => { const reg = await gateway<{ cluster_id: string; agent_token: string }>("/targets", { method: "POST", body: JSON.stringify({ cluster_id: "target-cluster-01", management_base_url: "http://api-gateway:8000", apply: false }) }); await gateway("/agent/connect", { method: "POST", headers: { "x-agent-token": reg.agent_token }, body: JSON.stringify({ cluster_id: reg.cluster_id, agent_id: "dashboard-live-agent", capabilities: ["collector", "command_receiver"] }) }); return `${reg.cluster_id} 등록·연결`; })} disabled={!!busy}><Server size={15} />클러스터 연결</button><button onClick={() => void run("Git webhook", async () => { const r = await local<{ accepted: boolean; status: number; visual: VisualState }>("/github-trigger", { method: "POST", body: JSON.stringify({ commit_sha: demoRepo?.head, image: gitops?.image, replicas: gitops?.replicas }) }); setVisual(r.visual); return `accepted=${r.accepted}; status=${r.status}; image=${gitops?.image || "nginx:1.27-alpine"}`; })} disabled={!!busy}><GitBranch size={15} />Git webhook</button><button onClick={() => void run("배포 명령", async () => { const r = await gateway<{ accepted: boolean; correlation_id?: string }>("/commands", { method: "POST", auth: true, body: JSON.stringify({ cluster_id: "target-cluster-01", action: "rollout_restart", namespace: scaleNs, reason: "dashboard live demo" }) }); return `accepted=${r.accepted}; ${r.correlation_id ?? ""}`; })} disabled={!!busy}><Activity size={15} />배포 명령</button><button onClick={() => void run("SSE 조회", async () => { const r = await gateway<{ cards: unknown[] }>("/dashboard/query", { auth: true }); setCards(r.cards?.length ?? 0); return `cards=${r.cards?.length ?? 0}`; })} disabled={!!busy}><Radio size={15} />read model 조회</button><button className="danger" onClick={() => void run("장애 주입", async () => { const r = await local<{ health: { status: Status; detail: string }; overview: Overview }>("/fault/gateway/down", { method: "POST" }); setOverview(r.overview); return `${r.health.status}; ${r.health.detail}`; })} disabled={!!busy}><ShieldAlert size={15} />Gateway 내리기</button><button className="primary" onClick={() => void run("복구 확인", async () => { const r = await local<{ health: { status: Status; detail: string }; overview: Overview }>("/fault/gateway/recover", { method: "POST" }); setOverview(r.overview); return `${r.health.status}; ${r.health.detail}`; })} disabled={!!busy}><Undo2 size={15} />Gateway 복구</button></div><p className="hint">장애 주입은 kind-management deploy/api-gateway replica를 0으로 만들고, 연결 복구는 현재 Gateway NodePort 또는 포트포워드 상태를 실제로 확인합니다.</p></Panel>
        <Panel className="kubernetes-panel" title="Pod scale 실시간 조작" icon={<Server size={18} />}><div className="form-grid"><label>namespace<input value={scaleNs} onChange={(e) => setScaleNs(e.target.value)} /></label><label>deployment<input value={scaleName} onChange={(e) => setScaleName(e.target.value)} /></label><label>replicas<input type="number" min="0" max="10" value={scaleReplicas} onChange={(e) => setScaleReplicas(Number(e.target.value) || 0)} /></label><button className="primary" onClick={() => void run("스케일 조정", () => scaleTarget(scaleReplicas))} disabled={!!busy}><Activity size={15} />스케일 조정</button></div></Panel>
        <Panel className="events-panel" title="분석 범위" icon={<GitCommitHorizontal size={18} />}><Rows rows={(overview?.sourceSummary ?? []).map((r) => [r.label, `${num(r.counts.files)} files`, `${num(r.counts.source)} source`, `${r.branch} · ${r.head}`])} /></Panel>
        <Panel className="kubernetes-panel" title="실행 중 서비스" icon={<Server size={18} />}><List rows={[...(overview?.services ?? []).map((s) => [s.status, s.name, s.port ? `:${s.port}` : "runtime", s.detail] as [Status, string, string, string]), ...(overview?.clusters ?? []).map((c) => [c.status, c.context, `${c.nodes} node / ${c.pods} pod`, c.detail] as [Status, string, string, string]), ...(overview?.workloads ?? []).map((w) => [w.status, `${w.namespace}/${w.name}`, `${w.ready}/${w.replicas} ready`, w.context] as [Status, string, string, string])]} /></Panel>
        <Panel className="events-panel" title="실제 실행 이벤트" icon={<Activity size={18} />}><EventList events={events} /></Panel>
      </div></section>
      <section className="bottom-grid"><Panel className="events-panel" title="운영 로그" icon={<CheckCircle2 size={18} />}><LogList logs={logs} /></Panel><Panel className="events-panel" title="Gateway read model" icon={<Radio size={18} />}><div className="read-model"><strong>{cards}</strong><span>dashboard cards</span><p>로그인 후 read model 조회 또는 Gateway SSE로 갱신됩니다.</p></div></Panel></section>
    </main>
  );
}
function VisualBoard({ visual, events, cards, sse, metricSse, frames, history, busy, onRefresh, onDeploy, onScaleUp, onScaleDesired, onGatewaySse }: { visual: VisualState | null; events: BridgeEvent[]; cards: number; sse: "대기" | "연결" | "오류"; metricSse: "대기" | "연결" | "오류"; frames: VisualPacket[]; history: MetricSample[]; busy: string; onRefresh: () => void; onDeploy: () => void; onScaleUp: () => void; onScaleDesired: () => void; onGatewaySse: () => void }) {
  if (!visual) return <section className="visual-shell"><div className="visual-head"><div><p className="eyebrow">SSE metric stream</p><h2>Prometheus와 Kubernetes snapshot을 SSE로 연결하는 중입니다</h2></div><Badge s={metricSse === "연결" ? "정상" : metricSse === "오류" ? "오류" : "대기"} t={`visual.snapshot ${metricSse}`} /></div><p className="empty">첫 visual.snapshot 프레임을 기다리고 있습니다.</p></section>;
  const feed = [...events, ...visual.sse.localEvents].slice(0, 10);
  const latest = frames[0];
  const targetCluster = visual.clusters.find((cluster) => cluster.role === "Target");
  const mismatchCount = latest?.summary?.mismatches ?? visual.comparisons.filter((c) => driftKeys.has(c.key) && c.status !== "정상").length;
  const alertCount = latest?.summary?.alerts ?? visual.comparisons.filter((c) => c.status !== "정상").length;
  const controlPlaneStatus = targetCluster?.status ?? latest?.summary?.controlPlaneStatus ?? "대기";
  const synced = mismatchCount === 0 && visual.live.deployment.status === "정상";
  const headline = synced && controlPlaneStatus === "정상" ? "데모 레포와 target 클러스터가 실시간 동기화되었습니다" : synced ? "워크로드는 동기화됐고 운영 헬스 경고가 감지되었습니다" : "desired/live 불일치가 실제 클러스터에서 감지되었습니다";
  const verdictLabel = synced && controlPlaneStatus === "정상" ? "동기화 완료" : synced ? "운영 주의" : "불일치 감지";
  const frameAge = latest ? `${Math.max(0, Math.round((Date.now() - Date.parse(latest.at)) / 1000))}초 전` : "수신 전";
  const streamStatus: Status = metricSse === "연결" ? "정상" : metricSse === "오류" ? "오류" : "대기";
  const endpointStatus: Status = visual.live.endpoints.length === visual.live.deployment.ready ? "정상" : "주의";
  const podStatus: Status = visual.live.pods.length === visual.live.deployment.ready ? "정상" : "주의";
  const metricReadyPods = Number(visual.metrics.sandboxPods.value || visual.metrics.sandboxPods.count || 0);
  const metricStatus: Status = metricReadyPods === visual.live.deployment.ready ? "정상" : "주의";
  const samples = history.length ? history : latest ? [sampleFromPacket(latest)].filter((x): x is MetricSample => Boolean(x)) : [];
  const flow = [
    { title: "Demo GitOps", value: visual.demoRepo.head, detail: visual.demoRepo.branch, status: visual.demoRepo.status },
    { title: "Desired YAML", value: `${visual.desired.replicas} replicas`, detail: visual.desired.image, status: "정상" as Status },
    { title: "Target live", value: `${visual.live.deployment.ready}/${visual.live.deployment.replicas} ready`, detail: `${visual.live.pods.length} pods / ${visual.live.endpoints.length} endpoints`, status: visual.live.deployment.status },
    { title: "Control Plane", value: controlPlaneStatus, detail: targetCluster?.detail ?? "수집 전", status: controlPlaneStatus },
    { title: "Prometheus", value: `${visual.metrics.up.value || visual.metrics.up.count} up`, detail: `${visual.metrics.sandboxPods.value || visual.metrics.sandboxPods.count} pod metrics`, status: visual.metrics.up.status },
    { title: "SSE 처리", value: latest ? `#${latest.sequence}` : "수신 전", detail: frameAge, status: streamStatus },
  ];
  return (
    <section className="visual-shell">
      <div className="visual-head">
        <div><p className="eyebrow">SSE metric stream</p><h2>{headline}</h2></div>
        <div className="visual-meta"><Badge s={streamStatus} t={`visual.snapshot ${metricSse}`} /><Badge s={controlPlaneStatus} t={`Target CP ${controlPlaneStatus}`} /><Badge s={visual.gateway.health.status} t={`Gateway ${visual.gateway.health.status}`} /><Badge s={sse === "연결" ? "정상" : sse === "오류" ? "오류" : "대기"} t={`Gateway SSE ${sse}`} /><Badge s={visual.demoRepo.status} t={`Demo repo ${visual.demoRepo.branch}`} /></div>
      </div>
      <div className={`verdict-banner ${synced && controlPlaneStatus === "정상" ? "정상" : "주의"}`}>
        <div><span>{verdictLabel}</span><strong>{visual.desired.replicas} desired → {visual.live.deployment.ready}/{visual.live.deployment.replicas} live</strong><p>{latest ? `${latest.source}에서 ${time(latest.at)} 수신 · alert ${alertCount}` : "SSE metric snapshot을 기다리는 중"}</p></div>
        <div className="quick-actions"><button onClick={onRefresh} disabled={!!busy}><RefreshCcw size={15} />수동 검증</button><button className="primary" onClick={onDeploy} disabled={!!busy}><Server size={15} />desired 배포</button><button onClick={onScaleUp} disabled={!!busy}><Activity size={15} />3개로 증가</button><button onClick={onScaleDesired} disabled={!!busy}><Undo2 size={15} />desired로 복구</button><button onClick={onGatewaySse}><Radio size={15} />Gateway SSE</button></div>
      </div>
      <div className="sre-health-grid">
        <HealthTile title="서비스 동기화" value={synced ? "정상" : "주의"} status={synced ? "정상" : "주의"} detail={`${mismatchCount}개 diff · desired ${visual.desired.replicas}`} />
        <HealthTile title="Deployment" value={`${visual.live.deployment.ready}/${visual.live.deployment.replicas}`} status={visual.live.deployment.status} detail={`gen ${visual.live.deployment.observedGeneration}/${visual.live.deployment.generation} · rev ${visual.live.deployment.revision || "-"}`} />
        <HealthTile title="Control Plane" value={controlPlaneStatus} status={controlPlaneStatus} detail={targetCluster?.detail ?? "target control-plane 수집 전"} />
        <HealthTile title="Pod / Endpoint" value={`${visual.live.pods.length}/${visual.live.endpoints.length}`} status={podStatus === "정상" && endpointStatus === "정상" ? "정상" : "주의"} detail={`${podStatus === "정상" ? "pod 정상" : "pod 지연"} · ${endpointStatus === "정상" ? "endpoint 정상" : "endpoint 지연"}`} />
        <HealthTile title="Prometheus Ready" value={String(metricReadyPods)} status={metricStatus} detail={visual.metrics.sandboxPods.query} />
        <HealthTile title="SSE 수신" value={latest ? `#${latest.sequence}` : "없음"} status={streamStatus} detail={latest ? frameAge : "visual.snapshot 대기"} />
      </div>
      <div className="trend-grid">
        <MetricTrend title="Ready Pod" status={visual.live.deployment.status} samples={samples} field="readyPods" max={Math.max(visual.desired.replicas, visual.live.deployment.replicas, 1)} suffix="pods" />
        <MetricTrend title="Prometheus Ready" status={metricStatus} samples={samples} field="prometheusReadyPods" max={Math.max(visual.desired.replicas, visual.live.deployment.replicas, metricReadyPods, 1)} suffix="pods" />
        <MetricTrend title="Endpoint" status={endpointStatus} samples={samples} field="endpoints" max={Math.max(visual.live.deployment.replicas, visual.live.endpoints.length, 1)} suffix="eps" />
        <MetricTrend title="Diff Count" status={mismatchCount ? "주의" : "정상"} samples={samples} field="mismatches" max={Math.max(...samples.map((s) => s.mismatches), mismatchCount, 1)} suffix="diff" invert />
      </div>
      <div className="flow-rail">
        {flow.map((item, index) => <div className={`flow-node ${item.status}`} key={item.title}><span>{String(index + 1).padStart(2, "0")}</span><strong>{item.title}</strong><em>{item.value}</em><code>{item.detail}</code></div>)}
      </div>
      <div className="compare-grid">
        <section className="compare-panel desired"><h3>GitOps desired</h3><strong>{visual.desired.namespace}/{visual.desired.name}</strong><dl><div><dt>repo</dt><dd>{visual.demoRepo.remote}</dd></div><div><dt>branch / commit</dt><dd>{visual.demoRepo.branch} · {visual.demoRepo.head}</dd></div><div><dt>image</dt><dd>{visual.desired.image}</dd></div><div><dt>replicas</dt><dd>{visual.desired.replicas}</dd></div></dl></section>
        <section className="compare-panel live"><h3>Cluster live</h3><strong>{visual.live.deployment.namespace}/{visual.live.deployment.name}</strong><dl><div><dt>generation</dt><dd>{visual.live.deployment.observedGeneration}/{visual.live.deployment.generation}</dd></div><div><dt>revision</dt><dd>{visual.live.deployment.revision || "수집됨"}</dd></div><div><dt>image</dt><dd>{visual.live.deployment.image}</dd></div><div><dt>ready</dt><dd>{visual.live.deployment.ready}/{visual.live.deployment.replicas}</dd></div></dl></section>
        <section className="compare-panel verdict"><h3>차이 비교</h3><div className="diff-matrix">{visual.comparisons.map((c) => <div className={`diff-cell ${c.status}`} key={c.key}><span>{c.label}</span><strong>{String(c.desired)}</strong><em>→</em><strong>{String(c.live)}</strong></div>)}</div></section>
      </div>
      <div className="cluster-visual-grid">
        <section className="visual-card"><h3>클러스터 단위 상태</h3><div className="cluster-cards">{visual.clusters.map((c) => <article className="cluster-card" key={c.context}><div><Dot s={c.status} /><strong>{c.role}</strong><code>{c.context}</code></div><p>{c.nodes} node · {c.pods} pods</p><div className="component-pills">{(c.componentStatus?.length ? c.componentStatus : c.components.map((name) => ({ name, status: "대기" as Status, detail: "컴포넌트 수집 전", ready: "", restarts: 0 }))).map((x) => <span className={x.status} title={x.detail} key={x.name}><Dot s={x.status} />{x.name}</span>)}</div></article>)}</div></section>
        <section className="visual-card"><h3>Workload topology</h3><div className="topology"><TopologyNode title="Deployment" main={`${visual.live.deployment.ready}/${visual.live.deployment.replicas} ready`} status={visual.live.deployment.status} sub={`rev ${visual.live.deployment.revision || "-"}`} /><span className="topology-arrow">→</span><div className="rs-stack">{visual.live.replicaSets.slice(0, 2).map((rs) => <TopologyNode key={rs.name} title="ReplicaSet" main={rs.name.replace(`${visual.live.deployment.name}-`, "")} status={rs.ready === rs.desired ? "정상" : "주의"} sub={`${rs.ready}/${rs.desired}`} />)}</div><span className="topology-arrow">→</span><div className="pod-grid">{visual.live.pods.map((p) => <div className={`pod-tile ${p.ready ? "정상" : "오류"}`} key={p.name}><strong>{p.name.replace(`${visual.live.deployment.name}-`, "")}</strong><span>{p.phase} · restart {p.restarts}</span><code>{p.ip}</code></div>)}</div><span className="topology-arrow">→</span><TopologyNode title="Service / Endpoints" main={`${visual.live.service.clusterIP}:${visual.live.service.port}`} status={visual.live.endpoints.length === visual.live.deployment.ready ? "정상" : "주의"} sub={`${visual.live.endpoints.length} endpoints`} /></div></section>
        <section className="visual-card"><h3>SSE / Metrics live</h3><div className="metric-grid"><Metric title="visual.snapshot" value={latest ? `#${latest.sequence}` : "0"} status={streamStatus} detail={latest?.error ?? frameAge} /><Metric title="Prometheus up" value={String(visual.metrics.up.value || visual.metrics.up.count)} status={visual.metrics.up.status} detail="service proxy /api/v1/query" /><Metric title="Ready replica metric" value={String(visual.metrics.sandboxPods.value || visual.metrics.sandboxPods.count)} status={metricStatus} detail="max(kube_deployment_status_replicas_ready)" /><Metric title="Desired replica metric" value={String(visual.metrics.replicas.value || visual.metrics.replicas.count)} status={visual.metrics.replicas.status} detail="max(kube_deployment_spec_replicas)" /><Metric title="Gateway cards" value={String(cards || visual.gateway.cards.count)} status={visual.gateway.cards.status} detail={visual.gateway.cards.error ?? "dashboard/query"} /><Metric title="Bridge events" value={String(visual.sse.totalLocalEvents)} status={feed.length ? "정상" : "대기"} detail="local-api/events" /></div><FrameList frames={frames} /><EventList events={feed} /></section>
      </div>
    </section>
  );
}
function TopologyNode({ title, main, sub, status }: { title: string; main: string; sub: string; status: Status }) { return <div className={`topology-node ${status}`}><span>{title}</span><strong>{main}</strong><code>{sub}</code></div>; }
function Metric({ title, value, detail, status }: { title: string; value: string; detail: string; status: Status }) { return <div className={`metric-card ${status}`}><span>{title}</span><strong>{value}</strong><code>{detail}</code></div>; }
function HealthTile({ title, value, detail, status }: { title: string; value: string; detail: string; status: Status }) { return <div className={`health-tile ${status}`}><span>{title}</span><strong>{value}</strong><code>{detail}</code></div>; }
function MetricTrend({ title, status, samples, field, max, suffix, invert = false }: { title: string; status: Status; samples: MetricSample[]; field: keyof Pick<MetricSample, "readyPods" | "liveReplicas" | "activePods" | "endpoints" | "prometheusReadyPods" | "deploymentMetric" | "mismatches">; max: number; suffix: string; invert?: boolean }) {
  const values = samples.map((sample) => Number(sample[field]) || 0);
  const latest = values[values.length - 1] ?? 0;
  const width = 220;
  const height = 64;
  const ceiling = Math.max(max, ...values, 1);
  const points = values.map((value, index) => {
    const x = values.length <= 1 ? width - 6 : 6 + (index * (width - 12)) / (values.length - 1);
    const y = height - 8 - (value / ceiling) * (height - 18);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return <div className={`trend-card ${invert && latest > 0 ? "주의" : status}`}><div><span>{title}</span><strong>{latest} {suffix}</strong><code>{samples.length ? `${samples.length} SSE frames` : "프레임 대기"}</code></div><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} trend`}><path d={`M 6 ${height - 8} H ${width - 6}`} /><polyline points={points || `6,${height - 8}`} /></svg></div>;
}
function FrameList({ frames }: { frames: VisualPacket[] }) { return frames.length ? <div className="frame-list">{frames.slice(0, 5).map((frame) => <div className={`frame-row ${frame.status}`} key={`${frame.sequence}-${frame.at}`}><strong>#{frame.sequence}</strong><time>{time(frame.at)}</time><span>{frame.summary ? `${frame.summary.readyPods}/${frame.summary.liveReplicas} ready · ${frame.summary.pods} pods · ${frame.summary.mismatches} diff` : frame.error}</span></div>)}</div> : <p className="empty">SSE metric frame 수신 전입니다.</p>; }
function Badge({ s, t }: { s: Status; t: string }) { return <span className={`status ${s}`}>{t}</span>; }
function Dot({ s }: { s: Status }) { return <i className={`dot ${s}`} aria-label={s} />; }
function Panel({ title, icon, action, children, className = "" }: { title: string; icon: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) { return <section className={`panel ${className}`}><div className="panel-head"><h2>{icon}{title}</h2><div className="panel-actions">{action}</div></div>{children}</section>; }
function Rows({ rows }: { rows: string[][] }) { return <div className="analysis-list">{rows.map((r, i) => <div className="analysis-row" key={i}><strong>{r[0]}</strong><span>{r[1]}</span><span>{r[2]}</span><code>{r[3]}</code></div>)}</div>; }
function List({ rows }: { rows: Array<[Status, string, string, string]> }) { return <div className="service-list">{rows.map((r, i) => <div className="service-row" key={i}><Dot s={r[0]} /><strong>{r[1]}</strong><span>{r[2]}</span><code>{short(r[3], 88)}</code></div>)}</div>; }
function Diff({ text }: { text: string }) { const rows = text ? text.split("\n").slice(0, 18) : ["diff를 실행하면 변경 과정이 여기에 표시됩니다."]; return <div className="diff-list">{rows.map((line, i) => <div className="diff-row" key={`${i}-${line}`}><Dot s={line.startsWith("+") ? "정상" : line.startsWith("-") ? "오류" : "대기"} /><strong>{line.startsWith("+") ? "추가" : line.startsWith("-") ? "삭제" : "정보"}</strong><code>{line}</code></div>)}</div>; }
function EventList({ events }: { events: BridgeEvent[] }) { return events.length ? <div className="event-list">{events.map((e, i) => <div className="event-row" key={`${e.id}-${e.type}-${i}`}><time>{time(e.at)}</time><Dot s={e.status} /><strong>{e.type}</strong><span>{e.message}</span><code>{e.detail ?? ""}</code></div>)}</div> : <p className="empty">아직 이벤트가 없습니다.</p>; }
function LogList({ logs }: { logs: Log[] }) { return logs.length ? <div className="log-list">{logs.map((l) => <div className="log-row" key={l.id}><time>{time(l.at)}</time><Dot s={l.status} /><strong>{l.title}</strong><span>{l.detail}</span></div>)}</div> : <p className="empty">아직 실행 로그가 없습니다.</p>; }

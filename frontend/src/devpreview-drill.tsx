// ⚠ 데모 · 클러스터 → 노드 → 파드 드릴다운. 클릭으로 줌인, 파드는 상세. 라이트모드. motion. 더미.
import ReactDOM from "react-dom/client";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, Server, Boxes, Box, Cpu, Layers, FileCog, Activity, ScrollText, ArrowLeft } from "lucide-react";
import "./styles/tokens.css";
import "./styles/foundation.css";

const EASE = [0.32, 0.72, 0, 1] as const;
const BLUE = "#2F5BFF";

type NodeT = { id: string; zone: string; instance: string; vcpu: number; memGi: number; k8s: string };
const NODES: NodeT[] = [
  { id: "ip-10-0-1-24", zone: "apne2-a", instance: "m5.xlarge", vcpu: 4, memGi: 16, k8s: "v1.29.4" },
  { id: "ip-10-0-2-91", zone: "apne2-b", instance: "m5.xlarge", vcpu: 4, memGi: 16, k8s: "v1.29.4" },
  { id: "ip-10-0-3-15", zone: "apne2-c", instance: "m5.2xlarge", vcpu: 8, memGi: 32, k8s: "v1.29.4" },
];
const SERVICES = [
  { id: "shop-api", color: "#2F5BFF" }, { id: "shop-web", color: "#22C55E" }, { id: "checkout", color: "#F59E0B" },
  { id: "payments", color: "#EF4444" }, { id: "search", color: "#06B6D4" }, { id: "auth", color: "#A855F7" },
  { id: "redis", color: "#EC4899" }, { id: "gateway", color: "#3B82F6" }, { id: "notifier", color: "#F97316" }, { id: "worker", color: "#14B8A6" },
];
const SCOLOR = Object.fromEntries(SERVICES.map((s) => [s.id, s.color])) as Record<string, string>;
const SVC_CFG: Record<string, string[]> = {
  "shop-api": ["app-config", "redis-config"], "shop-web": ["app-config", "feature-flags"], checkout: ["app-config", "db-credentials"],
  payments: ["db-credentials"], search: ["app-config", "redis-config"], auth: ["db-credentials"], redis: ["redis-config"],
  gateway: ["tls-cert"], notifier: ["app-config"], worker: ["app-config"],
};

type Status = "Running" | "OOMKilled" | "CrashLoopBackOff" | "Pending";
const STCOLOR: Record<Status, string> = { Running: "#22C55E", OOMKilled: "#EF4444", CrashLoopBackOff: "#EF4444", Pending: "#9AA1AC" };
type Pod = { id: string; name: string; node: string; svc: string; cpu: number; mem: number; status: Status; restarts: number; ageMin: number; image: string; ready: string };

function makeRng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function genPods(): Pod[] {
  const r = makeRng(7); const pods: Pod[] = []; let k = 0;
  NODES.forEach((node) => {
    const count = 15 + Math.floor(r() * 8);
    for (let i = 0; i < count; i++) {
      const svc = SERVICES[Math.floor(r() * SERVICES.length)].id;
      const pending = r() < 0.03; const hot = r() < 0.09;
      let cpu = Math.floor(r() * 58) + 12, mem = Math.floor(r() * 56) + 18;
      if (hot) { cpu = 88 + Math.floor(r() * 11); mem = 90 + Math.floor(r() * 9); }
      const status: Status = pending ? "Pending" : hot ? (r() < 0.5 ? "OOMKilled" : "CrashLoopBackOff") : "Running";
      pods.push({
        id: `p${k++}`, name: `${svc}-${Math.floor(r() * 900) + 100}-${["x7f", "q2d", "m9k", "b4t", "z1p"][Math.floor(r() * 5)]}`,
        node: node.id, svc, cpu: pending ? 0 : cpu, mem: pending ? 0 : mem, status,
        restarts: status === "Running" ? (r() < 0.2 ? 1 : 0) : 3 + Math.floor(r() * 8),
        ageMin: 8 + Math.floor(r() * 5000), image: `registry.opsia.io/${svc}:1.${Math.floor(r() * 18)}.${Math.floor(r() * 9)}`,
        ready: pending ? "0/1" : "1/1",
      });
    }
  });
  return pods;
}
const util = (p: Pod) => Math.max(p.cpu, p.mem);
const isCrit = (p: Pod) => p.status === "OOMKilled" || p.status === "CrashLoopBackOff";
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function heat(u: number): string {
  const stops: [number, number[]][] = [[0, [96, 165, 250]], [30, [59, 130, 246]], [55, [45, 212, 191]], [72, [250, 204, 21]], [86, [249, 115, 22]], [100, [239, 68, 68]]];
  u = Math.max(0, Math.min(100, u));
  for (let i = 0; i < stops.length - 1; i++) { const [u0, c0] = stops[i], [u1, c1] = stops[i + 1]; if (u <= u1) { const t = (u - u0) / (u1 - u0 || 1); return `rgb(${Math.round(lerp(c0[0], c1[0], t))},${Math.round(lerp(c0[1], c1[1], t))},${Math.round(lerp(c0[2], c1[2], t))})`; } }
  return "rgb(239,68,68)";
}
const age = (m: number) => (m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`);

// 육각
function hexSpiral(n: number) { const out = [{ q: 0, r: 0 }]; const d = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]; for (let k = 1; out.length < n; k++) { let q = d[4][0] * k, r = d[4][1] * k; for (let s = 0; s < 6 && out.length < n; s++) for (let st = 0; st < k && out.length < n; st++) { out.push({ q, r }); q += d[s][0]; r += d[s][1]; } } return out.slice(0, n); }
const hpx = (q: number, r: number, s: number) => s * Math.sqrt(3) * (q + r / 2);
const hpy = (q: number, r: number, s: number) => s * 1.5 * r;
const hpts = (cx: number, cy: number, rad: number) => Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 180) * (60 * i - 30); return `${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`; }).join(" ");

const Gloss = () => <svg width="0" height="0" style={{ position: "absolute" }}><defs><linearGradient id="dg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0.42" /><stop offset="0.5" stopColor="#fff" stopOpacity="0.08" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient></defs></svg>;

function Honeycomb({ pods, colorBy, s = 16, stagger = true, onPod }: { pods: Pod[]; colorBy: "svc" | "load"; s?: number; stagger?: boolean; onPod?: (p: Pod) => void }) {
  const cells = hexSpiral(pods.length);
  const pos = cells.map((c) => ({ x: hpx(c.q, c.r, s), y: hpy(c.q, c.r, s) }));
  const xs = pos.map((p) => p.x), ys = pos.map((p) => p.y), pad = s + 2;
  const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad, minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
  const w = maxX - minX, h = maxY - minY;
  return (
    <svg width={w} height={h} viewBox={`${minX} ${minY} ${w} ${h}`} style={{ maxWidth: "100%", height: "auto" }}>
      {pods.map((p, i) => {
        const pts = hpts(pos[i].x, pos[i].y, s - 1);
        const fill = p.status === "Pending" ? "#C7CBD3" : colorBy === "svc" ? SCOLOR[p.svc] : heat(util(p));
        return (
          <motion.g key={p.id} initial={stagger ? { opacity: 0, scale: 0.5 } : false} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.01, duration: 0.3, ease: EASE }}
            onClick={() => onPod?.(p)} style={{ cursor: onPod ? "pointer" : "default", transformOrigin: `${pos[i].x}px ${pos[i].y}px` }} className="hx">
            <polygon points={pts} fill={fill} stroke="#fff" strokeWidth={1.6} strokeLinejoin="round" />
            <polygon points={pts} fill="url(#dg)" strokeLinejoin="round" style={{ pointerEvents: "none" }} />
            {isCrit(p) && <polygon points={pts} fill="none" stroke="#EF4444" strokeWidth={2.4} strokeLinejoin="round" style={{ pointerEvents: "none" }} />}
          </motion.g>
        );
      })}
    </svg>
  );
}

function Gauge({ label, v, sub }: { label: string; v: number; sub?: string }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}><span style={{ color: "#8A93A0" }}>{label}</span><span style={{ fontWeight: 700, color: "#111318" }}>{v}%{sub && <span style={{ color: "#9AA1AC", fontWeight: 400 }}> {sub}</span>}</span></div>
      <div style={{ height: 8, borderRadius: 999, background: "rgba(17,19,24,0.06)", overflow: "hidden" }}><div style={{ width: `${v}%`, height: "100%", borderRadius: 999, background: heat(v) }} /></div>
    </div>
  );
}

const Hint = ({ icon: I, children }: { icon: typeof Server; children: React.ReactNode }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 9, background: "rgba(47,91,255,0.05)", border: "1px solid rgba(47,91,255,0.12)", borderRadius: 12, padding: "10px 14px", fontSize: 12.5, color: "#3A4658" }}>
    <I size={15} style={{ color: BLUE, flexShrink: 0 }} /> <span>{children}</span>
  </div>
);

// ── 클러스터 레벨 ─────────────────────────────
function ClusterLevel({ pods, onNode }: { pods: Pod[]; onNode: (n: NodeT) => void }) {
  const crit = pods.filter(isCrit).length;
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Hint icon={Boxes}>클러스터는 <b>서버(노드) 여러 대</b>의 묶음입니다. 노드 카드를 클릭해 안을 열어보세요.</Hint>
      <div style={{ position: "relative", background: "rgba(47,91,255,0.03)", border: "1px dashed rgba(47,91,255,0.25)", borderRadius: 18, padding: 16, paddingTop: 34 }}>
        <div style={{ position: "absolute", top: 10, left: 14, display: "flex", alignItems: "center", gap: 7 }}>
          <Boxes size={14} style={{ color: BLUE }} /><span style={{ fontSize: 12, fontWeight: 700, color: BLUE }}>cluster-2</span>
          <span style={{ fontSize: 11.5, color: "#9AA1AC" }}>· {NODES.length} 노드 · {pods.length} 파드 · 임계 {crit}</span>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {NODES.map((node) => {
            const np = pods.filter((p) => p.node === node.id);
            const act = np.filter((p) => p.status !== "Pending");
            const avgCpu = Math.round(act.reduce((s, p) => s + p.cpu, 0) / (act.length || 1));
            const hot = np.filter(isCrit).length;
            return (
              <motion.button key={node.id} onClick={() => onNode(node)} whileHover={{ y: -3 }} whileTap={{ scale: 0.99 }}
                style={{ flex: 1, textAlign: "left", background: "#fff", border: "1px solid rgba(17,19,24,0.08)", borderRadius: 16, padding: 14, boxShadow: "0 1px 3px rgba(17,19,24,0.05)", cursor: "pointer", display: "flex", flexDirection: "column" }} className="ncard">
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ width: 22, height: 22, borderRadius: 7, background: "rgba(47,91,255,0.1)", display: "grid", placeItems: "center" }}><Server size={13} style={{ color: BLUE }} /></span>
                  <span style={{ fontFamily: "ui-monospace,monospace", fontSize: 12, fontWeight: 600, color: "#111318" }}>{node.id}</span>
                  <ChevronRight size={16} style={{ marginLeft: "auto", color: "#C3CAD5" }} className="chev" />
                </div>
                <div style={{ fontSize: 10.5, color: "#9AA1AC", marginTop: 3, marginLeft: 29 }}>{node.instance} · {node.zone}{hot > 0 && <span style={{ color: "#EF4444", fontWeight: 600 }}> · 핫스팟 {hot}</span>}</div>
                <div style={{ marginTop: 11 }}><Gauge label="평균 CPU" v={avgCpu} sub={`· ${np.length} pods`} /></div>
                <div style={{ display: "flex", justifyContent: "center", marginTop: 12, minHeight: 150 }}><Honeycomb pods={np} colorBy="load" s={13} /></div>
              </motion.button>
            );
          })}
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: "#8A93A0", display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>낮음<span style={{ width: 120, height: 8, borderRadius: 999, background: "linear-gradient(90deg,#60A5FA,#3B82F6,#2DD4BF,#FACC15,#F97316,#EF4444)" }} />높음</span>
        <span style={{ marginLeft: 6 }}>· 육각형 = 파드, 색 = 부하</span>
      </div>
    </div>
  );
}

// ── 노드 레벨 ─────────────────────────────
function NodeLevel({ node, pods, onPod }: { node: NodeT; pods: Pod[]; onPod: (p: Pod) => void }) {
  const [colorBy, setColorBy] = useState<"svc" | "load">("svc");
  const np = pods.filter((p) => p.node === node.id);
  const act = np.filter((p) => p.status !== "Pending");
  const avgCpu = Math.round(act.reduce((s, p) => s + p.cpu, 0) / (act.length || 1));
  const avgMem = Math.round(act.reduce((s, p) => s + p.mem, 0) / (act.length || 1));
  const svcs = [...new Set(np.map((p) => p.svc))];
  const usedSvcs = SERVICES.filter((s) => svcs.includes(s.id));
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Hint icon={Server}>노드는 <b>실제 서버 1대</b>예요. 이 위에 여러 파드가 함께 뜹니다. 파드(육각형)를 클릭해 자세히 보세요.</Hint>
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16 }}>
        {/* 노드 정보 */}
        <div style={{ background: "#F6F8FC", border: "1px solid rgba(17,19,24,0.06)", borderRadius: 16, padding: 16, display: "grid", gap: 12, alignContent: "start" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(47,91,255,0.1)", display: "grid", placeItems: "center" }}><Server size={17} style={{ color: BLUE }} /></span>
            <div style={{ minWidth: 0 }}><div style={{ fontFamily: "ui-monospace,monospace", fontSize: 12.5, fontWeight: 700, color: "#111318" }}>{node.id}</div><div style={{ fontSize: 11, color: "#9AA1AC" }}>{node.zone}</div></div>
          </div>
          {[["인스턴스", node.instance], ["vCPU", `${node.vcpu} 코어`], ["메모리", `${node.memGi} Gi`], ["쿠버네티스", node.k8s], ["파드", `${np.length}개`]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}><span style={{ color: "#8A93A0" }}>{k}</span><span style={{ fontWeight: 600, color: "#111318", fontFamily: "ui-monospace,monospace" }}>{v}</span></div>
          ))}
          <div style={{ height: 1, background: "rgba(17,19,24,0.06)" }} />
          <Gauge label="CPU 사용" v={avgCpu} /><Gauge label="MEM 사용" v={avgMem} />
        </div>
        {/* 파드 벌집 */}
        <div style={{ background: "#fff", border: "1px solid rgba(17,19,24,0.08)", borderRadius: 16, padding: 16, boxShadow: "0 1px 3px rgba(17,19,24,0.05)", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#111318" }}>파드 {np.length}개</span>
            <div style={{ display: "flex", gap: 4, background: "#F2F3F7", borderRadius: 10, padding: 3 }}>
              {([["svc", "서비스"], ["load", "부하"]] as const).map(([id, l]) => { const on = colorBy === id; return <button key={id} onClick={() => setColorBy(id)} style={{ position: "relative", padding: "6px 12px", borderRadius: 7, border: "none", background: "transparent", cursor: "pointer" }}>{on && <motion.span layoutId="nsw" style={{ position: "absolute", inset: 0, borderRadius: 7, background: BLUE }} transition={{ type: "spring", visualDuration: 0.25, bounce: 0.18 }} />}<span style={{ position: "relative", fontSize: 12, fontWeight: 600, color: on ? "#fff" : "#565E6B" }}>{l}</span></button>; })}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1, minHeight: 260, marginTop: 8 }}><Honeycomb pods={np} colorBy={colorBy} s={24} onPod={onPod} /></div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, color: "#8A93A0", paddingTop: 10, borderTop: "1px solid rgba(17,19,24,0.06)" }}>
            {colorBy === "svc" ? usedSvcs.map((s) => <span key={s.id} style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: s.color }} />{s.id}</span>)
              : <span style={{ display: "flex", alignItems: "center", gap: 8 }}>낮음<span style={{ width: 120, height: 7, borderRadius: 999, background: "linear-gradient(90deg,#60A5FA,#3B82F6,#2DD4BF,#FACC15,#F97316,#EF4444)" }} />높음</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 파드 레벨 (상세) ─────────────────────────────
function Card({ icon: I, title, children }: { icon: typeof Cpu; title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid rgba(17,19,24,0.08)", borderRadius: 16, padding: 16, boxShadow: "0 1px 3px rgba(17,19,24,0.05)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 13 }}><I size={15} style={{ color: BLUE }} /><span style={{ fontSize: 12.5, fontWeight: 700, color: "#111318" }}>{title}</span></div>
      {children}
    </div>
  );
}
function Row({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, padding: "4px 0" }}><span style={{ color: "#8A93A0", flexShrink: 0 }}>{k}</span><span style={{ fontWeight: 600, color: "#111318", fontFamily: mono ? "ui-monospace,monospace" : undefined, textAlign: "right", wordBreak: "break-all" }}>{v}</span></div>;
}
function PodLevel({ pod }: { pod: Pod }) {
  const crit = isCrit(pod);
  const events = pod.status === "OOMKilled"
    ? [["OOMKilled", "메모리 한도(512Mi) 초과로 컨테이너 강제 종료", "2m 전", "#EF4444"], ["BackOff", "실패한 컨테이너 재시작 대기 중", "1m 전", "#F59E0B"], ["Unhealthy", "Liveness probe 실패 (3회)", "40s 전", "#F59E0B"]]
    : pod.status === "CrashLoopBackOff"
      ? [["BackOff", "CrashLoopBackOff — 재시작 반복", "1m 전", "#EF4444"], ["Failed", "컨테이너 종료 코드 1", "3m 전", "#EF4444"], ["Pulled", "이미지 pull 완료", "8m 전", "#22C55E"]]
      : [["Started", "컨테이너 시작됨", `${age(pod.ageMin)} 전`, "#22C55E"], ["Pulled", "이미지 pull 완료", `${age(pod.ageMin)} 전`, "#22C55E"], ["Scheduled", `${pod.node}에 배치됨`, `${age(pod.ageMin)} 전`, "#22C55E"]];
  const logs = crit
    ? ["level=error msg=\"out of memory\" rss=537Mi limit=512Mi", "signal: killed (OOM)", "level=warn msg=\"restarting container\"", "level=error msg=\"readiness probe failed\""]
    : ["level=info msg=\"request handled\" path=/health status=200 dur=3ms", `level=info msg="connected" svc=${pod.svc}`, "level=info msg=\"gc pause\" dur=1.2ms", "level=info msg=\"heartbeat ok\""];
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Hint icon={Box}>파드는 <b>앱이 실제로 도는 최소 단위</b>입니다. 안에 컨테이너가 들어있고, 하나의 노드 위에서 돌아갑니다.</Hint>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", border: "1px solid rgba(17,19,24,0.08)", borderRadius: 16, padding: 16, boxShadow: "0 1px 3px rgba(17,19,24,0.05)" }}>
        <span style={{ width: 40, height: 40, borderRadius: 11, background: `${SCOLOR[pod.svc]}1A`, display: "grid", placeItems: "center" }}><Box size={20} style={{ color: SCOLOR[pod.svc] }} /></span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: "ui-monospace,monospace", fontSize: 15, fontWeight: 700, color: "#111318" }}>{pod.name}</div>
          <div style={{ fontSize: 12, color: "#8A93A0", marginTop: 2 }}>서비스 {pod.svc} · 노드 {pod.node}</div>
        </div>
        <span style={{ display: "flex", alignItems: "center", gap: 6, background: `${STCOLOR[pod.status]}18`, color: STCOLOR[pod.status], fontWeight: 700, fontSize: 12.5, padding: "7px 13px", borderRadius: 999 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: STCOLOR[pod.status] }} className={crit ? "pulse" : ""} />{pod.status}
        </span>
      </div>
      {/* 상세 카드 그리드 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card icon={Cpu} title="리소스"><div style={{ display: "grid", gap: 12 }}><Gauge label="CPU" v={pod.cpu} sub={crit ? "· 한도 근접" : ""} /><Gauge label="메모리" v={pod.mem} sub={pod.status === "OOMKilled" ? "· 한도 초과" : ""} /><Row k="재시작" v={<span style={{ color: pod.restarts > 0 ? "#EF4444" : "#111318" }}>{pod.restarts}회</span>} /><Row k="나이" v={age(pod.ageMin)} /></div></Card>
        <Card icon={Layers} title="컨테이너 · 소유"><Row k="Ready" v={pod.ready} /><Row k="이미지" v={pod.image} mono /><Row k="소유" v={`${pod.svc} (Deployment)`} mono /><Row k="ReplicaSet" v={`${pod.svc}-7d4f`} mono /><Row k="QoS" v="Burstable" /></Card>
        <Card icon={FileCog} title="마운트된 설정"><div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>{(SVC_CFG[pod.svc] || []).map((c) => { const secret = c.includes("cred") || c.includes("cert"); return <span key={c} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontFamily: "ui-monospace,monospace", fontWeight: 600, color: "#111318", background: secret ? "#F7F0FE" : "#EEF2FF", border: `1px solid ${secret ? "#A855F7" : BLUE}33`, borderRadius: 9, padding: "6px 10px" }}><span style={{ width: 8, height: 8, borderRadius: 2, background: secret ? "#A855F7" : BLUE }} />{c}<span style={{ color: "#9AA1AC", fontWeight: 400 }}>{secret ? "Secret" : "ConfigMap"}</span></span>; })}</div></Card>
        <Card icon={Activity} title="최근 이벤트"><div style={{ display: "grid", gap: 9 }}>{events.map(([kind, msg, t, c], i) => (<div key={i} style={{ display: "flex", gap: 9, alignItems: "start" }}><span style={{ width: 7, height: 7, borderRadius: 999, background: c as string, marginTop: 5, flexShrink: 0 }} /><div style={{ minWidth: 0 }}><span style={{ fontSize: 12, fontWeight: 700, color: "#111318" }}>{kind}</span> <span style={{ fontSize: 11.5, color: "#565E6B" }}>{msg}</span><div style={{ fontSize: 10.5, color: "#B4BBC6" }}>{t}</div></div></div>))}</div></Card>
      </div>
      <Card icon={ScrollText} title="로그 (최근)"><pre style={{ margin: 0, background: "#F4F6FA", borderRadius: 12, padding: "12px 14px", fontFamily: "ui-monospace,monospace", fontSize: 11.5, lineHeight: 1.75, color: crit ? "#7F1D1D" : "#3A4658", overflowX: "auto", whiteSpace: "pre" }}>{logs.join("\n")}</pre></Card>
    </div>
  );
}

// ── 루트 ─────────────────────────────
function App() {
  const pods = useMemo(() => genPods(), []);
  const [node, setNode] = useState<NodeT | null>(null);
  const [pod, setPod] = useState<Pod | null>(null);
  const level = pod ? "pod" : node ? "node" : "cluster";
  const crumbs = [
    { label: "cluster-2", on: () => { setPod(null); setNode(null); } },
    ...(node ? [{ label: node.id, on: () => setPod(null) }] : []),
    ...(pod ? [{ label: pod.name, on: () => {} }] : []),
  ];

  return (
    <div className="dr" style={{ minHeight: "100vh", padding: "40px 24px", display: "flex", justifyContent: "center" }}>
      <Gloss />
      <div style={{ width: 980, maxWidth: "100%" }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", color: "#111318" }}>클러스터 탐색</div>
          {/* 브레드크럼 */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {level !== "cluster" && <button onClick={() => (pod ? setPod(null) : setNode(null))} style={{ display: "flex", alignItems: "center", gap: 5, background: "#fff", border: "1px solid rgba(17,19,24,0.1)", borderRadius: 9, padding: "6px 11px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#565E6B", marginRight: 4 }}><ArrowLeft size={14} />뒤로</button>}
            {crumbs.map((c, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {i > 0 && <ChevronRight size={14} style={{ color: "#C3CAD5" }} />}
                <button onClick={c.on} style={{ background: i === crumbs.length - 1 ? "#EEF2FF" : "transparent", border: "none", borderRadius: 8, padding: "5px 10px", cursor: i === crumbs.length - 1 ? "default" : "pointer", fontSize: 12.5, fontWeight: 600, fontFamily: "ui-monospace,monospace", color: i === crumbs.length - 1 ? BLUE : "#8A93A0" }}>{c.label}</button>
              </span>
            ))}
          </div>
        </div>

        <div style={{ background: "#fff", border: "1px solid rgba(17,19,24,0.06)", borderRadius: 22, padding: 20, boxShadow: "0 24px 60px -28px rgba(17,19,24,0.22), 0 2px 6px rgba(17,19,24,0.04)", minHeight: 480, overflow: "hidden" }}>
          <AnimatePresence mode="wait">
            <motion.div key={level} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }} transition={{ duration: 0.32, ease: EASE }}>
              {level === "cluster" && <ClusterLevel pods={pods} onNode={(n) => setNode(n)} />}
              {level === "node" && node && <NodeLevel node={node} pods={pods} onPod={(p) => setPod(p)} />}
              {level === "pod" && pod && <PodLevel pod={pod} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <style>{`
        .dr { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Pretendard", "Apple SD Gothic Neo", "Helvetica Neue", sans-serif; }
        .dr .hx { transition: filter .12s; }
        .dr .hx:hover { filter: brightness(1.1); }
        .dr .ncard .chev { transition: transform .16s, color .16s; }
        .dr .ncard:hover .chev { transform: translateX(3px); color: ${BLUE}; }
        .dr .ncard { transition: box-shadow .16s, border-color .16s; }
        .dr .ncard:hover { box-shadow: 0 12px 28px -12px rgba(47,91,255,0.28); border-color: rgba(47,91,255,0.3); }
        .pulse { animation: pl 1.1s ease-in-out infinite; }
        @keyframes pl { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.7); } }
        @media (prefers-reduced-motion: reduce) { *,*::before,*::after { animation:none !important; } }
      `}</style>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <div style={{ minHeight: "100vh", background: "#EDF0F5" }}><App /></div>,
);

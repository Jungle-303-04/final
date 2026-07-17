// ⚠ 데모 · 클러스터 → 노드 → 파드 (물리 계층). 노드=박스, 파드=육각형, 서비스=색. 라이트모드. 더미.
import ReactDOM from "react-dom/client";
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Boxes } from "lucide-react";
import "./styles/tokens.css";
import "./styles/foundation.css";

const EASE = [0.32, 0.72, 0, 1] as const;

const NODES = [
  { id: "ip-10-0-1-24", zone: "apne2-a" },
  { id: "ip-10-0-2-91", zone: "apne2-b" },
  { id: "ip-10-0-3-15", zone: "apne2-c" },
];
// 서비스(워크로드) → 색
const SERVICES = [
  { id: "shop-api", color: "#2F5BFF" }, { id: "shop-web", color: "#22C55E" },
  { id: "checkout", color: "#F59E0B" }, { id: "payments", color: "#EF4444" },
  { id: "search", color: "#06B6D4" }, { id: "auth", color: "#A855F7" },
  { id: "redis", color: "#EC4899" }, { id: "gateway", color: "#3B82F6" },
  { id: "notifier", color: "#F97316" }, { id: "worker", color: "#14B8A6" },
];
const SCOLOR = Object.fromEntries(SERVICES.map((s) => [s.id, s.color])) as Record<string, string>;

type Pod = { id: string; name: string; node: string; svc: string; cpu: number; mem: number; pending: boolean };
function makeRng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function genPods(): Pod[] {
  const r = makeRng(7); const pods: Pod[] = []; let k = 0;
  NODES.forEach((node) => {
    const count = 16 + Math.floor(r() * 8);
    for (let i = 0; i < count; i++) {
      const svc = SERVICES[Math.floor(r() * SERVICES.length)].id;
      const pending = r() < 0.04;
      let cpu = Math.floor(r() * 60) + 12, mem = Math.floor(r() * 58) + 18;
      if (r() < 0.08) { cpu = 88 + Math.floor(r() * 11); mem = 90 + Math.floor(r() * 9); }
      pods.push({ id: `p${k++}`, name: `${svc}-${1000 + Math.floor(r() * 9000)}`, node: node.id, svc, cpu: pending ? 0 : cpu, mem: pending ? 0 : mem, pending });
    }
  });
  return pods;
}

const util = (p: Pod) => Math.max(p.cpu, p.mem);
const isCrit = (p: Pod) => !p.pending && util(p) >= 88;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function heat(u: number): string {
  const stops: [number, number[]][] = [[0, [96, 165, 250]], [30, [59, 130, 246]], [55, [45, 212, 191]], [72, [250, 204, 21]], [86, [249, 115, 22]], [100, [239, 68, 68]]];
  u = Math.max(0, Math.min(100, u));
  for (let i = 0; i < stops.length - 1; i++) {
    const [u0, c0] = stops[i], [u1, c1] = stops[i + 1];
    if (u <= u1) { const t = (u - u0) / (u1 - u0 || 1); return `rgb(${Math.round(lerp(c0[0], c1[0], t))},${Math.round(lerp(c0[1], c1[1], t))},${Math.round(lerp(c0[2], c1[2], t))})`; }
  }
  return "rgb(239,68,68)";
}
const fillFor = (p: Pod, mode: "svc" | "load") => (p.pending ? "#C7CBD3" : mode === "svc" ? SCOLOR[p.svc] : heat(util(p)));

// 육각
function hexSpiral(n: number) {
  const out = [{ q: 0, r: 0 }]; const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  for (let k = 1; out.length < n; k++) { let q = dirs[4][0] * k, r = dirs[4][1] * k; for (let side = 0; side < 6 && out.length < n; side++) for (let step = 0; step < k && out.length < n; step++) { out.push({ q, r }); q += dirs[side][0]; r += dirs[side][1]; } }
  return out.slice(0, n);
}
const hexPx = (q: number, r: number, s: number) => s * Math.sqrt(3) * (q + r / 2);
const hexPy = (q: number, r: number, s: number) => s * 1.5 * r;
const hexPts = (cx: number, cy: number, rad: number) => Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 180) * (60 * i - 30); return `${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`; }).join(" ");

type Tip = { pod: Pod; x: number; y: number } | null;
type HoverFn = (p: Pod, x: number, y: number) => void;

function Gauge({ label, v }: { label: string; v: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 10.5, color: "#8A93A0", width: 26 }}>{label}</span>
      <div style={{ flex: 1, height: 6, borderRadius: 999, background: "rgba(17,19,24,0.06)", overflow: "hidden" }}><div style={{ width: `${v}%`, height: "100%", borderRadius: 999, background: heat(v) }} /></div>
      <span style={{ fontSize: 10.5, fontWeight: 600, color: "#565E6B", width: 30, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{v}%</span>
    </div>
  );
}

function NodeCard({ node, pods, mode, hoverSvc, onHover, onLeave }: { node: typeof NODES[number]; pods: Pod[]; mode: "svc" | "load"; hoverSvc: string | null; onHover: HoverFn; onLeave: () => void }) {
  const np = pods.filter((p) => p.node === node.id);
  const active = np.filter((p) => !p.pending);
  const avgCpu = Math.round(active.reduce((s, p) => s + p.cpu, 0) / (active.length || 1));
  const avgMem = Math.round(active.reduce((s, p) => s + p.mem, 0) / (active.length || 1));
  const hot = np.filter(isCrit).length;
  const s = 16;
  const cells = hexSpiral(np.length);
  const pos = cells.map((c) => ({ x: hexPx(c.q, c.r, s), y: hexPy(c.q, c.r, s) }));
  const xs = pos.map((p) => p.x), ys = pos.map((p) => p.y), pad = s + 2;
  const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad, minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
  const w = maxX - minX, h = maxY - minY;
  return (
    <div style={{ flex: 1, background: "#fff", border: "1px solid rgba(17,19,24,0.08)", borderRadius: 16, padding: 14, boxShadow: "0 1px 3px rgba(17,19,24,0.05)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ width: 20, height: 20, borderRadius: 6, background: "rgba(47,91,255,0.1)", display: "grid", placeItems: "center" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2F5BFF" strokeWidth="2.4"><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /></svg>
        </span>
        <span style={{ fontFamily: "ui-monospace,monospace", fontSize: 12, fontWeight: 600, color: "#111318" }}>{node.id}</span>
        <span style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 600, color: "#565E6B" }}>{np.length} <span style={{ color: "#9AA1AC", fontWeight: 500 }}>pods</span></span>
      </div>
      <div style={{ fontSize: 10.5, color: "#9AA1AC", marginTop: 3, marginLeft: 27 }}>{node.zone}{hot > 0 && <span style={{ color: "#EF4444", fontWeight: 600 }}> · 핫스팟 {hot}</span>}</div>
      <div style={{ display: "grid", gap: 6, marginTop: 11 }}><Gauge label="CPU" v={avgCpu} /><Gauge label="MEM" v={avgMem} /></div>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", marginTop: 12, minHeight: 190 }}>
        <svg width={w} height={h} viewBox={`${minX} ${minY} ${w} ${h}`} style={{ maxWidth: "100%", height: "auto" }}>
          {np.map((p, i) => {
            const pts = hexPts(pos[i].x, pos[i].y, s - 1);
            const dim = hoverSvc ? p.svc !== hoverSvc : false;
            return (
              <motion.g key={p.id} initial={{ opacity: 0 }} animate={{ opacity: dim ? 0.16 : 1 }} transition={{ delay: i * 0.008, duration: 0.28, ease: EASE }}
                onMouseMove={(e) => onHover(p, e.clientX, e.clientY)} onMouseLeave={onLeave} style={{ cursor: "pointer" }}>
                <polygon points={pts} fill={fillFor(p, mode)} stroke="#fff" strokeWidth={1.6} strokeLinejoin="round" />
                <polygon points={pts} fill="url(#cgloss)" strokeLinejoin="round" style={{ pointerEvents: "none" }} />
                {isCrit(p) && <polygon points={pts} fill="none" stroke="#EF4444" strokeWidth={2.4} strokeLinejoin="round" style={{ pointerEvents: "none" }} />}
              </motion.g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function App() {
  const pods = useMemo(() => genPods(), []);
  const [mode, setMode] = useState<"svc" | "load">("svc");
  const [tip, setTip] = useState<Tip>(null);
  const hoverSvc = tip && mode === "svc" ? tip.pod.svc : null;
  const onHover: HoverFn = (pod, x, y) => setTip({ pod, x, y });
  const onLeave = () => setTip(null);
  const crit = pods.filter(isCrit).length, pending = pods.filter((p) => p.pending).length;
  const usedSvcs = SERVICES.filter((s) => pods.some((p) => p.svc === s.id));

  return (
    <div className="cv" style={{ minHeight: "100vh", padding: "48px 24px", display: "flex", justifyContent: "center" }}>
      <svg width="0" height="0" style={{ position: "absolute" }}><defs><linearGradient id="cgloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0.42" /><stop offset="0.5" stopColor="#fff" stopOpacity="0.08" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient></defs></svg>
      <div style={{ width: 980, maxWidth: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", color: "#111318" }}>클러스터 토폴로지</div>
            <div style={{ fontSize: 12.5, color: "#8A93A0", marginTop: 3 }}>클러스터 → 노드 → 파드</div>
          </div>
          {/* 색 기준 토글 */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: "#8A93A0" }}>색 기준</span>
            <div style={{ display: "flex", gap: 4, background: "#F2F3F7", borderRadius: 11, padding: 4 }}>
              {([["svc", "서비스"], ["load", "부하"]] as const).map(([id, label]) => {
                const on = mode === id;
                return (
                  <button key={id} onClick={() => setMode(id)} style={{ position: "relative", padding: "7px 15px", borderRadius: 8, border: "none", background: "transparent", cursor: "pointer" }}>
                    {on && <motion.span layoutId="csw" style={{ position: "absolute", inset: 0, borderRadius: 8, background: "#2F5BFF", boxShadow: "0 4px 12px -3px rgba(47,91,255,0.5)" }} transition={{ type: "spring", visualDuration: 0.26, bounce: 0.18 }} />}
                    <span style={{ position: "relative", fontSize: 12.5, fontWeight: 600, color: on ? "#fff" : "#565E6B" }}>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 클러스터 프레임 (바깥 상자) */}
        <div style={{ background: "#fff", border: "1px solid rgba(17,19,24,0.06)", borderRadius: 22, padding: 20, boxShadow: "0 24px 60px -28px rgba(17,19,24,0.22), 0 2px 6px rgba(17,19,24,0.04)" }}>
          <div style={{ position: "relative", background: "rgba(47,91,255,0.03)", border: "1px dashed rgba(47,91,255,0.25)", borderRadius: 18, padding: 16, paddingTop: 34 }}>
            <div style={{ position: "absolute", top: 10, left: 14, display: "flex", alignItems: "center", gap: 7 }}>
              <Boxes size={14} style={{ color: "#2F5BFF" }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#2F5BFF" }}>cluster-2</span>
              <span style={{ fontSize: 11.5, color: "#9AA1AC" }}>· {NODES.length} 노드 · {pods.length} 파드 · 임계 {crit} · 대기 {pending}</span>
            </div>
            {/* 노드 박스들 */}
            <div style={{ display: "flex", gap: 12 }}>
              {NODES.map((node) => <NodeCard key={node.id} node={node} pods={pods} mode={mode} hoverSvc={hoverSvc} onHover={onHover} onLeave={onLeave} />)}
            </div>
          </div>

          {/* 레전드 */}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(17,19,24,0.06)", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", fontSize: 11.5, color: "#8A93A0" }}>
            {mode === "svc"
              ? usedSvcs.map((s) => <span key={s.id} style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: s.color }} />{s.id}</span>)
              : <span style={{ display: "flex", alignItems: "center", gap: 8 }}>낮음<span style={{ width: 180, height: 8, borderRadius: 999, background: "linear-gradient(90deg,#60A5FA,#3B82F6,#2DD4BF,#FACC15,#F97316,#EF4444)" }} />높음 · 사용률</span>}
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: mode === "svc" ? "#94A3B8" : "#EF4444", boxShadow: "0 0 0 2px rgba(239,68,68,0.35)" }} />임계 파드(테두리)</span>
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: "#B4BBC6", marginTop: 10, textAlign: "center" }}>클러스터(바깥) ⊃ 노드(카드) ⊃ 파드(육각형) · 파드에 마우스를 올리면 같은 서비스 파드가 노드 전체에서 강조됩니다</div>
      </div>

      {tip && (
        <div style={{ position: "fixed", left: tip.x + 14, top: tip.y + 14, zIndex: 50, pointerEvents: "none", background: "#fff", border: "1px solid rgba(17,19,24,0.08)", borderRadius: 12, padding: "10px 12px", boxShadow: "0 16px 40px -12px rgba(17,19,24,0.28)", minWidth: 176 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: fillFor(tip.pod, mode), flexShrink: 0 }} /><span style={{ fontFamily: "ui-monospace,monospace", fontSize: 12.5, fontWeight: 600, color: "#111318" }}>{tip.pod.name}</span></div>
          <div style={{ marginTop: 5, fontSize: 11.5, color: "#8A93A0" }}>노드 {tip.pod.node} · 서비스 {tip.pod.svc}</div>
          {tip.pod.pending ? <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: "#6B7280" }}>Pending</div>
            : <div style={{ marginTop: 8, display: "flex", gap: 16, fontSize: 12 }}><span style={{ color: "#8A93A0" }}>CPU <b style={{ color: "#111318" }}>{tip.pod.cpu}%</b></span><span style={{ color: "#8A93A0" }}>MEM <b style={{ color: "#111318" }}>{tip.pod.mem}%</b></span></div>}
        </div>
      )}

      <style>{`
        .cv { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Pretendard", "Apple SD Gothic Neo", "Helvetica Neue", sans-serif; }
        .cv g[style*="cursor: pointer"]:hover { filter: brightness(1.08); }
        @media (prefers-reduced-motion: reduce) { *,*::before,*::after { animation-duration:.01ms !important; transition-duration:.01ms !important; } }
      `}</style>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <div style={{ minHeight: "100vh", background: "#EDF0F5" }}><App /></div>,
);

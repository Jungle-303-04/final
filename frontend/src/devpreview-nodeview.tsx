// ⚠ 데모 · 노드→파드 시각화. 노드 벌집 / 히트맵 / 트리맵. 라이트모드 + 그라데이션. motion. 전부 더미.
import ReactDOM from "react-dom/client";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Hexagon, LayoutGrid, LayoutTemplate } from "lucide-react";
import "./styles/tokens.css";
import "./styles/foundation.css";

const EASE = [0.32, 0.72, 0, 1] as const;

// ── 더미 데이터 ─────────────────────────────
const NODES = [
  { id: "ip-10-0-1-24", zone: "apne2-a" },
  { id: "ip-10-0-2-91", zone: "apne2-b" },
  { id: "ip-10-0-3-15", zone: "apne2-c" },
];
const APPS = ["shop-api", "shop-web", "checkout", "payments", "search", "redis", "worker", "cron", "gateway", "notifier", "auth", "media"];
type Pod = { id: string; name: string; node: string; app: string; cpu: number; mem: number; pending: boolean };

function makeRng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function genPods(): Pod[] {
  const r = makeRng(42); const pods: Pod[] = []; let k = 0;
  NODES.forEach((node) => {
    const count = 18 + Math.floor(r() * 9);
    for (let i = 0; i < count; i++) {
      const app = APPS[Math.floor(r() * APPS.length)];
      const pending = r() < 0.04;
      let cpu = Math.floor(r() * 62) + 10;
      let mem = Math.floor(r() * 60) + 18;
      if (r() < 0.08) { cpu = 88 + Math.floor(r() * 11); mem = 90 + Math.floor(r() * 9); } // 핫스팟
      pods.push({ id: `p${k++}`, name: `${app}-${(1000 + Math.floor(r() * 9000))}`, node: node.id, app, cpu: pending ? 0 : cpu, mem: pending ? 0 : mem, pending });
    }
  });
  return pods;
}

const util = (p: Pod) => Math.max(p.cpu, p.mem);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
// 사용률 → 열지도 그라데이션 (라이트모드 대비 조정)
function heat(u: number): string {
  const stops: [number, number[]][] = [[0, [96, 165, 250]], [30, [59, 130, 246]], [55, [45, 212, 191]], [72, [250, 204, 21]], [86, [249, 115, 22]], [100, [239, 68, 68]]];
  u = Math.max(0, Math.min(100, u));
  for (let i = 0; i < stops.length - 1; i++) {
    const [u0, c0] = stops[i], [u1, c1] = stops[i + 1];
    if (u <= u1) { const t = (u - u0) / (u1 - u0 || 1); return `rgb(${Math.round(lerp(c0[0], c1[0], t))},${Math.round(lerp(c0[1], c1[1], t))},${Math.round(lerp(c0[2], c1[2], t))})`; }
  }
  return "rgb(239,68,68)";
}
const colorFor = (p: Pod) => (p.pending ? "#C7CBD3" : heat(util(p)));
const isCrit = (p: Pod) => !p.pending && util(p) >= 88;

// ── 육각 좌표 ─────────────────────────────
function hexSpiral(n: number): { q: number; r: number }[] {
  const out = [{ q: 0, r: 0 }];
  const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  for (let k = 1; out.length < n; k++) {
    let q = dirs[4][0] * k, r = dirs[4][1] * k;
    for (let side = 0; side < 6 && out.length < n; side++) {
      for (let step = 0; step < k && out.length < n; step++) {
        out.push({ q, r }); q += dirs[side][0]; r += dirs[side][1];
      }
    }
  }
  return out.slice(0, n);
}
const hexPx = (q: number, r: number, s: number) => s * Math.sqrt(3) * (q + r / 2);
const hexPy = (q: number, r: number, s: number) => s * 1.5 * r;
const hexPts = (cx: number, cy: number, rad: number) =>
  Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 180) * (60 * i - 30); return `${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`; }).join(" ");

// ── 스쿼리파이드 트리맵 ─────────────────────────────
type Cell = { x: number; y: number; w: number; h: number; pod: Pod };
function treemap(items: { value: number; pod: Pod }[], X: number, Y: number, W: number, H: number): Cell[] {
  const out: Cell[] = [];
  const nodes = items.map((i) => ({ pod: i.pod, area: 0, value: i.value }));
  const total = nodes.reduce((s, n) => s + n.value, 0) || 1;
  const scale = (W * H) / total;
  nodes.forEach((n) => { n.area = n.value * scale; });
  let x = X, y = Y, w = W, h = H, i = 0;
  const worst = (row: typeof nodes, len: number) => {
    const s = row.reduce((a, n) => a + n.area, 0); let mn = Infinity, mx = 0;
    row.forEach((n) => { mn = Math.min(mn, n.area); mx = Math.max(mx, n.area); });
    return Math.max((len * len * mx) / (s * s), (s * s) / (len * len * mn));
  };
  while (i < nodes.length) {
    const vertical = w >= h; const len = Math.min(w, h);
    const row = [nodes[i]]; let j = i + 1;
    while (j < nodes.length) {
      if (worst([...row, nodes[j]], len) <= worst(row, len)) { row.push(nodes[j]); j++; } else break;
    }
    const s = row.reduce((a, n) => a + n.area, 0); const thick = s / len; let pos = vertical ? y : x;
    row.forEach((n) => {
      const cl = n.area / thick;
      if (vertical) out.push({ x, y: pos, w: thick, h: cl, pod: n.pod });
      else out.push({ x: pos, y, w: cl, h: thick, pod: n.pod });
      pos += cl;
    });
    if (vertical) { x += thick; w -= thick; } else { y += thick; h -= thick; }
    i = j;
  }
  return out;
}

// 공유 그라데이션(광택) 정의
const Defs = () => (
  <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
    <defs>
      <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity="0.42" />
        <stop offset="0.5" stopColor="#fff" stopOpacity="0.08" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
    </defs>
  </svg>
);

// ── 툴팁 ─────────────────────────────
type Tip = { pod: Pod; x: number; y: number } | null;
function Tooltip({ tip }: { tip: Tip }) {
  if (!tip) return null;
  const p = tip.pod;
  return (
    <div style={{ position: "fixed", left: tip.x + 14, top: tip.y + 14, zIndex: 50, pointerEvents: "none", background: "#fff", border: "1px solid rgba(17,19,24,0.08)", borderRadius: 12, padding: "10px 12px", boxShadow: "0 16px 40px -12px rgba(17,19,24,0.28)", minWidth: 174 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 9, height: 9, borderRadius: 3, background: colorFor(p), flexShrink: 0 }} />
        <span style={{ fontFamily: "ui-monospace,monospace", fontSize: 12.5, fontWeight: 600, color: "#111318" }}>{p.name}</span>
      </div>
      <div style={{ marginTop: 5, fontSize: 11.5, color: "#8A93A0" }}>{p.node} · {p.app}</div>
      {p.pending
        ? <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: "#6B7280" }}>Pending</div>
        : <div style={{ marginTop: 8, display: "flex", gap: 16, fontSize: 12 }}>
            <span style={{ color: "#8A93A0" }}>CPU <b style={{ color: "#111318" }}>{p.cpu}%</b></span>
            <span style={{ color: "#8A93A0" }}>MEM <b style={{ color: "#111318" }}>{p.mem}%</b></span>
          </div>}
    </div>
  );
}

function Gauge({ label, v }: { label: string; v: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 10.5, color: "#8A93A0", width: 26 }}>{label}</span>
      <div style={{ flex: 1, height: 6, borderRadius: 999, background: "rgba(17,19,24,0.06)", overflow: "hidden" }}>
        <div style={{ width: `${v}%`, height: "100%", borderRadius: 999, background: heat(v) }} />
      </div>
      <span style={{ fontSize: 10.5, fontWeight: 600, color: "#565E6B", width: 30, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{v}%</span>
    </div>
  );
}

type ViewProps = { pods: Pod[]; onHover: (p: Pod, x: number, y: number) => void; onLeave: () => void };
const VB_W = 900, VB_H = 420;

function Hex({ p, cx, cy, rad, onHover, onLeave, i }: { p: Pod; cx: number; cy: number; rad: number; onHover: ViewProps["onHover"]; onLeave: ViewProps["onLeave"]; i: number }) {
  const pts = hexPts(cx, cy, rad);
  return (
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.008, duration: 0.3, ease: EASE }}
      onMouseMove={(e) => onHover(p, e.clientX, e.clientY)} onMouseLeave={onLeave} style={{ cursor: "pointer" }}>
      <polygon points={pts} fill={colorFor(p)} stroke="#fff" strokeWidth={1.6} strokeLinejoin="round" />
      <polygon points={pts} fill="url(#gloss)" strokeLinejoin="round" style={{ pointerEvents: "none" }} />
      {isCrit(p) && <polygon points={pts} fill="none" stroke="#EF4444" strokeWidth={2.4} strokeLinejoin="round" style={{ pointerEvents: "none" }} />}
    </motion.g>
  );
}

// ── 1. 노드 벌집 ─────────────────────────────
function NodeHive({ node, pods, onHover, onLeave }: { node: typeof NODES[number] } & ViewProps) {
  const np = pods.filter((p) => p.node === node.id);
  const active = np.filter((p) => !p.pending);
  const avgCpu = Math.round(active.reduce((s, p) => s + p.cpu, 0) / (active.length || 1));
  const avgMem = Math.round(active.reduce((s, p) => s + p.mem, 0) / (active.length || 1));
  const hot = np.filter(isCrit).length;
  const s = 17;
  const cells = hexSpiral(np.length);
  const pos = cells.map((c) => ({ x: hexPx(c.q, c.r, s), y: hexPy(c.q, c.r, s) }));
  const xs = pos.map((p) => p.x), ys = pos.map((p) => p.y);
  const pad = s + 2;
  const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad, minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
  const w = maxX - minX, h = maxY - minY;
  return (
    <div style={{ background: "#F6F8FC", border: "1px solid rgba(17,19,24,0.05)", borderRadius: 18, padding: 16, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
        <span style={{ fontFamily: "ui-monospace,monospace", fontSize: 12.5, fontWeight: 600, color: "#111318" }}>{node.id}</span>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: "#565E6B" }}>{np.length} <span style={{ color: "#9AA1AC", fontWeight: 500 }}>pods</span></span>
      </div>
      <div style={{ fontSize: 11, color: "#9AA1AC", marginTop: 2 }}>{node.zone}{hot > 0 && <span style={{ color: "#EF4444", fontWeight: 600 }}> · 핫스팟 {hot}</span>}</div>
      <div style={{ display: "grid", gap: 7, marginTop: 12 }}>
        <Gauge label="CPU" v={avgCpu} /><Gauge label="MEM" v={avgMem} />
      </div>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", marginTop: 14, minHeight: 200 }}>
        <svg width={w} height={h} viewBox={`${minX} ${minY} ${w} ${h}`} style={{ maxWidth: "100%", height: "auto" }}>
          {np.map((p, i) => <Hex key={p.id} p={p} cx={pos[i].x} cy={pos[i].y} rad={s - 1} i={i} onHover={onHover} onLeave={onLeave} />)}
        </svg>
      </div>
    </div>
  );
}
function NodeHiveView({ pods, onHover, onLeave }: ViewProps) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
      {NODES.map((node) => <NodeHive key={node.id} node={node} pods={pods} onHover={onHover} onLeave={onLeave} />)}
    </div>
  );
}

// ── 2. 히트맵(전체 필드) ─────────────────────────────
function HexFieldView({ pods, onHover, onLeave }: ViewProps) {
  const n = pods.length;
  const cols = Math.round(Math.sqrt(n * 2.2));
  const r = 24, hexW = 1.5 * r, hexH = Math.sqrt(3) * r;
  const rows = Math.ceil(n / cols);
  const blockW = cols * hexW + r * 0.5, blockH = rows * hexH + hexH / 2;
  const ox = (VB_W - blockW) / 2 + r, oy = (VB_H - blockH) / 2 + hexH / 2;
  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" style={{ display: "block" }}>
      {pods.map((p, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const cx = ox + col * hexW, cy = oy + row * hexH + (col % 2) * (hexH / 2);
        return <Hex key={p.id} p={p} cx={cx} cy={cy} rad={r - 1} i={i} onHover={onHover} onLeave={onLeave} />;
      })}
    </svg>
  );
}

// ── 3. 트리맵 ─────────────────────────────
function TreemapView({ pods, onHover, onLeave }: ViewProps) {
  const gap = 16, headerH = 26;
  const colW = (VB_W - (NODES.length - 1) * gap) / NODES.length;
  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" style={{ display: "block" }}>
      {NODES.map((node, ni) => {
        const np = pods.filter((p) => p.node === node.id);
        const items = np.map((p) => ({ value: Math.max(util(p), 8), pod: p })).sort((a, b) => b.value - a.value);
        const x0 = ni * (colW + gap);
        const cells = treemap(items, x0, headerH, colW, VB_H - headerH);
        return (
          <g key={node.id}>
            <text x={x0 + 1} y={15} fill="#565E6B" fontSize="11.5" fontWeight="600" fontFamily="ui-monospace,monospace">{node.id}</text>
            {cells.map((c, i) => {
              const p = c.pod; const big = c.w > 52 && c.h > 30;
              return (
                <motion.g key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.008, duration: 0.3 }}
                  onMouseMove={(e) => onHover(p, e.clientX, e.clientY)} onMouseLeave={onLeave} style={{ cursor: "pointer" }}>
                  <rect x={c.x + 1.5} y={c.y + 1.5} width={Math.max(0, c.w - 3)} height={Math.max(0, c.h - 3)} rx={5}
                    fill={colorFor(p)} stroke={isCrit(p) ? "#EF4444" : "#fff"} strokeWidth={isCrit(p) ? 2 : 1.5} />
                  <rect x={c.x + 1.5} y={c.y + 1.5} width={Math.max(0, c.w - 3)} height={Math.max(0, c.h - 3)} rx={5} fill="url(#gloss)" style={{ pointerEvents: "none" }} />
                  {big && <text x={c.x + 8} y={c.y + 18} fill="rgba(255,255,255,0.95)" fontSize="10.5" fontWeight="600" style={{ pointerEvents: "none" }}>{p.app}</text>}
                </motion.g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

function Legend() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: "#8A93A0" }}>낮음</span>
        <div style={{ width: 180, height: 8, borderRadius: 999, background: "linear-gradient(90deg,#60A5FA,#3B82F6,#2DD4BF,#FACC15,#F97316,#EF4444)" }} />
        <span style={{ fontSize: 11, color: "#8A93A0" }}>높음 · 사용률</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 11, height: 11, borderRadius: 3, background: "#C7CBD3" }} />
        <span style={{ fontSize: 11, color: "#8A93A0" }}>Pending</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 11, height: 11, borderRadius: 3, background: "#EF4444", boxShadow: "0 0 0 2px rgba(239,68,68,0.35)" }} />
        <span style={{ fontSize: 11, color: "#8A93A0" }}>임계(핫스팟)</span>
      </div>
    </div>
  );
}

const VIEWS = [
  { id: "hive", label: "노드 벌집", icon: Hexagon, desc: "노드 = 벌집, 파드 = 육각형. 노드가 클수록 벌집도 커진다" },
  { id: "field", label: "히트맵", icon: LayoutGrid, desc: "클러스터 전체를 한 판으로 — 뜨거운 파드가 튄다" },
  { id: "tree", label: "트리맵", icon: LayoutTemplate, desc: "노드→파드 계층 + 크기로 리소스 비중까지" },
] as const;

function App() {
  const pods = useMemo(() => genPods(), []);
  const [view, setView] = useState<"hive" | "field" | "tree">("hive");
  const [tip, setTip] = useState<Tip>(null);
  const onHover = (pod: Pod, x: number, y: number) => setTip({ pod, x, y });
  const onLeave = () => setTip(null);

  const crit = pods.filter(isCrit).length;
  const warn = pods.filter((p) => !p.pending && util(p) >= 72 && util(p) < 88).length;
  const pending = pods.filter((p) => p.pending).length;
  const healthy = pods.length - crit - warn - pending;
  const active = VIEWS.find((v) => v.id === view)!;
  const props = { pods, onHover, onLeave };

  return (
    <div className="nv" style={{ minHeight: "100vh", padding: "48px 24px", display: "flex", justifyContent: "center" }}>
      <Defs />
      <div style={{ width: 968, maxWidth: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", color: "#111318" }}>클러스터 토폴로지</div>
            <div style={{ fontSize: 12.5, color: "#8A93A0", marginTop: 3 }}>cluster-2 · {NODES.length} 노드 · {pods.length} 파드</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {[{ k: "정상", v: healthy, c: "#22C55E" }, { k: "경고", v: warn, c: "#F59E0B" }, { k: "임계", v: crit, c: "#EF4444" }, { k: "대기", v: pending, c: "#9AA1AC" }].map((s) => (
              <div key={s.k} style={{ display: "flex", alignItems: "center", gap: 7, background: "#fff", border: "1px solid rgba(17,19,24,0.06)", borderRadius: 12, padding: "8px 12px", boxShadow: "0 1px 2px rgba(17,19,24,0.04)" }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: s.c }} />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "#111318", fontVariantNumeric: "tabular-nums" }}>{s.v}</span>
                <span style={{ fontSize: 11.5, color: "#8A93A0" }}>{s.k}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: "#fff", border: "1px solid rgba(17,19,24,0.06)", borderRadius: 22, padding: 22, boxShadow: "0 24px 60px -28px rgba(17,19,24,0.22), 0 2px 6px rgba(17,19,24,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#111318" }}>노드 → 파드</div>
              <AnimatePresence mode="wait">
                <motion.div key={view} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}
                  style={{ fontSize: 12, color: "#8A93A0", marginTop: 3 }}>{active.desc}</motion.div>
              </AnimatePresence>
            </div>
            <div style={{ display: "flex", gap: 4, background: "#F2F3F7", borderRadius: 12, padding: 4 }}>
              {VIEWS.map((v) => {
                const on = view === v.id; const Icon = v.icon;
                return (
                  <button key={v.id} onClick={() => setView(v.id)} style={{ position: "relative", display: "flex", alignItems: "center", gap: 7, padding: "8px 13px", borderRadius: 9, border: "none", background: "transparent", cursor: "pointer" }}>
                    {on && <motion.span layoutId="vsw" style={{ position: "absolute", inset: 0, borderRadius: 9, background: "#2F5BFF", boxShadow: "0 4px 12px -3px rgba(47,91,255,0.55)" }} transition={{ type: "spring", visualDuration: 0.28, bounce: 0.18 }} />}
                    <Icon size={15} style={{ position: "relative", color: on ? "#fff" : "#8A93A0" }} />
                    <span style={{ position: "relative", fontSize: 12.5, fontWeight: 600, color: on ? "#fff" : "#565E6B" }}>{v.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ marginTop: 18, minHeight: VB_H, display: "flex", alignItems: "center" }}>
            <div style={{ width: "100%" }}>
              <AnimatePresence mode="wait">
                <motion.div key={view} initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.99 }} transition={{ duration: 0.25, ease: EASE }}>
                  {view === "hive" && <NodeHiveView {...props} />}
                  {view === "field" && <HexFieldView {...props} />}
                  {view === "tree" && <TreemapView {...props} />}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(17,19,24,0.06)" }}><Legend /></div>
        </div>
      </div>

      <Tooltip tip={tip} />

      <style>{`
        .nv { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Pretendard", "Apple SD Gothic Neo", "Helvetica Neue", sans-serif; }
        .nv g[style*="cursor: pointer"] { transition: filter .12s; }
        .nv g[style*="cursor: pointer"]:hover { filter: brightness(1.08) saturate(1.05); }
        @media (prefers-reduced-motion: reduce) { *,*::before,*::after { animation-duration:.01ms !important; transition-duration:.01ms !important; } }
      `}</style>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <div style={{ minHeight: "100vh", background: "#EDF0F5" }}><App /></div>,
);

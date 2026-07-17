// ⚠ 데모 · 통합 서비스 토폴로지 — 트래픽 + 설정 의존성 + 소유(파드)를 한 화면에. 라이트모드. motion. 더미.
import ReactDOM from "react-dom/client";
import { useState } from "react";
import { motion } from "motion/react";
import "./styles/tokens.css";
import "./styles/foundation.css";

const BLUE = "#2F5BFF";
const PURPLE = "#A855F7";
const ST = { ok: "#22C55E", warn: "#F59E0B", crit: "#EF4444" } as const;

type Status = "ok" | "warn" | "crit";
type Svc = { id: string; name: string; kind: string; layer: number; replicas: number; status: Status };
const SERVICES: Svc[] = [
  { id: "ingress", name: "ingress-nginx", kind: "Ingress", layer: 0, replicas: 2, status: "ok" },
  { id: "gateway", name: "gateway", kind: "Deployment", layer: 1, replicas: 3, status: "ok" },
  { id: "shop-web", name: "shop-web", kind: "Deployment", layer: 2, replicas: 4, status: "ok" },
  { id: "shop-api", name: "shop-api", kind: "Deployment", layer: 2, replicas: 6, status: "warn" },
  { id: "checkout", name: "checkout", kind: "Deployment", layer: 3, replicas: 3, status: "warn" },
  { id: "search", name: "search", kind: "Deployment", layer: 3, replicas: 2, status: "ok" },
  { id: "auth", name: "auth", kind: "Deployment", layer: 3, replicas: 2, status: "ok" },
  { id: "payments", name: "payments", kind: "Deployment", layer: 4, replicas: 3, status: "crit" },
  { id: "notifier", name: "notifier", kind: "Deployment", layer: 4, replicas: 2, status: "ok" },
  { id: "redis", name: "redis", kind: "StatefulSet", layer: 5, replicas: 1, status: "ok" },
  { id: "postgres", name: "postgres", kind: "StatefulSet", layer: 5, replicas: 1, status: "ok" },
];
const SVC = (id: string) => SERVICES.find((s) => s.id === id)!;
type TEdge = { from: string; to: string; rps: number };
const EDGES: TEdge[] = [
  { from: "ingress", to: "gateway", rps: 1200 },
  { from: "gateway", to: "shop-web", rps: 700 }, { from: "gateway", to: "shop-api", rps: 950 },
  { from: "shop-web", to: "shop-api", rps: 420 },
  { from: "shop-api", to: "checkout", rps: 380 }, { from: "shop-api", to: "search", rps: 260 },
  { from: "shop-api", to: "auth", rps: 300 }, { from: "shop-api", to: "redis", rps: 640 },
  { from: "checkout", to: "payments", rps: 210 }, { from: "checkout", to: "postgres", rps: 190 }, { from: "checkout", to: "notifier", rps: 90 },
  { from: "payments", to: "postgres", rps: 180 }, { from: "auth", to: "postgres", rps: 150 }, { from: "search", to: "redis", rps: 240 },
];
type Cfg = { id: string; kind: "ConfigMap" | "Secret" };
const CONFIGS: Cfg[] = [
  { id: "app-config", kind: "ConfigMap" }, { id: "redis-config", kind: "ConfigMap" },
  { id: "feature-flags", kind: "ConfigMap" }, { id: "db-credentials", kind: "Secret" }, { id: "tls-cert", kind: "Secret" },
];
const CFG_EDGES: Record<string, string[]> = {
  "app-config": ["shop-web", "shop-api", "checkout", "search"],
  "redis-config": ["shop-api", "search", "redis"],
  "feature-flags": ["shop-web", "checkout"],
  "db-credentials": ["checkout", "payments", "auth", "postgres"],
  "tls-cert": ["ingress", "gateway"],
};
const CFG = (id: string) => CONFIGS.find((c) => c.id === id)!;

// ── 좌표 ─────────────────────────────
const VW = 940, VH = 540;
const NW = 120, NH = 56;
const LX = [16, 168, 320, 472, 624, 792];
const NY: Record<string, number> = {
  ingress: 176, gateway: 176,
  "shop-web": 92, "shop-api": 250,
  checkout: 54, search: 176, auth: 298,
  payments: 104, notifier: 250, redis: 104, postgres: 250,
};
const spos = (id: string) => ({ x: LX[SVC(id).layer], y: NY[id] });
const CW = 126, CH = 40, CY = 470;
const cx0 = (i: number) => 24 + i * 182;
const cpos = (id: string) => ({ x: cx0(CONFIGS.findIndex((c) => c.id === id)), y: CY });

const curve = (x1: number, y1: number, x2: number, y2: number, horiz = true) => {
  if (horiz) { const mx = (x1 + x2) / 2; return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`; }
  const my = (y1 + y2) / 2; return `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
};

// 선택 문맥: 서비스면 트래픽 이웃+쓰는 설정, 설정이면 소비 서비스
function context(sel: string | null) {
  if (!sel) return null;
  if (CFG_EDGES[sel]) return { svcs: new Set(CFG_EDGES[sel]), cfgs: new Set([sel]), center: sel };
  const svcs = new Set<string>([sel]);
  EDGES.forEach((e) => { if (e.from === sel) svcs.add(e.to); if (e.to === sel) svcs.add(e.from); });
  const cfgs = new Set<string>();
  Object.entries(CFG_EDGES).forEach(([c, list]) => { if (list.includes(sel)) cfgs.add(c); });
  return { svcs, cfgs, center: sel };
}

function App() {
  const [sel, setSel] = useState<string | null>(null);
  const [mode, setMode] = useState<"all" | "traffic" | "config">("all");
  const ctx = context(sel);
  const svcLit = (id: string) => !ctx || ctx.svcs.has(id) || ctx.center === id;
  const cfgLit = (id: string) => !ctx || ctx.cfgs.has(id);

  return (
    <div className="tp" style={{ minHeight: "100vh", padding: "44px 24px", display: "flex", justifyContent: "center" }}>
      <div style={{ width: 992, maxWidth: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", color: "#111318" }}>서비스 토폴로지</div>
            <div style={{ fontSize: 12.5, color: "#8A93A0", marginTop: 3 }}>cluster-2 · shop · 트래픽 · 설정 의존성 · 소유를 한 화면에</div>
          </div>
          {/* 관계 강조 필터 */}
          <div style={{ display: "flex", gap: 4, background: "#F2F3F7", borderRadius: 12, padding: 4 }}>
            {([["all", "전체"], ["traffic", "트래픽"], ["config", "설정"]] as const).map(([id, label]) => {
              const on = mode === id;
              return (
                <button key={id} onClick={() => setMode(id)} style={{ position: "relative", padding: "8px 14px", borderRadius: 9, border: "none", background: "transparent", cursor: "pointer" }}>
                  {on && <motion.span layoutId="msw" style={{ position: "absolute", inset: 0, borderRadius: 9, background: BLUE, boxShadow: "0 4px 12px -3px rgba(47,91,255,0.5)" }} transition={{ type: "spring", visualDuration: 0.26, bounce: 0.18 }} />}
                  <span style={{ position: "relative", fontSize: 12.5, fontWeight: 600, color: on ? "#fff" : "#565E6B" }}>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ background: "#fff", border: "1px solid rgba(17,19,24,0.06)", borderRadius: 22, padding: 18, boxShadow: "0 24px 60px -28px rgba(17,19,24,0.22), 0 2px 6px rgba(17,19,24,0.04)" }}>
          <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" style={{ display: "block" }} onMouseLeave={() => setSel(null)}>
            <defs>
              <linearGradient id="tgloss" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#fff" stopOpacity="0.5" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* 데이터 계층 배경 밴드 */}
            <rect x={LX[5] - 12} y={20} width={NW + 24} height={VH - 120} rx={16} fill="rgba(17,19,24,0.02)" />
            <text x={LX[5] + NW / 2} y={14} textAnchor="middle" fontSize="10.5" fill="#B4BBC6" fontWeight="600">DATA</text>

            {/* 설정 의존성 엣지 (평소 옅게, 호버 강조) */}
            {mode !== "traffic" && Object.entries(CFG_EDGES).map(([c, list]) => list.map((sid) => {
              const a = cpos(c), b = spos(sid);
              const lit = !ctx ? false : (ctx.center === c || ctx.center === sid);
              const base = mode === "config" ? 0.22 : 0.09;
              return <path key={`${c}-${sid}`} d={curve(a.x + CW / 2, a.y, b.x + NW / 2, b.y + NH, false)} fill="none"
                stroke={CFG(c).kind === "Secret" ? PURPLE : BLUE} strokeWidth={lit ? 2 : 1.2} strokeDasharray="3 4"
                style={{ opacity: ctx ? (lit ? 0.85 : 0.04) : base, transition: "opacity .18s" }} />;
            }))}

            {/* 트래픽 엣지 (항상 애니메이션) */}
            {mode !== "config" && EDGES.map((e) => {
              const a = spos(e.from), b = spos(e.to);
              const on = !ctx || ctx.center === e.from || ctx.center === e.to;
              const w = Math.max(1.4, Math.min(7, e.rps / 170));
              const col = SVC(e.to).status === "crit" ? ST.crit : SVC(e.to).status === "warn" ? ST.warn : "#AEB9D4";
              const dur = Math.max(0.6, 1.7 - e.rps / 1000);
              const d = curve(a.x + NW, a.y + NH / 2, b.x, b.y + NH / 2);
              return (
                <g key={`${e.from}-${e.to}`} style={{ opacity: on ? 1 : 0.1, transition: "opacity .18s" }}>
                  <path d={d} fill="none" stroke={col} strokeWidth={w} strokeOpacity={0.45} strokeLinecap="round" />
                  <path d={d} fill="none" stroke={col} strokeWidth={w} strokeLinecap="round" strokeDasharray="2 9" className="flow" style={{ animationDuration: `${dur}s` }} />
                </g>
              );
            })}

            {/* 설정 노드 */}
            {CONFIGS.map((c) => {
              const p = cpos(c.id); const secret = c.kind === "Secret"; const lit = cfgLit(c.id); const on = ctx?.center === c.id;
              return (
                <g key={c.id} onMouseEnter={() => setSel(c.id)} style={{ cursor: "pointer", opacity: lit ? 1 : 0.28, transition: "opacity .18s" }}>
                  <rect x={p.x} y={p.y} width={CW} height={CH} rx={11} fill={on ? (secret ? "#F7F0FE" : "#EEF2FF") : "#fff"}
                    stroke={on ? (secret ? PURPLE : BLUE) : "rgba(17,19,24,0.1)"} strokeWidth={on ? 2 : 1} style={{ filter: "drop-shadow(0 2px 5px rgba(17,19,24,0.07))" }} />
                  <rect x={p.x + 10} y={p.y + 12} width={16} height={16} rx={4} fill={secret ? PURPLE : BLUE} opacity={0.16} />
                  <text x={p.x + 34} y={p.y + 18} fontSize="11" fontWeight="600" fill="#111318" fontFamily="ui-monospace,monospace">{c.id}</text>
                  <text x={p.x + 34} y={p.y + 31} fontSize="9.5" fill={secret ? PURPLE : "#9AA1AC"}>{c.kind}{on ? ` · ${CFG_EDGES[c.id].length}개 영향` : ""}</text>
                </g>
              );
            })}

            {/* 서비스 노드 (소유 파드 점 포함) */}
            {SERVICES.map((s) => {
              const p = spos(s.id); const lit = svcLit(s.id); const on = ctx?.center === s.id;
              const rps = EDGES.filter((e) => e.from === s.id).reduce((t, e) => t + e.rps, 0);
              return (
                <g key={s.id} onMouseEnter={() => setSel(s.id)} style={{ cursor: "pointer", opacity: lit ? 1 : 0.26, transition: "opacity .18s" }}>
                  <rect x={p.x} y={p.y} width={NW} height={NH} rx={13} fill="#fff" stroke={on ? BLUE : "rgba(17,19,24,0.1)"} strokeWidth={on ? 2 : 1}
                    style={{ filter: on ? "drop-shadow(0 6px 16px rgba(47,91,255,0.22))" : "drop-shadow(0 2px 5px rgba(17,19,24,0.08))" }} />
                  <rect x={p.x} y={p.y} width={NW} height={NH} rx={13} fill="url(#tgloss)" style={{ pointerEvents: "none" }} />
                  <circle cx={p.x + 14} cy={p.y + 17} r={4.5} fill={ST[s.status]} />
                  <text x={p.x + 25} y={p.y + 21} fontSize="11.5" fontWeight="600" fill="#111318" fontFamily="ui-monospace,monospace">{s.name}</text>
                  <text x={p.x + 12} y={p.y + 35} fontSize="9" fill="#9AA1AC">{on ? `${rps} req/s ↗` : s.kind}</text>
                  {/* 소유 파드 점 */}
                  <g>
                    {Array.from({ length: Math.min(s.replicas, 8) }).map((_, k) => (
                      <circle key={k} cx={p.x + 14 + k * 11} cy={p.y + 46} r={3.2} fill={s.status === "crit" && k === 0 ? ST.crit : "rgba(47,91,255,0.55)"} />
                    ))}
                  </g>
                </g>
              );
            })}
          </svg>

          {/* 레전드 */}
          <div style={{ marginTop: 6, paddingTop: 14, borderTop: "1px solid rgba(17,19,24,0.06)", display: "flex", gap: 18, flexWrap: "wrap", fontSize: 11.5, color: "#8A93A0", alignItems: "center" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><svg width="26" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke="#AEB9D4" strokeWidth="3" strokeLinecap="round" /></svg>트래픽(두께=req/s)</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><svg width="26" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke={BLUE} strokeWidth="1.6" strokeDasharray="3 3" /></svg>ConfigMap</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><svg width="26" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke={PURPLE} strokeWidth="1.6" strokeDasharray="3 3" /></svg>Secret</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: ST.ok }} />정상<span style={{ width: 8, height: 8, borderRadius: 999, background: ST.warn, marginLeft: 6 }} />경고<span style={{ width: 8, height: 8, borderRadius: 999, background: ST.crit, marginLeft: 6 }} />임계</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: 999, background: "rgba(47,91,255,0.55)" }} />파드(소유)</span>
            <span style={{ marginLeft: "auto", color: "#B4BBC6" }}>노드에 마우스를 올리면 그 서비스의 모든 관계가 강조됩니다</span>
          </div>
        </div>
      </div>

      <style>{`
        .tp { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Pretendard", "Apple SD Gothic Neo", "Helvetica Neue", sans-serif; }
        .tp .flow { animation: flowmove linear infinite; }
        @keyframes flowmove { to { stroke-dashoffset: -22; } }
        @media (prefers-reduced-motion: reduce) { .tp .flow { animation: none !important; } }
      `}</style>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <div style={{ minHeight: "100vh", background: "#EDF0F5" }}><App /></div>,
);

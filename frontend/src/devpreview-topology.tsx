// ⚠ 데모 · 서비스 토폴로지 v4 — 호출(트래픽) 전용 그래프.
// 분업: 맵 = 물리 · 토폴로지 = 호출 · 렌즈 = 의존 · 상세 = 전체 스펙. 설정 의존성은 통합 맵 렌즈가 주인.
// 드래그 재배치 + 방향 화살표 + 선 호버 = 수치 + 선 클릭 = 오류 상세 고정.
import ReactDOM from "react-dom/client";
import { useRef, useState } from "react";
import { motion } from "motion/react";
import { readDevpreviewTopologyFocus } from "./features/filters/devpreviewDeepLinks";
import "./styles/tokens.css";
import "./styles/foundation.css";

const UI = { bg: "#FAFAFC", card: "#FFFFFF", line: "#E9EAEE", ink: "#111318", ink2: "#5F6570", ink3: "#9AA0AA" } as const;
const BLUE = "#0A84FF";
const ST = { ok: "#2EBD5B", warn: "#FF9F0A", crit: "#FF453A" } as const;
const MONO = "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace";

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

// ── 좌표 (초기 배치 — 드래그로 자유 이동) ─────────────────────────────
const VW = 940, VH = 420;
const NW = 124, NH = 58;
const LX = [14, 168, 322, 476, 630, 792];
const NY: Record<string, number> = {
  ingress: 176, gateway: 176,
  "shop-web": 92, "shop-api": 250,
  checkout: 54, search: 176, auth: 298,
  payments: 104, notifier: 250, redis: 104, postgres: 250,
};
const INIT: Record<string, { x: number; y: number }> = (() => {
  const m: Record<string, { x: number; y: number }> = {};
  SERVICES.forEach((s) => { m[s.id] = { x: LX[s.layer], y: NY[s.id] }; });
  return m;
})();

const curve = (x1: number, y1: number, x2: number, y2: number, horiz = true) => {
  if (horiz) { const mx = (x1 + x2) / 2; return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`; }
  const my = (y1 + y2) / 2; return `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
};

// 상대 위치에 따라 좌/우/상/하 접점 자동 선택
function anchors(a: { x: number; y: number }, b: { x: number; y: number }) {
  if (b.x >= a.x + NW + 10) return { x1: a.x + NW, y1: a.y + NH / 2, x2: b.x, y2: b.y + NH / 2, dirX: 1, horiz: true };
  if (b.x + NW <= a.x - 10) return { x1: a.x, y1: a.y + NH / 2, x2: b.x + NW, y2: b.y + NH / 2, dirX: -1, horiz: true };
  if (b.y >= a.y + NH) return { x1: a.x + NW / 2, y1: a.y + NH, x2: b.x + NW / 2, y2: b.y, dirY: 1, horiz: false };
  return { x1: a.x + NW / 2, y1: a.y, x2: b.x + NW / 2, y2: b.y + NH, dirY: -1, horiz: false };
}
const arrowAt = (an: ReturnType<typeof anchors>) => {
  const { x2, y2 } = an;
  if (an.horiz) return an.dirX === 1 ? `M ${x2 - 7} ${y2 - 3.6} L ${x2 - 0.5} ${y2} L ${x2 - 7} ${y2 + 3.6} Z` : `M ${x2 + 7} ${y2 - 3.6} L ${x2 + 0.5} ${y2} L ${x2 + 7} ${y2 + 3.6} Z`;
  return an.dirY === 1 ? `M ${x2 - 3.6} ${y2 - 7} L ${x2} ${y2 - 0.5} L ${x2 + 3.6} ${y2 - 7} Z` : `M ${x2 - 3.6} ${y2 + 7} L ${x2} ${y2 + 0.5} L ${x2 + 3.6} ${y2 + 7} Z`;
};

// 선택 문맥: 트래픽 이웃
function context(sel: string | null) {
  if (!sel) return null;
  const svcs = new Set<string>([sel]);
  EDGES.forEach((e) => { if (e.from === sel) svcs.add(e.to); if (e.to === sel) svcs.add(e.from); });
  return { svcs, center: sel };
}

// 엣지 메트릭 (더미)
const edgeMetrics = (e: TEdge) => {
  const st = SVC(e.to).status;
  const err = st === "crit" ? 8.4 : st === "warn" ? 1.2 : 0.08;
  const p99 = Math.round(38 + e.rps / 9 + (st === "crit" ? 220 : st === "warn" ? 60 : 0));
  return { err, p99, st };
};
function App() {
  const [pos, setPos] = useState(INIT);
  const [sel, setSel] = useState<string | null>(() => readDevpreviewTopologyFocus(SERVICES.map((s) => s.id)));
  const [etip, setEtip] = useState<{ x: number; y: number; e: TEdge } | null>(null);
  const [pinEdge, setPinEdge] = useState<TEdge | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const ctx = context(sel);
  const ekey = (e: TEdge) => `${e.from}-${e.to}`;

  const svcLit = (id: string) => (pinEdge ? pinEdge.from === id || pinEdge.to === id : !ctx || ctx.svcs.has(id));
  const P = (id: string) => pos[id];

  const toVB = (cx: number, cy: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((cx - r.left) * VW) / r.width, y: ((cy - r.top) * VH) / r.height };
  };
  const startDrag = (id: string) => (e: React.PointerEvent) => {
    const v = toVB(e.clientX, e.clientY);
    dragRef.current = { id, dx: v.x - P(id).x, dy: v.y - P(id).y };
    setDragId(id); setEtip(null);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current; if (!d) return;
    const v = toVB(e.clientX, e.clientY);
    const x = Math.max(4, Math.min(VW - NW - 4, v.x - d.dx));
    const y = Math.max(4, Math.min(VH - NH - 4, v.y - d.dy));
    setPos((p) => ({ ...p, [d.id]: { x, y } }));
  };
  const endDrag = () => { dragRef.current = null; setDragId(null); };

  return (
    <div className="tp" style={{ minHeight: "100vh", padding: "44px 24px", display: "flex", justifyContent: "center" }}>
      <div style={{ width: 992, maxWidth: "100%" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 18 }}>
          <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.03em", color: UI.ink }}>서비스 토폴로지</div>
          <div style={{ fontSize: 12, color: UI.ink3 }}>prod-eks · shop · 호출 흐름 — 드래그 재배치 · 더블클릭 = 맵에서 보기</div>
          {/* 뷰 내비게이션 — 맵/토폴로지/연결/AI 공통 문법 */}
          <nav style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: "auto" }}>
            {([["맵", "devpreview-opsia.html", false], ["토폴로지", "devpreview-topology.html", true], ["연결", "devpreview-connect.html", false], ["AI", "devpreview-ai.html", false]] as const).map(([l, href, act]) => (
              <a key={l} href={`/${href}`} style={{ fontSize: 11.5, fontWeight: act ? 700 : 500, color: act ? UI.ink : UI.ink3, textDecoration: "none", padding: "3px 9px", borderRadius: 7, background: act ? "rgba(17,19,24,0.05)" : "transparent" }}>{l}</a>
            ))}
          </nav>
        </div>

        <div style={{ background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 16, padding: 18, position: "relative" }}>
          {/* 고정된 엣지 상세 — 오류를 머물러서 볼 수 있는 패널 */}
          {pinEdge && (() => {
            const m = edgeMetrics(pinEdge);
            const bad = m.st !== "ok";
            const seed = (pinEdge.from + pinEdge.to).split("").reduce((s, ch) => s + ch.charCodeAt(0), 0);
            const errs = bad ? [
              { t: `14:0${seed % 10}:${10 + (seed * 7) % 49}`, msg: m.st === "crit" ? "POST /pay → 502 · upstream timeout" : "GET /v1 → 429 · rate limited" },
              { t: `14:0${(seed + 1) % 10}:${10 + (seed * 7 + 13) % 49}`, msg: m.st === "crit" ? "POST /pay → 503 · connection refused" : "GET /v1 → 504 · slow upstream" },
              { t: `14:0${(seed + 2) % 10}:${10 + (seed * 7 + 26) % 49}`, msg: m.st === "crit" ? "GET /health → 500 · OOMKilled 직후" : "GET /v1 → 200 · 1.9s (p99 초과)" },
            ] : [];
            return (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", bounce: 0.12, visualDuration: 0.3 }}
                style={{ position: "absolute", top: 14, right: 14, width: 268, background: "rgba(255,255,255,0.97)", backdropFilter: "blur(10px)", border: `1px solid ${bad ? "#F0B8B4" : UI.line}`, borderRadius: 13, padding: 14, boxShadow: "0 16px 40px -18px rgba(17,19,24,0.25)", zIndex: 5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, fontFamily: MONO, color: UI.ink, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {pinEdge.from} <span style={{ color: UI.ink3, fontWeight: 500 }}>→</span> {pinEdge.to}
                  </span>
                  <button onClick={() => setPinEdge(null)} style={{ width: 20, height: 20, borderRadius: 999, border: "none", background: "rgba(17,19,24,0.06)", color: UI.ink3, cursor: "pointer", fontSize: 10, lineHeight: 1 }}>✕</button>
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 9, fontSize: 10.5, fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ color: UI.ink2 }}>rps <b style={{ color: UI.ink }}>{pinEdge.rps.toLocaleString()}</b></span>
                  <span style={{ color: UI.ink2 }}>p99 <b style={{ color: m.p99 > 200 ? ST.crit : UI.ink }}>{m.p99}ms</b></span>
                  <span style={{ color: UI.ink2 }}>5xx <b style={{ color: m.err >= 1 ? ST.crit : UI.ink }}>{m.err}%</b></span>
                </div>
                {bad ? (
                  <div style={{ marginTop: 11, borderTop: `1px solid ${UI.line}`, paddingTop: 10 }}>
                    <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.06em", color: ST[m.st], marginBottom: 7 }}>최근 오류</div>
                    {errs.map((er, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "3px 0", fontSize: 10, fontFamily: MONO }}>
                        <span style={{ color: UI.ink3, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{er.t}</span>
                        <span style={{ color: UI.ink2, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{er.msg}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ marginTop: 11, display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: ST.ok, fontWeight: 600 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: ST.ok }} />오류 없음 · 정상 흐름
                  </div>
                )}
              </motion.div>
            );
          })()}

          <svg ref={svgRef} viewBox={`0 0 ${VW} ${VH}`} width="100%" style={{ display: "block", touchAction: "none" }}
            onPointerMove={onMove} onPointerUp={endDrag} onPointerLeave={() => { if (!dragRef.current) { setSel(null); setEtip(null); } }}>
            <defs>
              {SERVICES.map((s) => {
                const p = P(s.id);
                return <clipPath key={s.id} id={`clip-${s.id}`}><rect x={p.x} y={p.y} width={NW} height={NH} rx={12} /></clipPath>;
              })}
            </defs>

            {/* 데이터 계층 배경 밴드 */}
            <rect x={LX[5] - 12} y={20} width={NW + 24} height={VH - 60} rx={14} fill="rgba(17,19,24,0.025)" />
            <text x={LX[5] + NW / 2} y={14} textAnchor="middle" fontSize="9.5" fill={UI.ink3} fontWeight="600" letterSpacing="0.08em">DATA</text>

            {/* 트래픽 엣지 — 두께 균일 + 방향 화살표 + 호버 수치 + 클릭 고정 */}
            {EDGES.map((e) => {
              const a = P(e.from), b = P(e.to);
              const an = anchors(a, b);
              const pinned = pinEdge && ekey(pinEdge) === ekey(e);
              const hovered = (etip && ekey(etip.e) === ekey(e)) || pinned;
              const on = pinEdge ? pinned : hovered || (!etip && (!ctx || ctx.center === e.from || ctx.center === e.to));
              const toSt = SVC(e.to).status;
              const col = toSt === "crit" ? ST.crit : toSt === "warn" ? ST.warn : hovered ? BLUE : "#C3CAD6";
              const dur = Math.max(0.55, 1.9 - e.rps / 800);
              const d = curve(an.x1, an.y1, an.x2, an.y2, an.horiz);
              return (
                <g key={ekey(e)} style={{ opacity: on ? 1 : 0.08, transition: "opacity .18s" }}>
                  <path d={d} fill="none" stroke={col} strokeWidth={3} strokeOpacity={hovered ? 0.5 : 0.35} strokeLinecap="round" />
                  <path d={d} fill="none" stroke={col} strokeWidth={3} strokeLinecap="round" strokeDasharray="3 11" className="flow" style={{ animationDuration: `${dur}s` }} />
                  <path d={arrowAt(an)} fill={col} opacity={hovered ? 0.9 : 0.55} />
                  <path d={d} fill="none" stroke="transparent" strokeWidth={16} strokeLinecap="round" style={{ cursor: "pointer" }}
                    onClick={() => { setPinEdge(pinned ? null : e); setEtip(null); }}
                    onMouseEnter={(ev) => { if (dragRef.current) return; setEtip({ x: ev.clientX, y: ev.clientY, e }); setSel(null); }}
                    onMouseMove={(ev) => { if (dragRef.current) return; setEtip({ x: ev.clientX, y: ev.clientY, e }); }}
                    onMouseLeave={() => setEtip(null)} />
                </g>
              );
            })}

            {/* 서비스 노드 — 드래그 가능 카드 */}
            {SERVICES.map((s) => {
              const p = P(s.id); const lit = svcLit(s.id); const on = ctx?.center === s.id;
              const rps = EDGES.filter((e) => e.from === s.id).reduce((t, e) => t + e.rps, 0);
              return (
                <g key={s.id} onMouseEnter={() => { if (!dragRef.current) setSel(s.id); }} onPointerDown={startDrag(s.id)}
                  onDoubleClick={() => { window.location.href = `/devpreview-opsia.html?svc=${s.id}`; }}
                  style={{ cursor: dragId === s.id ? "grabbing" : "grab", opacity: lit ? 1 : 0.22, transition: "opacity .18s" }}>
                  <rect x={p.x} y={p.y} width={NW} height={NH} rx={12} fill={UI.card} stroke={dragId === s.id || on ? BLUE : UI.line} strokeWidth={on || dragId === s.id ? 1.5 : 1}
                    style={{ filter: dragId === s.id ? "drop-shadow(0 16px 30px rgba(10,132,255,0.22))" : on ? "drop-shadow(0 8px 18px rgba(10,132,255,0.16))" : "drop-shadow(0 1px 2px rgba(17,19,24,0.05))" }} />
                  <g clipPath={`url(#clip-${s.id})`} style={{ pointerEvents: "none" }}>
                    <circle cx={p.x + 15} cy={p.y + 17} r={4} fill={ST[s.status]} />
                    <text x={p.x + 26} y={p.y + 20.5} fontSize="11" fontWeight="600" fill={UI.ink} fontFamily={MONO} letterSpacing="-0.01em">{s.name}</text>
                    <text x={p.x + 13} y={p.y + 34} fontSize="8.5" fill={UI.ink3}>{on ? `${rps.toLocaleString()} req/s` : `${s.kind} · ×${s.replicas}`}</text>
                    {Array.from({ length: Math.min(s.replicas, 8) }).map((_, k) => (
                      <circle key={k} cx={p.x + 16 + k * 11} cy={p.y + 46} r={3} fill={s.status === "crit" && k === 0 ? ST.crit : "rgba(10,132,255,0.4)"} />
                    ))}
                  </g>
                </g>
              );
            })}
          </svg>

          {/* 레전드 */}
          <div style={{ marginTop: 6, paddingTop: 14, borderTop: `1px solid ${UI.line}`, display: "flex", gap: 18, flexWrap: "wrap", fontSize: 11, color: UI.ink2, alignItems: "center" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><svg width="30" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="#C3CAD6" strokeWidth="3" strokeLinecap="round" /><path d="M22 0.5 L29 4 L22 7.5 Z" fill="#C3CAD6" /></svg>호출(속도 = req/s)</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: ST.ok }} />정상<span style={{ width: 8, height: 8, borderRadius: 999, background: ST.warn, marginLeft: 6 }} />경고<span style={{ width: 8, height: 8, borderRadius: 999, background: ST.crit, marginLeft: 6 }} />임계</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: 999, background: "rgba(10,132,255,0.4)" }} />파드(소유)</span>
            <span style={{ marginLeft: "auto", color: UI.ink3 }}>드래그 = 재배치 · 노드 호버 = 관계 · 선 호버 = 수치 · 선 클릭 = 오류 상세</span>
          </div>
        </div>
      </div>

      {/* 엣지 툴팁 */}
      {etip && (() => {
        const m = edgeMetrics(etip.e);
        const bad = m.st !== "ok";
        return (
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.12 }}
            style={{
              position: "fixed", left: Math.min(etip.x + 14, window.innerWidth - 210), top: Math.min(etip.y + 16, window.innerHeight - 110), zIndex: 60, pointerEvents: "none",
              background: "rgba(255,255,255,0.96)", backdropFilter: "blur(10px)", border: `1px solid ${bad ? "#F0B8B4" : UI.line}`, borderRadius: 11, padding: "10px 12px",
              boxShadow: "0 10px 30px -12px rgba(17,19,24,0.22)", minWidth: 176,
            }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 700, fontFamily: MONO, color: UI.ink }}>
              {etip.e.from}<span style={{ color: UI.ink3, fontWeight: 500 }}>→</span>{etip.e.to}
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 7, fontSize: 10.5, fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>
              <span style={{ color: UI.ink2 }}>rps <b style={{ color: UI.ink }}>{etip.e.rps.toLocaleString()}</b></span>
              <span style={{ color: UI.ink2 }}>p99 <b style={{ color: m.p99 > 200 ? ST.crit : UI.ink }}>{m.p99}ms</b></span>
              <span style={{ color: UI.ink2 }}>5xx <b style={{ color: m.err >= 1 ? ST.crit : UI.ink }}>{m.err}%</b></span>
            </div>
            {bad && (
              <div style={{ marginTop: 7, fontSize: 10, fontWeight: 600, color: ST[m.st], display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: ST[m.st] }} />
                {m.st === "crit" ? `${etip.e.to} 임계 — 오류율 상승` : `${etip.e.to} 경고 — 지연 증가`}
              </div>
            )}
          </motion.div>
        );
      })()}

      <style>{`
        .tp { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Pretendard", "Apple SD Gothic Neo", "Helvetica Neue", sans-serif; -webkit-font-smoothing: antialiased; }
        .tp .flow { animation: flowmove linear infinite; }
        @keyframes flowmove { to { stroke-dashoffset: -28; } }
        .tp svg text { user-select: none; }
        @media (prefers-reduced-motion: reduce) { .tp .flow { animation: none !important; } }
      `}</style>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <div style={{ minHeight: "100vh", background: "#FAFAFC" }}><App /></div>,
);

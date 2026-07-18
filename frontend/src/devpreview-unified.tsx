// ⚠ 데모 · 통합 리소스 셸 — 하나의 화면 · 선택 유지 · 관점 전환.
// 관점 = 물리(어디 깔렸나) · 관계(누굴 부르나). 선택(포커스 서비스)은 관점 전환에도 유지.
// 구성(ConfigMap/Secret)은 관점이 아니라 양쪽 공통 렌즈(오버레이). v4 디자인 언어.
import ReactDOM from "react-dom/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Box, Server, Layers3, FileCog, Network, Braces, Globe, ShoppingCart, CreditCard, Search, KeyRound, X, ChevronRight } from "lucide-react";
import "./styles/tokens.css";
import "./styles/foundation.css";

const RedisIcon = ({ size = 14, style }: { size?: number; style?: React.CSSProperties }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={style} aria-hidden>
    <path d="M10.5 2.661l.54.997-1.797.644 2.409.218.748 1.246.467-1.121 2.077-.208-1.61-.613.426-1.017-1.578.519zm6.905 2.077L13.76 6.182l3.292 1.298.353-.146 3.293-1.298zm-10.51.312a2.97 1.153 0 0 0-2.97 1.152 2.97 1.153 0 0 0 2.97 1.153 2.97 1.153 0 0 0 2.97-1.153 2.97 1.153 0 0 0-2.97-1.152zM24 6.805s-8.983 4.278-10.395 4.953c-1.226.561-1.901.561-3.261.094C8.318 11.022 0 7.241 0 7.241v1.038c0 .24.332.499.966.8 1.277.613 8.34 3.677 9.45 4.206 1.112.53 1.9.54 3.313-.197 1.412-.738 8.049-3.905 9.326-4.57.654-.342.945-.602.945-.84zm-10.042.602L8.39 8.26l3.884 1.61zM24 10.637s-8.983 4.279-10.395 4.954c-1.226.56-1.901.56-3.261.093C8.318 14.854 0 11.074 0 11.074v1.038c0 .238.332.498.966.8 1.277.612 8.34 3.676 9.45 4.205 1.112.53 1.9.54 3.313-.197 1.412-.737 8.049-3.905 9.326-4.57.654-.332.945-.602.945-.84zm0 3.842l-10.395 4.954c-1.226.56-1.901.56-3.261.094C8.318 18.696 0 14.916 0 14.916v1.038c0 .239.332.499.966.8 1.277.613 8.34 3.676 9.45 4.206 1.112.53 1.9.54 3.313-.198 1.412-.737 8.049-3.904 9.326-4.569.654-.343.945-.613.945-.841z"/>
  </svg>
);

const UI = { bg: "#FAFAFC", card: "#FFFFFF", line: "#E9EAEE", line2: "#F1F2F5", ink: "#111318", ink2: "#5F6570", ink3: "#9AA0AA" } as const;
const BLUE = "#0A84FF";
const HP = { ok: "#2EBD5B", warn: "#FF9F0A", crit: "#FF453A", ghost: "#F3F4F6" } as const;
const MONO = "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace";
const SOFT = { type: "spring", bounce: 0.12, visualDuration: 0.32 } as const;
const PAGE = { type: "spring", bounce: 0.08, visualDuration: 0.5 } as const;

// ── 도메인 ─────────────────────────────
type SvcIconT = React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
type Svc = { id: string; ns: string; kind: string; color: string; icon: SvcIconT; repo: string; rev: string; sync: "Synced" | "OutOfSync"; layer: number; status: "ok" | "warn" | "crit"; replicas: number };
const SERVICES: Svc[] = [
  { id: "ingress", ns: "shop", kind: "Ingress", color: "#5F6570", icon: Network, repo: "opsia/platform", rev: "7d21e08", sync: "Synced", layer: 0, status: "ok", replicas: 2 },
  { id: "gateway", ns: "platform", kind: "Deployment", color: "#4C6EF5", icon: Network, repo: "opsia/platform", rev: "7d21e08", sync: "Synced", layer: 1, status: "ok", replicas: 3 },
  { id: "shop-web", ns: "shop", kind: "Deployment", color: "#28A745", icon: Globe, repo: "Jungle-303-04/final", rev: "a3f92c1", sync: "OutOfSync", layer: 2, status: "ok", replicas: 4 },
  { id: "shop-api", ns: "shop", kind: "Deployment", color: "#0A84FF", icon: Braces, repo: "Jungle-303-04/final", rev: "a3f92c1", sync: "OutOfSync", layer: 2, status: "warn", replicas: 6 },
  { id: "checkout", ns: "shop", kind: "Deployment", color: "#E8930C", icon: ShoppingCart, repo: "Jungle-303-04/final", rev: "a3f92c1", sync: "OutOfSync", layer: 3, status: "warn", replicas: 3 },
  { id: "search", ns: "shop", kind: "Deployment", color: "#0FA3B1", icon: Search, repo: "Jungle-303-04/final", rev: "a3f92c1", sync: "OutOfSync", layer: 3, status: "ok", replicas: 2 },
  { id: "auth", ns: "platform", kind: "Deployment", color: "#8250DF", icon: KeyRound, repo: "opsia/platform", rev: "7d21e08", sync: "Synced", layer: 3, status: "ok", replicas: 2 },
  { id: "payments", ns: "shop", kind: "Deployment", color: "#E5484D", icon: CreditCard, repo: "Jungle-303-04/final", rev: "a3f92c1", sync: "OutOfSync", layer: 4, status: "crit", replicas: 3 },
  { id: "redis", ns: "platform", kind: "StatefulSet", color: "#DC382C", icon: RedisIcon, repo: "opsia/platform", rev: "7d21e08", sync: "Synced", layer: 5, status: "ok", replicas: 1 },
];
const SVC = Object.fromEntries(SERVICES.map((s) => [s.id, s])) as Record<string, Svc>;
const EDGES = [
  { from: "ingress", to: "gateway", rps: 1200 }, { from: "gateway", to: "shop-web", rps: 700 }, { from: "gateway", to: "shop-api", rps: 950 },
  { from: "shop-web", to: "shop-api", rps: 420 }, { from: "shop-api", to: "checkout", rps: 380 }, { from: "shop-api", to: "search", rps: 260 },
  { from: "shop-api", to: "auth", rps: 300 }, { from: "shop-api", to: "redis", rps: 640 }, { from: "checkout", to: "payments", rps: 210 }, { from: "search", to: "redis", rps: 240 },
];
const SVC_CFG: Record<string, string[]> = {
  "shop-api": ["app-config", "redis-config"], "shop-web": ["app-config", "feature-flags"], checkout: ["app-config", "db-credentials"],
  payments: ["db-credentials"], search: ["app-config", "redis-config"], auth: ["db-credentials"], redis: ["redis-config"], gateway: ["tls-cert"],
};
const CFG_KIND: Record<string, "ConfigMap" | "Secret"> = { "app-config": "ConfigMap", "redis-config": "ConfigMap", "feature-flags": "ConfigMap", "db-credentials": "Secret", "tls-cert": "Secret" };

const NODES = [
  { id: "ip-10-0-1-24", zone: "apne2-a", cap: 10 },
  { id: "ip-10-0-2-91", zone: "apne2-b", cap: 10 },
  { id: "ip-10-0-3-15", zone: "apne2-c", cap: 14 },
];
type Pod = { id: string; svc: string; node: string; cpu: number; crit: boolean; pending: boolean };
function makeRng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const PODS: Pod[] = (() => {
  const r = makeRng(23); const out: Pod[] = []; let k = 0;
  NODES.forEach((n) => {
    const count = n.cap - Math.floor(r() * 2);
    for (let i = 0; i < count; i++) {
      const svc = SERVICES[Math.floor(r() * SERVICES.length)].id;
      const pending = r() < 0.03; const hot = SVC[svc].status === "crit" && r() < 0.5;
      out.push({ id: `p${k++}`, svc, node: n.id, cpu: pending ? 0 : hot ? 92 + Math.floor(r() * 7) : 14 + Math.floor(r() * 52), crit: hot, pending });
    }
  });
  return out;
})();
const podColor = (p: Pod) => (p.pending ? HP.ghost : p.crit ? HP.crit : p.cpu >= 75 ? HP.warn : HP.ok);

// ── 파드 타일 (강도 램프) ─────────────────────────────
function PodTile({ p, live, dim, lit, onClick }: { p: Pod; live: number; dim: boolean; lit: boolean; onClick: () => void }) {
  const cpuV = p.pending ? 0 : Math.max(3, Math.min(99, p.cpu + live));
  const c = podColor(p);
  const mix = p.pending ? 0 : p.crit ? 100 : Math.round(14 + (cpuV / 100) * 66);
  return (
    <motion.button layout onClick={(e) => { e.stopPropagation(); onClick(); }} initial={false}
      animate={{ opacity: dim ? 0.16 : 1 }} whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.95 }} transition={SOFT}
      title={`${p.svc} · ${p.pending ? "Pending" : `CPU ${cpuV}%`}`} className={p.crit ? "utile crit" : "utile"}
      style={{ aspectRatio: "1", border: "none", borderRadius: 6.5, cursor: "pointer", background: p.pending ? "#F0F1F4" : `color-mix(in srgb, ${c} ${mix}%, #fff)`, transition: "background 1.2s ease", boxShadow: lit ? `0 0 0 1.5px #fff, 0 0 0 3px ${BLUE}` : `inset 0 0 0 1px color-mix(in srgb, ${c} ${Math.min(mix + 12, 100)}%, rgba(17,19,24,0.06))` }} />
  );
}

// ── 물리 관점: 노드 카드 그리드 ─────────────────────────────
function PhysicalView({ focus, tick, onPickSvc }: { focus: string | null; tick: number; onPickSvc: (id: string) => void }) {
  const live = (p: Pod) => (p.pending || p.crit ? 0 : Math.round(Math.sin((tick + p.cpu + p.id.length * 3) * 1.1) * 4));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
      {NODES.map((n) => {
        const np = PODS.filter((p) => p.node === n.id).sort((a, b) => (b.crit ? 1 : 0) - (a.crit ? 1 : 0) || a.svc.localeCompare(b.svc));
        const hot = np.filter((p) => p.crit).length;
        return (
          <div key={n.id} style={{ background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Server size={12} strokeWidth={2} style={{ color: UI.ink3 }} />
              <span style={{ fontSize: 12.5, fontWeight: 700, fontFamily: MONO, color: UI.ink, letterSpacing: "-0.02em" }}>{n.id}</span>
              <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 600, fontFamily: MONO, color: hot ? HP.crit : UI.ink2 }}>{hot > 0 && `${hot}⚠ `}{np.length}<span style={{ color: UI.ink3 }}>/{n.cap}</span></span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4 }}>
              {np.map((p) => <PodTile key={p.id} p={p} live={live(p)} dim={!!focus && p.svc !== focus} lit={!!focus && p.svc === focus} onClick={() => onPickSvc(p.svc)} />)}
              {Array.from({ length: n.cap - np.length }).map((_, i) => <div key={i} style={{ aspectRatio: "1", borderRadius: 6.5, border: "1px dashed #E2E4E9", boxSizing: "border-box" }} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 관계 관점: 호출 그래프 ─────────────────────────────
const VW = 920, VH = 400, NW = 120, NH = 54;
const LX = [16, 168, 320, 472, 620, 780];
const NY: Record<string, number> = { ingress: 170, gateway: 170, "shop-web": 90, "shop-api": 246, checkout: 60, search: 170, auth: 300, payments: 110, redis: 170 };
const rpos = (id: string) => ({ x: LX[SVC[id].layer], y: NY[id] });
const curve = (x1: number, y1: number, x2: number, y2: number) => { const mx = (x1 + x2) / 2; return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`; };

function RelationView({ focus, onPickSvc }: { focus: string | null; onPickSvc: (id: string) => void }) {
  const neigh = useMemo(() => {
    if (!focus) return null;
    const s = new Set<string>([focus]);
    EDGES.forEach((e) => { if (e.from === focus) s.add(e.to); if (e.to === focus) s.add(e.from); });
    return s;
  }, [focus]);
  return (
    <div style={{ background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 16, padding: 18 }}>
      <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" style={{ display: "block" }}>
        <defs>{SERVICES.map((s) => { const p = rpos(s.id); return <clipPath key={s.id} id={`uc-${s.id}`}><rect x={p.x} y={p.y} width={NW} height={NH} rx={12} /></clipPath>; })}</defs>
        {EDGES.map((e) => {
          const a = rpos(e.from), b = rpos(e.to);
          const on = !focus || focus === e.from || focus === e.to;
          const st = SVC[e.to].status; const col = st === "crit" ? HP.crit : st === "warn" ? HP.warn : "#C3CAD6";
          const dur = Math.max(0.55, 1.9 - e.rps / 800);
          const d = curve(a.x + NW, a.y + NH / 2, b.x, b.y + NH / 2);
          return (
            <g key={`${e.from}-${e.to}`} style={{ opacity: on ? 1 : 0.09, transition: "opacity .2s" }}>
              <path d={d} fill="none" stroke={col} strokeWidth={3} strokeOpacity={0.32} strokeLinecap="round" />
              <path d={d} fill="none" stroke={col} strokeWidth={3} strokeLinecap="round" strokeDasharray="3 11" className="uflow" style={{ animationDuration: `${dur}s` }} />
              <path d={`M ${b.x - 7} ${b.y + NH / 2 - 3.6} L ${b.x - 0.5} ${b.y + NH / 2} L ${b.x - 7} ${b.y + NH / 2 + 3.6} Z`} fill={col} opacity={0.55} />
            </g>
          );
        })}
        {SERVICES.map((s) => {
          const p = rpos(s.id); const on = focus === s.id; const lit = !neigh || neigh.has(s.id);
          return (
            <g key={s.id} onClick={() => onPickSvc(s.id)} style={{ cursor: "pointer", opacity: lit ? 1 : 0.24, transition: "opacity .2s" }}>
              <rect x={p.x} y={p.y} width={NW} height={NH} rx={12} fill={UI.card} stroke={on ? BLUE : UI.line} strokeWidth={on ? 1.5 : 1}
                style={{ filter: on ? "drop-shadow(0 8px 18px rgba(10,132,255,0.18))" : "drop-shadow(0 1px 2px rgba(17,19,24,0.05))" }} />
              <g clipPath={`url(#uc-${s.id})`} style={{ pointerEvents: "none" }}>
                <circle cx={p.x + 15} cy={p.y + 18} r={4} fill={HP[s.status]} />
                <text x={p.x + 26} y={p.y + 21.5} fontSize="11" fontWeight="600" fill={UI.ink} fontFamily={MONO}>{s.id}</text>
                <text x={p.x + 14} y={p.y + 38} fontSize="8.5" fill={UI.ink3}>{s.kind} · {s.ns}</text>
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── 통합 셸 ─────────────────────────────
function App() {
  const [tick, setTick] = useState(0);
  useEffect(() => { const iv = setInterval(() => setTick((t) => t + 1), 1500); return () => clearInterval(iv); }, []);
  const [view, setView] = useState<"physical" | "relation">("physical");
  const [focus, setFocus] = useState<string | null>(null);
  const [cfgLens, setCfgLens] = useState(false);
  const dir = useRef(1);
  const setV = (v: "physical" | "relation") => { dir.current = v === "relation" ? 1 : -1; setView(v); };

  const pick = (id: string) => setFocus((cur) => (cur === id ? null : id));
  const meta = focus ? SVC[focus] : null;
  const cfgs = focus ? SVC_CFG[focus] ?? [] : [];

  return (
    <div className="uni" style={{ minHeight: "100vh", background: UI.bg }}>
      <div style={{ width: 1180, maxWidth: "100%", margin: "0 auto", padding: "30px 24px 48px" }}>
        {/* 헤더: 제목 + 관점 세그먼트 */}
        <header style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: "-0.03em", color: UI.ink }}>리소스</h1>
          <div style={{ display: "flex", gap: 3, background: "rgba(17,19,24,0.05)", borderRadius: 10, padding: 3 }}>
            {([["physical", "물리"], ["relation", "관계"]] as const).map(([id, label]) => {
              const on = view === id;
              return (
                <button key={id} onClick={() => setV(id)} style={{ position: "relative", padding: "7px 18px", borderRadius: 8, border: "none", background: "transparent", cursor: "pointer" }}>
                  {on && <motion.span layoutId="useg" transition={SOFT} style={{ position: "absolute", inset: 0, borderRadius: 8, background: "#fff", boxShadow: "0 1px 3px rgba(17,19,24,0.12)" }} />}
                  <span style={{ position: "relative", fontSize: 12.5, fontWeight: 600, color: on ? UI.ink : UI.ink3 }}>{label}</span>
                </button>
              );
            })}
          </div>
          <span style={{ fontSize: 11.5, color: UI.ink3 }}>{view === "physical" ? "어느 노드에 깔렸나" : "누가 누굴 부르나"}</span>

          {/* 구성 렌즈 토글 — 관점 아니라 양쪽 공통 오버레이 */}
          <button onClick={() => setCfgLens((v) => !v)} disabled={!focus}
            style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, border: `1px solid ${cfgLens && focus ? "#BFD8FB" : UI.line}`, background: cfgLens && focus ? "rgba(10,132,255,0.07)" : UI.card, color: !focus ? UI.ink3 : cfgLens ? BLUE : UI.ink2, borderRadius: 999, padding: "6px 13px", fontSize: 11.5, fontWeight: 600, cursor: focus ? "pointer" : "not-allowed", opacity: focus ? 1 : 0.5 }}>
            <FileCog size={13} />구성 렌즈
          </button>
        </header>

        {/* 선택칩 — 관점 전환에도 유지되는 공유 컨텍스트 */}
        <div style={{ minHeight: 34, marginBottom: 14 }}>
          <AnimatePresence>
            {meta && (
              <motion.div key={meta.id} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={SOFT}
                style={{ display: "inline-flex", alignItems: "center", gap: 9, background: UI.card, border: `1px solid ${meta.status === "crit" ? "#F0B8B4" : UI.line}`, borderRadius: 999, padding: "6px 8px 6px 12px", boxShadow: "0 1px 2px rgba(17,19,24,0.05)" }}>
                <span style={{ width: 18, height: 18, borderRadius: 6, background: `${meta.color}18`, display: "grid", placeItems: "center" }}><meta.icon size={12} style={{ color: meta.color }} /></span>
                <span style={{ fontSize: 12.5, fontWeight: 700, fontFamily: MONO, color: UI.ink }}>{meta.id}</span>
                <span style={{ fontSize: 10.5, color: UI.ink3 }}>{meta.kind} · {meta.ns} · ×{meta.replicas}</span>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: HP[meta.status] }} />
                {/* 배포 계보 힌트 (배포 관점의 씨앗) */}
                <a href={`/devpreview-opsia.html?svc=${meta.id}`} style={{ fontSize: 10.5, fontWeight: 600, color: UI.ink2, textDecoration: "none", fontFamily: MONO, borderLeft: `1px solid ${UI.line}`, paddingLeft: 9 }}>{meta.rev} · {meta.sync}</a>
                <button onClick={() => { setFocus(null); setCfgLens(false); }} style={{ width: 20, height: 20, borderRadius: 999, border: "none", background: "rgba(17,19,24,0.06)", color: UI.ink3, cursor: "pointer", fontSize: 10, lineHeight: 1 }}>✕</button>
              </motion.div>
            )}
            {!meta && <motion.span key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ fontSize: 11.5, color: UI.ink3 }}>서비스를 선택하면 관점을 바꿔도 선택이 유지됩니다 — 파드 타일 또는 관계 노드를 클릭</motion.span>}
          </AnimatePresence>
        </div>

        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0, position: "relative", overflow: "hidden" }}>
            <AnimatePresence mode="popLayout" initial={false} custom={dir.current}>
              <motion.div key={view} custom={dir.current}
                initial={{ opacity: 0, x: 40 * dir.current, filter: "blur(6px)" }} animate={{ opacity: 1, x: 0, filter: "blur(0px)" }} exit={{ opacity: 0, x: -36 * dir.current, filter: "blur(6px)" }} transition={PAGE}>
                {view === "physical"
                  ? <PhysicalView focus={focus} tick={tick} onPickSvc={pick} />
                  : <RelationView focus={focus} onPickSvc={pick} />}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* 구성 렌즈 오버레이 패널 — 양쪽 관점 공통 */}
          <AnimatePresence>
            {cfgLens && meta && (
              <motion.aside key="cfg" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={SOFT}
                style={{ width: 236, flexShrink: 0, background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 16, padding: 15 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: UI.ink }}><FileCog size={13} style={{ color: BLUE }} />구성 의존</div>
                <div style={{ fontSize: 10.5, color: UI.ink3, marginTop: 2 }}>{meta.id}이(가) 마운트하는 리소스</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
                  {cfgs.length === 0 && <span style={{ fontSize: 11, color: UI.ink3 }}>의존하는 구성 없음</span>}
                  {cfgs.map((c) => {
                    const secret = CFG_KIND[c] === "Secret";
                    return (
                      <div key={c} style={{ display: "flex", alignItems: "center", gap: 9, border: `1px solid ${UI.line2}`, background: "#FBFBFD", borderRadius: 11, padding: "9px 11px" }}>
                        <FileCog size={14} style={{ color: secret ? "#8250DF" : BLUE, flexShrink: 0 }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, fontFamily: MONO, color: UI.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c}</div>
                          <div style={{ fontSize: 10, color: secret ? "#8250DF" : UI.ink3 }}>{CFG_KIND[c]}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 12, paddingTop: 11, borderTop: `1px solid ${UI.line}`, fontSize: 10, color: UI.ink3, lineHeight: 1.5 }}>구성은 관점이 아니라 <b style={{ color: UI.ink2 }}>렌즈</b> — 물리·관계 어느 관점에서든 켤 수 있습니다.</div>
              </motion.aside>
            )}
          </AnimatePresence>
        </div>

        {/* 관점 대응 설명 — 같은 선택, 다른 렌즈 */}
        <div style={{ marginTop: 18, display: "flex", gap: 10, fontSize: 11, color: UI.ink3, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: HP.ok }} />정상<span style={{ width: 8, height: 8, borderRadius: 999, background: HP.warn, marginLeft: 5 }} />경고<span style={{ width: 8, height: 8, borderRadius: 999, background: HP.crit, marginLeft: 5 }} />임계</span>
          <span style={{ marginLeft: "auto" }}>물리 = 어디 깔렸나 · 관계 = 누굴 부르나 · 배포 계보 = 선택칩의 rev·sync (다음 관점) · 구성 = 렌즈</span>
        </div>
      </div>

      <style>{`
        .uni { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Pretendard", "Apple SD Gothic Neo", "Helvetica Neue", sans-serif; -webkit-font-smoothing: antialiased; }
        .uni .utile.crit { animation: uc 1.3s ease-in-out infinite; }
        @keyframes uc { 0%,100% { filter: none; } 50% { filter: brightness(1.12) saturate(1.15); } }
        .uni .uflow { animation: uf linear infinite; }
        @keyframes uf { to { stroke-dashoffset: -28; } }
        .uni svg text { user-select: none; }
        @media (prefers-reduced-motion: reduce) { .uni .utile.crit, .uni .uflow { animation: none !important; } }
      `}</style>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);

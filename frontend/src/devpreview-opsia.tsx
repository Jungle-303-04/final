/* eslint-disable react-hooks/exhaustive-deps */
// ⚠ 데모 · Opsia 통합 맵 v4 — 프로덕션 그레이드 재설계.
// 원칙: 뉴트럴 표면 + 헤어라인, 색은 데이터에만, 모노 숫자, 4pt 그리드, 절제된 물리 모션.
// 구조: 클러스터(리스트) → 노드(위젯 그리드) → 파드(페이지 드릴). 연결 = 블루 하이라이트.
import ReactDOM from "react-dom/client";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Box, ChevronRight, ChevronLeft, X, Layers3, FileCog, Cpu, Activity, Server, Globe, Braces, ShoppingCart, CreditCard, Search, KeyRound, Network } from "lucide-react";
import "./styles/tokens.css";
import "./styles/foundation.css";

// GitHub 마크 (인라인 SVG)
const GithubIcon = ({ size = 14, style }: { size?: number; style?: React.CSSProperties }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={style} aria-hidden>
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/>
  </svg>
);
// Redis 공식 로고 (Simple Icons)
const RedisIcon = ({ size = 14, style }: { size?: number; style?: React.CSSProperties }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={style} aria-hidden>
    <path d="M10.5 2.661l.54.997-1.797.644 2.409.218.748 1.246.467-1.121 2.077-.208-1.61-.613.426-1.017-1.578.519zm6.905 2.077L13.76 6.182l3.292 1.298.353-.146 3.293-1.298zm-10.51.312a2.97 1.153 0 0 0-2.97 1.152 2.97 1.153 0 0 0 2.97 1.153 2.97 1.153 0 0 0 2.97-1.153 2.97 1.153 0 0 0-2.97-1.152zM24 6.805s-8.983 4.278-10.395 4.953c-1.226.561-1.901.561-3.261.094C8.318 11.022 0 7.241 0 7.241v1.038c0 .24.332.499.966.8 1.277.613 8.34 3.677 9.45 4.206 1.112.53 1.9.54 3.313-.197 1.412-.738 8.049-3.905 9.326-4.57.654-.342.945-.602.945-.84zm-10.042.602L8.39 8.26l3.884 1.61zM24 10.637s-8.983 4.279-10.395 4.954c-1.226.56-1.901.56-3.261.093C8.318 14.854 0 11.074 0 11.074v1.038c0 .238.332.498.966.8 1.277.612 8.34 3.676 9.45 4.205 1.112.53 1.9.54 3.313-.197 1.412-.737 8.049-3.905 9.326-4.57.654-.332.945-.602.945-.84zm0 3.842l-10.395 4.954c-1.226.56-1.901.56-3.261.094C8.318 18.696 0 14.916 0 14.916v1.038c0 .239.332.499.966.8 1.277.613 8.34 3.676 9.45 4.206 1.112.53 1.9.54 3.313-.198 1.412-.737 8.049-3.904 9.326-4.569.654-.343.945-.613.945-.841z"/>
  </svg>
);

// ── 디자인 토큰 ─────────────────────────────
const UI = { bg: "#FAFAFC", card: "#FFFFFF", line: "#E9EAEE", line2: "#F1F2F5", ink: "#111318", ink2: "#5F6570", ink3: "#9AA0AA" } as const;
const BLUE = "#0A84FF"; // 선택/하이라이트 전용
const HP = { ok: "#2EBD5B", warn: "#FF9F0A", crit: "#FF453A", pending: "#D9DCE1", ghost: "#F3F4F6" } as const;
const MONO = "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace";
const SPRING = { type: "spring", bounce: 0.16, visualDuration: 0.5 } as const;
const SOFT = { type: "spring", bounce: 0.12, visualDuration: 0.32 } as const;
const PAGE = { type: "spring", bounce: 0.08, visualDuration: 0.55 } as const;

// ── 도메인 ─────────────────────────────
const CLUSTERS = [
  { id: "prod-eks", env: "prod", region: "ap-northeast-2" },
  { id: "dev-eks", env: "dev", region: "ap-northeast-2" },
];
const NODES = [
  { id: "ip-10-0-1-24", cluster: "prod-eks", zone: "apne2-a", instance: "m5.xlarge", cap: 20 },
  { id: "ip-10-0-2-91", cluster: "prod-eks", zone: "apne2-b", instance: "m5.xlarge", cap: 20 },
  { id: "ip-10-0-3-15", cluster: "prod-eks", zone: "apne2-c", instance: "m5.2xlarge", cap: 30 },
  { id: "ip-10-1-0-11", cluster: "dev-eks", zone: "apne2-a", instance: "t3.large", cap: 10 },
  { id: "ip-10-1-0-42", cluster: "dev-eks", zone: "apne2-b", instance: "t3.large", cap: 10 },
];
const SERVICES = [
  { id: "shop-api", color: "#0A84FF", repo: "Jungle-303-04/final" },
  { id: "shop-web", color: "#28A745", repo: "Jungle-303-04/final" },
  { id: "checkout", color: "#E8930C", repo: "Jungle-303-04/final" },
  { id: "payments", color: "#E5484D", repo: "Jungle-303-04/final" },
  { id: "search", color: "#0FA3B1", repo: "Jungle-303-04/final" },
  { id: "auth", color: "#8250DF", repo: "opsia/platform" },
  { id: "redis", color: "#DC382C", repo: "opsia/platform" },
  { id: "gateway", color: "#4C6EF5", repo: "opsia/platform" },
  { id: "worker", color: "#12B5A5", repo: "opsia/platform" },
];
const SVC = Object.fromEntries(SERVICES.map((s) => [s.id, s])) as Record<string, (typeof SERVICES)[number]>;
type SvcIconT = React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
const SVC_ICON: Partial<Record<string, SvcIconT>> = {
  redis: RedisIcon, // 실제 제품 → 실제 로고
  "shop-api": Braces, "shop-web": Globe, checkout: ShoppingCart, payments: CreditCard,
  search: Search, auth: KeyRound, gateway: Network,
};
function ServiceIcon({ id, size = 14, style }: { id: string; size?: number; style?: React.CSSProperties }) {
  const Icon = SVC_ICON[id] ?? Box;
  return <Icon size={size} style={style} />;
}
const CONFIGS = [
  { id: "app-config", kind: "ConfigMap" }, { id: "redis-config", kind: "ConfigMap" },
  { id: "feature-flags", kind: "ConfigMap" }, { id: "db-credentials", kind: "Secret" }, { id: "tls-cert", kind: "Secret" },
];
const SVC_CFG: Record<string, string[]> = {
  "shop-api": ["app-config", "redis-config"], "shop-web": ["app-config", "feature-flags"], checkout: ["app-config", "db-credentials"],
  payments: ["db-credentials"], search: ["app-config", "redis-config"], auth: ["db-credentials"], redis: ["redis-config"],
  gateway: ["tls-cert"], worker: ["app-config"],
};
const REPOS = [...new Set(SERVICES.map((s) => s.repo))];
const REPO_META: Record<string, { rev: string; sync: "Synced" | "OutOfSync"; tool: string }> = {
  "Jungle-303-04/final": { rev: "a3f92c1", sync: "OutOfSync", tool: "Argo CD" },
  "opsia/platform": { rev: "7d21e08", sync: "Synced", tool: "Argo CD" },
};

type Status = "Running" | "OOMKilled" | "CrashLoopBackOff" | "Pending";
type Pod = { id: string; name: string; node: string; cluster: string; svc: string; cpu: number; mem: number; status: Status; restarts: number };
function makeRng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function genPods(): Pod[] {
  const r = makeRng(23); const pods: Pod[] = []; let k = 0;
  NODES.forEach((node) => {
    const count = node.cap - Math.floor(r() * 2);
    for (let i = 0; i < count; i++) {
      const svc = SERVICES[Math.floor(r() * SERVICES.length)].id;
      const pending = r() < 0.03, hot = r() < 0.045;
      let cpu = Math.floor(r() * 46) + 12, mem = Math.floor(r() * 44) + 16;
      if (hot) { cpu = 90 + Math.floor(r() * 9); mem = 92 + Math.floor(r() * 7); }
      const status: Status = pending ? "Pending" : hot ? (r() < 0.5 ? "OOMKilled" : "CrashLoopBackOff") : "Running";
      pods.push({ id: `p${k++}`, name: `${svc}-${Math.floor(r() * 900) + 100}`, node: node.id, cluster: node.cluster, svc, cpu: pending ? 0 : cpu, mem: pending ? 0 : mem, status, restarts: status === "Running" ? 0 : 2 + Math.floor(r() * 6) });
    }
  });
  return pods;
}
const health = (p: Pod) => Math.max(p.cpu, p.mem);
const isCrit = (p: Pod) => p.status === "OOMKilled" || p.status === "CrashLoopBackOff";
const healthColor = (p: Pod) => (p.status === "Pending" ? HP.pending : isCrit(p) ? HP.crit : health(p) >= 75 ? HP.warn : HP.ok);
const spanOf = (cap: number) => Math.min(3, Math.max(1, Math.ceil(cap / 10)));

type Lens = { kind: "svc" | "cfg" | "git"; id: string } | null;
type View = { level: "clusters" } | { level: "nodes"; cluster: string } | { level: "pods"; cluster: string; node: string };

// ── 파드 타일: 강도 램프 (Datadog Host Map / GitHub 잔디 방식)
// 상태 = 색상(그린/오렌지/레드), 사용률 = 같은 색의 진하기. 형태는 고정, 색만 부드럽게 변한다.
function PodTile({ p, big, dim, lit, live, onClick }: { p: Pod; big: boolean; dim: boolean; lit: boolean; live: number; onClick: () => void }) {
  const cpuV = p.status === "Pending" ? 0 : Math.max(3, Math.min(99, p.cpu + live));
  const c = healthColor(p);
  // 강도: 20% ~ 92% (저부하도 식별 가능, 고부하는 깊은 색)
  const mix = p.status === "Pending" ? 0 : isCrit(p) ? 100 : Math.round(20 + (cpuV / 100) * 72);
  const bg = p.status === "Pending" ? "#F0F1F4" : `color-mix(in srgb, ${c} ${mix}%, #fff)`;
  const deep = mix > 55; // 진한 타일 위 텍스트는 밝게
  return (
    <motion.button layout data-pod={p.id} onClick={(e) => { e.stopPropagation(); onClick(); }}
      initial={false}
      animate={{ opacity: dim ? 0.15 : 1, scale: 1 }} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.96 }} transition={SOFT}
      title={`${p.name} · ${p.status === "Running" ? `CPU ${cpuV}%` : p.status}`}
      className={isCrit(p) ? "tile crit" : "tile"}
      style={{
        aspectRatio: "1", border: "none", borderRadius: big ? 11 : 6.5, cursor: "pointer", position: "relative", overflow: "hidden",
        background: bg, transition: "background 1.2s ease",
        boxShadow: lit ? `0 0 0 1.5px #fff, 0 0 0 3px ${BLUE}` : `inset 0 0 0 1px color-mix(in srgb, ${c} ${Math.min(mix + 12, 100)}%, rgba(17,19,24,0.06))`,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: big ? 2 : 0, padding: 0, minWidth: 0,
      }}>
      {big && (
        <>
          <span style={{ position: "relative", zIndex: 1, fontSize: 11, fontWeight: 600, color: deep ? "rgba(255,255,255,0.95)" : "rgba(17,19,24,0.8)", letterSpacing: "-0.01em", maxWidth: "90%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: MONO }}>{p.svc}</span>
          <span style={{ position: "relative", zIndex: 1, fontSize: 9, fontWeight: 600, color: deep ? "rgba(255,255,255,0.75)" : "rgba(17,19,24,0.5)", fontVariantNumeric: "tabular-nums", fontFamily: MONO }}>{p.status === "Running" ? `${cpuV}%` : p.status}</span>
        </>
      )}
    </motion.button>
  );
}

// ── 게이지: 정밀 계기 (미세한 숨결만) ─────────────────────────────
function Gauge({ label, v }: { label: string; v: number }) {
  const c = v >= 90 ? HP.crit : v >= 75 ? HP.warn : HP.ok;
  const spd = Math.max(1.6, 3.2 - v / 50);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
      <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.06em", color: UI.ink3, width: 30, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 4, borderRadius: 999, background: "rgba(17,19,24,0.06)", overflow: "hidden" }}>
        <motion.div initial={{ width: 0 }}
          animate={{ width: [`${Math.max(2, v - 0.6)}%`, `${Math.min(99, v + 0.6)}%`] }}
          transition={{ duration: spd, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
          style={{ height: "100%", borderRadius: 999, background: c }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: UI.ink, width: 34, textAlign: "right", fontVariantNumeric: "tabular-nums", fontFamily: MONO, flexShrink: 0 }}>{v}<span style={{ color: UI.ink3, fontSize: 9 }}>%</span></span>
    </div>
  );
}

// ── 스파크라인 ─────────────────────────────
function Spark({ id, base, tick, h = 22, color = HP.ok }: { id: string; base: number; tick: number; h?: number; color?: string }) {
  const hsh = id.split("").reduce((s, ch) => s + ch.charCodeAt(0), 0);
  const W = 100;
  const pts = Array.from({ length: 25 }, (_, i) => {
    const x = tick - 24 + i;
    return Math.max(4, Math.min(96, base + 9 * Math.sin(x * 0.55 + hsh) + 5 * Math.sin(x * 0.21 + hsh * 1.7)));
  });
  const line = pts.map((v, i) => `${i === 0 ? "M" : "L"} ${((i / 24) * W).toFixed(1)} ${(h - (v / 100) * h).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${h}`} width="100%" height={h} preserveAspectRatio="none" style={{ display: "block" }}>
      <path d={`${line} L ${W} ${h} L 0 ${h} Z`} fill={color} opacity={0.07} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ── 노드 위젯 ─────────────────────────────
function NodeWidget({ node, pods, expanded, dimFn, litFn, live, tick, onOpen, onPod }: {
  node: (typeof NODES)[number]; pods: Pod[]; expanded: boolean; dimFn: (p: Pod) => boolean; litFn: (p: Pod) => boolean; live: (p: Pod) => number;
  tick: number; onOpen: () => void; onPod: (p: Pod) => void;
}) {
  const np = pods.filter((p) => p.node === node.id);
  const act = np.filter((p) => p.status === "Running");
  const avgC = Math.round(act.reduce((s, p) => s + p.cpu, 0) / (act.length || 1));
  const avgM = Math.round(act.reduce((s, p) => s + p.mem, 0) / (act.length || 1));
  const hot = np.filter(isCrit).length;
  const span = spanOf(node.cap);
  const cols = expanded ? 10 : span * 5;
  return (
    <motion.div layoutId={`node-${node.id}`} transition={SPRING} onClick={expanded ? undefined : onOpen}
      style={{
        background: UI.card, borderRadius: 16, padding: expanded ? 24 : 16, border: `1px solid ${UI.line}`,
        boxShadow: "none", cursor: expanded ? "default" : "pointer", display: "flex", flexDirection: "column", gap: expanded ? 16 : 12, minWidth: 0, height: "100%", boxSizing: "border-box",
      }}
      whileHover={expanded ? undefined : { y: -2, boxShadow: "0 12px 32px -18px rgba(17,19,24,0.18)", borderColor: "#DFE1E7" }}
      whileTap={expanded ? undefined : { scale: 0.993 }}
      className="widget">
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, minWidth: 0 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <Server size={expanded ? 15 : 12} strokeWidth={2} style={{ color: UI.ink3, flexShrink: 0 }} />
            <span style={{ fontSize: expanded ? 17 : 12.5, fontWeight: 700, letterSpacing: "-0.02em", color: UI.ink, fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.id}</span>
          </div>
          <div style={{ fontSize: expanded ? 11.5 : 9.5, color: UI.ink3, marginTop: 2, marginLeft: expanded ? 21 : 18, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{node.instance} · {node.zone} · Ready</div>
        </div>
        <span style={{ fontSize: expanded ? 12 : 10.5, fontWeight: 600, color: hot ? HP.crit : UI.ink2, fontVariantNumeric: "tabular-nums", fontFamily: MONO, flexShrink: 0, marginTop: 1 }}>
          {hot > 0 && <span style={{ fontWeight: 700 }}>{hot}⚠ </span>}{np.length}<span style={{ color: UI.ink3 }}>/{node.cap}</span>
        </span>
      </div>
      <div style={{ display: "flex", gap: 14 }}>
        <Gauge label="CPU" v={avgC} /><Gauge label="MEM" v={avgM} />
      </div>
      {expanded && (
        <div style={{ border: `1px solid ${UI.line2}`, background: "#FBFBFD", borderRadius: 12, padding: "12px 14px 8px" }}>
          <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.06em", color: UI.ink3, marginBottom: 8 }}>CPU · 최근 24 틱</div>
          <Spark id={node.id} base={avgC} tick={tick} h={36} color={avgC >= 75 ? HP.warn : HP.ok} />
        </div>
      )}
      <motion.div layout style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: expanded ? 8 : 4 }}>
        {np.map((p) => <PodTile key={p.id} p={p} big={expanded} dim={dimFn(p)} lit={litFn(p)} live={live(p)} onClick={() => onPod(p)} />)}
        {Array.from({ length: node.cap - np.length }).map((_, i) => (
          <div key={`g${i}`} style={{ aspectRatio: "1", borderRadius: expanded ? 11 : 6.5, border: "1px dashed #E2E4E9", boxSizing: "border-box" }} />
        ))}
      </motion.div>
    </motion.div>
  );
}

// ── 클러스터 로우 ─────────────────────────────
function ClusterRow({ cl, pods, tick, related, onOpen }: { cl: (typeof CLUSTERS)[number]; pods: Pod[]; tick: number; related: Set<string>; onOpen: () => void }) {
  const cp = pods.filter((p) => p.cluster === cl.id);
  const act = cp.filter((p) => p.status === "Running");
  const avgC = Math.round(act.reduce((s, p) => s + p.cpu, 0) / (act.length || 1));
  const avgM = Math.round(act.reduce((s, p) => s + p.mem, 0) / (act.length || 1));
  const chot = cp.filter(isCrit).length;
  const nodes = NODES.filter((n) => n.cluster === cl.id);
  const rel = cp.filter((p) => related.has(p.id)).length;
  return (
    <motion.button layoutId={`cl-${cl.id}`} transition={SPRING} onClick={onOpen}
      whileHover={{ y: -2, boxShadow: "0 14px 36px -20px rgba(17,19,24,0.18)", borderColor: "#DFE1E7" }} whileTap={{ scale: 0.996 }}
      style={{
        display: "grid", gridTemplateColumns: "230px 1fr 140px auto auto 16px", alignItems: "center", columnGap: 24,
        width: "100%", textAlign: "left", cursor: "pointer",
        background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 16, padding: "20px 24px", boxShadow: "none",
      }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className={chot ? "pulsedot" : undefined} style={{ width: 8, height: 8, borderRadius: 999, background: chot ? HP.crit : HP.ok, flexShrink: 0 }} />
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em", color: UI.ink, fontFamily: MONO }}>{cl.id}</span>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.04em", color: cl.env === "prod" ? "#B25A00" : UI.ink2, border: `1px solid ${cl.env === "prod" ? "#F3D8B7" : UI.line}`, background: cl.env === "prod" ? "#FFF8EF" : "#FAFAFB", borderRadius: 6, padding: "1.5px 7px" }}>{cl.env}</span>
        </div>
        <div style={{ fontSize: 11, color: UI.ink3, marginTop: 4, marginLeft: 16 }}>{cl.region} · 노드 {nodes.length} · 파드 {cp.length}{chot ? ` · 임계 ${chot}` : ""}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0, maxWidth: 300 }}>
        <Gauge label="CPU" v={avgC} /><Gauge label="MEM" v={avgM} />
      </div>
      <div style={{ borderLeft: `1px solid ${UI.line2}`, paddingLeft: 20 }}><Spark id={cl.id} base={avgC} tick={tick} h={28} color={avgC >= 75 ? HP.warn : HP.ok} /></div>
      <div style={{ display: "flex", gap: 4 }}>
        {nodes.map((n) => {
          const worst = pods.filter((p) => p.node === n.id);
          const w = worst.some(isCrit) ? HP.crit : worst.some((p) => health(p) >= 75 && p.status === "Running") ? HP.warn : HP.ok;
          return <span key={n.id} title={n.id} style={{ width: 10, height: 10, borderRadius: 3, background: w }} />;
        })}
      </div>
      {rel > 0 ? <span style={{ fontSize: 10.5, fontWeight: 700, color: BLUE, fontFamily: MONO }}>{rel} 관련</span> : <span />}
      <ChevronRight size={15} style={{ color: "#C6CAD1" }} />
    </motion.button>
  );
}

// ── 앱 ─────────────────────────────
function App() {
  const pods = useMemo(() => genPods(), []);
  const [tick, setTick] = useState(0);
  useEffect(() => { const iv = setInterval(() => setTick((t) => t + 1), 1500); return () => clearInterval(iv); }, []);
  const live = (p: Pod) => (p.status !== "Running" ? 0 : Math.round(Math.sin((tick + p.cpu + p.id.length * 3) * 1.1) * 3));

  const [view, setView] = useState<View>({ level: "clusters" });
  const [dir, setDir] = useState(1);
  const go = (v: View, d: number) => { setDir(d); setView(v); };
  const [focusPod, setFocusPod] = useState<Pod | null>(null);
  const [lens, setLens] = useState<Lens>(null);
  const [pin, setPin] = useState<Lens>(null);

  const incident = focusPod && isCrit(focusPod) ? focusPod : null;
  const effLens: Lens = lens ?? pin ?? (incident ? { kind: "svc", id: incident.svc } : null);
  const related = useMemo(() => {
    const l = effLens; if (!l) return new Set<string>();
    if (l.kind === "svc") return new Set(pods.filter((p) => p.svc === l.id).map((p) => p.id));
    if (l.kind === "cfg") return new Set(pods.filter((p) => (SVC_CFG[p.svc] || []).includes(l.id)).map((p) => p.id));
    return new Set(pods.filter((p) => SVC[p.svc].repo === l.id).map((p) => p.id));
  }, [effLens, pods]);
  const dimFn = (p: Pod) => (effLens ? !related.has(p.id) && p.id !== focusPod?.id : focusPod ? p.id !== focusPod.id : false);
  const litFn = (p: Pod) => !!effLens && related.has(p.id);
  const crit = pods.filter(isCrit).length;

  const gotoNode = (p: Pod) => { go({ level: "pods", cluster: p.cluster, node: p.node }, 1); setFocusPod(p); };
  const openNodeById = (id: string) => { const n = NODES.find((x) => x.id === id); if (n) go({ level: "pods", cluster: n.cluster, node: n.id }, 1); };
  const selectPod = (p: Pod) => setFocusPod((cur) => (cur?.id === p.id ? null : p));

  const viewKey = view.level === "clusters" ? "clusters" : view.level === "nodes" ? `nodes-${view.cluster}` : `pods-${view.node}`;
  const crumbs: { label: string; onClick?: () => void }[] = [{ label: "클러스터", onClick: view.level !== "clusters" ? () => go({ level: "clusters" }, -1) : undefined }];
  if (view.level !== "clusters") crumbs.push({ label: view.cluster, onClick: view.level === "pods" ? () => go({ level: "nodes", cluster: view.cluster }, -1) : undefined });
  if (view.level === "pods") crumbs.push({ label: view.node });

  return (
    <div className="op">
      <div style={{ width: 1220, maxWidth: "100%", margin: "0 auto", padding: "32px 24px 48px" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", color: UI.ink }}>통합 맵</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 500, color: UI.ink2 }}>
              <span className="pulsedot" style={{ width: 6, height: 6, borderRadius: 999, background: HP.ok }} />
              실시간 · {CLUSTERS.length} 클러스터 · {NODES.length} 노드 · {pods.length} 파드 · 임계 <b style={{ color: crit ? HP.crit : UI.ink, fontFamily: MONO }}>{crit}</b>
            </div>
          </div>
          <div style={{ display: "flex", gap: 14, fontSize: 11, fontWeight: 500, color: UI.ink2 }}>
            {([["정상", HP.ok], ["경고", HP.warn], ["임계", HP.crit], ["대기", HP.pending]] as const).map(([k, c]) => (
              <span key={k} style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: c }} />{k}</span>
            ))}
          </div>
        </header>

        {/* 장애 스트립 */}
        {crit > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: HP.crit, display: "flex", alignItems: "center", gap: 5, marginRight: 2 }}><Activity size={12} />장애 {crit}</span>
            {pods.filter(isCrit).map((p, i) => (
              <motion.button key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: i * 0.05 }}
                whileHover={{ y: -1, borderColor: "#F0B8B4" }} whileTap={{ scale: 0.97 }} onClick={() => gotoNode(p)}
                style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${UI.line}`, cursor: "pointer", background: UI.card, borderRadius: 999, padding: "5px 12px", fontSize: 11, fontWeight: 600, color: UI.ink }}>
                <span className="pulsedot" style={{ width: 6, height: 6, borderRadius: 99, background: HP.crit }} />
                <span style={{ fontFamily: MONO }}>{p.name}</span>
                <span style={{ fontWeight: 500, color: UI.ink3 }}>{p.status} · {p.node}</span>
              </motion.button>
            ))}
          </div>
        )}

        {/* 브레드크럼 */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 16, minHeight: 28 }}>
          {view.level !== "clusters" && (
            <motion.button whileTap={{ scale: 0.92 }} whileHover={{ borderColor: "#D8DBE1" }}
              onClick={() => go(view.level === "pods" ? { level: "nodes", cluster: view.cluster } : { level: "clusters" }, -1)}
              style={{ width: 26, height: 26, borderRadius: 999, border: `1px solid ${UI.line}`, background: UI.card, cursor: "pointer", display: "grid", placeItems: "center", marginRight: 6 }}>
              <ChevronLeft size={14} style={{ color: UI.ink2 }} />
            </motion.button>
          )}
          {crumbs.map((c, i) => (
            <span key={c.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {i > 0 && <ChevronRight size={11} style={{ color: "#C6CAD1" }} />}
              <button onClick={c.onClick} disabled={!c.onClick}
                style={{ border: "none", background: "transparent", cursor: c.onClick ? "pointer" : "default", fontSize: 12, fontWeight: 600, color: i === crumbs.length - 1 ? UI.ink : UI.ink3, padding: "2px 4px", fontFamily: i > 0 ? MONO : undefined, letterSpacing: "-0.01em" }}>
                {c.label}
              </button>
            </span>
          ))}
        </div>

        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
            <AnimatePresence>
              {effLens && (
                <motion.div key="chip" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={SOFT}
                  style={{ position: "absolute", top: -46, right: 0, zIndex: 10, display: "flex", alignItems: "center", gap: 7, background: UI.card, border: `1px solid ${incident && !lens && !pin ? "#F0B8B4" : "#BFD8FB"}`, borderRadius: 999, padding: "5px 13px", fontSize: 11.5, fontWeight: 600, color: incident && !lens && !pin ? HP.crit : BLUE }}>
                  {incident && !lens && !pin ? <Activity size={12} /> : effLens.kind === "svc" ? <Layers3 size={12} /> : effLens.kind === "cfg" ? <FileCog size={12} /> : <GithubIcon size={12} />}
                  <span style={{ fontFamily: MONO }}>{incident && !lens && !pin ? `장애 조사 · ${incident.name}` : effLens.id}</span>
                  <span style={{ fontWeight: 500, opacity: 0.6 }}>{related.size} 파드</span>
                  {pin && <button onClick={() => setPin(null)} style={{ border: "none", background: "rgba(17,19,24,0.06)", borderRadius: 999, width: 15, height: 15, cursor: "pointer", fontSize: 9, lineHeight: 1, color: "inherit" }}>✕</button>}
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence mode="popLayout" custom={dir} initial={false}>
              <motion.div key={viewKey} custom={dir}
                initial={{ opacity: 0, x: 46 * dir, scale: 0.985, filter: "blur(7px)" }} animate={{ opacity: 1, x: 0, scale: 1, filter: "blur(0px)" }} exit={{ opacity: 0, x: -42 * dir, scale: 0.99, filter: "blur(7px)" }} transition={PAGE}>

                {view.level === "clusters" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {CLUSTERS.map((cl, i) => (
                      <motion.div key={cl.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: i * 0.05 }}>
                        <ClusterRow cl={cl} pods={pods} tick={tick} related={effLens ? related : new Set()} onOpen={() => go({ level: "nodes", cluster: cl.id }, 1)} />
                      </motion.div>
                    ))}
                  </div>
                )}

                {view.level === "nodes" && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
                    {NODES.filter((n) => n.cluster === view.cluster).map((node, i) => (
                      <motion.div key={node.id} style={{ gridColumn: `span ${spanOf(node.cap)}` }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: i * 0.04 }}>
                        <NodeWidget node={node} pods={pods} expanded={false} dimFn={dimFn} litFn={litFn} live={live} tick={tick}
                          onOpen={() => go({ level: "pods", cluster: view.cluster, node: node.id }, 1)} onPod={selectPod} />
                      </motion.div>
                    ))}
                  </div>
                )}

                {view.level === "pods" && (() => {
                  const node = NODES.find((n) => n.id === view.node)!;
                  return <NodeWidget node={node} pods={pods} expanded dimFn={dimFn} litFn={litFn} live={live} tick={tick} onOpen={() => {}} onPod={selectPod} />;
                })()}
              </motion.div>
            </AnimatePresence>
          </div>

          <SidePanel pods={pods} focusPod={focusPod} setLens={setLens} pin={pin} setPin={setPin} effLens={effLens} clearPod={() => setFocusPod(null)} openNode={openNodeById} />
        </div>
      </div>

      <style>{`
        html, body { background: ${UI.bg}; }
        .op { min-height: 100vh; background: ${UI.bg}; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Pretendard", "Apple SD Gothic Neo", "Helvetica Neue", sans-serif; -webkit-font-smoothing: antialiased; }
        .op .tile.crit { animation: critp 1.3s ease-in-out infinite; }
        @keyframes critp { 0%,100% { filter: none; } 50% { filter: brightness(1.12) saturate(1.15); } }
        .pulsedot { animation: pd 1.5s ease-in-out infinite; }
        @keyframes pd { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
        .op ::-webkit-scrollbar { width: 8px; } .op ::-webkit-scrollbar-thumb { background: rgba(17,19,24,0.12); border-radius: 99px; }
        @media (prefers-reduced-motion: reduce) { .tile.crit, .pulsedot { animation: none !important; } }
      `}</style>
    </div>
  );
}

// ── 우측 패널 ─────────────────────────────
function SidePanel({ pods, focusPod, setLens, pin, setPin, effLens, clearPod, openNode }: {
  pods: Pod[]; focusPod: Pod | null; setLens: (l: Lens) => void; pin: Lens; setPin: (l: Lens) => void; effLens: Lens; clearPod: () => void; openNode: (id: string) => void;
}) {
  const [tab, setTab] = useState<"svc" | "cfg" | "git">("svc");
  const count = (l: Lens) => { if (!l) return 0; if (l.kind === "svc") return pods.filter((p) => p.svc === l.id).length; if (l.kind === "cfg") return pods.filter((p) => (SVC_CFG[p.svc] || []).includes(l.id)).length; return pods.filter((p) => SVC[p.svc].repo === l.id).length; };

  const Row = ({ l, icon, label, sub, warn }: { l: Lens; icon?: React.ReactNode; label: string; sub: string; warn?: boolean }) => {
    const active = effLens && effLens.kind === l!.kind && effLens.id === l!.id;
    return (
      <motion.button whileTap={{ scale: 0.985 }} onMouseEnter={() => setLens(l)} onMouseLeave={() => setLens(null)}
        onClick={() => setPin(pin && pin.id === l!.id && pin.kind === l!.kind ? null : l)}
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: "none", background: active ? "rgba(10,132,255,0.07)" : "transparent", borderRadius: 10, padding: "8px 10px", cursor: "pointer", transition: "background .15s" }}>
        {icon}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, fontFamily: MONO, color: UI.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>{label}</div>
          <div style={{ fontSize: 10.5, color: warn ? "#B25A00" : UI.ink3, marginTop: 1 }}>{sub}</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: active ? BLUE : UI.ink3, fontVariantNumeric: "tabular-nums", fontFamily: MONO }}>{count(l)}</span>
      </motion.button>
    );
  };

  return (
    <aside style={{ width: 270, flexShrink: 0, background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 16, padding: 14, display: "flex", flexDirection: "column", gap: 12, position: "sticky", top: 24, maxHeight: "calc(100vh - 60px)", overflowY: "auto" }}>
      <AnimatePresence mode="wait">
        {focusPod ? (
          <motion.div key={focusPod.id} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={SOFT} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <PodDetail pod={focusPod} setLens={setLens} setPin={setPin} clearPod={clearPod} openNode={openNode} />
          </motion.div>
        ) : (
          <motion.div key="lens" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={SOFT} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ padding: "2px 2px 0" }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: "-0.02em", color: UI.ink }}>연결 보기</div>
              <div style={{ fontSize: 10.5, color: UI.ink3, marginTop: 2 }}>올리면 관련 파드가 밝게 표시 · 클릭 = 고정</div>
            </div>
            <div style={{ display: "flex", gap: 3, background: "rgba(17,19,24,0.04)", borderRadius: 10, padding: 3 }}>
              {([["svc", "서비스", Layers3], ["cfg", "설정", FileCog], ["git", "배포", GithubIcon]] as const).map(([id, label, I]) => {
                const on = tab === id;
                return (
                  <button key={id} onClick={() => setTab(id)} style={{ position: "relative", flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "6px 0", borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", fontSize: 11.5, fontWeight: 600, color: on ? UI.ink : UI.ink3 }}>
                    {on && <motion.span layoutId="ptab" transition={SOFT} style={{ position: "absolute", inset: 0, borderRadius: 8, background: "#fff", boxShadow: "0 1px 3px rgba(17,19,24,0.12)" }} />}
                    <span style={{ position: "relative", display: "flex", alignItems: "center", gap: 5 }}><I size={12} />{label}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {tab === "svc" && SERVICES.map((s) => <Row key={s.id} l={{ kind: "svc", id: s.id }} icon={<ServiceIcon id={s.id} size={14} style={{ color: s.color, flexShrink: 0 }} />} label={s.id} sub={s.repo} />)}
              {tab === "cfg" && CONFIGS.map((c) => <Row key={c.id} l={{ kind: "cfg", id: c.id }} icon={<FileCog size={14} style={{ color: c.kind === "Secret" ? "#8250DF" : BLUE, flexShrink: 0 }} />} label={c.id} sub={c.kind} />)}
              {tab === "git" && REPOS.map((r) => <Row key={r} l={{ kind: "git", id: r }} icon={<GithubIcon size={14} style={{ color: "#24292F", flexShrink: 0 }} />} label={r} sub={`${REPO_META[r].tool} · ${REPO_META[r].rev} · ${REPO_META[r].sync}`} warn={REPO_META[r].sync === "OutOfSync"} />)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
}

function PodDetailLink({ l, icon, label, sub, onClick, setLens, setPin }: { l?: Lens; icon: React.ReactNode; label: string; sub: string; onClick?: () => void; setLens: (l: Lens) => void; setPin: (l: Lens) => void }) {
  return (
    <motion.button whileTap={{ scale: 0.985 }}
      onMouseEnter={l ? () => setLens(l) : undefined} onMouseLeave={l ? () => setLens(null) : undefined}
      onClick={onClick ?? (l ? () => setPin(l) : undefined)}
      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: `1px solid ${UI.line2}`, background: "#FBFBFD", borderRadius: 11, padding: "9px 11px", cursor: "pointer" }}>
      {icon}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 600, fontFamily: MONO, color: UI.ink, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
        <div style={{ fontSize: 10, color: UI.ink3, marginTop: 1 }}>{sub}</div>
      </div>
      <ChevronRight size={13} style={{ color: "#C6CAD1", flexShrink: 0 }} />
    </motion.button>
  );
}

function PodDetail({ pod, setLens, setPin, clearPod, openNode }: { pod: Pod; setLens: (l: Lens) => void; setPin: (l: Lens) => void; clearPod: () => void; openNode: (id: string) => void }) {
  const crit = isCrit(pod);
  const stColor = pod.status === "Running" ? HP.ok : crit ? HP.crit : UI.ink2;
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: `${SVC[pod.svc].color}14`, display: "grid", placeItems: "center", flexShrink: 0 }}><ServiceIcon id={pod.svc} size={16} style={{ color: SVC[pod.svc].color }} /></span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, fontFamily: MONO, letterSpacing: "-0.01em", color: UI.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pod.name}</div>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: stColor, marginTop: 1 }}>{pod.status}{pod.restarts > 0 ? ` · 재시작 ${pod.restarts}` : ""}</div>
        </div>
        <button onClick={clearPod} style={{ width: 24, height: 24, borderRadius: 999, border: "none", background: "rgba(17,19,24,0.05)", color: UI.ink3, cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}><X size={12} /></button>
      </div>
      {crit && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, border: "1px solid #F0B8B4", background: "#FFF7F6", borderRadius: 10, padding: "7px 11px", fontSize: 10.5, fontWeight: 600, color: HP.crit }}>
          <Activity size={12} /> 장애 조사 — 이 파드의 연결이 표시됩니다
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 9, border: `1px solid ${UI.line2}`, background: "#FBFBFD", borderRadius: 11, padding: "11px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9.5, fontWeight: 600, letterSpacing: "0.06em", color: UI.ink3 }}><Cpu size={11} style={{ color: BLUE }} />한도 대비</div>
        <Gauge label="CPU" v={pod.cpu} /><Gauge label="MEM" v={pod.mem} />
      </div>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: UI.ink3, marginTop: 2 }}>연결된 것들</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <PodDetailLink l={{ kind: "svc", id: pod.svc }} icon={<ServiceIcon id={pod.svc} size={14} style={{ color: SVC[pod.svc].color, flexShrink: 0 }} />} label={pod.svc} sub="서비스 · 형제 파드" setLens={setLens} setPin={setPin} />
        {(SVC_CFG[pod.svc] || []).map((c) => {
          const cfg = CONFIGS.find((x) => x.id === c)!;
          return <PodDetailLink key={c} l={{ kind: "cfg", id: c }} icon={<FileCog size={14} style={{ color: cfg.kind === "Secret" ? "#8250DF" : BLUE, flexShrink: 0 }} />} label={c} sub={cfg.kind} setLens={setLens} setPin={setPin} />;
        })}
        <PodDetailLink l={{ kind: "git", id: SVC[pod.svc].repo }} icon={<GithubIcon size={14} style={{ color: "#24292F", flexShrink: 0 }} />} label={SVC[pod.svc].repo} sub={`${REPO_META[SVC[pod.svc].repo].rev} · ${REPO_META[SVC[pod.svc].repo].sync}`} setLens={setLens} setPin={setPin} />
        <PodDetailLink icon={<Server size={14} style={{ color: UI.ink2, flexShrink: 0 }} />} label={pod.node} sub={`물리 노드 · ${pod.cluster}`} onClick={() => openNode(pod.node)} setLens={setLens} setPin={setPin} />
      </div>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);

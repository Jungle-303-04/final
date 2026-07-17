/* eslint-disable react-hooks/exhaustive-deps */
// ⚠ 데모 · Opsia 통합 맵 v2.1 — DOM + CSS Grid + Motion 스프링.
// 논리: 지도 = 물리(멀티클러스터→노드 위젯→파드 타일) × 건강. 연결(서비스/설정/Git/장애조사) = 오버레이.
// 노드 = iOS 위젯(용량따라 1·2·3칸). 노드 클릭 = 앱스토어식 카드 확장. 연결선 = 실선 노선 스타일. 전부 더미.
import ReactDOM from "react-dom/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Box, ChevronRight, X, Layers3, FileCog, GitBranch, Cpu, Activity, Server } from "lucide-react";
import "./styles/tokens.css";
import "./styles/foundation.css";

const BLUE = "#0A6CFF";
const RED = "#E5484D";
const HP = { ok: "#9FDDB2", warn: "#FFC069", crit: "#FF6B5E", pending: "#E3E6EB", ghost: "#F1F3F7" } as const;
const SPRING = { type: "spring", bounce: 0.18, visualDuration: 0.45 } as const;
const SOFT = { type: "spring", bounce: 0.14, visualDuration: 0.3 } as const;

// ── 도메인 ─────────────────────────────
const CLUSTERS = [
  { id: "prod-eks", env: "prod", region: "ap-northeast-2" },
  { id: "dev-eks", env: "dev", region: "ap-northeast-2" },
];
// 한 칸(가상 블록) = 파드 10슬롯(5×2). cap은 10의 배수.
const NODES = [
  { id: "ip-10-0-1-24", cluster: "prod-eks", zone: "apne2-a", instance: "m5.xlarge", cap: 20 },
  { id: "ip-10-0-2-91", cluster: "prod-eks", zone: "apne2-b", instance: "m5.xlarge", cap: 20 },
  { id: "ip-10-0-3-15", cluster: "prod-eks", zone: "apne2-c", instance: "m5.2xlarge", cap: 30 },
  { id: "ip-10-1-0-11", cluster: "dev-eks", zone: "apne2-a", instance: "t3.large", cap: 10 },
  { id: "ip-10-1-0-42", cluster: "dev-eks", zone: "apne2-b", instance: "t3.large", cap: 10 },
];
const SERVICES = [
  { id: "shop-api", color: "#0A6CFF", repo: "Jungle-303-04/final" },
  { id: "shop-web", color: "#30B15C", repo: "Jungle-303-04/final" },
  { id: "checkout", color: "#F5A623", repo: "Jungle-303-04/final" },
  { id: "payments", color: "#F0544C", repo: "Jungle-303-04/final" },
  { id: "search", color: "#17AEC9", repo: "Jungle-303-04/final" },
  { id: "auth", color: "#9D5CE8", repo: "opsia/platform" },
  { id: "redis", color: "#E8558E", repo: "opsia/platform" },
  { id: "gateway", color: "#5B77F2", repo: "opsia/platform" },
  { id: "worker", color: "#25B8A8", repo: "opsia/platform" },
];
const SVC = Object.fromEntries(SERVICES.map((s) => [s.id, s])) as Record<string, (typeof SERVICES)[number]>;
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
    const count = Math.min(node.cap - 2, node.cluster === "prod-eks" ? 15 + Math.floor(r() * 7) : 7 + Math.floor(r() * 3));
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

// ── 연결선: 실선 노선 스타일 (스파인 + 파드 분기 + 정션 도트) ─────────────────────────────
function SpineOverlay({ containerRef, ids, red }: { containerRef: React.RefObject<HTMLDivElement | null>; ids: string[]; red: boolean }) {
  const [d, setD] = useState("");
  const [dots, setDots] = useState<{ x: number; y: number }[]>([]);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const root = containerRef.current;
      if (!root || ids.length === 0) { setD(""); setDots([]); return; }
      const rb = root.getBoundingClientRect();
      const pts = ids
        .map((id) => root.querySelector(`[data-pod="${id}"]`))
        .filter((el): el is Element => !!el)
        .map((el) => { const b = el.getBoundingClientRect(); return { x: b.left - rb.left, y: b.top + b.height / 2 - rb.top }; })
        .sort((a, b) => a.y - b.y || a.x - b.x);
      if (pts.length === 0) { setD(""); setDots([]); return; }
      const spineX = 8;
      let path = "";
      if (pts.length > 1) path += `M ${spineX} ${pts[0].y} L ${spineX} ${pts[pts.length - 1].y} `;
      pts.forEach((p) => { path += `M ${spineX} ${p.y} C ${spineX + 14} ${p.y}, ${p.x - 14} ${p.y}, ${p.x - 3} ${p.y} `; });
      setD(path);
      setDots(pts.map((p) => ({ x: spineX, y: p.y })));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ids.join(","), red]);
  if (!d) return null;
  const col = red ? RED : BLUE;
  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 6, overflow: "visible" }}>
      <path d={d} fill="none" stroke={col} strokeWidth={5} strokeOpacity={0.09} strokeLinecap="round" />
      <path d={d} fill="none" stroke={col} strokeWidth={1.6} strokeOpacity={0.8} strokeLinecap="round" />
      {dots.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={2.8} fill="#fff" stroke={col} strokeWidth={1.6} />)}
    </svg>
  );
}

// ── 파드 타일 ─────────────────────────────
function PodTile({ p, big, dim, lit, live, onClick }: { p: Pod; big: boolean; dim: boolean; lit: boolean; live: number; onClick: () => void }) {
  const h = p.status === "Running" ? Math.max(5, Math.min(99, health(p) + live)) : health(p);
  return (
    <motion.button layout data-pod={p.id} onClick={(e) => { e.stopPropagation(); onClick(); }}
      initial={false}
      animate={{ opacity: dim ? 0.16 : 1, scale: 1 }} whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.96 }} transition={SOFT}
      title={`${p.name} · ${p.status === "Running" ? `${h}%` : p.status}`}
      className={isCrit(p) ? "tile crit" : "tile"}
      style={{
        aspectRatio: "1", border: "none", borderRadius: big ? 12 : 7, cursor: "pointer", background: healthColor(p), position: "relative",
        boxShadow: lit ? `0 0 0 1.5px #fff, 0 0 0 3px ${BLUE}` : "inset 0 0 0 1px rgba(255,255,255,0.55)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: big ? 2 : 0, padding: 0, minWidth: 0,
      }}>
      {big && (
        <>
          <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(10,14,20,0.75)", letterSpacing: "-0.01em", maxWidth: "92%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.svc}</span>
          <span style={{ fontSize: 9.5, fontWeight: 600, color: "rgba(10,14,20,0.45)", fontVariantNumeric: "tabular-nums" }}>{p.status === "Running" ? `${h}%` : p.status}</span>
        </>
      )}
    </motion.button>
  );
}

// ── 게이지 ─────────────────────────────
function Gauge({ label, v, w }: { label: string; v: number; w?: number }) {
  const c = v >= 90 ? HP.crit : v >= 75 ? HP.warn : "#63C687";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: "#98A0AC", width: 28, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 5, borderRadius: 999, background: "rgba(10,14,20,0.06)", overflow: "hidden", minWidth: w }}>
        <motion.div animate={{ width: `${v}%` }} transition={SOFT} style={{ height: "100%", borderRadius: 999, background: c }} />
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, color: "#3C4350", width: 28, textAlign: "right", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{v}%</span>
    </div>
  );
}

// ── 노드 위젯 ─────────────────────────────
function NodeWidget({ node, pods, expanded, dimFn, litFn, live, onOpen, onPod }: {
  node: (typeof NODES)[number]; pods: Pod[]; expanded: boolean; dimFn: (p: Pod) => boolean; litFn: (p: Pod) => boolean; live: (p: Pod) => number;
  onOpen: () => void; onPod: (p: Pod) => void;
}) {
  const np = pods.filter((p) => p.node === node.id);
  const act = np.filter((p) => p.status === "Running");
  const avgC = Math.round(act.reduce((s, p) => s + p.cpu, 0) / (act.length || 1));
  const avgM = Math.round(act.reduce((s, p) => s + p.mem, 0) / (act.length || 1));
  const hot = np.filter(isCrit).length;
  const span = spanOf(node.cap);
  const cols = expanded ? 10 : span * 5; // 한 칸당 5열 × 2행 = 10 파드
  return (
    <motion.div layoutId={`node-${node.id}`} transition={SPRING} onClick={expanded ? undefined : onOpen}
      style={{
        gridColumn: `span ${span}`, background: "#fff", borderRadius: 20, padding: expanded ? 22 : 14,
        boxShadow: expanded ? "0 32px 80px -24px rgba(10,14,20,0.35)" : "0 1px 2px rgba(10,14,20,0.05), 0 8px 24px -18px rgba(10,14,20,0.15)",
        cursor: expanded ? "default" : "pointer", display: "flex", flexDirection: "column", gap: expanded ? 14 : 10, minWidth: 0,
      }}
      whileHover={expanded ? undefined : { y: -2, boxShadow: "0 2px 4px rgba(10,14,20,0.05), 0 16px 36px -18px rgba(10,14,20,0.22)" }}
      className="widget">
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        {expanded && <span style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(10,108,255,0.09)", display: "grid", placeItems: "center", flexShrink: 0 }}><Server size={15} style={{ color: BLUE }} /></span>}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 7, minWidth: 0 }}>
            <span style={{ fontSize: expanded ? 16 : 12.5, fontWeight: 700, letterSpacing: "-0.02em", color: "#0B0E14", fontFamily: "ui-monospace, SFMono-Regular, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.id}</span>
          </div>
          <div style={{ fontSize: expanded ? 11.5 : 9.5, color: "#98A0AC", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{node.instance} · {node.zone} · Ready</div>
        </div>
        <span style={{ fontSize: expanded ? 12 : 10.5, fontWeight: 700, color: hot ? "#D2372E" : "#6B7280", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{hot > 0 && <span>⚠{hot} · </span>}{np.length}<span style={{ color: "#B9BFC9", fontWeight: 500 }}>/{node.cap}</span></span>
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <Gauge label="CPU" v={avgC} /><Gauge label="MEM" v={avgM} />
      </div>
      <motion.div layout style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: expanded ? 8 : 4 }}>
        {np.map((p) => <PodTile key={p.id} p={p} big={expanded} dim={dimFn(p)} lit={litFn(p)} live={live(p)} onClick={() => onPod(p)} />)}
        {Array.from({ length: node.cap - np.length }).map((_, i) => (
          <div key={`g${i}`} style={{ aspectRatio: "1", borderRadius: expanded ? 12 : 7, background: HP.ghost }} />
        ))}
      </motion.div>
    </motion.div>
  );
}

// ── 앱 ─────────────────────────────
function App() {
  const pods = useMemo(() => genPods(), []);
  const [tick, setTick] = useState(0);
  useEffect(() => { const iv = setInterval(() => setTick((t) => t + 1), 1500); return () => clearInterval(iv); }, []);
  const live = (p: Pod) => (p.status !== "Running" ? 0 : Math.round(Math.sin((tick + p.cpu + p.id.length * 3) * 1.1) * 3));

  const [openNode, setOpenNode] = useState<string | null>(null);
  const [focusPod, setFocusPod] = useState<Pod | null>(null);
  const [lens, setLens] = useState<Lens>(null);
  const [pin, setPin] = useState<Lens>(null);
  const mapRef = useRef<HTMLDivElement>(null);

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
  const openNodeObj = NODES.find((n) => n.id === openNode) || null;

  const selectPod = (p: Pod) => { setFocusPod((cur) => (cur?.id === p.id ? null : p)); };

  return (
    <div className="op">
      <div style={{ width: 1220, maxWidth: "100%", margin: "0 auto", padding: "30px 24px 40px" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: "-0.03em", color: "#0B0E14" }}>통합 맵</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, color: "#6B7280", background: "#fff", borderRadius: 999, padding: "5px 12px", boxShadow: "0 1px 2px rgba(10,14,20,0.06)" }}>
              <span className="pulsedot" style={{ width: 7, height: 7, borderRadius: 999, background: "#30B15C" }} />실시간 · {CLUSTERS.length} 클러스터 · {NODES.length} 노드 · {pods.length} 파드 · 임계 <b style={{ color: crit ? "#D2372E" : "#0B0E14" }}>{crit}</b>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, fontSize: 11, fontWeight: 500, color: "#6B7280" }}>
            {([["정상", HP.ok], ["경고", HP.warn], ["임계", HP.crit], ["대기", HP.pending], ["빈 슬롯", HP.ghost]] as const).map(([k, c]) => (
              <span key={k} style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3.5, background: c, boxShadow: "inset 0 0 0 1px rgba(10,14,20,0.05)" }} />{k}</span>
            ))}
          </div>
        </header>

        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div ref={mapRef} style={{ flex: 1, minWidth: 0, position: "relative", display: "flex", flexDirection: "column", gap: 18, paddingLeft: 26 }}>
            {effLens && !openNode && <SpineOverlay containerRef={mapRef} ids={[...related]} red={!!incident && !lens && !pin} />}
            <AnimatePresence>
              {effLens && (
                <motion.div key="chip" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={SOFT}
                  style={{ position: "absolute", top: -6, right: 0, zIndex: 10, display: "flex", alignItems: "center", gap: 7, background: incident && !lens && !pin ? "#FFECEA" : "#E8F0FF", borderRadius: 999, padding: "6px 13px", fontSize: 11.5, fontWeight: 700, color: incident && !lens && !pin ? "#D2372E" : BLUE, boxShadow: "0 2px 8px rgba(10,14,20,0.08)" }}>
                  {incident && !lens && !pin ? <Activity size={13} /> : effLens.kind === "svc" ? <Layers3 size={13} /> : effLens.kind === "cfg" ? <FileCog size={13} /> : <GitBranch size={13} />}
                  {incident && !lens && !pin ? `장애 조사 · ${incident.name}` : effLens.id}
                  <span style={{ fontWeight: 600, opacity: 0.65 }}>{related.size} 파드</span>
                  {pin && <button onClick={() => setPin(null)} style={{ border: "none", background: "rgba(10,14,20,0.08)", borderRadius: 999, width: 16, height: 16, cursor: "pointer", fontSize: 10, lineHeight: 1, color: "inherit" }}>✕</button>}
                </motion.div>
              )}
            </AnimatePresence>

            {CLUSTERS.map((cl) => {
              const cp = pods.filter((p) => p.cluster === cl.id);
              const chot = cp.filter(isCrit).length;
              return (
                <section key={cl.id}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "2px 4px 10px" }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: chot ? HP.crit : "#30B15C", alignSelf: "center" }} className={chot ? "pulsedot" : undefined} />
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em", color: "#0B0E14", fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>{cl.id}</h2>
                    <span style={{ fontSize: 11, fontWeight: 700, color: cl.env === "prod" ? "#B4540A" : "#4E6B8C", background: cl.env === "prod" ? "#FFF0E0" : "#EAF1F9", borderRadius: 999, padding: "2px 9px" }}>{cl.env}</span>
                    <span style={{ fontSize: 11.5, color: "#98A0AC" }}>{cl.region} · 파드 {cp.length}{chot ? ` · 임계 ${chot}` : ""}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
                    {NODES.filter((n) => n.cluster === cl.id).map((node) => (
                      openNode === node.id
                        ? <div key={node.id} style={{ gridColumn: `span ${spanOf(node.cap)}`, borderRadius: 20, background: "rgba(10,14,20,0.03)", minHeight: 120 }} />
                        : <NodeWidget key={node.id} node={node} pods={pods} expanded={false} dimFn={dimFn} litFn={litFn} live={live} onOpen={() => setOpenNode(node.id)} onPod={selectPod} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          <SidePanel pods={pods} focusPod={focusPod} setLens={setLens} pin={pin} setPin={setPin} effLens={effLens} clearPod={() => setFocusPod(null)} openNode={(id) => setOpenNode(id)} />
        </div>
      </div>

      <AnimatePresence>
        {openNodeObj && (
          <>
            <motion.div key="bk" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
              onClick={() => setOpenNode(null)}
              style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(10,14,20,0.32)", backdropFilter: "blur(8px)" }} />
            <div style={{ position: "fixed", inset: 0, zIndex: 41, display: "flex", alignItems: "center", justifyContent: "center", padding: 28, pointerEvents: "none" }}>
              <div style={{ width: 760, maxWidth: "100%", maxHeight: "88vh", overflowY: "auto", pointerEvents: "auto", position: "relative" }}>
                <button onClick={() => setOpenNode(null)} style={{ position: "absolute", top: 14, right: 14, zIndex: 2, width: 30, height: 30, borderRadius: 999, border: "none", background: "rgba(10,14,20,0.06)", color: "#6B7280", cursor: "pointer", display: "grid", placeItems: "center" }}><X size={15} /></button>
                <NodeWidget node={openNodeObj} pods={pods} expanded dimFn={dimFn} litFn={litFn} live={live} onOpen={() => {}} onPod={selectPod} />
              </div>
            </div>
          </>
        )}
      </AnimatePresence>

      <style>{`
        html, body { background: #F2F4F8; }
        .op { min-height: 100vh; background: #F2F4F8; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Pretendard", "Apple SD Gothic Neo", "Helvetica Neue", sans-serif; -webkit-font-smoothing: antialiased; }
        .op .tile.crit { animation: critp 1.2s ease-in-out infinite; }
        @keyframes critp { 0%,100% { filter: none; } 50% { filter: brightness(1.14) saturate(1.2); } }
        .pulsedot { animation: pd 1.4s ease-in-out infinite; }
        @keyframes pd { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
        .op ::-webkit-scrollbar { width: 8px; } .op ::-webkit-scrollbar-thumb { background: rgba(10,14,20,0.12); border-radius: 99px; }
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

  const Row = ({ l, icon, label, sub, dot, warn }: { l: Lens; icon?: React.ReactNode; label: string; sub: string; dot?: string; warn?: boolean }) => {
    const active = effLens && effLens.kind === l!.kind && effLens.id === l!.id;
    return (
      <motion.button whileTap={{ scale: 0.98 }} onMouseEnter={() => setLens(l)} onMouseLeave={() => setLens(null)}
        onClick={() => setPin(pin && pin.id === l!.id && pin.kind === l!.kind ? null : l)}
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: "none", background: active ? "rgba(10,108,255,0.08)" : "transparent", borderRadius: 12, padding: "9px 11px", cursor: "pointer", transition: "background .15s" }}>
        {dot ? <span style={{ width: 10, height: 10, borderRadius: 3.5, background: dot, flexShrink: 0 }} /> : icon}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, fontFamily: "ui-monospace, SFMono-Regular, monospace", color: "#0B0E14", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>{label}</div>
          <div style={{ fontSize: 10.5, color: warn ? "#C77700" : "#98A0AC", marginTop: 1 }}>{sub}</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: active ? BLUE : "#98A0AC", fontVariantNumeric: "tabular-nums" }}>{count(l)}</span>
      </motion.button>
    );
  };

  return (
    <aside style={{ width: 272, flexShrink: 0, background: "#fff", borderRadius: 20, boxShadow: "0 1px 2px rgba(10,14,20,0.05), 0 12px 32px -20px rgba(10,14,20,0.18)", padding: 16, display: "flex", flexDirection: "column", gap: 12, position: "sticky", top: 24, maxHeight: "calc(100vh - 60px)", overflowY: "auto" }}>
      <AnimatePresence mode="wait">
        {focusPod ? (
          <motion.div key={focusPod.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={SOFT} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <PodDetail pod={focusPod} setLens={setLens} setPin={setPin} clearPod={clearPod} openNode={openNode} />
          </motion.div>
        ) : (
          <motion.div key="lens" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={SOFT} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 800, letterSpacing: "-0.02em", color: "#0B0E14" }}>연결 보기</div>
              <div style={{ fontSize: 11, color: "#98A0AC", marginTop: 2 }}>올리면 지도에 연결이 그려집니다 · 클릭 = 고정</div>
            </div>
            <div style={{ display: "flex", gap: 4, background: "#F0F2F6", borderRadius: 11, padding: 3 }}>
              {([["svc", "서비스", Layers3], ["cfg", "설정", FileCog], ["git", "배포", GitBranch]] as const).map(([id, label, I]) => {
                const on = tab === id;
                return (
                  <button key={id} onClick={() => setTab(id)} style={{ position: "relative", flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "7px 0", borderRadius: 9, border: "none", background: "transparent", cursor: "pointer", fontSize: 11.5, fontWeight: 600, color: on ? "#0B0E14" : "#98A0AC" }}>
                    {on && <motion.span layoutId="ptab" transition={SOFT} style={{ position: "absolute", inset: 0, borderRadius: 9, background: "#fff", boxShadow: "0 1px 4px rgba(10,14,20,0.12)" }} />}
                    <span style={{ position: "relative", display: "flex", alignItems: "center", gap: 5 }}><I size={12} />{label}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {tab === "svc" && SERVICES.map((s) => <Row key={s.id} l={{ kind: "svc", id: s.id }} dot={s.color} label={s.id} sub={s.repo} />)}
              {tab === "cfg" && CONFIGS.map((c) => <Row key={c.id} l={{ kind: "cfg", id: c.id }} icon={<FileCog size={14} style={{ color: c.kind === "Secret" ? "#9D5CE8" : BLUE, flexShrink: 0 }} />} label={c.id} sub={c.kind} />)}
              {tab === "git" && REPOS.map((r) => <Row key={r} l={{ kind: "git", id: r }} icon={<GitBranch size={14} style={{ color: "#6B7280", flexShrink: 0 }} />} label={r} sub={`${REPO_META[r].tool} · ${REPO_META[r].rev} · ${REPO_META[r].sync}`} warn={REPO_META[r].sync === "OutOfSync"} />)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
}

function PodDetailLink({ l, icon, label, sub, onClick, setLens, setPin }: { l?: Lens; icon: React.ReactNode; label: string; sub: string; onClick?: () => void; setLens: (l: Lens) => void; setPin: (l: Lens) => void }) {
  return (
    <motion.button whileTap={{ scale: 0.98 }}
      onMouseEnter={l ? () => setLens(l) : undefined} onMouseLeave={l ? () => setLens(null) : undefined}
      onClick={onClick ?? (l ? () => setPin(l) : undefined)}
      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: "none", background: "#F7F8FB", borderRadius: 13, padding: "10px 12px", cursor: "pointer" }}>
      {icon}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 600, fontFamily: "ui-monospace, SFMono-Regular, monospace", color: "#0B0E14", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
        <div style={{ fontSize: 10, color: "#98A0AC", marginTop: 1 }}>{sub}</div>
      </div>
      <ChevronRight size={13} style={{ color: "#C4CAD3", flexShrink: 0 }} />
    </motion.button>
  );
}

function PodDetail({ pod, setLens, setPin, clearPod, openNode }: { pod: Pod; setLens: (l: Lens) => void; setPin: (l: Lens) => void; clearPod: () => void; openNode: (id: string) => void }) {
  const crit = isCrit(pod);
  const stColor = pod.status === "Running" ? "#1F9D4D" : crit ? "#D2372E" : "#6B7280";
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 36, height: 36, borderRadius: 11, background: `${SVC[pod.svc].color}18`, display: "grid", placeItems: "center", flexShrink: 0 }}><Box size={17} style={{ color: SVC[pod.svc].color }} /></span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, fontFamily: "ui-monospace, SFMono-Regular, monospace", letterSpacing: "-0.01em", color: "#0B0E14", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pod.name}</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: stColor, marginTop: 1 }}>{pod.status}{pod.restarts > 0 ? ` · 재시작 ${pod.restarts}` : ""}</div>
        </div>
        <button onClick={clearPod} style={{ width: 26, height: 26, borderRadius: 999, border: "none", background: "rgba(10,14,20,0.05)", color: "#98A0AC", cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}><X size={13} /></button>
      </div>
      {crit && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, background: "#FFECEA", borderRadius: 11, padding: "8px 11px", fontSize: 11, fontWeight: 700, color: "#D2372E" }}>
          <Activity size={13} /> 장애 조사 모드 — 이 파드의 연결이 지도에 표시됩니다
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 9, background: "#F7F8FB", borderRadius: 13, padding: "12px 13px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, fontWeight: 700, color: "#3C4350" }}><Cpu size={12} style={{ color: BLUE }} />건강 · 한도 대비</div>
        <Gauge label="CPU" v={pod.cpu} /><Gauge label="MEM" v={pod.mem} />
      </div>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: "#3C4350", display: "flex", alignItems: "center", gap: 6 }}><Activity size={12} style={{ color: BLUE }} />연결된 것들</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        <PodDetailLink l={{ kind: "svc", id: pod.svc }} icon={<span style={{ width: 10, height: 10, borderRadius: 3.5, background: SVC[pod.svc].color, flexShrink: 0 }} />} label={pod.svc} sub="서비스 · 형제 파드" setLens={setLens} setPin={setPin} />
        {(SVC_CFG[pod.svc] || []).map((c) => {
          const cfg = CONFIGS.find((x) => x.id === c)!;
          return <PodDetailLink key={c} l={{ kind: "cfg", id: c }} icon={<FileCog size={14} style={{ color: cfg.kind === "Secret" ? "#9D5CE8" : BLUE, flexShrink: 0 }} />} label={c} sub={cfg.kind} setLens={setLens} setPin={setPin} />;
        })}
        <PodDetailLink l={{ kind: "git", id: SVC[pod.svc].repo }} icon={<GitBranch size={14} style={{ color: "#6B7280", flexShrink: 0 }} />} label={SVC[pod.svc].repo} sub={`${REPO_META[SVC[pod.svc].repo].rev} · ${REPO_META[SVC[pod.svc].repo].sync}`} setLens={setLens} setPin={setPin} />
        <PodDetailLink icon={<Server size={14} style={{ color: "#6B7280", flexShrink: 0 }} />} label={pod.node} sub={`물리 노드 · ${pod.cluster}`} onClick={() => openNode(pod.node)} setLens={setLens} setPin={setPin} />
      </div>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);

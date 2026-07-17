/* eslint-disable react-hooks/exhaustive-deps */
// ⚠ 데모 · 라이브 클러스터 맵. 하나의 캔버스에서 클러스터→노드→파드 시맨틱 줌 + 실시간 갱신 + 트래픽 오버레이. 라이트모드. 더미.
import ReactDOM from "react-dom/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Box, Cpu, FileCog, Activity, ScrollText, ChevronRight, Maximize2, Radio } from "lucide-react";
import "./styles/tokens.css";
import "./styles/foundation.css";

const BLUE = "#2F5BFF";
const NODES = [
  { id: "ip-10-0-1-24", zone: "apne2-a", instance: "m5.xlarge" },
  { id: "ip-10-0-2-91", zone: "apne2-b", instance: "m5.xlarge" },
  { id: "ip-10-0-3-15", zone: "apne2-c", instance: "m5.2xlarge" },
];
const SERVICES = [
  { id: "shop-api", color: "#2F5BFF" }, { id: "shop-web", color: "#22C55E" }, { id: "checkout", color: "#F59E0B" },
  { id: "payments", color: "#EF4444" }, { id: "search", color: "#06B6D4" }, { id: "auth", color: "#A855F7" },
  { id: "redis", color: "#EC4899" }, { id: "gateway", color: "#3B82F6" }, { id: "notifier", color: "#F97316" }, { id: "worker", color: "#14B8A6" },
];
const SCOLOR = Object.fromEntries(SERVICES.map((s) => [s.id, s.color])) as Record<string, string>;
const SVC_CFG: Record<string, string[]> = { "shop-api": ["app-config", "redis-config"], "shop-web": ["app-config", "feature-flags"], checkout: ["app-config", "db-credentials"], payments: ["db-credentials"], search: ["app-config", "redis-config"], auth: ["db-credentials"], redis: ["redis-config"], gateway: ["tls-cert"], notifier: ["app-config"], worker: ["app-config"] };
const TRAFFIC: [string, string, number][] = [["gateway", "shop-web", 700], ["gateway", "shop-api", 950], ["shop-web", "shop-api", 420], ["shop-api", "checkout", 380], ["shop-api", "search", 260], ["shop-api", "auth", 300], ["shop-api", "redis", 640], ["checkout", "payments", 210], ["checkout", "notifier", 90], ["search", "redis", 240]];

type Status = "Running" | "OOMKilled" | "CrashLoopBackOff" | "Pending";
// cpu/mem = 한도(limit) 대비 사용률(%) — 건강도의 기준
type Pod = { id: string; name: string; node: string; svc: string; cpu: number; mem: number; cpuLimM: number; memLimMi: number; status: Status; restarts: number; ageMin: number; image: string };
const STCOLOR: Record<Status, string> = { Running: "#22C55E", OOMKilled: "#EF4444", CrashLoopBackOff: "#EF4444", Pending: "#9AA1AC" };
const CPU_LIMS = [250, 500, 1000], MEM_LIMS = [256, 512, 1024];
function makeRng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function genPods(): Pod[] {
  const r = makeRng(11); const pods: Pod[] = []; let k = 0;
  NODES.forEach((node) => {
    const count = 14 + Math.floor(r() * 7);
    for (let i = 0; i < count; i++) {
      const svc = SERVICES[Math.floor(r() * SERVICES.length)].id; const pending = r() < 0.03; const hot = r() < 0.08;
      let cpu = Math.floor(r() * 55) + 14, mem = Math.floor(r() * 52) + 20; if (hot) { cpu = 88 + Math.floor(r() * 11); mem = 90 + Math.floor(r() * 9); }
      const status: Status = pending ? "Pending" : hot ? (r() < 0.5 ? "OOMKilled" : "CrashLoopBackOff") : "Running";
      pods.push({ id: `p${k++}`, name: `${svc}-${Math.floor(r() * 900) + 100}-${["x7f", "q2d", "m9k", "b4t", "z1p"][Math.floor(r() * 5)]}`, node: node.id, svc, cpu: pending ? 0 : cpu, mem: pending ? 0 : mem, cpuLimM: CPU_LIMS[Math.floor(r() * 3)], memLimMi: MEM_LIMS[Math.floor(r() * 3)], status, restarts: status === "Running" ? 0 : 3 + Math.floor(r() * 8), ageMin: 8 + Math.floor(r() * 5000), image: `registry.opsia.io/${svc}:1.${Math.floor(r() * 18)}.${Math.floor(r() * 9)}` });
    }
  });
  return pods;
}
// 건강도 = 한도 대비 사용률(여유→임박) + 상태 오버라이드
const health = (p: Pod) => Math.max(p.cpu, p.mem);
const isCrit = (p: Pod) => p.status === "OOMKilled" || p.status === "CrashLoopBackOff";
const healthColor = (p: Pod) => (p.status === "Pending" ? "#C7CBD3" : isCrit(p) ? "#EF4444" : heat(health(p)));

// ── 영역(convex hull) 유틸 ─────────────────────────────
type Pt = { x: number; y: number };
function convexHull(pts: Pt[]): Pt[] {
  if (pts.length < 3) return pts;
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo: Pt[] = []; for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  const up: Pt[] = []; for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop(); return lo.concat(up);
}
function territoryPath(pts: Pt[], grow: number): string {
  if (pts.length < 3) { const c = pts[0] || { x: 0, y: 0 }; const rr = grow + 20; return `M ${c.x - rr} ${c.y} a ${rr} ${rr} 0 1 0 ${rr * 2} 0 a ${rr} ${rr} 0 1 0 ${-rr * 2} 0 Z`; }
  const h = convexHull(pts);
  const cx = h.reduce((s, q) => s + q.x, 0) / h.length, cy = h.reduce((s, q) => s + q.y, 0) / h.length;
  const e = h.map((q) => { const dx = q.x - cx, dy = q.y - cy, L = Math.hypot(dx, dy) || 1; return { x: q.x + (dx / L) * grow, y: q.y + (dy / L) * grow }; });
  const n = e.length; let d = `M ${(e[0].x + e[n - 1].x) / 2} ${(e[0].y + e[n - 1].y) / 2}`;
  for (let i = 0; i < n; i++) { const p0 = e[i], p1 = e[(i + 1) % n]; d += ` Q ${p0.x.toFixed(1)} ${p0.y.toFixed(1)}, ${((p0.x + p1.x) / 2).toFixed(1)} ${((p0.y + p1.y) / 2).toFixed(1)}`; }
  return d + " Z";
}
const NODE_TINT = ["rgba(47,91,255,0.05)", "rgba(6,182,212,0.055)", "rgba(245,158,11,0.06)"];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function heat(u: number): string {
  const st: [number, number[]][] = [[0, [96, 165, 250]], [30, [59, 130, 246]], [55, [45, 212, 191]], [72, [250, 204, 21]], [86, [249, 115, 22]], [100, [239, 68, 68]]];
  u = Math.max(0, Math.min(100, u));
  for (let i = 0; i < st.length - 1; i++) { const [u0, c0] = st[i], [u1, c1] = st[i + 1]; if (u <= u1) { const t = (u - u0) / (u1 - u0 || 1); return `rgb(${Math.round(lerp(c0[0], c1[0], t))},${Math.round(lerp(c0[1], c1[1], t))},${Math.round(lerp(c0[2], c1[2], t))})`; } }
  return "rgb(239,68,68)";
}
const age = (m: number) => (m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`);
function hexSpiral(n: number) { const out = [{ q: 0, r: 0 }]; const d = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]; for (let k = 1; out.length < n; k++) { let q = d[4][0] * k, r = d[4][1] * k; for (let s = 0; s < 6 && out.length < n; s++) for (let st = 0; st < k && out.length < n; st++) { out.push({ q, r }); q += d[s][0]; r += d[s][1]; } } return out.slice(0, n); }
const hpx = (q: number, r: number, s: number) => s * Math.sqrt(3) * (q + r / 2);
const hpy = (q: number, r: number, s: number) => s * 1.5 * r;
const hpts = (cx: number, cy: number, rad: number) => Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 180) * (60 * i - 30); return `${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`; }).join(" ");

const S = 22, PAD = 26, HEADER = 46, GAP = 96;
type Focus = { t: "cluster" } | { t: "node"; id: string } | { t: "pod"; id: string };
const CANVAS_W = 952, CANVAS_H = 560, ASPECT = CANVAS_W / CANVAS_H;
function fit(b: { x: number; y: number; w: number; h: number }) { let W = b.w, H = b.h; if (W / H < ASPECT) W = H * ASPECT; else H = W / ASPECT; return { x: b.x + b.w / 2 - W / 2, y: b.y + b.h / 2 - H / 2, w: W, h: H }; }

function App() {
  const [pods, setPods] = useState<Pod[]>(genPods);
  const [focus, setFocus] = useState<Focus>({ t: "cluster" });
  const [colorBy, setColorBy] = useState<"load" | "svc">("load");
  const [showTraffic, setShowTraffic] = useState(true);
  const [, setBeat] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);

  // 레이아웃 (파드 개수 고정 → 위치 고정)
  const layout = useMemo(() => {
    const nodeLayouts = NODES.map((node) => {
      const np = pods.filter((p) => p.node === node.id);
      const cells = hexSpiral(np.length);
      const rel = cells.map((c) => ({ x: hpx(c.q, c.r, S), y: hpy(c.q, c.r, S) }));
      const minX = Math.min(...rel.map((r) => r.x)) - S, maxX = Math.max(...rel.map((r) => r.x)) + S, minY = Math.min(...rel.map((r) => r.y)) - S, maxY = Math.max(...rel.map((r) => r.y)) + S;
      const hw = maxX - minX, hh = maxY - minY, rw = hw + PAD * 2, rh = hh + PAD + HEADER;
      return { node, np, rel, minX, maxX, minY, maxY, rw, rh, hh };
    });
    const offsets = nodeLayouts.map((_, index) =>
      nodeLayouts.slice(0, index).reduce((sum, region) => sum + region.rw + GAP, 0),
    );
    const regions = nodeLayouts.map(({ node, np, rel, minX, maxX, minY, maxY, rw, rh, hh }, index) => {
      const ox = offsets[index];
      const oy = 0, hcx = ox + rw / 2, hcy = oy + HEADER + PAD + hh / 2;
      const pp: Record<string, { x: number; y: number }> = {};
      np.forEach((p, i) => { pp[p.id] = { x: hcx + (rel[i].x - (minX + maxX) / 2), y: hcy + (rel[i].y - (minY + maxY) / 2) }; });
      return { node, x: ox, y: oy, w: rw, h: rh, ids: np.map((p) => p.id), pp };
    });
    const lastRegion = regions[regions.length - 1];
    const worldW = lastRegion ? lastRegion.x + lastRegion.w : 0, worldH = Math.max(...regions.map((r) => r.h));
    return { regions, worldW, worldH };
  }, [pods.length]);

  const posOf = (id: string) => { for (const r of layout.regions) if (r.pp[id]) return r.pp[id]; return { x: 0, y: 0 }; };
  const podById = (id: string) => pods.find((p) => p.id === id)!;
  const centroids = useMemo(() => { const m: Record<string, { x: number; y: number; n: number }> = {}; pods.forEach((p) => { const q = posOf(p.id); (m[p.svc] ||= { x: 0, y: 0, n: 0 }); m[p.svc].x += q.x; m[p.svc].y += q.y; m[p.svc].n++; }); Object.values(m).forEach((c) => { c.x /= c.n; c.y /= c.n; }); return m; }, [layout]);

  // 카메라 타깃
  const target = useMemo(() => {
    if (focus.t === "cluster") return fit({ x: -50, y: -60, w: layout.worldW + 100, h: layout.worldH + 90 });
    if (focus.t === "node") { const r = layout.regions.find((r) => r.node.id === focus.id)!; return fit({ x: r.x - 24, y: r.y - 30, w: r.w + 48, h: r.h + 48 }); }
    const q = posOf(focus.id); return fit({ x: q.x - 150, y: q.y - 90, w: 300, h: 220 });
  }, [focus, layout]);
  const targetRef = useRef(target);
  const camRef = useRef(target);
  useEffect(() => { targetRef.current = target; }, [target]);
  useEffect(() => {
    let raf = 0; const tick = () => { const c = camRef.current, t = targetRef.current; const k = 0.14; const n = { x: c.x + (t.x - c.x) * k, y: c.y + (t.y - c.y) * k, w: c.w + (t.w - c.w) * k, h: c.h + (t.h - c.h) * k }; camRef.current = n; svgRef.current?.setAttribute("viewBox", `${n.x.toFixed(1)} ${n.y.toFixed(1)} ${n.w.toFixed(1)} ${n.h.toFixed(1)}`); raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, []);

  // 실시간 갱신 + 이벤트 티커
  const [feed, setFeed] = useState<{ id: number; kind: "crit" | "ok"; msg: string }[]>([]);
  const feedId = useRef(0);
  useEffect(() => {
    const iv = setInterval(() => {
      const news: { kind: "crit" | "ok"; msg: string }[] = [];
      setPods((prev) => prev.map((p) => {
        if (p.status === "Pending") return p;
        const j = () => Math.random() * 16 - 8;
        let cpu = Math.max(6, Math.min(99, Math.round(p.cpu + j()))), mem = Math.max(8, Math.min(99, Math.round(p.mem + j())));
        let status = p.status, restarts = p.restarts;
        if (Math.random() < 0.03) {
          if (isCrit(p)) { status = "Running"; cpu = 40 + Math.floor(Math.random() * 20); mem = 45 + Math.floor(Math.random() * 20); news.push({ kind: "ok", msg: `${p.name} 복구됨 → Running` }); }
          else { status = Math.random() < 0.5 ? "OOMKilled" : "CrashLoopBackOff"; cpu = 90 + Math.floor(Math.random() * 9); mem = 92 + Math.floor(Math.random() * 7); restarts = p.restarts + 1; news.push({ kind: "crit", msg: `${p.name} ${status}` }); }
        }
        return { ...p, cpu, mem, status, restarts };
      }));
      if (news.length) setFeed((f) => [...news.map((n) => ({ ...n, id: feedId.current++ })), ...f].slice(0, 3));
      setBeat((b) => b + 1);
    }, 1400);
    return () => clearInterval(iv);
  }, []);

  const crit = pods.filter(isCrit).length;
  const focusPod = focus.t === "pod" ? podById(focus.id) : null;
  const focusNode = focus.t === "node" ? focus.id : null;
  const fillOf = (p: Pod) => (colorBy === "load" ? healthColor(p) : p.status === "Pending" ? "#C7CBD3" : SCOLOR[p.svc]);

  const crumbs: { label: string; f: Focus }[] = [{ label: "cluster-2", f: { t: "cluster" } }];
  if (focus.t === "node") crumbs.push({ label: focus.id, f: focus });
  if (focus.t === "pod") { crumbs.push({ label: focusPod!.node, f: { t: "node", id: focusPod!.node } }); crumbs.push({ label: focusPod!.name, f: focus }); }

  return (
    <div className="lv" style={{ minHeight: "100vh", padding: "36px 24px", display: "flex", justifyContent: "center" }}>
      <div style={{ width: 992, maxWidth: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", color: "#111318", display: "flex", alignItems: "center", gap: 10 }}>
              라이브 클러스터 맵
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "#EF4444", background: "rgba(239,68,68,0.1)", padding: "3px 9px", borderRadius: 999 }}><span className="pulse" style={{ width: 7, height: 7, borderRadius: 999, background: "#EF4444" }} />LIVE</span>
            </div>
            {/* 브레드크럼 */}
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8 }}>
              {crumbs.map((c, i) => (
                <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {i > 0 && <ChevronRight size={13} style={{ color: "#C3CAD5" }} />}
                  <button onClick={() => setFocus(c.f)} style={{ background: i === crumbs.length - 1 ? "#EEF2FF" : "transparent", border: "none", borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "ui-monospace,monospace", color: i === crumbs.length - 1 ? BLUE : "#8A93A0" }}>{c.label}</button>
                </span>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setShowTraffic((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 6, background: showTraffic ? "#EEF2FF" : "#F2F3F7", border: "none", borderRadius: 10, padding: "8px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: showTraffic ? BLUE : "#8A93A0" }}><Radio size={14} />트래픽</button>
            <div style={{ display: "flex", gap: 4, background: "#F2F3F7", borderRadius: 11, padding: 4 }}>
              {([["load", "건강도"], ["svc", "서비스"]] as const).map(([id, l]) => { const on = colorBy === id; return <button key={id} onClick={() => setColorBy(id)} style={{ position: "relative", padding: "7px 13px", borderRadius: 8, border: "none", background: "transparent", cursor: "pointer" }}>{on && <motion.span layoutId="lsw" style={{ position: "absolute", inset: 0, borderRadius: 8, background: BLUE }} transition={{ type: "spring", visualDuration: 0.25, bounce: 0.18 }} />}<span style={{ position: "relative", fontSize: 12, fontWeight: 600, color: on ? "#fff" : "#565E6B" }}>{l}</span></button>; })}
            </div>
            <button onClick={() => setFocus({ t: "cluster" })} style={{ display: "flex", alignItems: "center", gap: 6, background: "#F2F3F7", border: "none", borderRadius: 10, padding: "8px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#565E6B" }}><Maximize2 size={14} />전체</button>
          </div>
        </div>

        <div style={{ position: "relative", background: "#fff", border: "1px solid rgba(17,19,24,0.06)", borderRadius: 22, boxShadow: "0 24px 60px -28px rgba(17,19,24,0.22), 0 2px 6px rgba(17,19,24,0.04)", overflow: "hidden" }}>
          <svg ref={svgRef} width="100%" height={CANVAS_H} viewBox={`${target.x} ${target.y} ${target.w} ${target.h}`} style={{ display: "block", background: "radial-gradient(circle at 30% 20%, rgba(47,91,255,0.04), transparent 60%)" }} onClick={() => setFocus({ t: "cluster" })}>
            <defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0.42" /><stop offset="0.5" stopColor="#fff" stopOpacity="0.08" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient></defs>

            {/* 노드 = 영역(territory) */}
            {layout.regions.map((r) => {
              const np = pods.filter((p) => p.node === r.node.id); const act = np.filter((p) => p.status !== "Pending");
              const avg = Math.round(act.reduce((s, p) => s + health(p), 0) / (act.length || 1)); const hot = np.filter(isCrit).length;
              const on = focusNode === r.node.id || (focus.t === "pod" && focusPod!.node === r.node.id);
              const idx = NODES.findIndex((n) => n.id === r.node.id);
              const hullPts = r.ids.map((id) => posOf(id));
              const cxx = hullPts.reduce((s, p) => s + p.x, 0) / hullPts.length;
              const labelY = Math.min(...hullPts.map((p) => p.y)) - S - 28;
              return (
                <g key={r.node.id} onClick={(e) => { e.stopPropagation(); setFocus({ t: "node", id: r.node.id }); }} style={{ cursor: "pointer" }}>
                  <path d={territoryPath(hullPts, S + 16)} fill={on ? "rgba(47,91,255,0.08)" : NODE_TINT[idx % 3]} stroke={on ? BLUE : "rgba(17,19,24,0.13)"} strokeWidth={on ? 2.5 : 1.5} />
                  <text x={cxx} y={labelY} textAnchor="middle" fontSize="14" fontWeight="700" fill="#111318" fontFamily="ui-monospace,monospace">{r.node.id}</text>
                  <text x={cxx} y={labelY + 16} textAnchor="middle" fontSize="11" fill="#9AA1AC">{r.node.instance} · {r.node.zone} · {np.length} pods · 평균 {avg}%{hot ? ` · 핫스팟 ${hot}` : ""}</text>
                </g>
              );
            })}

            {/* 트래픽 오버레이 */}
            {showTraffic && TRAFFIC.map(([a, b, rps]) => {
              const ca = centroids[a], cb = centroids[b]; if (!ca || !cb) return null;
              const mx = (ca.x + cb.x) / 2, my = (ca.y + cb.y) / 2 - 40;
              const d = `M ${ca.x} ${ca.y} Q ${mx} ${my}, ${cb.x} ${cb.y}`; const w = Math.max(1.2, Math.min(6, rps / 190));
              const tgtCrit = pods.some((p) => p.svc === b && isCrit(p)); const col = tgtCrit ? "#EF4444" : "#9DB0D8";
              return <g key={`${a}-${b}`} style={{ opacity: 0.7 }}><path d={d} fill="none" stroke={col} strokeWidth={w} strokeOpacity={0.35} strokeLinecap="round" /><path d={d} fill="none" stroke={col} strokeWidth={w} strokeLinecap="round" strokeDasharray="2 10" className="flow" style={{ animationDuration: `${Math.max(0.6, 1.6 - rps / 1000)}s` }} /></g>;
            })}

            {/* 파드 */}
            {pods.map((p) => {
              const q = posOf(p.id); const pts = hpts(q.x, q.y, S - 1);
              const dim = (focus.t === "node" && p.node !== focus.id) || (focus.t === "pod" && p.id !== focus.id);
              const foc = focus.t === "pod" && p.id === focus.id;
              // 시맨틱 줌: 노드로 들어가면 각 파드에 서비스 라벨이 나타남
              const showLabel = (focus.t === "node" && p.node === focus.id) || foc;
              return (
                <g key={p.id} onClick={(e) => { e.stopPropagation(); setFocus({ t: "pod", id: p.id }); }} style={{ cursor: "pointer", opacity: dim ? 0.22 : 1, transition: "opacity .3s" }} className="hx">
                  <polygon points={pts} fill={fillOf(p)} stroke={foc ? BLUE : "#fff"} strokeWidth={foc ? 3 : 1.7} strokeLinejoin="round" />
                  <polygon points={pts} fill="url(#lg)" strokeLinejoin="round" style={{ pointerEvents: "none" }} />
                  {isCrit(p) && <polygon points={pts} fill="none" stroke="#EF4444" strokeWidth={2.6} strokeLinejoin="round" className="critpulse" style={{ pointerEvents: "none" }} />}
                  {showLabel && <text x={q.x} y={q.y + 2.5} textAnchor="middle" fontSize="6.2" fontWeight="700" fill="rgba(255,255,255,0.95)" style={{ pointerEvents: "none", textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}>{p.svc}</text>}
                  {showLabel && <text x={q.x} y={q.y + 9.5} textAnchor="middle" fontSize="4.6" fontWeight="500" fill="rgba(255,255,255,0.8)" style={{ pointerEvents: "none" }}>{p.status === "Running" ? `${health(p)}%` : p.status}</text>}
                </g>
              );
            })}
          </svg>

          {/* 하단 상태바 */}
          <div style={{ position: "absolute", left: 16, bottom: 14, display: "flex", gap: 14, alignItems: "center", fontSize: 11.5, color: "#8A93A0", background: "rgba(255,255,255,0.85)", backdropFilter: "blur(6px)", padding: "7px 12px", borderRadius: 11, border: "1px solid rgba(17,19,24,0.06)" }}>
            {colorBy === "load" ? <span style={{ display: "flex", alignItems: "center", gap: 7 }}>여유<span style={{ width: 90, height: 7, borderRadius: 999, background: "linear-gradient(90deg,#60A5FA,#3B82F6,#2DD4BF,#FACC15,#F97316,#EF4444)" }} />한도 임박</span>
              : <span>색 = 서비스</span>}
            <span style={{ color: "#C3CAD5" }}>|</span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span className="pulse" style={{ width: 7, height: 7, borderRadius: 999, background: "#22C55E" }} />실시간 · {NODES.length}노드 {pods.length}파드 · 임계 <b style={{ color: crit ? "#EF4444" : "#111318" }}>{crit}</b></span>
          </div>
          {focus.t === "cluster" && <div style={{ position: "absolute", right: 16, bottom: 14, fontSize: 11.5, color: "#B4BBC6" }}>노드/파드를 클릭하면 그 안으로 줌인합니다</div>}

          {/* 실시간 이벤트 티커 */}
          {focus.t !== "pod" && (
            <div style={{ position: "absolute", top: 14, right: 16, display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", pointerEvents: "none" }}>
              <AnimatePresence>
                {feed.map((e) => (
                  <motion.div key={e.id} initial={{ opacity: 0, x: 30, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={{ type: "spring", visualDuration: 0.32, bounce: 0.2 }}
                    style={{ display: "flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,0.92)", backdropFilter: "blur(8px)", border: `1px solid ${e.kind === "crit" ? "rgba(239,68,68,0.25)" : "rgba(34,197,94,0.25)"}`, borderRadius: 10, padding: "6px 11px", boxShadow: "0 6px 16px -6px rgba(17,19,24,0.15)" }}>
                    <span className={e.kind === "crit" ? "pulse" : ""} style={{ width: 7, height: 7, borderRadius: 999, background: e.kind === "crit" ? "#EF4444" : "#22C55E", flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 600, fontFamily: "ui-monospace,monospace", color: e.kind === "crit" ? "#B91C1C" : "#15803D" }}>{e.msg}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* 상세 패널 */}
          <AnimatePresence>
            {focusPod && <DetailPanel key={focusPod.id} pod={focusPod} onClose={() => setFocus({ t: "node", id: focusPod.node })} />}
          </AnimatePresence>
        </div>
      </div>

      <style>{`
        .lv { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Pretendard", "Apple SD Gothic Neo", "Helvetica Neue", sans-serif; }
        .lv .hx:hover polygon:first-child { filter: brightness(1.12); }
        .lv .flow { animation: flowmove linear infinite; }
        @keyframes flowmove { to { stroke-dashoffset: -24; } }
        .pulse { animation: pl 1.2s ease-in-out infinite; }
        @keyframes pl { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .35; transform: scale(.65); } }
        .critpulse { animation: cp 1.1s ease-in-out infinite; }
        @keyframes cp { 0%,100% { opacity: 1; } 50% { opacity: .3; } }
        @media (prefers-reduced-motion: reduce) { .flow,.pulse,.critpulse { animation: none !important; } }
      `}</style>
    </div>
  );
}

function Bar({ label, v, sub, detail }: { label: string; v: number; sub?: string; detail?: string }) {
  return <div><div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}><span style={{ color: "#8A93A0" }}>{label} <span style={{ color: "#B4BBC6" }}>(한도 대비)</span></span><span style={{ fontWeight: 700, color: "#111318" }}>{v}%{detail && <span style={{ color: "#9AA1AC", fontWeight: 500 }}> · {detail}</span>}{sub && <span style={{ color: "#EF4444", fontWeight: 600 }}> {sub}</span>}</span></div><div style={{ height: 8, borderRadius: 999, background: "rgba(17,19,24,0.06)", overflow: "hidden" }}><motion.div animate={{ width: `${v}%` }} transition={{ duration: 0.6 }} style={{ height: "100%", borderRadius: 999, background: heat(v) }} /></div></div>;
}
function DetailPanel({ pod, onClose }: { pod: Pod; onClose: () => void }) {
  const crit = isCrit(pod);
  const events = pod.status === "OOMKilled" ? [["OOMKilled", "메모리 한도(512Mi) 초과 · 강제 종료", "방금", "#EF4444"], ["BackOff", "실패 컨테이너 재시작 대기", "1m 전", "#F59E0B"], ["Unhealthy", "Liveness probe 실패", "40s 전", "#F59E0B"]]
    : pod.status === "CrashLoopBackOff" ? [["BackOff", "CrashLoopBackOff · 재시작 반복", "방금", "#EF4444"], ["Failed", "종료 코드 1", "2m 전", "#EF4444"]]
      : [["Started", "컨테이너 시작됨", `${age(pod.ageMin)} 전`, "#22C55E"], ["Pulled", "이미지 pull 완료", `${age(pod.ageMin)} 전`, "#22C55E"]];
  return (
    <motion.div initial={{ x: 340, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 340, opacity: 0 }} transition={{ type: "spring", visualDuration: 0.36, bounce: 0.16 }}
      style={{ position: "absolute", top: 12, right: 12, bottom: 12, width: 320, background: "#fff", border: "1px solid rgba(17,19,24,0.08)", borderRadius: 18, boxShadow: "0 20px 50px -18px rgba(17,19,24,0.3)", padding: 16, overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: `${SCOLOR[pod.svc]}1A`, display: "grid", placeItems: "center", flexShrink: 0 }}><Box size={18} style={{ color: SCOLOR[pod.svc] }} /></span>
        <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontFamily: "ui-monospace,monospace", fontSize: 13, fontWeight: 700, color: "#111318", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pod.name}</div><div style={{ fontSize: 11, color: "#8A93A0" }}>{pod.svc} · {pod.node}</div></div>
        <button onClick={onClose} style={{ border: "none", background: "#F2F3F7", borderRadius: 8, width: 26, height: 26, cursor: "pointer", color: "#8A93A0", fontSize: 15 }}>×</button>
      </div>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: `${STCOLOR[pod.status]}18`, color: STCOLOR[pod.status], fontWeight: 700, fontSize: 12, padding: "5px 11px", borderRadius: 999, marginBottom: 14 }}><span className={crit ? "pulse" : ""} style={{ width: 7, height: 7, borderRadius: 999, background: STCOLOR[pod.status] }} />{pod.status}<span style={{ color: "#9AA1AC", fontWeight: 500 }}>· 재시작 {pod.restarts}</span></span>
      <div style={{ display: "grid", gap: 14 }}>
        <Section icon={Cpu} title="리소스 · 실시간"><div style={{ display: "grid", gap: 11 }}><Bar label="CPU" v={pod.cpu} detail={`${Math.round(pod.cpu / 100 * pod.cpuLimM)}m / ${pod.cpuLimM}m`} sub={crit ? "· 임박" : undefined} /><Bar label="메모리" v={pod.mem} detail={`${Math.round(pod.mem / 100 * pod.memLimMi)}Mi / ${pod.memLimMi}Mi`} sub={pod.status === "OOMKilled" ? "· 초과" : undefined} /></div></Section>
        <Section icon={FileCog} title="설정"><div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{(SVC_CFG[pod.svc] || []).map((c) => { const secret = c.includes("cred") || c.includes("cert"); return <span key={c} style={{ fontSize: 11, fontFamily: "ui-monospace,monospace", fontWeight: 600, color: "#111318", background: secret ? "#F7F0FE" : "#EEF2FF", border: `1px solid ${secret ? "#A855F7" : BLUE}30`, borderRadius: 8, padding: "4px 8px" }}>{c}</span>; })}</div><div style={{ fontSize: 11, color: "#9AA1AC", marginTop: 8, fontFamily: "ui-monospace,monospace" }}>{pod.image}</div></Section>
        <Section icon={Activity} title="이벤트"><div style={{ display: "grid", gap: 8 }}>{events.map(([k, m, t, c], i) => <div key={i} style={{ display: "flex", gap: 8, alignItems: "start" }}><span style={{ width: 6, height: 6, borderRadius: 999, background: c as string, marginTop: 5, flexShrink: 0 }} /><div><span style={{ fontSize: 11.5, fontWeight: 700, color: "#111318" }}>{k}</span> <span style={{ fontSize: 11, color: "#565E6B" }}>{m}</span><div style={{ fontSize: 10, color: "#B4BBC6" }}>{t}</div></div></div>)}</div></Section>
        <Section icon={ScrollText} title="로그"><pre style={{ margin: 0, background: "#F4F6FA", borderRadius: 10, padding: "10px 12px", fontFamily: "ui-monospace,monospace", fontSize: 10.5, lineHeight: 1.7, color: crit ? "#7F1D1D" : "#3A4658", overflowX: "auto", whiteSpace: "pre" }}>{(crit ? ["level=error msg=\"out of memory\"", "signal: killed (OOM)", "restarting container..."] : ["level=info path=/health 200 3ms", `level=info connected svc=${pod.svc}`, "level=info heartbeat ok"]).join("\n")}</pre></Section>
      </div>
    </motion.div>
  );
}
function Section({ icon: I, title, children }: { icon: typeof Cpu; title: string; children: React.ReactNode }) {
  return <div><div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 9 }}><I size={13} style={{ color: BLUE }} /><span style={{ fontSize: 12, fontWeight: 700, color: "#111318" }}>{title}</span></div>{children}</div>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(<div style={{ minHeight: "100vh", background: "#EDF0F5" }}><App /></div>);

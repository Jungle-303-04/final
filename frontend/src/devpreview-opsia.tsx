/* eslint-disable react-hooks/exhaustive-deps */
// ⚠ 데모 · Opsia 통합 맵 v4 — 프로덕션 그레이드 재설계.
// 원칙: 뉴트럴 표면 + 헤어라인, 색은 데이터에만, 모노 숫자, 4pt 그리드, 절제된 물리 모션.
// 구조: 클러스터(리스트) → 노드(위젯 그리드) → 파드(페이지 드릴). 연결 = 블루 하이라이트.
import ReactDOM from "react-dom/client";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";
import { Box, ChevronRight, ChevronLeft, X, Plug, FileCog, Cpu, Activity, Server, Globe, Braces, ShoppingCart, CreditCard, Search, KeyRound, Network } from "lucide-react";
import { readDevpreviewOpsiaPin } from "./features/filters/devpreviewDeepLinks";
import { UI, BLUE, HP, TINT, MONO, TYPE, SOFT, SPRING, PAGE, PRESENT_SCALE, DUR, inkA, blueA, LINE3, INK4, INSET, IDENT, BRAND, cardA } from "./devpreview/theme";
import { AwsIcon, RedisIcon, GithubIcon } from "./devpreview/brandIcons";
import "./styles/tokens.css";
import "./styles/foundation.css";

// GitHub 마크 (인라인 SVG)
// Redis 공식 로고 (Simple Icons)

// Amazon EKS 공식 로고 (Simple Icons)

// ── 디자인 토큰 ─────────────────────────────
// 상태 팔레트 — 플릿 뷰에서 검증된 톤(애플 시스템 컬러 계열)

// ── 도메인 ─────────────────────────────
const CLUSTERS = [
  { id: "prod-eks", env: "prod", region: "ap-northeast-2", platform: "Amazon EKS" },
  { id: "dev-eks", env: "dev", region: "ap-northeast-2", platform: "Amazon EKS" },
];
// state: Ready(가동) · Provisioning(예약됨 — 아직 스케줄 불가) · Cordoned(비활성)
type NodeState = "Ready" | "Provisioning" | "Cordoned";
const NODES: { id: string; cluster: string; zone: string; instance: string; cap: number; state: NodeState }[] = [
  { id: "ip-10-0-1-24", cluster: "prod-eks", zone: "apne2-a", instance: "m5.xlarge", cap: 20, state: "Ready" },
  { id: "ip-10-0-2-91", cluster: "prod-eks", zone: "apne2-b", instance: "m5.xlarge", cap: 20, state: "Ready" },
  { id: "ip-10-0-3-15", cluster: "prod-eks", zone: "apne2-c", instance: "m5.2xlarge", cap: 30, state: "Ready" },
  { id: "ip-10-0-4-63", cluster: "prod-eks", zone: "apne2-a", instance: "m5.xlarge", cap: 20, state: "Provisioning" },
  { id: "ip-10-1-0-11", cluster: "dev-eks", zone: "apne2-a", instance: "t3.large", cap: 10, state: "Ready" },
  { id: "ip-10-1-0-42", cluster: "dev-eks", zone: "apne2-b", instance: "t3.large", cap: 10, state: "Cordoned" },
];
// 노드 정렬: 가동(0) → 예약됨(1) → 비활성(2) — 아직 못 쓰는 노드는 뒤로
const nodeRank = (n: { state: NodeState }) => (n.state === "Ready" ? 0 : n.state === "Provisioning" ? 1 : 2);
const nodeIdle = (n: { state: NodeState }) => n.state !== "Ready";
const SERVICES = [
  { id: "shop-api", color: BLUE, repo: "Jungle-303-04/final", ns: "shop", kind: "Deployment" },
  { id: "shop-web", color: HP.ok, repo: "Jungle-303-04/final", ns: "shop", kind: "Deployment" },
  { id: "checkout", color: HP.warn, repo: "Jungle-303-04/final", ns: "shop", kind: "Deployment" },
  { id: "payments", color: HP.crit, repo: "Jungle-303-04/final", ns: "shop", kind: "Deployment" },
  { id: "search", color: IDENT.teal, repo: "Jungle-303-04/final", ns: "shop", kind: "Deployment" },
  { id: "auth", color: TINT.purple.fg, repo: "opsia/platform", ns: "platform", kind: "Deployment" },
  { id: "redis", color: IDENT.ruby, repo: "opsia/platform", ns: "platform", kind: "StatefulSet" },
  { id: "gateway", color: IDENT.indigo, repo: "opsia/platform", ns: "platform", kind: "Deployment" },
  { id: "worker", color: IDENT.jade, repo: "opsia/platform", ns: "platform", kind: "Deployment" },
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
    if (node.state !== "Ready") return; // 예약·비활성 노드엔 파드가 배치되지 않는다
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
const pct = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
const spanOf = (cap: number) => Math.min(3, Math.max(1, Math.ceil(cap / 10)));
// 정렬 랭크: 임계(0) → 실행 중(1) → 대기·미할당(2)
const rank = (p: Pod) => (isCrit(p) ? 0 : p.status === "Pending" ? 2 : 1);

// ── 셸 통합용 인벤토리 — 맵과 리소스 표가 '같은 세계'를 공유하기 위한 단일 데이터 소스
export type PodInv = { name: string; ns: string; svc: string; ownerKind: string; cfgs: string[]; status: Status; cpu: number; mem: number; restarts: number; cluster: string; node: string; bad: boolean; qos: string };
export function podInventory(): PodInv[] {
  return genPods().map((p) => ({
    name: p.name, ns: SVC[p.svc].ns, svc: p.svc, ownerKind: SVC[p.svc].kind, cfgs: SVC_CFG[p.svc] || [],
    status: p.status, cpu: p.cpu, mem: p.mem, restarts: p.restarts, cluster: p.cluster, node: p.node,
    bad: isCrit(p), qos: qosOf(p),
  }));
}
export function repoInventory() {
  return REPOS.map((r) => ({ repo: r, ...REPO_META[r] }));
}
// 서비스 카탈로그 — 배포(애플리케이션) 서피스가 앱 목록을 같은 세계에서 파생한다
export function svcCatalog() {
  return Object.entries(SVC).map(([id, m]) => ({ ...m, id }));
}
export type NodeInv = { id: string; cluster: string; zone: string; instance: string; cap: number; state: NodeState; podCount: number; cpu: number; mem: number };
export function nodeInventory(): NodeInv[] {
  const pods = genPods();
  return NODES.map((n) => {
    const on = pods.filter((p) => p.node === n.id);
    const avg = (f: (p: Pod) => number) => (on.length ? Math.round(on.reduce((s, p) => s + f(p), 0) / on.length) : 0);
    return { ...n, podCount: on.length, cpu: avg((p) => p.cpu), mem: avg((p) => p.mem) };
  });
}

type Lens = { kind: "svc" | "cfg" | "git" | "crit"; id: string } | null;
type View = { level: "clusters" } | { level: "nodes"; cluster: string } | { level: "pods"; cluster: string; node: string };

// ── 파드 타일: 강도 램프 (호스트 맵 / 기여 잔디 방식)
// 상태 = 색상(그린/오렌지/레드), 사용률 = 같은 색의 진하기. 형태는 고정, 색만 부드럽게 변한다.
function PodTile({ p, big, dim, lit, live, onClick, onTip }: { p: Pod; big: boolean; dim: boolean; lit: boolean; live: number; onClick: () => void; onTip: (x: number, y: number, pods: Pod[] | null) => void }) {
  const cpuV = p.status === "Pending" ? 0 : Math.max(3, Math.min(99, p.cpu + live));
  const c = healthColor(p);
  // 강도 램프: 뉴트럴 → 상태색. 플릿 뷰와 같은 구간(22~88%)으로 저부하도 또렷하게.
  const mix = p.status === "Pending" ? 0 : isCrit(p) ? 100 : Math.round(22 + (cpuV / 100) * 66);
  const bg = p.status === "Pending" ? INSET : `color-mix(in srgb, ${c} ${mix}%, ${INSET})`;
  return (
    <motion.button layout data-pod={p.id} onClick={(e) => { e.stopPropagation(); onClick(); }}
      initial={false}
      animate={{ opacity: dim ? 0.15 : 1, scale: 1 }} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.96 }} transition={SOFT}
      onMouseEnter={(e) => onTip(e.clientX, e.clientY, [p])} onMouseMove={(e) => onTip(e.clientX, e.clientY, [p])} onMouseLeave={() => onTip(0, 0, null)}
      className={isCrit(p) ? "tile crit" : "tile"}
      style={{
        aspectRatio: "1", border: "none", borderRadius: big ? 5 : 3, cursor: "pointer", position: "relative", overflow: "hidden",
        background: bg, transition: "background 1.2s ease",
        boxShadow: lit ? `0 0 0 1.5px ${UI.card}, 0 0 0 2.5px ${BLUE}` : p.status === "Pending" ? `inset 0 0 0 1px ${inkA(0.07)}` : "none",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 0, minWidth: 0,
      }}>
      {/* 이름은 그룹 헤더가 전담. 예외: 대기(생성 중)는 스피너로 진행 중임을 표기 */}
      {p.status === "Pending" && (
        <span className="podspin" style={{ width: big ? 13 : 8, height: big ? 13 : 8, borderRadius: 999, border: `1.5px solid ${inkA(0.14)}`, borderTopColor: UI.ink3, boxSizing: "border-box" }} />
      )}
    </motion.button>
  );
}

// ── 부드럽게 카운트되는 숫자 (틱 주기에 맞춰 ~1.4초 글라이드) ─────────────────────────────
function Num({ v }: { v: number }) {
  const mv = useMotionValue(v);
  const [disp, setDisp] = useState(v);
  useEffect(() => {
    const ctl = animate(mv, v, { duration: DUR.count, ease: "easeInOut", onUpdate: (x) => setDisp(Math.round(x)) });
    return () => ctl.stop();
  }, [v]);
  return <>{disp}</>;
}

// ── 게이지: 갱신 주기 동안 미끄러지듯 따라가는 계기 ─────────────────────────────
function Gauge({ label, v }: { label: string; v: number }) {
  const value = pct(v);
  const c = value >= 90 ? HP.crit : value >= 75 ? HP.warn : HP.ok;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
      <span style={{ fontSize: TYPE.micro, fontWeight: 600, letterSpacing: "0.06em", color: UI.ink3, width: 30, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 4, borderRadius: 999, background: inkA(0.06), overflow: "hidden" }}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${value}%` }}
          transition={{ duration: DUR.count, ease: "easeInOut" }}
          style={{ height: "100%", borderRadius: 999, background: c, transition: "background .6s ease" }} />
      </div>
      <span style={{ width: 34, textAlign: "right", flexShrink: 0, fontSize: TYPE.label, fontWeight: 600, color: UI.ink, fontVariantNumeric: "tabular-nums", fontFamily: MONO }}>
        <Num v={value} /><span style={{ color: UI.ink3, fontSize: TYPE.micro }}>%</span>
      </span>
    </div>
  );
}

// ── 스파크라인 — Catmull-Rom 스플라인으로 부드럽게 + 그라데이션 면 ─────────────────────────────
// (이전엔 직선 세그먼트라 각져 보였음)
function smoothPath(pts: { x: number; y: number }[]) {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

function Spark({ id, base, tick, h = 22, color = HP.ok }: { id: string; base: number; tick: number; h?: number; color?: string }) {
  const hsh = id.split("").reduce((s, ch) => s + ch.charCodeAt(0), 0);
  const W = 100, N = 36, PAD = 2.5;
  const gid = `sg-${id.replace(/[^a-zA-Z0-9]/g, "")}`;
  const vals = Array.from({ length: N }, (_, i) => {
    const x = tick - (N - 1) + i;
    return Math.max(3, Math.min(97, base + 8 * Math.sin(x * 0.42 + hsh) + 4.5 * Math.sin(x * 0.19 + hsh * 1.7) + 2 * Math.sin(x * 0.83 + hsh * 0.4)));
  });
  const pts = vals.map((v, i) => ({ x: (i / (N - 1)) * W, y: PAD + (1 - v / 100) * (h - PAD * 2) }));
  const line = smoothPath(pts);
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${h}`} width="100%" height={h} preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0.015} />
        </linearGradient>
      </defs>
      <path d={`${line} L ${W} ${h} L 0 ${h} Z`} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last.x} cy={last.y} r={1.8} fill={color} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ── 파드 표 행: 상태칩 · 이름 · 부하 · 재시작 · 나이 → 클릭 시 상세 ─────────────────────────────
// 이름 칸에 최소 폭을 보장해야 짜부라지지 않는다 (이미지 태그는 툴팁으로 이동)
const PODCOLS = "14px minmax(148px,1.6fr) 46px 82px 78px 78px 42px 38px 60px";
const hashOf = (p: Pod) => p.id.split("").reduce((s, ch) => s + ch.charCodeAt(0), 0);
const ageOf = (p: Pod) => { const h = hashOf(p) % 220; return h < 24 ? `${h + 1}h` : `${Math.floor(h / 24)}d`; };
const readyOf = (p: Pod) => (p.status === "Running" ? "1/1" : p.status === "Pending" ? "0/1" : "0/1");
const qosOf = (p: Pod) => (["Guaranteed", "Burstable", "BestEffort"] as const)[hashOf(p) % 3];
const imageOf = (p: Pod) => `v1.${hashOf(p) % 9}.${hashOf(p) % 5}`;

function PodRow({ p, live, dim, lit, onClick, onTip }: { p: Pod; live: number; dim: boolean; lit: boolean; onClick: () => void; onTip: (x: number, y: number, pods: Pod[] | null) => void }) {
  const c = healthColor(p);
  const cpuV = p.status === "Pending" ? 0 : Math.max(3, Math.min(99, p.cpu + live));
  const memV = p.status === "Pending" ? 0 : Math.max(3, Math.min(99, p.mem + Math.round(live * 0.6)));
  const stLabel = p.status === "Running" ? "Running" : p.status;
  return (
    <motion.button data-pod={p.id} onClick={(e) => { e.stopPropagation(); onClick(); }}
      onMouseEnter={(e) => onTip(e.clientX, e.clientY, [p])} onMouseMove={(e) => onTip(e.clientX, e.clientY, [p])} onMouseLeave={() => onTip(0, 0, null)}
      initial={false} animate={{ opacity: dim ? 0.3 : 1 }} transition={SOFT}
      className="podrow"
      style={{
        display: "grid", gridTemplateColumns: PODCOLS, alignItems: "center", gap: 12, width: "100%", textAlign: "left",
        border: "none", background: lit ? inkA(0.04) : "transparent", borderRadius: 9, padding: "8px 10px", cursor: "pointer",
      }}>
      {/* 상태 사각형 */}
      {p.status === "Pending" ? (
        <span title="생성 중" className="podspin" style={{ width: 12, height: 12, borderRadius: 999, border: `1.5px solid ${inkA(0.14)}`, borderTopColor: UI.ink3, boxSizing: "border-box" }} />
      ) : (
        <span title={stLabel} className={isCrit(p) ? "stchip crit" : "stchip"} style={{ width: 12, height: 12, borderRadius: 4, background: c }} />
      )}
      {/* 이름 + 상태 라벨 */}
      <span style={{ minWidth: 0, display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: TYPE.body, fontWeight: 600, fontFamily: MONO, color: UI.ink, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
        {p.status !== "Running" && <span style={{ fontSize: TYPE.micro, fontWeight: 600, color: isCrit(p) ? HP.crit : UI.ink3, flexShrink: 0 }}>{stLabel}</span>}
      </span>
      {/* Ready 컨테이너 */}
      <span style={{ fontSize: TYPE.caption2, fontFamily: MONO, fontVariantNumeric: "tabular-nums", color: p.status === "Running" ? UI.ink2 : HP.crit, fontWeight: p.status === "Running" ? 500 : 700 }}>{readyOf(p)}</span>
      {/* QoS 클래스 */}
      <span style={{ fontSize: TYPE.micro, fontWeight: 600, color: UI.ink3, border: `1px solid ${UI.line}`, borderRadius: 5, padding: "1px 6px", justifySelf: "start", whiteSpace: "nowrap" }}>{qosOf(p)}</span>
      <MiniBar v={cpuV} />
      <MiniBar v={memV} />
      <span style={{ fontSize: TYPE.label, fontFamily: MONO, fontVariantNumeric: "tabular-nums", textAlign: "right", color: p.restarts > 0 ? HP.crit : UI.ink3, fontWeight: p.restarts > 0 ? 700 : 500 }}>{p.restarts}</span>
      <span style={{ fontSize: TYPE.label, fontFamily: MONO, fontVariantNumeric: "tabular-nums", textAlign: "right", color: UI.ink3 }}>{ageOf(p)}</span>
      {/* 행 호버 표시 — 액션은 상세 시트가 오너(로그·이벤트·재시작 탭). 동작 없는 버튼을 두지 않는다 */}
      <span className="pacts" style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 8, padding: "2px 6px", boxShadow: `0 6px 16px -8px ${inkA(0.25)}` }}>
        <span style={{ fontSize: TYPE.caption, fontWeight: 600, color: UI.ink3 }}>상세</span>
        <ChevronRight size={12} style={{ color: INK4, marginLeft: 2 }} />
      </span>
    </motion.button>
  );
}

function MiniBar({ v }: { v: number }) {
  const c = v >= 90 ? HP.crit : v >= 75 ? HP.warn : HP.ok;
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <span style={{ flex: 1, height: 4, borderRadius: 999, background: inkA(0.06), overflow: "hidden" }}>
        <motion.span animate={{ width: `${v}%` }} transition={{ duration: DUR.count, ease: "easeInOut" }} style={{ display: "block", height: "100%", borderRadius: 999, background: c }} />
      </span>
      <span style={{ width: 26, textAlign: "right", fontSize: TYPE.caption2, fontFamily: MONO, fontVariantNumeric: "tabular-nums", color: UI.ink2 }}><Num v={v} /></span>
    </span>
  );
}

// ── 메트릭 셀: 값 + 추이(또는 용량 바)를 한 칸에 ─────────────────────────────
function MetricCell({ label, value, unit, tone, sub, spark, bar }: {
  label: string; value: number; unit: string; tone: string; sub?: string;
  spark?: { id: string; base: number; tick: number }; bar?: number;
}) {
  return (
    <div style={{ padding: "0 18px", borderLeft: `1px solid ${UI.line2}`, display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
      <div style={{ fontSize: TYPE.micro, fontWeight: 600, letterSpacing: "0.07em", color: UI.ink3, textTransform: "uppercase" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
        <span style={{ fontSize: TYPE.title1, fontWeight: 700, letterSpacing: "-0.03em", color: UI.ink, fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}><Num v={value} /></span>
        <span style={{ fontSize: TYPE.caption, fontWeight: 600, color: UI.ink3 }}>{unit}</span>
        {sub && <span style={{ marginLeft: "auto", fontSize: TYPE.micro, color: UI.ink3, fontFamily: MONO, whiteSpace: "nowrap", alignSelf: "center" }}>{sub}</span>}
      </div>
      <div style={{ height: 22 }}>
        {spark && <Spark id={spark.id} base={spark.base} tick={spark.tick} h={22} color={tone} />}
        {bar !== undefined && (
          <div style={{ marginTop: 9, height: 4, borderRadius: 999, background: inkA(0.06), overflow: "hidden" }}>
            <motion.div animate={{ width: `${Math.min(100, bar * 100)}%` }} transition={{ duration: DUR.meter, ease: "easeInOut" }} style={{ height: "100%", borderRadius: 999, background: tone }} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── 노드 위젯 ─────────────────────────────
function NodeWidget({ node, pods, expanded, dimFn, litFn, hideFn, live, tick, onOpen, onPod, onTip, onCritEnter, onCritLeave, onCritClick }: {
  node: (typeof NODES)[number]; pods: Pod[]; expanded: boolean; dimFn: (p: Pod) => boolean; litFn: (p: Pod) => boolean;
  /** 파드뷰 전용: 렌즈 선택 시 일치하지 않는 파드를 표에서 숨긴다 (노드뷰는 딤 처리 유지) */
  hideFn?: (p: Pod) => boolean;
  live: (p: Pod) => number;
  tick: number; onOpen: () => void; onPod: (p: Pod) => void; onTip: (x: number, y: number, pods: Pod[] | null) => void;
  onCritEnter: () => void; onCritLeave: () => void; onCritClick: () => void;
}) {
  // 스캔 순서: ① 임계 ② 실행 중(워크로드별 묶음, 부하 높은 순) ③ 대기(미할당) 맨 뒤
  const np = pods.filter((p) => p.node === node.id).sort((a, b) => rank(a) - rank(b) || a.svc.localeCompare(b.svc) || health(b) - health(a));
  const act = np.filter((p) => p.status === "Running");
  // 실시간: 파드 지터가 노드 평균에도 반영 — 게이지·숫자가 매 틱 움직인다
  const avgC = pct(act.reduce((s, p) => s + p.cpu + live(p), 0) / (act.length || 1));
  const avgM = pct(act.reduce((s, p) => s + p.mem + live(p) * 0.7, 0) / (act.length || 1));
  const hot = np.filter(isCrit).length;
  // 칸 병합: 파드 10개당 1칸 (칸당 타일 5열×2줄) — 20개=2칸, 30개=3칸
  const span = spanOf(node.cap);
  const cols = expanded ? 10 : span * 5;
  return (
    <motion.div transition={SPRING} onClick={expanded ? undefined : onOpen}
      style={{
        background: nodeIdle(node) ? UI.bg2 : UI.card, borderRadius: 16, padding: expanded ? 24 : 16,
        border: nodeIdle(node) ? `1px dashed ${LINE3}` : `1px solid ${UI.line}`, opacity: nodeIdle(node) ? 0.82 : 1,
        boxShadow: "none", cursor: expanded ? "default" : "pointer", display: "flex", flexDirection: "column", gap: expanded ? 16 : 12, minWidth: 0, height: "100%", boxSizing: "border-box",
      }}
      whileHover={expanded ? undefined : { boxShadow: `0 10px 26px -20px ${inkA(0.16)}`, borderColor: LINE3 }}
      className="widget">
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, minWidth: 0 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <Server size={expanded ? 15 : 12} strokeWidth={2} style={{ color: UI.ink3, flexShrink: 0 }} />
            <span style={{ fontSize: expanded ? 17 : 12.5, fontWeight: 700, letterSpacing: "-0.02em", color: UI.ink, fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.id}</span>
          </div>
          <div style={{ fontSize: expanded ? 11.5 : 9.5, color: UI.ink3, marginTop: 2, marginLeft: expanded ? 21 : 18, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {node.instance} · {node.zone} · <span style={{ color: nodeIdle(node) ? TINT.warn.fg : UI.ink3, fontWeight: nodeIdle(node) ? 600 : 400 }}>{node.state === "Ready" ? "Ready" : node.state === "Provisioning" ? "예약됨" : "비활성"}</span>
          </div>
        </div>
        <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginTop: 1 }}>
          {/* 장애 배지 — 호버: 에러 툴팁+미리보기 / 클릭: 에러 모아보기 */}
          {hot > 0 && (
            <span role="button"
              onClick={(e) => { e.stopPropagation(); onCritClick(); }}
              onMouseEnter={(e) => { e.stopPropagation(); onTip(e.clientX, e.clientY, np.filter(isCrit)); onCritEnter(); }}
              onMouseMove={(e) => onTip(e.clientX, e.clientY, np.filter(isCrit))}
              onMouseLeave={() => { onTip(0, 0, null); onCritLeave(); }}
              style={{ cursor: "pointer", fontSize: expanded ? 11 : 10, fontWeight: 700, color: HP.crit, background: TINT.crit.bg, border: `1px solid ${TINT.crit.bd}`, borderRadius: 6, padding: "1px 6px", fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>
              {hot}⚠
            </span>
          )}
          <span style={{ fontSize: expanded ? 12 : 10.5, fontWeight: 600, color: UI.ink2, fontVariantNumeric: "tabular-nums", fontFamily: MONO }}>{np.length}<span style={{ color: UI.ink3 }}>/{node.cap}</span></span>
        </span>
      </div>
      {expanded ? (
        // 노드 메트릭 — 카드 없이 플랫, 헤어라인 구분만
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: `1px solid ${UI.line}`, paddingBottom: 14 }}>
          <MetricCell label="CPU" value={avgC} unit="%" tone={avgC >= 90 ? HP.crit : avgC >= 75 ? HP.warn : HP.ok} spark={{ id: `${node.id}-c`, base: avgC, tick }} />
          <MetricCell label="MEM" value={avgM} unit="%" tone={avgM >= 90 ? HP.crit : avgM >= 75 ? HP.warn : HP.ok} spark={{ id: `${node.id}-m`, base: avgM, tick }} />
          <MetricCell label="파드 밀도" value={Math.round((np.length / node.cap) * 100)} unit="%" tone={BLUE} sub={`${np.length} / ${node.cap} 슬롯`} bar={np.length / node.cap} />
          <MetricCell label="재시작 24h" value={np.reduce((s, p) => s + p.restarts, 0)} unit="회" tone={hot ? HP.crit : UI.ink3} sub={hot ? `장애 파드 ${hot}` : "안정"} />
        </div>
      ) : (
        <div style={{ display: "flex", gap: 14 }}>
          <Gauge label="CPU" v={avgC} /><Gauge label="MEM" v={avgM} />
        </div>
      )}
      {expanded ? (
        // 파드뷰 = 표. 상태 · 이름 · 워크로드 · 부하 · 재시작 · 나이 → 클릭하면 상세.
        // 렌즈 선택 중엔 일치하는 파드만 남긴다 — 노드 지표(위)는 전체 기준 유지.
        (() => { const vis = hideFn ? np.filter((p) => !hideFn(p)) : np; return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontSize: TYPE.body, fontWeight: 700, color: UI.ink }}>
            파드 {vis.length}{vis.length !== np.length && <span style={{ fontWeight: 600, color: UI.ink3 }}> / {np.length} · 필터 적용됨</span>}
          </span>

          {/* 표 헤더 */}
          <div style={{ display: "grid", gridTemplateColumns: PODCOLS, alignItems: "center", gap: 12, padding: "0 10px 7px", borderBottom: `1px solid ${UI.line}`, fontSize: TYPE.micro, fontWeight: 600, letterSpacing: "0.07em", color: UI.ink3 }}>
            <span>상태</span><span>파드</span><span>READY</span><span>QOS</span><span>CPU</span><span>MEM</span><span style={{ textAlign: "right" }}>재시작</span><span style={{ textAlign: "right" }}>나이</span><span />
          </div>

          {(() => {
            const bySvc = new Map<string, Pod[]>();
            vis.forEach((p) => { const arr = bySvc.get(p.svc) ?? []; arr.push(p); bySvc.set(p.svc, arr); });
            const gRank = (list: Pod[]) => (list.some(isCrit) ? 0 : list.every((p) => p.status === "Pending") ? 2 : 1);
            const groups = [...bySvc.entries()].sort((a, b) => gRank(a[1]) - gRank(b[1]) || a[0].localeCompare(b[0]));
            if (!groups.length) return <div style={{ fontSize: TYPE.label, color: UI.ink3, padding: "14px 10px" }}>이 노드에는 필터와 일치하는 파드가 없습니다</div>;
            return groups.map(([svc, list]) => {
              const meta = SVC[svc];
              const worst = list.some(isCrit) ? HP.crit : list.some((p) => p.status === "Running" && health(p) >= 75) ? HP.warn : HP.ok;
              return (
                <div key={svc}>
                  {/* 워크로드 그룹 헤더 */}
                  <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 10px 6px", minWidth: 0 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: worst, flexShrink: 0 }} />
                    <span style={{ fontSize: TYPE.label2, fontWeight: 700, fontFamily: MONO, color: UI.ink, letterSpacing: "-0.01em" }}>{svc}</span>
                    <span style={{ fontSize: TYPE.caption, color: UI.ink3 }}>{meta.kind} · 복제본 {list.length}</span>
                    <span style={{ marginLeft: "auto", fontSize: TYPE.micro, fontWeight: 600, color: UI.ink3, border: `1px solid ${UI.line}`, borderRadius: 5, padding: "1px 7px", fontFamily: MONO }}>{meta.ns}</span>
                  </div>
                  {[...list].sort((a, b) => rank(a) - rank(b) || health(b) - health(a)).map((p) => (
                    <PodRow key={p.id} p={p} live={live(p)} dim={dimFn(p)} lit={litFn(p)} onClick={() => onPod(p)} onTip={onTip} />
                  ))}
                </div>
              );
            });
          })()}

          {node.cap - np.length > 0 && (
            <div style={{ fontSize: TYPE.caption, color: UI.ink3, padding: "8px 10px 0", borderTop: `1px solid ${UI.line2}` }}>남은 슬롯 {node.cap - np.length}</div>
          )}
        </div>
        ); })()
      ) : (
        <motion.div layout style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 4 }}>
          {np.map((p) => <PodTile key={p.id} p={p} big={false} dim={dimFn(p)} lit={litFn(p)} live={live(p)} onClick={() => onPod(p)} onTip={onTip} />)}
          {Array.from({ length: node.cap - np.length }).map((_, i) => (
            <div key={`g${i}`} style={{ aspectRatio: "1", borderRadius: 3, background: inkA(0.045) }} />
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}

// ── 클러스터 로우 ─────────────────────────────



// 세그먼트 링 — 상태 분포를 원형으로 (파드 ok/warn/crit/대기, 노드 ready/예약/차단)

// 클러스터 통계 — 카드·개요 스트립 공용 (단일 계산)
function clusterStats(clId: string, pods: Pod[], tick: number) {
  const cp = pods.filter((p) => p.cluster === clId);
  const act = cp.filter((p) => p.status === "Running");
  const hsh = clId.split("").reduce((s, ch) => s + ch.charCodeAt(0), 0);
  const drift = Math.sin(tick * 0.7 + hsh) * 2 + Math.sin(tick * 0.23 + hsh * 1.3);
  const avgC = pct(act.reduce((s, p) => s + p.cpu, 0) / (act.length || 1) + drift);
  const avgM = pct(act.reduce((s, p) => s + p.mem, 0) / (act.length || 1) + drift * 0.8);
  const nodes = NODES.filter((n) => n.cluster === clId);
  const ready = nodes.filter((n) => n.state === "Ready");
  const cores = ready.reduce((s, n) => s + (n.instance.includes("2xlarge") ? 8 : n.instance.includes("xlarge") ? 4 : 2), 0);
  const memGi = ready.reduce((s, n) => s + (n.instance.includes("2xlarge") ? 32 : n.instance.includes("xlarge") ? 16 : 8), 0);
  return {
    cp, nodes, ready, hsh, avgC, avgM, cores, memGi,
    chot: cp.filter(isCrit).length,
    net: Math.round(cp.length * 11 + drift * 14 + (hsh % 30)),
    disk: 38 + (hsh % 21),
    usedCores: (avgC / 100) * cores, usedMem: (avgM / 100) * memGi,
    ver: clId.startsWith("prod") ? "v1.31.4-eks-473bce4" : "v1.32.0-eks-19f6a2d",
  };
}

function ClusterMiniUsage({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      <span style={{ width: 34, fontSize: TYPE.micro, fontWeight: 600, letterSpacing: "0.05em", color: UI.ink3, flexShrink: 0 }}>{label}</span>
      <span style={{ flex: 1, height: 5, borderRadius: 999, background: inkA(0.07), overflow: "hidden" }}>
        <motion.span initial={false} animate={{ width: `${value}%` }} transition={{ duration: DUR.meter, ease: "easeInOut" }}
          style={{ display: "block", height: "100%", borderRadius: 999, background: value >= 90 ? HP.crit : value >= 75 ? HP.warn : HP.ok }} />
      </span>
      <span style={{ width: 38, textAlign: "right", fontSize: TYPE.label2, fontWeight: 700, fontFamily: MONO, color: UI.ink, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{value}%</span>
    </div>
  );
}


// 클러스터 개요 스트립 — 드릴 후 상세 정보의 자리 (GKE/OpenShift 관례: 상세는 클릭 후)
function ClusterOverview({ clId, pods, tick, meta, onKind }: {
  clId: string; pods: Pod[]; tick: number; meta?: Record<string, number>; onKind?: (kindId: string) => void;
}) {
  const st = clusterStats(clId, pods, tick);
  const KIND_LINKS: [string, string][] = [["StatefulSet", "StatefulSets"], ["DaemonSet", "DaemonSets"], ["Service", "Services"], ["Ingress", "Ingresses"], ["Job", "Jobs"], ["CronJob", "CronJobs"]];
  return (
    <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap", background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 14, padding: "12px 16px", marginBottom: 14 }}>
      <div style={{ minWidth: 0, flex: "1 1 340px", display: "flex", flexDirection: "column", gap: 3, fontFamily: MONO, fontSize: TYPE.caption, color: UI.ink2 }}>
        <span>183548421506 · Kubernetes {st.ver} · {meta?.Namespace ?? "-"}개의 네임스페이스</span>
        <span>CPU {st.usedCores.toFixed(1)}/{st.cores} cores · MEM {st.usedMem.toFixed(1)}/{st.memGi} GiB · NET {st.net}KB/s · DISK {st.disk}%</span>
        <span style={{ color: UI.ink3, fontSize: TYPE.micro, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>arn:aws:eks:ap-northeast-2:183548421506:cluster/{clId}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: TYPE.caption, color: UI.ink3 }}>
          <span className="pulsedot" style={{ width: 6, height: 6, borderRadius: 999, background: HP.ok }} />자동 갱신 · 방금 전
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, auto)", gap: "5px 18px", alignContent: "center" }}>
        {KIND_LINKS.map(([kid, lb]) => (
          <span key={kid} role="link" className="kindlink" onClick={onKind ? () => onKind(kid) : undefined}
            style={{ display: "flex", alignItems: "baseline", gap: 5, fontSize: TYPE.label, color: UI.ink2, cursor: onKind ? "pointer" : "default" }}>
            <b style={{ fontFamily: MONO, fontWeight: 700, color: UI.ink, fontVariantNumeric: "tabular-nums" }}>{meta?.[kid] ?? 0}</b>{lb}
          </span>
        ))}
      </div>
    </div>
  );
}

function ClusterRow({ cl, pods, tick, meta, onOpen }: {
  cl: (typeof CLUSTERS)[number]; pods: Pod[]; tick: number;
  meta?: Record<string, number>; onOpen: () => void;
}) {
  const st = clusterStats(cl.id, pods, tick);
  const healthy = st.chot === 0;
  return (
    <motion.button transition={SPRING} onClick={onOpen}
      whileHover={{ boxShadow: `0 10px 26px -20px ${inkA(0.16)}`, borderColor: LINE3 }}
      style={{
        display: "flex", flexDirection: "column", gap: 12, width: "100%", height: "100%", textAlign: "left", cursor: "pointer",
        background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 16, padding: 16, boxShadow: "none", boxSizing: "border-box",
      }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: `linear-gradient(135deg, ${BRAND.awsA}, ${BRAND.awsB})`, display: "grid", placeItems: "center", flexShrink: 0 }}>
          <AwsIcon size={17} style={{ color: UI.card }} />
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: TYPE.title3, fontWeight: 700, letterSpacing: "-0.02em", color: UI.ink, fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cl.id}</span>
            {cl.env === "prod" && <span style={{ fontSize: TYPE.micro, fontWeight: 600, color: TINT.warn.fg, border: `1px solid ${TINT.warn.bd}`, background: TINT.warn.bg, borderRadius: 5, padding: "1px 6px", flexShrink: 0 }}>prod</span>}
          </span>
          <span style={{ display: "block", fontSize: TYPE.caption2, color: UI.ink3, marginTop: 2, fontFamily: MONO }}>Amazon EKS · {st.ver}</span>
        </span>
        {healthy
          ? <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: TYPE.caption, fontWeight: 700, color: TINT.ok.fg, background: TINT.ok.bg, border: `1px solid ${TINT.ok.bd}`, borderRadius: 999, padding: "3px 9px", flexShrink: 0 }}><span className="pulsedot" style={{ width: 6, height: 6, borderRadius: 999, background: HP.ok }} />Active</span>
          : <span style={{ fontSize: TYPE.caption, fontWeight: 700, color: UI.card, background: HP.crit, borderRadius: 999, padding: "3px 9px", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>장애 {st.chot}</span>}
      </div>

      <div style={{ display: "flex", gap: 14, fontSize: TYPE.label, color: UI.ink2, fontVariantNumeric: "tabular-nums", flexWrap: "wrap" }}>
        <span>노드 <b style={{ fontFamily: MONO, color: UI.ink }}>{st.ready.length}/{st.nodes.length}</b> ready</span>
        <span>파드 <b style={{ fontFamily: MONO, color: UI.ink }}>{st.cp.length}</b>{st.chot > 0 && <b style={{ color: TINT.crit.fg, fontFamily: MONO }}> · 장애 {st.chot}</b>}</span>
        <span>네임스페이스 <b style={{ fontFamily: MONO, color: UI.ink }}>{meta?.Namespace ?? "-"}</b></span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: "auto" }}>
        <ClusterMiniUsage label="CPU" value={st.avgC} />
        <ClusterMiniUsage label="MEM" value={st.avgM} />
      </div>
    </motion.button>
  );
}

// '+ 클러스터 연결' 점선 카드 — 지도 클러스터 뷰와 홈 클러스터 섹션이 하나를 공유(두 번째 구현 금지)
// compact = 홈 섹션용 가로형(카드 높이를 잡아먹지 않는다) · 기본 = 지도 클러스터 뷰의 카드형
function AddClusterCard({ onClick, delay = 0, compact = false }: { onClick: () => void; delay?: number; compact?: boolean }) {
  return (
    <motion.button initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay }}
      onClick={onClick} whileHover={{ borderColor: TINT.blue.bd, background: blueA(0.03) }}
      style={compact
        ? { display: "flex", alignItems: "center", justifyContent: "center", gap: 10, minHeight: 60,
            border: `1.5px dashed ${LINE3}`, borderRadius: 14, background: "transparent", cursor: "pointer" }
        : { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 200,
            border: `1.5px dashed ${LINE3}`, borderRadius: 16, background: "transparent", cursor: "pointer" }}>
      <span style={{ width: compact ? 26 : 34, height: compact ? 26 : 34, borderRadius: 999, background: blueA(0.09), display: "grid", placeItems: "center", color: BLUE, fontSize: compact ? TYPE.bodyStrong : TYPE.heading, fontWeight: 600, lineHeight: 1 }}>+</span>
      <span style={{ fontSize: TYPE.body, fontWeight: 700, color: UI.ink }}>클러스터 연결</span>
      <span style={{ fontSize: TYPE.caption2, color: UI.ink3 }}>에이전트 설치로 등록</span>
    </motion.button>
  );
}

// 방금 등록한 클러스터 — 에이전트 부트스트랩 대기 상태(데이터가 아직 없으므로 드릴 불가가 사실)
export function PendingClusterCard({ name, delay = 0 }: { name: string; delay?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay }}
      style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 200, background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 16, padding: 16, boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: inkA(0.06), display: "grid", placeItems: "center", flexShrink: 0 }}>
          <AwsIcon size={17} style={{ color: UI.ink3 }} />
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: TYPE.title3, fontWeight: 700, letterSpacing: "-0.02em", color: UI.ink, fontFamily: MONO, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
          <span style={{ display: "block", fontSize: TYPE.caption2, color: UI.ink3, marginTop: 2, fontFamily: MONO }}>Amazon EKS · 버전 확인 중</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: TYPE.caption, fontWeight: 700, color: TINT.blue.fg, background: blueA(0.08), border: `1px solid ${blueA(0.25)}`, borderRadius: 999, padding: "3px 9px", flexShrink: 0 }}>
          <span className="pulsedot" style={{ width: 6, height: 6, borderRadius: 999, background: BLUE }} />연결 중
        </span>
      </div>
      <div style={{ fontSize: TYPE.label, color: UI.ink2 }}>에이전트 부트스트랩 · 첫 인벤토리 수집 대기</div>
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 7 }}>
        {["CPU", "MEM"].map((l) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 34, fontSize: TYPE.micro, fontWeight: 600, letterSpacing: "0.05em", color: UI.ink3 }}>{l}</span>
            <span style={{ flex: 1, height: 5, borderRadius: 999, background: inkA(0.05) }} />
            <span style={{ width: 38, textAlign: "right", fontSize: TYPE.label2, fontFamily: MONO, color: UI.ink3 }}>—</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ── 홈 서피스용 클러스터 섹션 (D21 2층 — 보드 밖 고정) — 카드는 지도와 같은 ClusterRow 하나 ──
export function HomeClusterSection({ meta, onOpen, pending = [] }: {
  meta?: Record<string, Record<string, number>>; onOpen: (clId: string) => void; pending?: string[];
}) {
  const pods = useMemo(() => genPods(), []);
  // 벽시계 기반 tick — 홈 카드와 지도 카드가 같은 순간 같은 숫자를 말하게 한다(두 화면 숫자 불일치 = 버그)
  const [tick, setTick] = useState(() => Math.floor(Date.now() / 1500));
  useEffect(() => { const iv = setInterval(() => setTick(Math.floor(Date.now() / 1500)), 1500); return () => clearInterval(iv); }, []);
  return (
    // 4칸 그리드 — 클러스터 카드 2칸씩, 연결 카드는 가로형 컴팩트 2칸(거대 공백 금지)
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gridAutoFlow: "row dense", gap: 14 }}>
      {CLUSTERS.map((cl) => (
        <div key={cl.id} style={{ gridColumn: "span 2", minWidth: 0 }}>
          <ClusterRow cl={cl} pods={pods} tick={tick} meta={meta?.[cl.id]} onOpen={() => onOpen(cl.id)} />
        </div>
      ))}
      {pending.map((n, i) => (
        <div key={n} style={{ gridColumn: "span 2", minWidth: 0 }}>
          <PendingClusterCard name={n} delay={(CLUSTERS.length + i) * 0.05} />
        </div>
      ))}
      {/* 홈에는 연결 카드 없음 — 고정 헤더의 "+ 클러스터 연결" 버튼이 유일한 진입(중복 금지). 카드는 지도 클러스터 뷰 전용 */}
    </div>
  );
}

// ── 앱 ─────────────────────────────
// embedded: 셸(통합 리소스)에 내장될 때 자체 헤더·내비를 숨기고 스코프 변화를 알림
export type MapScope = View;
export function OpsiaMap({ embedded = false, onScopeChange, onOpenResource , lensTab, onAddCluster, onAddRepo, stickyTop, clusterMeta, onOpenKind, initialCluster, pendingClusters, pendingRepos }: {
  embedded?: boolean;
  onScopeChange?: (v: View) => void;
  /** 임베드 모드: 파드 클릭 시 셸의 통합 상세 오버레이를 연다 (내부 패널 대신) */
  onOpenResource?: (kind: "Pod", data: Record<string, unknown>) => void;
  /** 셸의 종류 선택과 연결 보기 탭 동기화 (Service→서비스, ConfigMap·Secret→구성, Argo 앱→저장소) — 탭명은 D16(서피스명과 중복 금지) */
  lensTab?: "svc" | "cfg" | "git" | null;
  /** 우측 패널 '리소스' 탭 내용 — 셸의 종류 탐색이 여기로 통합된다 (보조 사이드바 대체) */
    /** 실서비스 배치: 클러스터 뷰의 '+ 연결' 카드 / 배포 탭의 '+ 저장소 연결' */
  onAddCluster?: () => void;
  onAddRepo?: () => void;
  /** 탐색 패널 고정 오프셋(CSS px) — 셸 sticky 헤더 바로 아래 */
  stickyTop?: number;
  /** 클러스터 카드 메타(종류·네임스페이스 카운트) — 셸 인벤토리에서 파생, 표 필터와 동일 로직 */
  clusterMeta?: Record<string, Record<string, number>>;
  /** 카드의 종류 링크 클릭 — 드릴과 함께 셸 표 종류를 전환 */
  onOpenKind?: (kindId: string) => void;
  /** 홈 카드 클릭 등 외부 진입 시 해당 클러스터 노드 뷰로 시작 (스코프 전달 — D21) */
  initialCluster?: string;
  /** 세션 중 등록된 연결 대기 항목 — 목록에 실반영(등록의 결과가 보여야 한다) */
  pendingClusters?: string[];
  pendingRepos?: string[];
} = {}) {
  const pods = useMemo(() => genPods(), []);
  // 벽시계 기반 tick — HomeClusterSection과 동일 위상(같은 순간 같은 숫자)
  const [tick, setTick] = useState(() => Math.floor(Date.now() / 1500));
  useEffect(() => { const iv = setInterval(() => setTick(Math.floor(Date.now() / 1500)), 1500); return () => clearInterval(iv); }, []);
  const live = (p: Pod) => (p.status !== "Running" ? 0 : Math.round(Math.sin((tick + p.cpu + p.id.length * 3) * 1.1) * 4 + Math.sin((tick + p.mem) * 0.37) * 2));

  const [view, setView] = useState<View>(initialCluster ? { level: "nodes", cluster: initialCluster } : { level: "clusters" });
  useEffect(() => { onScopeChange?.(view); }, [view]);
  const [dir, setDir] = useState(1);
  const [mode, setMode] = useState<"push" | "hero">("push");
  // 노드 ↔ 파드 = 같은 대상에 더 가까이(히어로 확장) · 그 외 = 레벨 이동(푸시 슬라이드)
  const go = (v: View, d: number) => {
    const hero = (view.level === "nodes" && v.level === "pods") || (view.level === "pods" && v.level === "nodes");
    setMode(hero ? "hero" : "push");
    setDir(d); setView(v);
  };
  const [focusPod, setFocusPod] = useState<Pod | null>(null);
  const [lens, setLens] = useState<Lens>(null);
  const [pin, setPin] = useState<Lens>(() => readDevpreviewOpsiaPin(Object.keys(SVC)));
  const [tip, setTip] = useState<{ x: number; y: number; list: Pod[] } | null>(null);
  // 툴팁 좌표는 CSS px로 — zoom(PRESENT_SCALE) 컨테이너 안 fixed는 시각 px 그대로 쓰면 스케일만큼 어긋난다(DESIGN-RULES 5장)
  const tipScale = embedded ? PRESENT_SCALE : 1;
  const onTip = (x: number, y: number, list: Pod[] | null) => setTip(list && list.length ? { x: x / tipScale, y: y / tipScale, list } : null);

  const incident = focusPod && isCrit(focusPod) ? focusPod : null;
  const effLens: Lens = lens ?? pin ?? (incident ? { kind: "svc", id: incident.svc } : null);
  const related = useMemo(() => {
    const l = effLens; if (!l) return new Set<string>();
    if (l.kind === "crit") return new Set(pods.filter(isCrit).map((p) => p.id));
    if (l.kind === "svc") return new Set(pods.filter((p) => p.svc === l.id).map((p) => p.id));
    if (l.kind === "cfg") return new Set(pods.filter((p) => (SVC_CFG[p.svc] || []).includes(l.id)).map((p) => p.id));
    return new Set(pods.filter((p) => SVC[p.svc].repo === l.id).map((p) => p.id));
  }, [effLens, pods]);
  const dimFn = (p: Pod) => (effLens ? !related.has(p.id) && p.id !== focusPod?.id : focusPod ? p.id !== focusPod.id : false);
  const litFn = (p: Pod) => !!effLens && related.has(p.id);
  const crit = pods.filter(isCrit).length;

  // 임베드에서 상세는 셸 오버레이 하나로 일원화 — 내부 미니 상세(focusPod 패널)를 두 번째 상세로 쓰지 않는다
  const openNodeById = (id: string) => { const n = NODES.find((x) => x.id === id); if (n) go({ level: "pods", cluster: n.cluster, node: n.id }, 1); };
  const selectPod = (p: Pod) => {
    // 임베드 모드에서는 상세를 셸의 최상위 오버레이 하나로 일원화한다 (내부 패널과 이원화 금지)
    if (embedded && onOpenResource) {
      onOpenResource("Pod", {
        name: p.name, ns: SVC[p.svc].ns, bad: isCrit(p), status: p.status, svc: p.svc, ownerKind: SVC[p.svc].kind,
        cfgs: SVC_CFG[p.svc] || [], qos: qosOf(p), node: p.node, cluster: p.cluster, restarts: p.restarts, age: `${3 + (p.cpu % 9)}d`,
      });
      return;
    }
    setFocusPod((cur) => (cur?.id === p.id ? null : p));
  };

  const viewKey = view.level === "clusters" ? "clusters" : view.level === "nodes" ? `nodes-${view.cluster}` : `pods-${view.node}`;
  const crumbs: { label: string; onClick?: () => void }[] = [{ label: "클러스터", onClick: view.level !== "clusters" ? () => go({ level: "clusters" }, -1) : undefined }];
  if (view.level !== "clusters") crumbs.push({ label: view.cluster, onClick: view.level === "pods" ? () => go({ level: "nodes", cluster: view.cluster }, -1) : undefined });
  if (view.level === "pods") crumbs.push({ label: view.node });

  return (
    <div className="op">
      <div style={{ width: embedded ? "100%" : 1220, maxWidth: "100%", margin: "0 auto", padding: embedded ? 0 : "32px 24px 48px" }}>
        {!embedded && (
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
            <h1 style={{ margin: 0, fontSize: TYPE.title1, fontWeight: 800, letterSpacing: "-0.03em", color: UI.ink }}>통합 맵</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: TYPE.label2, fontWeight: 600, color: UI.ink2 }}>
              <span className="pulsedot" style={{ width: 6, height: 6, borderRadius: 999, background: HP.ok }} />
              실시간 · {CLUSTERS.length} 클러스터 · {NODES.length} 노드 · {pods.length} 파드 · 장애 <b style={{ color: crit ? HP.crit : UI.ink, fontFamily: MONO }}>{crit}</b>
            </div>
            {/* 뷰 내비게이션 — 맵/토폴로지/연결/AI 공통 문법 */}
            <nav style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: 8, paddingLeft: 14, borderLeft: `1px solid ${UI.line}` }}>
              {([["맵", "devpreview-opsia.html", true], ["토폴로지", "devpreview-topology.html", false], ["연결", "devpreview-connect.html", false], ["AI", "devpreview-ai.html", false]] as const).map(([l, href, act]) => (
                <a key={l} href={`/${href}`} style={{ fontSize: TYPE.label2, fontWeight: act ? 700 : 500, color: act ? UI.ink : UI.ink3, textDecoration: "none", padding: "3px 9px", borderRadius: 7, background: act ? inkA(0.05) : "transparent" }}>{l}</a>
              ))}
            </nav>
          </div>
          <div style={{ display: "flex", gap: 14, fontSize: TYPE.label, fontWeight: 600, color: UI.ink2 }}>
            {([["정상", HP.ok], ["주의", HP.warn], ["장애", HP.crit], ["대기", HP.pending]] as const).map(([k, c]) => (
              <span key={k} style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: c }} />{k}</span>
            ))}
          </div>
        </header>
        )}

        {/* 상태 요약 줄 — 인벤토리 파생 한눈 개요 + 장애 스트립 (호버: 에러 미리보기 / 클릭: 필터 고정) */}
        {(() => {
          const prov = NODES.filter((n) => n.state === "Provisioning").length;
          const cord = NODES.filter((n) => n.state === "Cordoned").length;
          const pending = pods.filter((p) => p.status === "Pending").length;
          const outSync = REPOS.filter((r) => REPO_META[r].sync === "OutOfSync");
          const seg: React.CSSProperties = { display: "flex", alignItems: "center", gap: 5, fontSize: TYPE.label, fontWeight: 600, color: UI.ink2, background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 999, padding: "5px 11px", whiteSpace: "nowrap" };
          const num: React.CSSProperties = { fontFamily: MONO, fontWeight: 700, color: UI.ink, fontVariantNumeric: "tabular-nums" };
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              <span style={seg}><Server size={11} style={{ color: UI.ink3 }} />클러스터 <b style={num}>{CLUSTERS.length}</b>
                {(pendingClusters?.length ?? 0) > 0 && <span style={{ color: TINT.blue.fg }}>· 연결 중 {pendingClusters!.length}</span>}
              </span>
              <span style={seg}><Cpu size={11} style={{ color: UI.ink3 }} />노드 <b style={num}>{NODES.length}</b>
                {prov > 0 && <span style={{ color: TINT.blue.fg }}>· 예약 {prov}</span>}
                {cord > 0 && <span style={{ color: UI.ink3 }}>· 차단 {cord}</span>}
              </span>
              <span style={seg}><Box size={11} style={{ color: UI.ink3 }} />파드 <b style={num}>{pods.length}</b>
                {pending > 0 && <span style={{ color: TINT.blue.fg }}>· 대기 {pending}</span>}
              </span>
              {/* 집계 칩까지만(홈 요약 줄과 같은 문법) — 저장소별 상세는 배포 > 저장소·동기화가 오너 */}
              {outSync.length > 0 && (
                <span style={{ ...seg, borderColor: TINT.warn.bd, background: TINT.warn.bg, color: TINT.warn.fg, cursor: "default" }}
                  onMouseEnter={() => setLens({ kind: "git", id: outSync[0] })} onMouseLeave={() => setLens(null)}>
                  <GithubIcon size={11} />OutOfSync <b style={{ ...num, color: TINT.warn.fg }}>{outSync.length}</b>
                </span>
              )}
              {crit > 0 && <span style={{ width: 1, height: 16, background: UI.line, margin: "0 2px" }} />}
        {crit > 0 && (
          <>
            <motion.button whileTap={{ scale: 0.96 }}
              onMouseEnter={() => setLens({ kind: "crit", id: "all" })} onMouseLeave={() => setLens(null)}
              onClick={() => setPin(pin?.kind === "crit" ? null : { kind: "crit", id: "all" })}
              style={{
                fontSize: TYPE.label, fontWeight: 700, color: pin?.kind === "crit" ? UI.card : HP.crit, display: "flex", alignItems: "center", gap: 5, marginRight: 2,
                border: `1px solid ${pin?.kind === "crit" ? HP.crit : TINT.crit.bd}`, background: pin?.kind === "crit" ? HP.crit : TINT.crit.bg,
                borderRadius: 999, padding: "5px 12px", cursor: "pointer", transition: "background .2s ease, color .2s ease",
              }}>
              <Activity size={12} />장애 {crit}
            </motion.button>
            {/* 개별 파드 나열 금지 — "장애 N" 렌즈·핀이 지도 하이라이트로 같은 정보를 준다(줄바꿈 과밀 방지) */}
          </>
        )}
            </div>
          );
        })()}

        {/* 브레드크럼 */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 16, minHeight: 28 }}>
          {view.level !== "clusters" && (
            <motion.button whileTap={{ scale: 0.92 }} whileHover={{ borderColor: LINE3 }}
              onClick={() => go(view.level === "pods" ? { level: "nodes", cluster: view.cluster } : { level: "clusters" }, -1)}
              style={{ width: 26, height: 26, borderRadius: 999, border: `1px solid ${UI.line}`, background: UI.card, cursor: "pointer", display: "grid", placeItems: "center", marginRight: 6 }}>
              <ChevronLeft size={14} style={{ color: UI.ink2 }} />
            </motion.button>
          )}
          {crumbs.map((c, i) => (
            <span key={c.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {i > 0 && <ChevronRight size={11} style={{ color: INK4 }} />}
              <button onClick={c.onClick} disabled={!c.onClick}
                style={{ border: "none", background: "transparent", cursor: c.onClick ? "pointer" : "default", fontSize: TYPE.body, fontWeight: 600, color: i === crumbs.length - 1 ? UI.ink : UI.ink3, padding: "2px 4px", fontFamily: i > 0 ? MONO : undefined, letterSpacing: "-0.01em" }}>
                {c.label}
              </button>
            </span>
          ))}
        </div>

        {/* 좁아지면(AI 도킹 등) 어사이드가 아래로 내려간다 — 겹침 방지 */}
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 440px", minWidth: 0, position: "relative" }}>
            <AnimatePresence>
              {effLens && (
                <motion.div key="chip" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={SOFT}
                  style={{ position: "absolute", top: -46, right: 0, zIndex: 10, display: "flex", alignItems: "center", gap: 7, background: UI.card, border: `1px solid ${(incident && !lens && !pin) || effLens.kind === "crit" ? TINT.crit.bd : TINT.blue.bd}`, borderRadius: 999, padding: "5px 13px", fontSize: TYPE.label2, fontWeight: 600, color: (incident && !lens && !pin) || effLens.kind === "crit" ? HP.crit : BLUE }}>
                  {(incident && !lens && !pin) || effLens.kind === "crit" ? <Activity size={12} /> : effLens.kind === "svc" ? <Plug size={12} /> : effLens.kind === "cfg" ? <FileCog size={12} /> : <GithubIcon size={12} />}
                  <span style={{ fontFamily: MONO }}>{effLens.kind === "crit" ? "장애 필터" : incident && !lens && !pin ? `장애 조사 · ${incident.name}` : effLens.id}</span>
                  <span style={{ fontWeight: 600, opacity: 0.6 }}>{related.size} 파드</span>
                  {pin && <button onClick={() => setPin(null)} style={{ border: "none", background: inkA(0.06), borderRadius: 999, width: 15, height: 15, cursor: "pointer", fontSize: TYPE.micro, lineHeight: 1, color: "inherit" }}>✕</button>}
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence mode="popLayout" custom={{ dir, mode }} initial={false}>
              <motion.div key={viewKey} custom={{ dir, mode }}
                variants={{
                  initial: (c: { dir: number; mode: string }) => (c.mode === "hero" ? { opacity: 0, scale: c.dir === 1 ? 0.96 : 1.02, y: c.dir === 1 ? 10 : -6 } : { opacity: 0, x: 46 * c.dir, scale: 0.985, filter: "blur(7px)" }),
                  animate: { opacity: 1, x: 0, y: 0, scale: 1, filter: "blur(0px)" },
                  exit: (c: { dir: number; mode: string }) => (c.mode === "hero" ? { opacity: 0, scale: c.dir === 1 ? 1.02 : 0.97, transition: { duration: DUR.fade } } : { opacity: 0, x: -42 * c.dir, scale: 0.99, filter: "blur(7px)" }),
                }}
                initial="initial" animate="animate" exit="exit" transition={PAGE}>

                {view.level === "clusters" && (
                  /* 클러스터: 가로 최대 2개 · 카드 폭을 제한해 정사각에 가깝게 */
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 560px))", gap: 14, alignItems: "stretch" }}>
                    {CLUSTERS.map((cl, i) => (
                      <motion.div key={cl.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: i * 0.05 }} style={{ display: "flex" }}>
                        <ClusterRow cl={cl} pods={pods} tick={tick} meta={clusterMeta?.[cl.id]}
                          onOpen={() => go({ level: "nodes", cluster: cl.id }, 1)} />
                      </motion.div>
                    ))}
                    {(pendingClusters ?? []).map((n, i) => <PendingClusterCard key={n} name={n} delay={(CLUSTERS.length + i) * 0.05} />)}
                    {onAddCluster && <AddClusterCard onClick={onAddCluster} delay={(CLUSTERS.length + (pendingClusters?.length ?? 0)) * 0.05} />}
                  </div>
                )}

                {view.level === "nodes" && (<>
                  <ClusterOverview clId={view.cluster} pods={pods} tick={tick} meta={clusterMeta?.[view.cluster]} onKind={onOpenKind} />
                  {/* 노드: 4칸 그리드 + 파드 10개당 1칸 병합 — 20개 노드 두 장이 한 줄에 맞물린다 */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gridAutoFlow: "dense", gap: 12 }}>
                    {NODES.filter((n) => n.cluster === view.cluster).sort((a, b) => nodeRank(a) - nodeRank(b)).map((node, i) => (
                      <motion.div key={node.id} style={{ gridColumn: `span ${spanOf(node.cap)}`, minWidth: 0, maxWidth: "100%", overflow: "hidden" }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: i * 0.04 }}>
                        <NodeWidget node={node} pods={pods} expanded={false} dimFn={dimFn} litFn={litFn} live={live} tick={tick}
                          onOpen={() => go({ level: "pods", cluster: view.cluster, node: node.id }, 1)} onPod={selectPod} onTip={onTip}
                          onCritEnter={() => setLens({ kind: "crit", id: "all" })} onCritLeave={() => setLens(null)} onCritClick={() => setPin(pin?.kind === "crit" ? null : { kind: "crit", id: "all" })} />
                      </motion.div>
                    ))}
                  </div>
                </>)}

                {view.level === "pods" && (() => {
                  const node = NODES.find((n) => n.id === view.node)!;
                  {/* 파드뷰: 렌즈 선택 시 일치 파드만 표시(실제 필터) — 노드뷰의 딤 처리와 역할 분리 */}
                  return <NodeWidget node={node} pods={pods} expanded dimFn={dimFn} litFn={litFn} hideFn={effLens ? dimFn : undefined} live={live} tick={tick} onOpen={() => {}} onPod={selectPod} onTip={onTip}
                    onCritEnter={() => setLens({ kind: "crit", id: "all" })} onCritLeave={() => setLens(null)} onCritClick={() => setPin(pin?.kind === "crit" ? null : { kind: "crit", id: "all" })} />;
                })()}
              </motion.div>
            </AnimatePresence>
          </div>

          <SidePanel key={lensTab ?? "default"} pods={pods} focusPod={focusPod} setLens={setLens} pin={pin} setPin={setPin} effLens={effLens} clearPod={() => setFocusPod(null)} openNode={openNodeById} forcedTab={lensTab ?? null} scaled={embedded} onAddRepo={onAddRepo} stickyTop={stickyTop} pendingRepos={pendingRepos} />
        </div>
      </div>

      {/* 커서 추적 툴팁 — 포커싱된 파드의 핵심 정보 */}
      <AnimatePresence>
        {tip && (
          <motion.div key="tip" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: DUR.micro }}
            style={{
              position: "fixed", left: Math.min(tip.x + 14, window.innerWidth - 190), top: Math.min(tip.y + 16, window.innerHeight - 110), zIndex: 60, pointerEvents: "none",
              background: cardA(0.96), backdropFilter: "blur(10px)", border: `1px solid ${UI.line}`, borderRadius: 11, padding: "9px 11px",
              boxShadow: `0 10px 30px -12px ${inkA(0.22)}`, minWidth: 158,
            }}>
            {tip.list.length > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: TYPE.caption, fontWeight: 700, color: HP.crit, marginBottom: 6 }}>
                <Activity size={11} />장애 {tip.list.length}
              </div>
            )}
            {tip.list.map((p) => (
              <div key={p.id} style={{ marginBottom: tip.list.length > 1 ? 6 : 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: healthColor(p), flexShrink: 0 }} />
                  <span style={{ fontSize: TYPE.label2, fontWeight: 700, fontFamily: MONO, color: UI.ink, letterSpacing: "-0.01em" }}>{p.name}</span>
                </div>
                <div style={{ fontSize: TYPE.caption, color: UI.ink3, marginTop: 2, marginLeft: 13 }}>{p.svc} · {p.status}{p.restarts > 0 ? ` · 재시작 ${p.restarts}` : ""} · {imageOf(p)} · {qosOf(p)}</div>
                {tip.list.length === 1 && (
                  <div style={{ display: "flex", gap: 10, marginTop: 5, marginLeft: 13, fontSize: TYPE.caption, fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>
                    <span style={{ color: UI.ink2 }}>CPU <b style={{ color: UI.ink }}>{p.cpu}%</b></span>
                    <span style={{ color: UI.ink2 }}>MEM <b style={{ color: UI.ink }}>{p.mem}%</b></span>
                  </div>
                )}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        html, body { background: ${UI.bg}; }
        .op { min-height: 100vh; background: ${UI.bg}; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Pretendard", "Apple SD Gothic Neo", "Helvetica Neue", sans-serif; -webkit-font-smoothing: antialiased; }
        .op .tile.crit, .op .stchip.crit { animation: critp 1.3s ease-in-out infinite; }
        .op .podrow { position: relative; transition: background .15s ease; }
        .op .podrow:hover { background: ${inkA(0.035)} !important; }
        .op .pacts { opacity: 0; transition: opacity .15s ease; }
        .op .podrow:hover .pacts { opacity: 1; }
        .op .pact:hover { background: ${inkA(0.07)}; color: ${UI.ink} !important; }
        .op .kindlink:hover { color: ${BLUE} !important; } .op .kindlink:hover b { color: ${BLUE}; }
        .op .podspin { animation: podspin 0.9s linear infinite; }
        @keyframes podspin { to { transform: rotate(360deg); } }
        @keyframes critp { 0%,100% { filter: none; } 50% { filter: brightness(1.12) saturate(1.15); } }
        .pulsedot { animation: pd 1.5s ease-in-out infinite; }
        @keyframes pd { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
        .op ::-webkit-scrollbar { width: 8px; } .op ::-webkit-scrollbar-thumb { background: ${inkA(0.12)}; border-radius: 99px; }
        @media (prefers-reduced-motion: reduce) { .tile.crit, .pulsedot, .podspin { animation: none !important; } }
      `}</style>
    </div>
  );
}

// ── 우측 패널 ─────────────────────────────
function SidePanel({ pods, focusPod, setLens, pin, setPin, effLens, clearPod, openNode , forcedTab, scaled, onAddRepo, stickyTop, pendingRepos }: {
  pods: Pod[]; focusPod: Pod | null; setLens: (l: Lens) => void; pin: Lens; setPin: (l: Lens) => void; effLens: Lens; clearPod: () => void; openNode: (id: string) => void; forcedTab?: "svc" | "cfg" | "git" | null; scaled?: boolean; onAddRepo?: () => void; stickyTop?: number; pendingRepos?: string[];
}) {
  const [tab, setTab] = useState<"res" | "svc" | "cfg" | "git">(forcedTab ?? "svc"); // 종류 탐색은 쿠버네티스 뷰 본문이 오너 — 패널 기본은 서비스
  const count = (l: Lens) => { if (!l) return 0; if (l.kind === "crit") return pods.filter(isCrit).length; if (l.kind === "svc") return pods.filter((p) => p.svc === l.id).length; if (l.kind === "cfg") return pods.filter((p) => (SVC_CFG[p.svc] || []).includes(l.id)).length; return pods.filter((p) => SVC[p.svc].repo === l.id).length; };

  const Row = ({ l, icon, label, sub, warn }: { l: Lens; icon?: React.ReactNode; label: string; sub: string; warn?: boolean }) => {
    const active = effLens && effLens.kind === l!.kind && effLens.id === l!.id;
    return (
      <motion.button whileTap={{ scale: 0.985 }} onMouseEnter={() => setLens(l)} onMouseLeave={() => setLens(null)}
        onClick={() => setPin(pin && pin.id === l!.id && pin.kind === l!.kind ? null : l)}
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: "none", background: active ? blueA(0.07) : "transparent", borderRadius: 10, padding: "8px 10px", cursor: "pointer", transition: "background .15s" }}>
        {icon}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: TYPE.body, fontWeight: 600, fontFamily: MONO, color: UI.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>{label}</div>
          <div style={{ fontSize: TYPE.caption2, color: warn ? TINT.warn.fg : UI.ink3, marginTop: 1 }}>{sub}</div>
        </div>
        <span style={{ fontSize: TYPE.label, fontWeight: 600, color: active ? BLUE : UI.ink3, fontVariantNumeric: "tabular-nums", fontFamily: MONO }}>{count(l)}</span>
      </motion.button>
    );
  };

  return (
    /* 라운드 모서리 침범 방지: 바깥은 clip, 스크롤·거터는 안쪽 컨테이너 담당 (스크롤바 유무와 무관하게 폭 고정) */
    <aside style={{ width: 270, flexShrink: 0, alignSelf: "flex-start", background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 16, position: "sticky", top: stickyTop ?? 24, maxHeight: scaled ? `calc(100vh / ${PRESENT_SCALE} - ${(stickyTop ?? 24) + 16}px)` : "calc(100vh - 60px)", overflow: "hidden", display: "flex" }}>
    <div style={{ flex: 1, minWidth: 0, padding: "14px 6px 14px 14px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", scrollbarGutter: "stable" }}>
      <AnimatePresence mode="wait">
        {focusPod ? (
          <motion.div key={focusPod.id} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={SOFT} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <PodDetail pod={focusPod} setLens={setLens} setPin={setPin} clearPod={clearPod} openNode={openNode} />
          </motion.div>
        ) : (
          <motion.div key="lens" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={SOFT} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: TYPE.bodyStrong, fontWeight: 700, letterSpacing: "-0.02em", color: UI.ink, padding: "2px 2px 0" }}>연결 보기</div>
            <div style={{ display: "flex", gap: 3, background: inkA(0.04), borderRadius: 10, padding: 3 }}>
              {/* 아이콘 통일: 서비스=Plug (셸 사이드바 Service와 동일) · 리소스 탭 = 종류 탐색(보조 사이드바 통합) */}
              {/* '리소스' 탭 없음 — kind 탐색은 쿠버네티스 관점 본문(중복 정의 금지) */}
              {([["svc", "서비스", Plug], ["cfg", "구성", FileCog], ["git", "저장소", GithubIcon]] as const).map(([id, label, I]) => {
                const on = tab === id;
                return (
                  <button key={id} onClick={() => setTab(id)} style={{ position: "relative", flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "6px 0", borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", fontSize: TYPE.label2, fontWeight: 600, color: on ? UI.ink : UI.ink3 }}>
                    {on && <motion.span layoutId="ptab" transition={SOFT} style={{ position: "absolute", inset: 0, borderRadius: 8, background: UI.card, boxShadow: `0 1px 3px ${inkA(0.12)}` }} />}
                    <span style={{ position: "relative", display: "flex", alignItems: "center", gap: 5 }}><I size={12} />{label}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                            {tab === "svc" && SERVICES.map((s) => <Row key={s.id} l={{ kind: "svc", id: s.id }} icon={<ServiceIcon id={s.id} size={14} style={{ color: s.color, flexShrink: 0 }} />} label={s.id} sub={s.repo} />)}
              {tab === "cfg" && CONFIGS.map((c) => <Row key={c.id} l={{ kind: "cfg", id: c.id }} icon={<FileCog size={14} style={{ color: c.kind === "Secret" ? TINT.purple.fg : BLUE, flexShrink: 0 }} />} label={c.id} sub={c.kind} />)}
              {tab === "git" && (<>
                {REPOS.map((r) => <Row key={r} l={{ kind: "git", id: r }} icon={<GithubIcon size={14} style={{ color: BRAND.github, flexShrink: 0 }} />} label={r} sub={`${REPO_META[r].tool} · ${REPO_META[r].rev} · ${REPO_META[r].sync}`} warn={REPO_META[r].sync === "OutOfSync"} />)}
                {(pendingRepos ?? []).map((r) => (
                  <div key={r} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", borderRadius: 9, padding: "7px 10px", background: blueA(0.05) }}>
                    <GithubIcon size={14} style={{ color: UI.ink3, flexShrink: 0 }} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: "block", fontSize: TYPE.label2, fontWeight: 600, fontFamily: MONO, color: UI.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r}</span>
                      <span style={{ display: "block", fontSize: TYPE.micro, color: TINT.blue.fg, marginTop: 1 }}>연결 중 · 초기 동기화 대기</span>
                    </span>
                    <span className="pulsedot" style={{ width: 6, height: 6, borderRadius: 999, background: BLUE, flexShrink: 0 }} />
                  </div>
                ))}
                {onAddRepo && (
                  <button onClick={onAddRepo}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", marginTop: 6, padding: "9px 0",
                      border: `1.5px dashed ${LINE3}`, borderRadius: 11, background: "transparent", cursor: "pointer", fontSize: TYPE.label2, fontWeight: 700, color: BLUE }}>
                    + 저장소 연결
                  </button>
                )}
              </>)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </aside>
  );
}

function PodDetailLink({ l, icon, label, sub, onClick, setLens, setPin }: { l?: Lens; icon: React.ReactNode; label: string; sub: string; onClick?: () => void; setLens: (l: Lens) => void; setPin: (l: Lens) => void }) {
  return (
    <motion.button whileTap={{ scale: 0.985 }}
      onMouseEnter={l ? () => setLens(l) : undefined} onMouseLeave={l ? () => setLens(null) : undefined}
      onClick={onClick ?? (l ? () => setPin(l) : undefined)}
      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: `1px solid ${UI.line2}`, background: UI.bg2, borderRadius: 11, padding: "9px 11px", cursor: "pointer" }}>
      {icon}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: TYPE.body, fontWeight: 600, fontFamily: MONO, color: UI.ink, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
        <div style={{ fontSize: TYPE.caption, color: UI.ink3, marginTop: 1 }}>{sub}</div>
      </div>
      <ChevronRight size={13} style={{ color: INK4, flexShrink: 0 }} />
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
          <div style={{ fontSize: TYPE.bodyStrong, fontWeight: 700, fontFamily: MONO, letterSpacing: "-0.01em", color: UI.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pod.name}</div>
          <div style={{ fontSize: TYPE.caption2, fontWeight: 600, color: stColor, marginTop: 1 }}>{pod.status}{pod.restarts > 0 ? ` · 재시작 ${pod.restarts}` : ""}</div>
        </div>
        <button onClick={clearPod} style={{ width: 24, height: 24, borderRadius: 999, border: "none", background: inkA(0.05), color: UI.ink3, cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}><X size={12} /></button>
      </div>
      {crit && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${TINT.crit.bd}`, background: TINT.crit.bg, borderRadius: 10, padding: "7px 11px", fontSize: TYPE.caption2, fontWeight: 600, color: HP.crit }}>
          <Activity size={12} /> 장애 조사 — 이 파드의 연결이 표시됩니다
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 9, border: `1px solid ${UI.line2}`, background: UI.bg2, borderRadius: 11, padding: "11px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: TYPE.micro, fontWeight: 600, letterSpacing: "0.06em", color: UI.ink3 }}><Cpu size={11} style={{ color: BLUE }} />한도 대비</div>
        <Gauge label="CPU" v={pod.cpu} /><Gauge label="MEM" v={pod.mem} />
      </div>
      <div style={{ fontSize: TYPE.caption, fontWeight: 600, letterSpacing: "0.06em", color: UI.ink3, marginTop: 2 }}>연결된 것들</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <PodDetailLink l={{ kind: "svc", id: pod.svc }} icon={<ServiceIcon id={pod.svc} size={14} style={{ color: SVC[pod.svc].color, flexShrink: 0 }} />} label={pod.svc} sub="서비스 · 형제 파드" setLens={setLens} setPin={setPin} />
        {(SVC_CFG[pod.svc] || []).map((c) => {
          const cfg = CONFIGS.find((x) => x.id === c)!;
          return <PodDetailLink key={c} l={{ kind: "cfg", id: c }} icon={<FileCog size={14} style={{ color: cfg.kind === "Secret" ? TINT.purple.fg : BLUE, flexShrink: 0 }} />} label={c} sub={cfg.kind} setLens={setLens} setPin={setPin} />;
        })}
        <PodDetailLink l={{ kind: "git", id: SVC[pod.svc].repo }} icon={<GithubIcon size={14} style={{ color: BRAND.github, flexShrink: 0 }} />} label={SVC[pod.svc].repo} sub={`${REPO_META[SVC[pod.svc].repo].rev} · ${REPO_META[SVC[pod.svc].repo].sync}`} setLens={setLens} setPin={setPin} />
        <PodDetailLink icon={<Server size={14} style={{ color: UI.ink2, flexShrink: 0 }} />} label={pod.node} sub={`물리 노드 · ${pod.cluster}`} onClick={() => openNode(pod.node)} setLens={setLens} setPin={setPin} />
      </div>
    </>
  );
}

// 단독 페이지(devpreview-opsia.html)에서만 마운트 — 셸에 임베드될 땐 컴포넌트로만 사용
if (window.location.pathname.includes("devpreview-opsia")) {
  ReactDOM.createRoot(document.getElementById("root")!).render(<OpsiaMap />);
}

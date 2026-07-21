/* eslint-disable react-hooks/exhaustive-deps */
// ⚠ 데모 · Opsia 통합 맵 v5 — 실 인벤토리 계약 배선.
// 원칙: 뉴트럴 표면 + 헤어라인, 색은 데이터에만, 모노 숫자, 4pt 그리드.
// 구조: 클러스터(리스트) → 노드(관측 목록) → 파드(관측 목록).
// no backfill: 계약이 노출하지 않는 값(CPU/MEM/용량/파드→노드 귀속 등)은 절대
// 지어내지 않는다. 관측이 없으면 "관측 안 됨"/"관측된 리소스가 없습니다"를 렌더한다.
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Box, ChevronRight, ChevronLeft, Plug, FileCog, Cpu, Activity, Server, Network } from "lucide-react";
import { UI, BLUE, HP, TINT, MONO, TYPE, SOFT, SPRING, PAGE, PRESENT_SCALE, DUR, inkA, blueA, LINE3, INK4, BRAND, cardA } from "./devpreview/theme";
import { AwsIcon, GithubIcon } from "./devpreview/brandIcons";
import { statusLabel } from "./devpreview/statusLabel";
import { useDevpreviewContracts, type DevpreviewCluster } from "./devpreview/contracts";
import { useClusterSummaries, type ClusterSummaryView } from "./devpreview/clusterSummaryFeed";
import { useClusterTopology, type InvNode, type InvPod } from "./devpreview/inventoryTopologyFeed";
import "./styles/tokens.css";
import "./styles/foundation.css";

// ── 도메인 ─────────────────────────────
// 관측된 리소스의 health/status 문자열을 정직하게 심각도로 매핑한다(계약 값 그대로,
// 지어내지 않는다). devpreview-surfaces 의 healthPill 과 동일한 규약.
type Sev = "ok" | "warn" | "crit" | "unknown";
function healthSev(health: string): Sev {
  const h = health.toLowerCase();
  if (h === "healthy" || h === "ready") return "ok";
  if (h === "degraded" || h === "warning") return "warn";
  if (h === "critical" || h === "failed" || h === "unhealthy") return "crit";
  return "unknown";
}
const sevColor = (s: Sev) => (s === "crit" ? HP.crit : s === "warn" ? HP.warn : s === "ok" ? HP.ok : UI.ink3);
const isBadHealth = (health: string) => healthSev(health) === "crit";

type View = { level: "clusters" } | { level: "nodes"; cluster: string } | { level: "pods"; cluster: string; node: string };
export type MapScope = View;

type TipData = { x: number; y: number; label: string; status: string; health: string } | null;

// ── 커서 추적 툴팁 정보(노드/파드 공용) ─────────────────────────────
function HealthChip({ health }: { health: string }) {
  const sev = healthSev(health);
  const label = statusLabel(health); // 매핑에 없는 원시값은 원문 유지(honest)
  if (sev === "unknown") {
    return <span style={{ fontSize: TYPE.micro, fontWeight: 600, color: UI.ink3, border: `1px solid ${UI.line}`, borderRadius: 5, padding: "1px 6px", whiteSpace: "nowrap" }}>{label}</span>;
  }
  const c = sevColor(sev);
  return <span style={{ fontSize: TYPE.micro, fontWeight: 700, color: c, background: `${c}14`, border: `1px solid ${c}33`, borderRadius: 5, padding: "1px 6px", whiteSpace: "nowrap" }}>{label}</span>;
}

// ── 관측 안 됨 표기(사용률 계약이 없을 때) ─────────────────────────────
function ClusterMiniUsage({ label, value }: { label: string; value: number | null }) {
  // A null usage percentage is an honest "not observed" contract state — the
  // backend returned no `cpu_pct`/`mem_pct` sample. It must never be backfilled.
  if (value === null) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span style={{ width: 34, fontSize: TYPE.micro, fontWeight: 600, letterSpacing: "0.05em", color: UI.ink3, flexShrink: 0 }}>{label}</span>
        <span style={{ flex: 1, height: 5, borderRadius: 999, background: inkA(0.05) }} />
        <span style={{ textAlign: "right", fontSize: TYPE.micro, fontWeight: 600, color: UI.ink3, flexShrink: 0 }}>관측 안 됨</span>
      </div>
    );
  }
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

// 클러스터 개요 스트립 — 실 클러스터 계약(정체성·버전) + 셸 인벤토리 kind 카운트.
// 계정/ARN/코어수/네트워크/디스크 등 가짜 파생값은 제거했다.
function ClusterOverview({ cl, meta, onKind }: {
  cl?: DevpreviewCluster; meta?: Record<string, number>; onKind?: (kindId: string) => void;
}) {
  const KIND_LINKS: [string, string][] = [["StatefulSet", "StatefulSets"], ["DaemonSet", "DaemonSets"], ["Service", "Services"], ["Ingress", "Ingresses"], ["Job", "Jobs"], ["CronJob", "CronJobs"]];
  const hasMeta = meta !== undefined;
  return (
    <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap", background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 14, padding: "12px 16px", marginBottom: 14 }}>
      <div style={{ minWidth: 0, flex: "1 1 340px", display: "flex", flexDirection: "column", gap: 3, fontFamily: MONO, fontSize: TYPE.caption, color: UI.ink2 }}>
        <span>{cl ? `${cl.provider.toUpperCase()} · Kubernetes ${cl.kubernetesVersion ?? "관측 안 됨"}` : "클러스터 관측 안 됨"}</span>
        <span style={{ color: UI.ink3 }}>
          노드 {cl?.nodeCount ?? "—"} · 파드 {cl?.podCount ?? "—"} · 네임스페이스 {meta?.Namespace ?? cl?.namespaceCount ?? "—"}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: TYPE.caption, color: UI.ink3 }}>
          <span className="pulsedot" style={{ width: 6, height: 6, borderRadius: 999, background: cl?.connectionStatus === "online" ? HP.ok : UI.ink3 }} />
          {cl?.connectionStatus === "online" ? "연결됨 · 자동 갱신" : "연결 상태 관측 대기"}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, auto)", gap: "5px 18px", alignContent: "center" }}>
        {KIND_LINKS.map(([kid, lb]) => (
          <span key={kid} role="link" className="kindlink" onClick={onKind ? () => onKind(kid) : undefined}
            style={{ display: "flex", alignItems: "baseline", gap: 5, fontSize: TYPE.label, color: UI.ink2, cursor: onKind ? "pointer" : "default" }}>
            <b style={{ fontFamily: MONO, fontWeight: 700, color: UI.ink, fontVariantNumeric: "tabular-nums" }}>{hasMeta ? (meta?.[kid] ?? 0) : "—"}</b>{lb}
          </span>
        ))}
      </div>
    </div>
  );
}

function ClusterRow({ cl, summary, onOpen }: {
  cl: DevpreviewCluster; summary?: ClusterSummaryView; onOpen: () => void;
}) {
  // Live: identity/version/counts from `GET /api/clusters`; usage/health/open
  // incidents from `GET /api/clusters/{id}/summary`. No fixture aggregation.
  const incidents = cl.incidentCount ?? summary?.openIncidents ?? 0;
  const healthy = cl.connectionStatus === "online" && incidents === 0;
  const nodesReady = summary?.nodesReady ?? null;
  const nodesTotal = summary?.nodesTotal ?? cl.nodeCount ?? null;
  const podCount = summary?.podsRunning ?? cl.podCount ?? null;
  const loading = summary === undefined || summary.status === "loading";
  const fmt = (n: number | null) => (loading ? "…" : n ?? "—");
  const cpuPct = loading ? null : summary?.cpuPct ?? null;
  const memPct = loading ? null : summary?.memPct ?? null;
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
            {cl.environment === "production" && <span style={{ fontSize: TYPE.micro, fontWeight: 600, color: TINT.warn.fg, border: `1px solid ${TINT.warn.bd}`, background: TINT.warn.bg, borderRadius: 5, padding: "1px 6px", flexShrink: 0 }}>prod</span>}
            {cl.readOnly && <span style={{ fontSize: TYPE.micro, fontWeight: 600, color: UI.ink2, border: `1px solid ${UI.line}`, background: UI.bg2, borderRadius: 5, padding: "1px 6px", flexShrink: 0 }}>읽기 전용</span>}
          </span>
          <span style={{ display: "block", fontSize: TYPE.caption2, color: UI.ink3, marginTop: 2, fontFamily: MONO }}>{cl.provider.toUpperCase()} · {cl.kubernetesVersion ?? "—"}</span>
        </span>
        {healthy
          ? <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: TYPE.caption, fontWeight: 700, color: TINT.ok.fg, background: TINT.ok.bg, border: `1px solid ${TINT.ok.bd}`, borderRadius: 999, padding: "3px 9px", flexShrink: 0 }}><span className="pulsedot" style={{ width: 6, height: 6, borderRadius: 999, background: HP.ok }} />Active</span>
          : <span style={{ fontSize: TYPE.caption, fontWeight: 700, color: UI.card, background: HP.crit, borderRadius: 999, padding: "3px 9px", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>장애 {incidents}</span>}
      </div>

      <div style={{ display: "flex", gap: 14, fontSize: TYPE.label, color: UI.ink2, fontVariantNumeric: "tabular-nums", flexWrap: "wrap" }}>
        <span>노드 <b style={{ fontFamily: MONO, color: UI.ink }}>{fmt(nodesReady)}/{fmt(nodesTotal)}</b> ready</span>
        <span>파드 <b style={{ fontFamily: MONO, color: UI.ink }}>{fmt(podCount)}</b>{incidents > 0 && <b style={{ color: TINT.crit.fg, fontFamily: MONO }}> · 장애 {incidents}</b>}</span>
        <span>네임스페이스 <b style={{ fontFamily: MONO, color: UI.ink }}>{loading ? "…" : cl.namespaceCount ?? "—"}</b></span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: "auto" }}>
        <ClusterMiniUsage label="CPU" value={cpuPct} />
        <ClusterMiniUsage label="MEM" value={memPct} />
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

// 방금 등록한 클러스터 — 에이전트 부트스트랩 후 첫 인벤토리 수집을 기다리는 정직한 상태.
// 이름 파생 CPU/메모리/노드 수·타이머 Active 승격은 제거했다. 서버가 상태를 주기
// 전까지 관측값은 "관측 안 됨"으로 남는다(가짜로 채우지 않는다).
export function PendingClusterCard({ name, delay = 0 }: { name: string; delay?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay }}
      style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 200, background: UI.card, border: `1px solid ${blueA(0.3)}`, borderRadius: 16, padding: 16, boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: inkA(0.06), display: "grid", placeItems: "center", flexShrink: 0 }}>
          <AwsIcon size={17} style={{ color: UI.ink3 }} />
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: TYPE.title3, fontWeight: 700, letterSpacing: "-0.02em", color: UI.ink, fontFamily: MONO, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
          <span style={{ display: "block", fontSize: TYPE.caption2, color: UI.ink3, marginTop: 2, fontFamily: MONO }}>Amazon EKS · 버전 관측 대기</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: TYPE.caption, fontWeight: 700, color: TINT.blue.fg, background: blueA(0.08), border: `1px solid ${blueA(0.25)}`, borderRadius: 999, padding: "3px 9px", flexShrink: 0 }}><span className="pulsedot" style={{ width: 6, height: 6, borderRadius: 999, background: BLUE }} />부트스트랩 중</span>
      </div>
      <div style={{ fontSize: TYPE.label, color: UI.ink2 }}>부트스트랩 중 · 첫 인벤토리 수집 대기</div>
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 7 }}>
        <ClusterMiniUsage label="CPU" value={null} />
        <ClusterMiniUsage label="MEM" value={null} />
      </div>
    </motion.div>
  );
}

// ── 홈 서피스용 클러스터 섹션 (D21 2층 — 보드 밖 고정) — 카드는 지도와 같은 ClusterRow 하나 ──
export function HomeClusterSection({ meta: _meta, onOpen, pending = [] }: {
  meta?: Record<string, Record<string, number>>; onOpen: (clId: string) => void; pending?: string[];
}) {
  const { clusters } = useDevpreviewContracts();
  const clusterIds = useMemo(() => clusters.map((cl) => cl.id), [clusters]);
  const summaries = useClusterSummaries(clusterIds);
  return (
    // 4칸 그리드 — 클러스터 카드 2칸씩, 연결 카드는 가로형 컴팩트 2칸(거대 공백 금지)
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gridAutoFlow: "row dense", gap: 14 }}>
      {clusters.map((cl) => (
        <div key={cl.id} style={{ gridColumn: "span 2", minWidth: 0 }}>
          <ClusterRow cl={cl} summary={summaries[cl.id]} onOpen={() => onOpen(cl.id)} />
        </div>
      ))}
      {pending.map((n, i) => (
        <div key={n} style={{ gridColumn: "span 2", minWidth: 0 }}>
          <PendingClusterCard name={n} delay={(clusters.length + i) * 0.05} />
        </div>
      ))}
      {/* 홈에는 연결 카드 없음 — 고정 헤더의 "+ 클러스터 연결" 버튼이 유일한 진입(중복 금지). 카드는 지도 클러스터 뷰 전용 */}
    </div>
  );
}

// ── 노드 카드 — 관측된 노드 하나. 계약이 주는 name/status/health 만 렌더한다.
// 용량·CPU·MEM·파드 수는 인벤토리 계약에 없어 표기하지 않는다(no backfill).
function NodeCard({ node, onOpen, onTip }: {
  node: InvNode; onOpen: () => void; onTip: (t: TipData) => void;
}) {
  const sev = healthSev(node.health);
  return (
    <motion.button transition={SPRING} onClick={onOpen}
      whileHover={{ boxShadow: `0 10px 26px -20px ${inkA(0.16)}`, borderColor: LINE3 }}
      onMouseEnter={(e) => onTip({ x: e.clientX, y: e.clientY, label: node.name, status: node.status, health: node.health })}
      onMouseMove={(e) => onTip({ x: e.clientX, y: e.clientY, label: node.name, status: node.status, health: node.health })}
      onMouseLeave={() => onTip(null)}
      style={{
        display: "flex", flexDirection: "column", gap: 10, width: "100%", height: "100%", textAlign: "left", cursor: "pointer",
        background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 16, padding: 16, boxShadow: "none", boxSizing: "border-box",
      }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, minWidth: 0 }}>
        <Server size={13} strokeWidth={2} style={{ color: UI.ink3, flexShrink: 0, marginTop: 2 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: TYPE.body, fontWeight: 700, letterSpacing: "-0.02em", color: UI.ink, fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.name}</div>
          <div style={{ fontSize: TYPE.caption2, color: UI.ink3, marginTop: 2 }}>{node.status ? statusLabel(node.status) : "상태 관측 안 됨"}</div>
        </div>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: sevColor(sev), flexShrink: 0, marginTop: 4 }} />
      </div>
      <div style={{ marginTop: "auto" }}><HealthChip health={node.health} /></div>
    </motion.button>
  );
}

// ── 파드 행 — 관측된 파드 하나. name/ns/status/health 만. CPU/MEM/재시작/나이/QoS는
// 인벤토리 계약이 노출하지 않으므로 표기하지 않는다(no backfill).
function PodRow({ pod, onClick, onTip }: {
  pod: InvPod; onClick: () => void; onTip: (t: TipData) => void;
}) {
  const sev = healthSev(pod.health);
  return (
    <motion.button data-pod={pod.key} onClick={(e) => { e.stopPropagation(); onClick(); }}
      onMouseEnter={(e) => onTip({ x: e.clientX, y: e.clientY, label: pod.name, status: pod.status, health: pod.health })}
      onMouseMove={(e) => onTip({ x: e.clientX, y: e.clientY, label: pod.name, status: pod.status, health: pod.health })}
      onMouseLeave={() => onTip(null)}
      whileTap={{ scale: 0.995 }}
      className="podrow"
      style={{
        display: "grid", gridTemplateColumns: "12px minmax(160px,1.8fr) minmax(90px,1fr) 92px 96px", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
        border: "none", background: "transparent", borderRadius: 9, padding: "8px 10px", cursor: "pointer",
      }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: sevColor(sev) }} />
      <span style={{ fontSize: TYPE.body, fontWeight: 600, fontFamily: MONO, color: UI.ink, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pod.name}</span>
      <span style={{ fontSize: TYPE.caption, fontFamily: MONO, color: UI.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pod.namespace ?? "—"}</span>
      <span style={{ fontSize: TYPE.caption, fontFamily: MONO, color: UI.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pod.status ? statusLabel(pod.status) : "—"}</span>
      <span style={{ justifySelf: "start" }}><HealthChip health={pod.health} /></span>
    </motion.button>
  );
}

// ── 앱 ─────────────────────────────
// embedded: 셸(통합 리소스)에 내장될 때 자체 헤더·내비를 숨기고 스코프 변화를 알림
export function OpsiaMap({ embedded = false, onScopeChange, onOpenResource, onOpenRca, lensTab, onAddCluster, onAddRepo, stickyTop, clusterMeta, onOpenKind, initialCluster, pendingClusters, pendingRepos }: {
  embedded?: boolean;
  onScopeChange?: (v: View) => void;
  /** 임베드 모드: 파드 클릭 시 셸의 통합 상세 오버레이를 연다 (내부 패널 대신) */
  onOpenResource?: (kind: "Pod", data: Record<string, unknown>) => void;
  /** 장애(unhealthy) 파드 클릭 시 RCA 상세 사이드바를 연다 */
  onOpenRca?: (incident: { name: string; symptom: string; cluster: string; svc: string; ns: string }) => void;
  /** 셸의 종류 선택과 연결 보기 탭 동기화 */
  lensTab?: "svc" | "cfg" | "git" | null;
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
  const { clusters } = useDevpreviewContracts();
  const clusterIds = useMemo(() => clusters.map((cl) => cl.id), [clusters]);
  const clusterSummaries = useClusterSummaries(clusterIds);

  const [view, setView] = useState<View>(initialCluster ? { level: "nodes", cluster: initialCluster } : { level: "clusters" });
  useEffect(() => { onScopeChange?.(view); }, [view]);

  // 드릴된 클러스터의 관측된 노드·파드(실 인벤토리 계약). 클러스터 뷰에선 null → 무요청.
  const activeCluster = view.level === "clusters" ? null : view.cluster;
  const topology = useClusterTopology(activeCluster);
  const { nodes, pods } = topology;
  const crit = pods.filter((p) => isBadHealth(p.health)).length;

  const [dir, setDir] = useState(1);
  const [mode, setMode] = useState<"push" | "hero">("push");
  // 노드 ↔ 파드 = 같은 대상에 더 가까이(히어로 확장) · 그 외 = 레벨 이동(푸시 슬라이드)
  const go = (v: View, d: number) => {
    const hero = (view.level === "nodes" && v.level === "pods") || (view.level === "pods" && v.level === "nodes");
    setMode(hero ? "hero" : "push");
    setDir(d); setView(v);
  };
  const [tip, setTip] = useState<TipData>(null);
  // 툴팁 좌표는 CSS px로 — zoom(PRESENT_SCALE) 컨테이너 안 fixed는 시각 px 그대로 쓰면 스케일만큼 어긋난다
  const tipScale = embedded ? PRESENT_SCALE : 1;
  const onTip = (t: TipData) => setTip(t ? { ...t, x: t.x / tipScale, y: t.y / tipScale } : null);

  const selectPod = (p: InvPod) => {
    // 장애(unhealthy) 파드는 RCA 상세로 진입하는 게 자연스럽다.
    if (embedded && isBadHealth(p.health) && onOpenRca) {
      onOpenRca({ name: p.name, symptom: p.status || p.health, cluster: p.cluster, svc: "", ns: p.namespace ?? "" });
      return;
    }
    // 임베드 모드: 상세는 셸의 최상위 오버레이 하나로 일원화(내부 패널과 이원화 금지).
    // 계약이 주는 필드만 전달 — 없는 값(CPU/MEM/재시작 등)은 상세가 "관측 안 됨"을 렌더한다.
    if (embedded && onOpenResource) {
      onOpenResource("Pod", {
        name: p.name, ns: p.namespace ?? undefined, kind: "Pod",
        status: p.status, health: p.health, cluster: p.cluster, bad: isBadHealth(p.health),
      });
    }
  };

  const viewKey = view.level === "clusters" ? "clusters" : view.level === "nodes" ? `nodes-${view.cluster}` : `pods-${view.node}`;
  const crumbs: { label: string; onClick?: () => void }[] = [{ label: "클러스터", onClick: view.level !== "clusters" ? () => go({ level: "clusters" }, -1) : undefined }];
  if (view.level !== "clusters") crumbs.push({ label: view.cluster, onClick: view.level === "pods" ? () => go({ level: "nodes", cluster: view.cluster }, -1) : undefined });
  if (view.level === "pods") crumbs.push({ label: view.node });

  const activeClusterMeta = view.level !== "clusters" ? clusterMeta?.[view.cluster] : undefined;
  const activeClusterObj = view.level !== "clusters" ? clusters.find((c) => c.id === view.cluster) : undefined;

  return (
    <div className="op">
      <div style={{ width: embedded ? "100%" : 1220, maxWidth: "100%", margin: "0 auto", padding: embedded ? 0 : "32px 24px 48px" }}>
        {!embedded && (
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
            <h1 style={{ margin: 0, fontSize: TYPE.title1, fontWeight: 800, letterSpacing: "-0.03em", color: UI.ink }}>통합 맵</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: TYPE.label2, fontWeight: 600, color: UI.ink2 }}>
              <span className="pulsedot" style={{ width: 6, height: 6, borderRadius: 999, background: HP.ok }} />
              실시간 · {clusters.length} 클러스터
            </div>
          </div>
        </header>
        )}

        {/* 상태 요약 줄 — 클러스터 수(실). 드릴 시 관측된 노드·파드 수를 정직하게 표기. */}
        {(() => {
          const seg: React.CSSProperties = { display: "flex", alignItems: "center", gap: 5, fontSize: TYPE.label, fontWeight: 600, color: UI.ink2, background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 999, padding: "5px 11px", whiteSpace: "nowrap" };
          const num: React.CSSProperties = { fontFamily: MONO, fontWeight: 700, color: UI.ink, fontVariantNumeric: "tabular-nums" };
          const drilled = view.level !== "clusters";
          const observing = drilled && topology.status !== "loading";
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              <span style={seg}><Server size={11} style={{ color: UI.ink3 }} />클러스터 <b style={num}>{clusters.length}</b>
                {(pendingClusters?.length ?? 0) > 0 && <span style={{ color: TINT.blue.fg }}>· 연결 중 {pendingClusters!.length}</span>}
              </span>
              {drilled && (
                <span style={seg}><Cpu size={11} style={{ color: UI.ink3 }} />노드 <b style={num}>{observing ? nodes.length : "…"}</b></span>
              )}
              {drilled && (
                <span style={seg}><Box size={11} style={{ color: UI.ink3 }} />파드 <b style={num}>{observing ? pods.length : "…"}</b></span>
              )}
              {crit > 0 && <span style={{ width: 1, height: 16, background: UI.line, margin: "0 2px" }} />}
              {crit > 0 && (
                <span style={{ fontSize: TYPE.label, fontWeight: 700, color: HP.crit, display: "flex", alignItems: "center", gap: 5, border: `1px solid ${TINT.crit.bd}`, background: TINT.crit.bg, borderRadius: 999, padding: "5px 12px" }}>
                  <Activity size={12} />장애 {crit}
                </span>
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
                    {clusters.map((cl, i) => (
                      <motion.div key={cl.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: i * 0.05 }} style={{ display: "flex" }}>
                        <ClusterRow cl={cl} summary={clusterSummaries[cl.id]}
                          onOpen={() => go({ level: "nodes", cluster: cl.id }, 1)} />
                      </motion.div>
                    ))}
                    {(pendingClusters ?? []).map((n, i) => <PendingClusterCard key={n} name={n} delay={(clusters.length + i) * 0.05} />)}
                    {onAddCluster && <AddClusterCard onClick={onAddCluster} delay={(clusters.length + (pendingClusters?.length ?? 0)) * 0.05} />}
                  </div>
                )}

                {view.level === "nodes" && (<>
                  <ClusterOverview cl={activeClusterObj} meta={activeClusterMeta} onKind={onOpenKind} />
                  {topology.status === "loading" ? (
                    <NodeSkeleton />
                  ) : topology.status === "unavailable" ? (
                    <EmptyState icon={<Server size={18} strokeWidth={1.75} />} label="인벤토리 관측 안 됨"
                      hint="에이전트가 아직 이 클러스터의 노드 인벤토리를 보고하지 않았습니다." />
                  ) : nodes.length === 0 ? (
                    <EmptyState icon={<Cpu size={18} strokeWidth={1.75} />} label="관측된 노드가 없습니다"
                      hint="이 클러스터에서 준비된 노드가 아직 관측되지 않았습니다." />
                  ) : (
                    /* 노드: 4칸 그리드. 계약이 주는 정체성·상태만 — 용량 병합/파드 밀도 표기 없음 */
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
                      {nodes.map((node, i) => (
                        <motion.div key={node.key} style={{ minWidth: 0, maxWidth: "100%" }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: i * 0.04 }}>
                          <NodeCard node={node} onOpen={() => go({ level: "pods", cluster: view.cluster, node: node.name }, 1)} onTip={onTip} />
                        </motion.div>
                      ))}
                    </div>
                  )}
                </>)}

                {view.level === "pods" && (
                  <div style={{ background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 16, padding: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <Server size={14} style={{ color: UI.ink3 }} />
                      <span style={{ fontSize: TYPE.body, fontWeight: 700, fontFamily: MONO, color: UI.ink }}>{view.node}</span>
                    </div>
                    {/* 정직성: 인벤토리 계약은 파드의 노드 귀속을 노출하지 않는다.
                        따라서 이 클러스터에서 관측된 파드 전체를 표시한다(노드별 필터 불가). */}
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, background: UI.bg2, border: `1px solid ${UI.line}`, borderRadius: 10, padding: "9px 12px", marginBottom: 14 }}>
                      <Network size={13} strokeWidth={2} style={{ color: UI.ink3, flexShrink: 0, marginTop: 1 }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: TYPE.label2, fontWeight: 600, color: UI.ink2 }}>노드 범위 관측 미지원 · 클러스터 전체 파드 표시</div>
                        <div style={{ fontSize: TYPE.caption2, color: UI.ink3, marginTop: 2 }}>인벤토리 계약이 파드의 노드 귀속을 노출하지 않아, 이 클러스터에서 관측된 파드 전체를 보여줍니다.</div>
                      </div>
                    </div>
                    {topology.status === "loading" ? (
                      <PodSkeleton />
                    ) : topology.status === "unavailable" ? (
                      <EmptyState icon={<Box size={18} strokeWidth={1.75} />} label="인벤토리 관측 안 됨"
                        hint="에이전트가 아직 이 클러스터의 파드 인벤토리를 보고하지 않았습니다." flush />
                    ) : pods.length === 0 ? (
                      <EmptyState icon={<Box size={18} strokeWidth={1.75} />} label="관측된 파드가 없습니다"
                        hint="이 클러스터에서 실행 중인 파드가 아직 관측되지 않았습니다." flush />
                    ) : (<>
                      <div style={{ display: "grid", gridTemplateColumns: "12px minmax(160px,1.8fr) minmax(90px,1fr) 92px 96px", alignItems: "center", gap: 12, padding: "0 10px 7px", borderBottom: `1px solid ${UI.line}`, fontSize: TYPE.micro, fontWeight: 600, letterSpacing: "0.07em", color: UI.ink3 }}>
                        <span /><span>파드</span><span>네임스페이스</span><span>상태</span><span>헬스</span>
                      </div>
                      {pods.map((p) => (
                        <PodRow key={p.key} pod={p} onClick={() => selectPod(p)} onTip={onTip} />
                      ))}
                    </>)}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <SidePanel key={lensTab ?? "default"} forcedTab={lensTab ?? null} scaled={embedded} onAddRepo={onAddRepo} stickyTop={stickyTop} pendingRepos={pendingRepos} />
        </div>
      </div>

      {/* 커서 추적 툴팁 — 관측된 리소스의 이름·상태·헬스 */}
      <AnimatePresence>
        {tip && (
          <motion.div key="tip" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: DUR.micro }}
            style={{
              position: "fixed", left: Math.min(tip.x + 14, window.innerWidth - 200), top: Math.min(tip.y + 16, window.innerHeight - 90), zIndex: 60, pointerEvents: "none",
              background: cardA(0.96), backdropFilter: "blur(10px)", border: `1px solid ${UI.line}`, borderRadius: 11, padding: "9px 11px",
              boxShadow: `0 10px 30px -12px ${inkA(0.22)}`, minWidth: 160,
            }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: sevColor(healthSev(tip.health)), flexShrink: 0 }} />
              <span style={{ fontSize: TYPE.label2, fontWeight: 700, fontFamily: MONO, color: UI.ink, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tip.label}</span>
            </div>
            <div style={{ fontSize: TYPE.caption, color: UI.ink3, marginTop: 3, marginLeft: 13 }}>
              {(tip.status ? statusLabel(tip.status) : "상태 관측 안 됨")} · {tip.health ? statusLabel(tip.health) : "헬스 관측 안 됨"}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        html, body { background: ${UI.bg}; }
        .op { min-height: 100vh; background: ${UI.bg}; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Pretendard", "Apple SD Gothic Neo", "Helvetica Neue", sans-serif; -webkit-font-smoothing: antialiased; }
        .op .podrow { position: relative; transition: background .15s ease; }
        .op .podrow:hover { background: ${inkA(0.035)} !important; }
        .op .kindlink:hover { color: ${BLUE} !important; } .op .kindlink:hover b { color: ${BLUE}; }
        .pulsedot { animation: pd 1.5s ease-in-out infinite; }
        @keyframes pd { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
        .op .op-skel { display: block; background: linear-gradient(90deg, ${inkA(0.05)} 25%, ${inkA(0.09)} 37%, ${inkA(0.05)} 63%); background-size: 400% 100%; animation: skel 1.4s ease-in-out infinite; }
        @keyframes skel { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }
        .op ::-webkit-scrollbar { width: 8px; } .op ::-webkit-scrollbar-thumb { background: ${inkA(0.12)}; border-radius: 99px; }
        @media (prefers-reduced-motion: reduce) { .pulsedot, .op .op-skel { animation: none !important; } }
      `}</style>
    </div>
  );
}

// ── 빈 상태 — 아이콘 + 제목 + 부연으로 정돈(투박한 한 줄 텍스트 대신). 정직한 "관측 안 됨" 문구 유지.
function EmptyState({ icon, label, hint, flush = false }: { icon?: React.ReactNode; label: string; hint?: string; flush?: boolean }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
      background: flush ? "transparent" : UI.card, border: flush ? "none" : `1px solid ${UI.line}`, borderRadius: 14,
      padding: "44px 20px", textAlign: "center",
    }}>
      {icon && <span style={{ width: 40, height: 40, borderRadius: 12, background: inkA(0.04), display: "grid", placeItems: "center", color: UI.ink3, flexShrink: 0 }}>{icon}</span>}
      <span style={{ fontSize: TYPE.body, fontWeight: 700, color: UI.ink2 }}>{label}</span>
      {hint && <span style={{ fontSize: TYPE.caption, color: UI.ink3, maxWidth: 320, lineHeight: 1.5 }}>{hint}</span>}
    </div>
  );
}

// ── 로딩 스켈레톤 — 실데이터 도착 전 레이아웃 자리를 잡아 깜빡임/점프를 줄인다. shimmer는 .op-skel.
function NodeSkeleton() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 96, background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 16, padding: 16, boxSizing: "border-box" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="op-skel" style={{ width: 13, height: 13, borderRadius: 4 }} />
            <span className="op-skel" style={{ flex: 1, height: 11, borderRadius: 5 }} />
          </div>
          <span className="op-skel" style={{ width: "52%", height: 9, borderRadius: 5 }} />
          <span className="op-skel" style={{ width: 54, height: 17, borderRadius: 6, marginTop: "auto" }} />
        </div>
      ))}
    </div>
  );
}

function PodSkeleton() {
  const cols = "12px minmax(160px,1.8fr) minmax(90px,1fr) 92px 96px";
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: cols, alignItems: "center", gap: 12, padding: "0 10px 7px", borderBottom: `1px solid ${UI.line}`, fontSize: TYPE.micro, fontWeight: 600, letterSpacing: "0.07em", color: UI.ink3 }}>
        <span /><span>파드</span><span>네임스페이스</span><span>상태</span><span>헬스</span>
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: cols, alignItems: "center", gap: 12, padding: "9px 10px" }}>
          <span className="op-skel" style={{ width: 10, height: 10, borderRadius: 3 }} />
          <span className="op-skel" style={{ width: `${68 - i * 4}%`, height: 10, borderRadius: 5 }} />
          <span className="op-skel" style={{ width: "62%", height: 9, borderRadius: 5 }} />
          <span className="op-skel" style={{ width: 46, height: 9, borderRadius: 5 }} />
          <span className="op-skel" style={{ width: 42, height: 17, borderRadius: 6 }} />
        </div>
      ))}
    </div>
  );
}

// ── 우측 패널 ─────────────────────────────
// 서비스·구성 관계는 인벤토리 계약(resources/summary)에서 관측되지 않는다 →
// 정직한 "관측 안 됨". 저장소 탭은 실 세션 값(pendingRepos)과 연결 어포던스만 유지한다.
function SidePanel({ forcedTab, scaled, onAddRepo, stickyTop, pendingRepos }: {
  forcedTab?: "svc" | "cfg" | "git" | null; scaled?: boolean; onAddRepo?: () => void; stickyTop?: number; pendingRepos?: string[];
}) {
  const [tab, setTab] = useState<"svc" | "cfg" | "git">(forcedTab ?? "svc");
  return (
    <aside style={{ width: 270, flexShrink: 0, alignSelf: "flex-start", background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 16, position: "sticky", top: stickyTop ?? 24, maxHeight: scaled ? `calc(100vh / ${PRESENT_SCALE} - ${(stickyTop ?? 24) + 16}px)` : "calc(100vh - 60px)", overflow: "hidden", display: "flex" }}>
    <div style={{ flex: 1, minWidth: 0, padding: "14px 6px 14px 14px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", scrollbarGutter: "stable" }}>
      <div style={{ fontSize: TYPE.bodyStrong, fontWeight: 700, letterSpacing: "-0.02em", color: UI.ink, padding: "2px 2px 0" }}>연결 보기</div>
      <div style={{ display: "flex", gap: 3, background: inkA(0.04), borderRadius: 10, padding: 3 }}>
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

      {tab === "svc" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "26px 14px", textAlign: "center" }}>
          <Network size={20} style={{ color: INK4 }} />
          <span style={{ fontSize: TYPE.label2, fontWeight: 600, color: UI.ink2 }}>서비스 관계 관측 안 됨</span>
          <span style={{ fontSize: TYPE.caption, color: UI.ink3 }}>서비스 호출 관계는 트래픽 관점에서 관측됩니다.</span>
        </div>
      )}

      {tab === "cfg" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "26px 14px", textAlign: "center" }}>
          <FileCog size={20} style={{ color: INK4 }} />
          <span style={{ fontSize: TYPE.label2, fontWeight: 600, color: UI.ink2 }}>구성 관계 관측 안 됨</span>
          <span style={{ fontSize: TYPE.caption, color: UI.ink3 }}>ConfigMap·Secret 참조는 쿠버네티스 관점의 리소스 상세에서 확인하세요.</span>
        </div>
      )}

      {tab === "git" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
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
          {(pendingRepos ?? []).length === 0 && (
            <div style={{ fontSize: TYPE.caption, color: UI.ink3, padding: "16px 10px 6px" }}>연결된 저장소는 배포 관점에서 관리됩니다.</div>
          )}
          {onAddRepo && (
            <button onClick={onAddRepo}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", marginTop: 6, padding: "9px 0",
                border: `1.5px dashed ${LINE3}`, borderRadius: 11, background: "transparent", cursor: "pointer", fontSize: TYPE.label2, fontWeight: 700, color: BLUE }}>
              + 저장소 연결
            </button>
          )}
        </div>
      )}
    </div>
    </aside>
  );
}

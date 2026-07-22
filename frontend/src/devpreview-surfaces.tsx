// ── 데모 서피스: 배포 · 이슈 · 타임라인 · 점검 · 비용 · 설정 (Master Spec 5.7~5.10) ──
// 원칙: 모든 숫자는 실제 백엔드 계약(어댑터 훅) 파생 — 관측 안 된 값은 채우지 않는다(no backfill).
// 시각은 공용 부품(KpiValue/MiniBars/RankList/MiniTimeline)과 셸 토큰만 사용. 제품 이식 시 D5 공용 표로 수렴한다.
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  Rocket, Package, AlertTriangle, Bell, Clock, ShieldCheck, Coins,
  Building2, Globe, Check, Sparkles, X, Palette, RefreshCw, Lock, Pin,
  ChevronRight, MapPin, ShieldAlert, ArrowLeft, ArrowRight, ExternalLink, CircleAlert,
} from "lucide-react";
import { UI, BLUE, HP, TINT, MONO, TYPE, SOFT, DUR, PRESENT_SCALE, inkA, blueA, critA, BRAND } from "./devpreview/theme";
import { GithubIcon } from "./devpreview/brandIcons";
import { useCostOverview } from "./devpreview/costFeed";
import { useChecksOverview } from "./devpreview/checksFeed";
import { useIncidentRecentChanges, useRcaIssueDetails, useRecoveryPlan, type RcaIssueDetailView } from "./devpreview/rcaDetailFeed";
import { isActiveRcaIssue } from "./devpreview/rcaIssuesFeed";
import { useSession, sessionInitial } from "./devpreview/sessionFeed";
import { useAiConversations, useConversationDetail } from "./devpreview/aiFeed";
import { useAlertEvents, useAlertRules, useAlertChannels } from "./devpreview/alertsFeed";
import {
  useApplicationRuns,
  useApplications,
  useHelmReleases,
  type ApplicationRunView,
  type WorkflowStepView,
} from "./devpreview/deployFeed";
import { useChangeTimeline } from "./devpreview/changeTimelineFeed";
import { useTimelineBoard } from "./devpreview/timelineFeed";
import { useUiPreferences, useRefreshPolicies, useSettingsAccess } from "./devpreview/settingsFeed";
import { MiniTimeline } from "./devpreview/widgets";
import { statusLabel } from "./devpreview/statusLabel";
import { RepositoryConnections } from "./devpreview/RepositoryConnections";
import { groupApplicationsByRepository } from "./devpreview/repositoryRegistry";
import { selectScenarioRuns } from "./devpreview/scenarioGateSelection";

// ── 상대 시간 포맷 — 서버 타임스탬프(ISO 또는 epoch ms)를 사람이 읽는 근사치로 ──
function fromNow(input: string | number | null): string {
  if (input === null) return "—";
  const ms = typeof input === "number" ? input : Date.parse(input);
  if (!Number.isFinite(ms)) return "—";
  const diff = Date.now() - ms;
  if (diff < 0) return "방금";
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  return `${day}일 전`;
}

// ── 상태 라벨 — 공용 statusLabel(신규 헬퍼) 우선, 이 서피스에서만 쓰는 소수 토큰은
//    로컬 보강(헬퍼 파일은 동시 편집 금지라 여기서 덧댄다). 매핑에 없으면 원문 유지. ──
const LOCAL_STATUS_KO: Record<string, string> = {
  firing: "발생 중",
  live: "실시간",
  stale: "지연",
  partial: "부분",
  trusted_proxy: "신뢰 프록시",
  service_admin: "서비스 관리자",
  applications: "애플리케이션 목록",
  changes: "변경 이력",
  cost_nodes: "비용·노드",
  cost_summary: "비용 요약",
  cost_trend: "비용 추이",
  dashboard: "대시보드",
  gitops_counts: "GitOps 집계",
  gitops_rows: "GitOps 항목",
  helm_detail: "Helm 상세",
  helm_list: "Helm 목록",
  issues_audit: "이슈 감사",
  metrics_kubernetes: "Kubernetes 메트릭",
  metrics_prometheus: "Prometheus 메트릭",
  metrics_pvc: "PVC 메트릭",
  metrics_rightsizing: "리소스 최적화 메트릭",
  port_sessions: "포트 세션",
  resource_list: "리소스 목록",
  resource_list_slow: "느린 리소스 목록",
  evidence_received: "증거 수신",
  evidence_collected: "증거 수집 완료",
  evidence_built: "증거 정규화 완료",
  evidence_bundled: "증거 묶음 생성",
  incident_detected: "장애 감지",
  rule_missing: "분석 규칙 확인 필요",
  backlog_created: "분석 대기",
  ai_fallback_requested: "AI 보완 분석 중",
  rca_planned: "RCA 계획됨",
  rca_in_progress: "RCA 분석 중",
  rca_evaluated: "원인 후보 평가 완료",
  rca_completed: "원인 분석 완료",
  followup_required: "추가 확인 필요",
  action_required: "복구 검토 필요",
  recovery_planned: "복구 계획 생성",
  selection_required: "복구 선택 필요",
  recovery_selected: "복구 조치 선택됨",
  command_requested: "복구 요청됨",
  command_dispatched: "복구 실행 중",
  command_queued: "복구 실행 대기",
  command_completed: "복구 실행 완료",
  command_rejected: "복구 명령 거부됨",
  pr_requested: "복구 PR 요청됨",
  pr_created: "복구 PR 생성됨",
  pr_failed: "복구 PR 생성 실패",
};
function koLabel(raw: string | null | undefined): string {
  const key = raw?.trim().toLowerCase();
  return (key ? LOCAL_STATUS_KO[key] : undefined) ?? statusLabel(raw);
}
// ── reason code 한글화 — 백엔드가 준 원시 스네이크 코드(:cluster 등 콜론 접미사 포함)를
//    사용자 친화 한글 문구로. 매핑에 없으면 일반 안내로 폴백하고, 원시 코드는 호출부에서
//    작은 부가표기로만 노출한다(코드 나열 대신 정돈된 안내). ──
const REASON_KO: Record<string, string> = {
  checks_observation_unavailable: "점검 관측 데이터가 아직 없습니다",
  checks_definition_unavailable: "점검 정의(카탈로그)가 아직 없습니다",
  checks_observation_stale: "점검 관측 데이터가 오래되었습니다",
  checks_observation_partial: "점검 관측이 부분적으로만 수집되었습니다",
  checks_observation_clock_skew: "점검 관측 시각에 편차가 있습니다",
  checks_namespace_scope_partial: "일부 네임스페이스만 점검 범위에 포함되었습니다",
  checks_catalog_conflict: "점검 카탈로그 정의가 충돌합니다",
  application_bindings_incomplete: "애플리케이션 바인딩이 아직 완료되지 않았습니다",
  cost_observation_unavailable: "비용 관측 데이터가 아직 없습니다",
  cost_observation_not_integrated: "비용 관측이 아직 연동되지 않았습니다",
  node_pricing_observation_not_integrated: "노드 단가 관측이 아직 연동되지 않았습니다",
};
function reasonLabel(code: string): string {
  const prefix = code.split(":")[0];
  return REASON_KO[code] ?? REASON_KO[prefix] ?? "관측 데이터가 아직 없습니다";
}
// 정돈된 honest 안내 — 원시 코드 프리픽스로 중복 제거해 한글 한 줄씩, 원시 코드는 작은 표기로만.
function ReasonNotes({ codes }: { codes: string[] }) {
  const seen = new Set<string>();
  const rows: string[] = [];
  for (const c of codes) { const k = c.split(":")[0]; if (!seen.has(k)) { seen.add(k); rows.push(k); } }
  if (rows.length === 0) return null;
  return (
    <ul style={{ display: "flex", flexDirection: "column", gap: 5, margin: "8px 0 0", padding: 0, listStyle: "none" }}>
      {rows.map((k) => (
        <li key={k} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: TYPE.caption2, color: UI.ink2 }}>
          <span style={{ width: 4, height: 4, borderRadius: 999, background: HP.warn, flexShrink: 0, transform: "translateY(-2px)" }} />
          {/* M27/M28: 원시 reason code는 사용자에게 노출하지 않는다 — 한글 honest 라벨만 표기. */}
          <span style={{ flex: 1, minWidth: 0 }}>{reasonLabel(k)}</span>
        </li>
      ))}
    </ul>
  );
}

// ── 공통 프레임: 제목 + 주 액션 1개(P-43) + 탭 ──
function Page({ title, icon: I, action, tabs, tab, onTab, children }: {
  title: string; icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  action?: React.ReactNode; tabs?: string[]; tab?: string; onTab?: (t: string) => void; children: React.ReactNode;
}) {
  return (
    <main style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 16, padding: "14px 18px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <I size={17} style={{ color: BLUE }} />
        <span style={{ fontSize: TYPE.heading, fontWeight: 700, letterSpacing: "-0.02em", color: UI.ink }}>{title}</span>
        <span style={{ marginLeft: "auto" }}>{action}</span>
      </div>
      {tabs && (
        <div style={{ display: "flex", gap: 2, background: inkA(0.05), borderRadius: 9, padding: 2, width: "fit-content" }}>
          {tabs.map((t) => (
            <button key={t} onClick={() => onTab?.(t)}
              style={{ position: "relative", border: "none", background: "transparent", borderRadius: 7, padding: "5px 16px", fontSize: TYPE.label2, fontWeight: 700, color: tab === t ? UI.ink : UI.ink3, cursor: "pointer" }}>
              {tab === t && <motion.span layoutId={`ptab-${title}`} transition={SOFT} style={{ position: "absolute", inset: 0, background: UI.card, borderRadius: 7, boxShadow: `0 1px 4px ${inkA(0.14)}` }} />}
              <span style={{ position: "relative" }}>{t}</span>
            </button>
          ))}
        </div>
      )}
      {children}
    </main>
  );
}

const Card = ({ children, pad = 15 }: { children: React.ReactNode; pad?: number }) => (
  <div style={{ background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 14, padding: pad, minWidth: 0 }}>{children}</div>
);
const SettingsRow = ({ icon: I, title, sub, right }: { icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>; title: string; sub: string; right: React.ReactNode }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 15px", borderBottom: `1px solid ${UI.line2}` }}>
    <span style={{ width: 32, height: 32, borderRadius: 9, background: inkA(0.05), display: "grid", placeItems: "center", flexShrink: 0 }}><I size={16} style={{ color: UI.ink2 }} /></span>
    <span style={{ minWidth: 0, flex: 1 }}>
      <span style={{ display: "block", fontSize: TYPE.body, fontWeight: 700, color: UI.ink }}>{title}</span>
      <span style={{ display: "block", fontSize: TYPE.caption2, color: UI.ink3, marginTop: 1 }}>{sub}</span>
    </span>
    {right}
  </div>
);
const Pill = ({ tone, label }: { tone: "ok" | "warn" | "crit" | "info"; label: string }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: TYPE.caption, fontWeight: 700, borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap",
    color: tone === "ok" ? TINT.ok.fg : tone === "warn" ? TINT.warn.fg : tone === "crit" ? TINT.crit.fg : TINT.blue.fg,
    background: tone === "ok" ? TINT.ok.bg : tone === "warn" ? TINT.warn.bg : tone === "crit" ? critA(0.09) : blueA(0.08),
    border: `1px solid ${tone === "ok" ? TINT.ok.bd : tone === "warn" ? TINT.warn.bd : tone === "crit" ? critA(0.3) : blueA(0.25)}` }}>
    <span className={tone !== "ok" ? "pulsedot" : undefined} style={{ width: 5, height: 5, borderRadius: 999, background: tone === "info" ? BLUE : HP[tone] }} />{label}
  </span>
);
// 간이 표 행 — 제품에서는 D5 공용 표가 오너(여기서는 같은 타이포·헤어라인 문법만 재현)
function THead({ cols }: { cols: [string, string][] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: cols.map(([, w]) => w).join(" "), gap: 12, padding: "8px 14px", borderBottom: `1px solid ${UI.line}`, background: UI.bg2 }}>
      {cols.map(([l]) => <span key={l} style={{ fontSize: TYPE.micro, fontWeight: 600, letterSpacing: "0.05em", color: UI.ink3 }}>{l}</span>)}
    </div>
  );
}
function TRow({ cols, cells, onClick, i = 0 }: { cols: [string, string][]; cells: React.ReactNode[]; onClick?: () => void; i?: number }) {
  return (
    <motion.button initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: Math.min(i, 8) * 0.04 }}
      onClick={onClick} disabled={!onClick} className={onClick ? "rrow" : undefined}
      style={{ display: "grid", gridTemplateColumns: cols.map(([, w]) => w).join(" "), gap: 12, alignItems: "center", width: "100%", textAlign: "left", border: "none", background: "transparent", borderBottom: `1px solid ${UI.line2}`, padding: "10px 14px", cursor: onClick ? "pointer" : "default" }}>
      {cells.map((c, j) => <span key={j} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: TYPE.label2, color: UI.ink }}>{c}</span>)}
    </motion.button>
  );
}
// 서피스 요약 칩 — 홈·지도 상태 요약 줄과 같은 칩 문법(제품 P2에서 공용 컴포넌트로 수렴)
const segStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 5, fontSize: TYPE.label, fontWeight: 600, color: UI.ink2, background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 999, padding: "5px 11px", whiteSpace: "nowrap" };
const numStyle: React.CSSProperties = { fontFamily: MONO, fontWeight: 700, color: UI.ink, fontVariantNumeric: "tabular-nums" };
function ChipRow({ chips }: { chips: { label: string; value: React.ReactNode; warn?: boolean; crit?: boolean }[] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {chips.map((c) => (
        <span key={c.label} style={{ ...segStyle, ...(c.crit ? { borderColor: TINT.crit.bd, background: TINT.crit.bg, color: TINT.crit.fg } : c.warn ? { borderColor: TINT.warn.bd, background: TINT.warn.bg, color: TINT.warn.fg } : {}) }}>
          {c.label} <b style={numStyle}>{c.value}</b>
        </span>
      ))}
    </div>
  );
}

const Mono = ({ children, dim }: { children: React.ReactNode; dim?: boolean }) => (
  <span style={{ fontFamily: MONO, fontSize: TYPE.label, color: dim ? UI.ink3 : UI.ink, fontVariantNumeric: "tabular-nums" }}>{children}</span>
);


// ── 배포 /deploy — 탭: 애플리케이션 | GitOps | 워크플로우 | Helm 릴리스 (5.7) ──
// UI-PHASE2-001: 실 GET /api/applications(애플리케이션·GitOps·워크플로우 실행) +
// GET /api/helm/releases. 애플리케이션 jsonMap은 방어적으로 읽고, 없는 필드는
// 정직한 gap으로, Helm은 커버리지 unavailable + reason code를 그대로 렌더한다.
// 읽기 전용 — 여기서 어떤 배포/동기화 변형(mutation)도 발생시키지 않는다.
function healthPill(status: string | null): React.ReactNode {
  if (status === "healthy" || status === "ready") return <Pill tone="ok" label={koLabel(status)} />;
  if (status === "degraded" || status === "warning") return <Pill tone="warn" label={koLabel(status)} />;
  if (status === "critical" || status === "failed" || status === "unhealthy") return <Pill tone="crit" label={koLabel(status)} />;
  return <span style={{ fontSize: TYPE.label, color: UI.ink3 }}>{status ? koLabel(status) : "관측 안 됨"}</span>;
}
function deliveryPill(status: string | null): React.ReactNode {
  if (status === null) return <Mono dim>—</Mono>;
  if (status === "succeeded" || status === "synced" || status === "healthy") return <Pill tone="ok" label={koLabel(status)} />;
  if (status === "failed" || status === "degraded" || status === "error") return <Pill tone="crit" label={koLabel(status)} />;
  if (status === "pending" || status === "progressing" || status === "running") return <Pill tone="info" label={koLabel(status)} />;
  return <Pill tone="warn" label={koLabel(status)} />;
}
const emptyRow = (msg: string) => <div style={{ padding: "14px 15px", fontSize: TYPE.label2, color: UI.ink3 }}>{msg}</div>;

function workflowStep(run: ApplicationRunView | null, name: string): WorkflowStepView | null {
  return run?.steps.find((step) => step.name === name) ?? null;
}

function detailString(details: Record<string, unknown>, key: string): string | null {
  const value = details[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function detailEvidence(details: Record<string, unknown>, needles: string[]): string | null {
  const normalizedNeedles = needles.map((needle) => needle.toLowerCase());
  const visit = (value: unknown): string | null => {
    if (typeof value === "string") {
      const normalized = value.toLowerCase();
      return normalizedNeedles.some((needle) => normalized.includes(needle)) ? value : null;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const match = visit(item);
        if (match) return match;
      }
      return null;
    }
    if (typeof value === "object" && value !== null) {
      for (const item of Object.values(value)) {
        const match = visit(item);
        if (match) return match;
      }
    }
    return null;
  };
  return visit(details);
}

function scenarioRun(runs: ApplicationRunView[], stepName: string): { run: ApplicationRunView; step: WorkflowStepView } | null {
  for (const run of runs) {
    const step = workflowStep(run, stepName);
    if (step) return { run, step };
  }
  return null;
}

function GateStage({ label, state, evidence, href, actionLabel, onAction }: {
  label: string;
  state: "done" | "observed" | "pending";
  evidence: string;
  href?: string | null;
  actionLabel?: string | null;
  onAction?: (() => void) | null;
}) {
  const tone = state === "done" ? TINT.ok : state === "observed" ? TINT.warn : { fg: UI.ink3, bg: UI.bg2, bd: UI.line };
  const content = (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, border: `1px solid ${tone.bd}`, background: tone.bg, borderRadius: 10, padding: "10px 12px" }}>
      <span style={{ width: 22, height: 22, borderRadius: 999, display: "grid", placeItems: "center", flexShrink: 0, background: state === "done" ? TINT.ok.fg : state === "observed" ? TINT.warn.fg : inkA(0.08), color: UI.card }}>
        {state === "done" ? <Check size={13} strokeWidth={3} /> : state === "observed" ? <AlertTriangle size={12} /> : <span style={{ width: 6, height: 6, borderRadius: 999, background: UI.ink3 }} />}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: TYPE.label2, fontWeight: 750, color: state === "pending" ? UI.ink2 : tone.fg }}>{label}</div>
        <div title={evidence} style={{ marginTop: 2, fontFamily: MONO, fontSize: TYPE.caption2, color: UI.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{evidence}</div>
      </div>
      {actionLabel && onAction ? (
        <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onAction(); }}
          style={{ flexShrink: 0, border: `1px solid ${tone.bd}`, background: UI.card, color: tone.fg, borderRadius: 7, padding: "5px 8px", fontSize: TYPE.caption2, fontWeight: 750, cursor: "pointer" }}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
  return href ? <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>{content}</a> : content;
}

function ScenarioGate({ runs, repositoryRef, status, onRefresh, onOpenRef, onOpenIssues, onAskAi }: {
  runs: ApplicationRunView[];
  repositoryRef: string | null;
  status: "loading" | "ready" | "unavailable";
  onRefresh: () => void;
  onOpenRef: (kind: string, name: string) => void;
  onOpenIssues: () => void;
  onAskAi: () => void;
}) {
  const selection = selectScenarioRuns(runs, repositoryRef);
  const scopedRuns = selection.runs;
  const latest = scopedRuns[0] ?? null;
  const gitRecord = scenarioRun(scopedRuns, "git");
  const applyRecord = scenarioRun(scopedRuns, "apply");
  const healthRecord = scenarioRun(scopedRuns, "health");
  const safePrRecord = scenarioRun(scopedRuns, "safe_pr");
  const diffRecord = scenarioRun(scopedRuns, "diff");
  const failureRecord = scopedRuns.flatMap((run) => run.steps.map((step) => ({ run, step }))).find(({ step }) =>
    detailEvidence(step.details, ["imagepullbackoff", "errimagepull", "image_pull_back_off"]) !== null
    || step.message?.toLowerCase().includes("imagepullbackoff") === true
    || step.message?.toLowerCase().includes("errimagepull") === true) ?? null;
  const blocked = scopedRuns.find((run) =>
    run.status === "waiting_for_approval"
    || run.promotionGate?.eligible === false);
  const actualImage = diffRecord ? detailString(diffRecord.step.details, "actual_image") : null;
  const desiredImage = diffRecord ? detailString(diffRecord.step.details, "desired_image") : null;
  const failureEvidence = failureRecord
    ? detailEvidence(failureRecord.step.details, ["imagepullbackoff", "errimagepull", "image_pull_back_off"])
      ?? failureRecord.step.message
      ?? failureRecord.run.workflowRunId
    : null;
  const failureResource = failureRecord
    ? detailString(failureRecord.step.details, "pod_name")
      ?? detailString(failureRecord.step.details, "resource_name")
      ?? detailString(failureRecord.step.details, "name")
    : null;
  const failedImageCandidate = failureRecord === null && actualImage !== null
    ? `배포 diff 이미지 ${actualImage}${desiredImage ? ` → ${desiredImage}` : ""} · 직접 장애 이벤트 없음`
    : null;
  const prUrl = safePrRecord ? detailString(safePrRecord.step.details, "pr_url") : null;
  const repository = latest?.repositoryRef ?? selection.repositoryRef;
  const commitSha = gitRecord?.run.commitSha ?? null;
  const commitUrl = commitSha && repository ? `https://github.com/${repository}/commit/${commitSha}` : null;
  const gitDone = gitRecord?.step.status === "succeeded" && commitSha !== null;
  const applyDone = applyRecord?.step.status === "succeeded";
  const safePrDone = safePrRecord?.step.status === "succeeded" && prUrl !== null;
  const healthStepDone = healthRecord?.step.status === "succeeded";
  const rolloutRun = scopedRuns.find((run) => run.promotionGate?.rollout_ready === true) ?? null;
  const rolloutReady = rolloutRun !== null;

  return (
    <Card pad={12}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: TYPE.body, fontWeight: 800, color: UI.ink }}>GitOps 배포 게이트</div>
          <div style={{ marginTop: 2, fontFamily: MONO, fontSize: TYPE.caption2, color: UI.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {latest?.workflowRunId ?? (status === "loading" ? "실행 기록 확인 중" : "실행 기록 없음")}
          </div>
        </div>
        <button onClick={onRefresh} aria-label="배포 증거 새로고침" style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${UI.line}`, background: UI.card, color: UI.ink2, cursor: "pointer", display: "grid", placeItems: "center" }}><RefreshCw size={14} /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
        <GateStage label="Git commit" state={gitDone ? "done" : "pending"} evidence={commitSha ?? "커밋 증거 없음"} href={commitUrl} />
        <GateStage label="GitOps sync" state={applyDone ? "done" : "pending"} evidence={applyDone ? `${applyRecord?.run.commandId ?? "command"} · ${applyRecord?.step.message ?? "적용 완료"}` : "적용 증거 없음"} />
        <GateStage label="ImagePullBackOff" state={failureEvidence ? "observed" : "pending"}
          evidence={failureEvidence ? `실패 관측: ${failureEvidence}` : failedImageCandidate ?? "보존된 장애 이벤트 없음"}
          actionLabel={failureRecord ? (failureResource ? "게임 로그" : "AI 분석") : null}
          onAction={failureRecord ? (failureResource ? () => onOpenRef("Pod", failureResource) : onAskAi) : null} />
        <GateStage label="PromotionBlocked" state={blocked ? "observed" : "pending"} evidence={blocked ? `${blocked.workflowRunId} · 승인 대기` : "차단 증거 없음"}
          actionLabel={blocked ? "이슈/RCA" : null} onAction={blocked ? onOpenIssues : null} />
        <GateStage label="Safe PR" state={safePrDone ? "done" : "pending"} evidence={prUrl ?? "PR 증거 없음"} href={prUrl} />
        <GateStage label="정상 rollout" state={rolloutReady ? "done" : healthStepDone ? "observed" : "pending"} evidence={rolloutReady ? `Ready · ${desiredImage ?? rolloutRun?.workflowRunId ?? "rollout"}` : healthStepDone ? "health 단계 완료 · Ready 직접 증거는 없음" : "rollout 증거 없음"} />
      </div>
    </Card>
  );
}
export function DeploySurface({ pendingRepos = [], repositoryFilter = null, onOpenRef, onOpenIssues, onAskAi, onAddRepo }: {
  pendingRepos?: string[]; repositoryFilter?: string | null; onOpenRef: (kind: string, name: string) => void; onOpenIssues: () => void; onAskAi: () => void; onAddRepo: () => void;
}) {
  const [tab, setTab] = useState(repositoryFilter ? "GitOps" : "워크플로우");
  const [selectedRepository, setSelectedRepository] = useState<string | null>(repositoryFilter);
  const [expandedRepositories, setExpandedRepositories] = useState<string[]>(repositoryFilter ? [repositoryFilter] : []);
  useEffect(() => {
    if (repositoryFilter) {
      setSelectedRepository(repositoryFilter);
      setExpandedRepositories((current) =>
        current.some((repositoryRef) => repositoryRef.toLowerCase() === repositoryFilter.toLowerCase())
          ? current
          : [...current, repositoryFilter],
      );
      setTab("GitOps");
    }
  }, [repositoryFilter]);
  const [repositoryRefreshKey, setRepositoryRefreshKey] = useState(0);
  const appsFeed = useApplications(repositoryRefreshKey);
  const workflowFeed = useApplicationRuns(appsFeed.items, repositoryRefreshKey);
  const helm = useHelmReleases();
  const apps = appsFeed.items;
  const repositoryGroups = useMemo(() => groupApplicationsByRepository(apps), [apps]);
  const connectedRepositoryKeys = useMemo(
    () => new Set(repositoryGroups.map((group) => group.repositoryRef.toLowerCase())),
    [repositoryGroups],
  );
  const pendingOnly = pendingRepos.filter((repositoryRef) => !connectedRepositoryKeys.has(repositoryRef.toLowerCase()));
  const visibleWorkflowApps = apps.filter((application) =>
    application.workflowRunId !== null
    && !application.workflowRunId.startsWith("workflow-connect-validation-"));
  const appCols: [string, string][] = [["앱", "minmax(140px,1.4fr)"], ["환경", "minmax(80px,0.8fr)"], ["저장소", "minmax(150px,1.4fr)"], ["헬스", "minmax(110px,0.9fr)"], ["배포", "minmax(90px,0.8fr)"], ["브랜치", "minmax(70px,0.6fr)"]];
  const wfCols: [string, string][] = [["앱", "minmax(140px,1.2fr)"], ["워크플로우 실행", "minmax(200px,1.8fr)"], ["상태", "minmax(90px,0.8fr)"], ["관측 시각", "minmax(80px,0.7fr)"]];
  const helmCols: [string, string][] = [["릴리스", "minmax(120px,1.1fr)"], ["차트", "minmax(150px,1.4fr)"], ["차트 버전", "minmax(80px,0.8fr)"], ["네임스페이스", "minmax(90px,0.9fr)"], ["리비전", "56px"], ["상태", "minmax(90px,0.8fr)"]];
  const loading = appsFeed.status === "loading";
  return (
    <Page title="배포" icon={Rocket} tabs={["애플리케이션", "GitOps", "워크플로우", "Helm 릴리스"]} tab={tab} onTab={setTab}
      action={tab === "GitOps"
        ? <button onClick={onAddRepo} style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: BLUE, color: UI.card, borderRadius: 9, padding: "6px 13px", fontSize: TYPE.label2, fontWeight: 700, cursor: "pointer" }}>+ 저장소 연결</button>
        : null}>
      <ChipRow chips={[
        { label: "앱", value: appsFeed.status === "ready" ? apps.length : "—" },
        { label: "배포 대기", value: appsFeed.status === "ready" ? apps.filter((a) => a.deliveryStatus === "pending").length : "—" },
        { label: "저장소", value: appsFeed.status === "ready" ? repositoryGroups.length + pendingOnly.length : "—" },
        { label: "Helm", value: helm.status === "ready" ? helm.items.length : "—", warn: helm.status === "ready" && helm.coverageAvailability === "unavailable" },
      ]} />
      {tab === "애플리케이션" && (
        <Card pad={0}>
          <THead cols={appCols} />
          {loading ? emptyRow("불러오는 중…")
            : appsFeed.status === "unavailable" ? emptyRow("애플리케이션을 불러오지 못했습니다.")
            : apps.length === 0 ? emptyRow("관측된 애플리케이션 없음")
            : apps.map((a, i) => (
              <TRow key={a.id} cols={appCols} i={i} cells={[
                <span key="n" style={{ display: "flex", alignItems: "center", gap: 8 }}><Package size={13} style={{ color: BLUE, flexShrink: 0 }} /><Mono>{a.name}</Mono></span>,
                <span key="e" style={{ fontSize: TYPE.label, color: UI.ink2 }}>{a.environments.length ? a.environments.join(", ") : "—"}</span>,
                <Mono key="r" dim>{a.repositoryRef ?? "—"}</Mono>,
                healthPill(a.healthStatus),
                deliveryPill(a.deliveryStatus),
                <Mono key="b" dim>{a.defaultBranch ?? "—"}</Mono>,
              ]} />
            ))}
        </Card>
      )}
      {tab === "GitOps" && (
        <Card pad={10}>
          {loading ? emptyRow("불러오는 중…")
            : appsFeed.status === "unavailable" ? emptyRow("GitOps 바인딩을 불러오지 못했습니다.")
            : (repositoryGroups.length === 0 && pendingOnly.length === 0) ? emptyRow("연결된 저장소 없음")
            : <>
              <RepositoryConnections
                groups={repositoryGroups}
                expandedRepositories={expandedRepositories}
                onOpenRepository={(repositoryRef) => {
                  const repositoryKey = repositoryRef.toLowerCase();
                  const isOpen = expandedRepositories.some((current) => current.toLowerCase() === repositoryKey);
                  setExpandedRepositories((current) =>
                    isOpen
                      ? current.filter((expandedRepository) => expandedRepository.toLowerCase() !== repositoryKey)
                      : [...current, repositoryRef],
                  );
                  setSelectedRepository(isOpen ? null : repositoryRef);
                }}
                onDisconnected={() => setRepositoryRefreshKey((key) => key + 1)}
              />
              {pendingOnly.map((repositoryRef) => (
                <div key={repositoryRef} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 8px", color: UI.ink3 }}>
                  <GithubIcon size={15} style={{ flexShrink: 0 }} />
                  <Mono>{repositoryRef}</Mono>
                  <span style={{ marginLeft: "auto" }}><Pill tone="info" label="연결 중" /></span>
                </div>
              ))}
            </>}
        </Card>
      )}
      {tab === "워크플로우" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <ScenarioGate runs={workflowFeed.items} repositoryRef={selectedRepository} status={workflowFeed.status}
            onRefresh={() => setRepositoryRefreshKey((key) => key + 1)}
            onOpenRef={onOpenRef} onOpenIssues={onOpenIssues} onAskAi={onAskAi} />
          <Card pad={0}>
            <THead cols={wfCols} />
            {loading ? emptyRow("불러오는 중…")
              : appsFeed.status === "unavailable" ? emptyRow("워크플로우 실행을 불러오지 못했습니다.")
              : visibleWorkflowApps.length === 0 ? emptyRow("관측된 배포 실행 없음")
              : visibleWorkflowApps.map((a, i) => (
                <TRow key={a.id} cols={wfCols} i={i} cells={[
                  <span key="n" style={{ display: "flex", alignItems: "center", gap: 8 }}><Rocket size={13} style={{ color: BLUE, flexShrink: 0 }} /><Mono>{a.name}</Mono></span>,
                  <Mono key="w" dim>{a.workflowRunId}</Mono>,
                  deliveryPill(a.deliveryStatus),
                  <Mono key="t" dim>{fromNow(a.deliveryObservedAt)}</Mono>,
                ]} />
              ))}
          </Card>
        </div>
      )}
      {tab === "Helm 릴리스" && (
        <Card pad={0}>
          <THead cols={helmCols} />
          {helm.status === "loading" ? emptyRow("불러오는 중…")
            : helm.status === "unavailable" ? emptyRow("Helm 릴리스를 불러오지 못했습니다.")
            : helm.items.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "14px 15px" }}>
                <span style={{ fontSize: TYPE.body, fontWeight: 700, color: UI.ink2 }}>Helm 릴리스 관측 안 됨</span>
                <span style={{ fontSize: TYPE.label2, color: UI.ink3 }}>현재 스코프에서 Helm 저장소 관측이 완결되지 않았습니다.</span>
                <ReasonNotes codes={helm.reasonCodes} />
              </div>
            )
            : helm.items.map((h, i) => (
              <TRow key={`${h.namespace}/${h.name}`} cols={helmCols} i={i} cells={[
                <span key="n" style={{ display: "flex", alignItems: "center", gap: 8 }}><Package size={13} style={{ color: BLUE, flexShrink: 0 }} /><Mono>{h.name}</Mono></span>,
                <Mono key="c" dim>{h.chart ?? "—"}</Mono>, <Mono key="v">{h.chartVersion ?? "—"}</Mono>,
                <Mono key="ns" dim>{h.namespace}</Mono>, <Mono key="rv">{h.revision ?? "—"}</Mono>,
                deliveryPill(h.status),
              ]} />
            ))}
        </Card>
      )}
    </Page>
  );
}

// ── RCA 상세 — 실 계약(GET /api/dashboard/rca/issues 항목의 관측 RCA 필드 +
// GET /api/rca/recovery-plans/by-correlation) 파생. 원인/확신도/증거/복구 후보는
// 서버가 준 값만 렌더하고, 없으면 정직한 "관측 안 됨"으로 둔다(no backfill).
// 실제 복구 실행 경로(capability/CSRF)는 이 데모에 배선되어 있지 않으므로 실행
// 컨트롤은 비활성으로 두고 가짜 성공을 만들지 않는다.
type IssueAnalysisState = {
  label: "분석 중" | "원인 분석 완료" | "해결됨";
  tone: "info" | "ok";
};

const ANALYSIS_COMPLETED_STATUSES = new Set([
  "rca_completed",
  "followup_required",
  "action_required",
  "recovery_planned",
  "selection_required",
  "recovery_selected",
  "approval_recommended",
  "command_requested",
  "command_dispatched",
  "command_queued",
  "command_completed",
  "command_rejected",
  "pr_requested",
  "pr_patch_prepared",
  "pr_diff_explained",
  "pr_ready_for_creation",
  "pr_created",
  "pr_failed",
]);

function issueAnalysisState(issue: { status?: string | null; rootCause?: string | null }): IssueAnalysisState {
  const normalizedStatus = issue.status?.trim().toLowerCase() ?? "";
  if (["cancelled", "closed", "completed", "dismissed", "incident_resolved", "resolved"].includes(normalizedStatus)) {
    return { label: "해결됨", tone: "ok" };
  }
  if ((issue.rootCause?.trim() ?? "") !== "" || ANALYSIS_COMPLETED_STATUSES.has(normalizedStatus)) {
    return { label: "원인 분석 완료", tone: "ok" };
  }
  return { label: "분석 중", tone: "info" };
}
// 서버가 준 위험도 문자열을 방어적으로 톤에 매핑(미지의 값은 정보 톤).
function recoveryRiskTone(risk: string): { fg: string; bg: string; bd: string } {
  const r = risk.toLowerCase();
  if (r.includes("high") || risk.includes("높") || r.includes("crit")) return TINT.crit;
  if (r.includes("medium") || r.includes("moderate") || risk.includes("보통") || risk.includes("중")) return TINT.warn;
  if (r.includes("low") || risk.includes("낮")) return TINT.ok;
  return TINT.blue;
}

// ── RCA 상세 모달 — 자체 백드롭·중앙정렬·스크롤(연결 모달과 동일 문법) ──
function RcaSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      <span style={{ fontSize: TYPE.caption, fontWeight: 700, letterSpacing: "0.04em", color: UI.ink3, textTransform: "uppercase" }}>{title}</span>
      {children}
    </div>
  );
}

function RcaCardSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ flexShrink: 0, overflow: "hidden", border: `1px solid ${UI.line}`, borderRadius: 10, background: UI.card }}>
      <h2 style={{ margin: 0, padding: "12px 15px", borderBottom: `1px solid ${UI.line}`, background: inkA(0.018), fontSize: TYPE.label2, fontWeight: 700, color: UI.ink }}>{title}</h2>
      {children}
    </section>
  );
}
export function IssueDetail({ name, symptom, cluster, svc, ns, resourceKind, incidentId, currentSubject, onClose, onOpenRef, onAskAi, onRecovered: _onRecovered, correlationId, status, severity, rootCause, confidence, supportingEvidence, missingEvidence, situationSummary, recommendedActionSummary, evidenceSummary, evidenceBundleSummary, topInset = 0, leftInset = 0, rightInset = 0 }: {
  name: string; symptom: string; cluster: string; svc: string; ns: string; onClose: () => void; onOpenRef: (kind: string, n: string) => void; onAskAi: () => void; onRecovered?: (svc: string) => void;
  resourceKind?: string | null; incidentId?: string | null; currentSubject?: string | null;
  correlationId?: string; status?: string; severity?: "critical" | "warning" | null;
  rootCause?: string | null; confidence?: number | null; supportingEvidence?: string[]; missingEvidence?: string[];
  situationSummary?: string | null; recommendedActionSummary?: string | null; evidenceSummary?: string | null; evidenceBundleSummary?: string | null;
  topInset?: number; leftInset?: number; rightInset?: number;
}) {
  const [activeTab, setActiveTab] = useState<"detail" | "recovery">("detail");
  // 복구 후보는 실 계약(GET /api/rca/recovery-plans/by-correlation)에서만. 상관관계
  // id가 없으면(예: 지도 파생 진입) idle로 두고 관측 안 됨을 정직하게 표시한다.
  const recovery = useRecoveryPlan(correlationId ?? null);
  const recentChanges = useIncidentRecentChanges(incidentId ?? null);
  const conf = typeof confidence === "number" && Number.isFinite(confidence) ? Math.round(confidence * 100) : null;
  const analysisState = issueAnalysisState({ status, rootCause });
  const headerTone = analysisState.label === "해결됨" ? TINT.ok
    : severity === "warning" ? TINT.warn
      : severity === "critical" ? TINT.crit
        : TINT.blue;
  const support = supportingEvidence ?? [];
  const missing = missingEvidence ?? [];
  const observedStatus = status?.trim() ? koLabel(status) : currentSubject?.trim() ? koLabel(currentSubject) : "상태 미확인";
  return (
    <>
      {/* 스크림 — 사이드바 밖 클릭 시 닫기 */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: DUR.fade }}
        onClick={onClose} style={{ position: "fixed", top: topInset, left: leftInset, right: rightInset, bottom: 0, background: inkA(0.22), zIndex: 55 }} />
      {/* RCA 보고서 — 우측 사이드바(드로어). 리소스 상세 시트(DetailOverlay)와 폭·레이아웃 통일(560px) */}
      <motion.div initial={{ x: 580 }} animate={{ x: 0 }} exit={{ x: 580, transition: { duration: 0.14, ease: [0.4, 0, 1, 1] } }} transition={{ type: "spring", bounce: 0.06, visualDuration: 0.28 }}
        style={{ position: "fixed", top: topInset, right: rightInset, bottom: 0, width: 560, maxWidth: `calc(100vw / ${PRESENT_SCALE} - ${leftInset + rightInset}px)`, background: UI.card, borderLeft: `1px solid ${UI.line}`, boxShadow: `-24px 0 60px -30px ${inkA(0.3)}`, zIndex: 56, display: "flex", flexDirection: "column", overflow: "hidden", transition: "right .28s cubic-bezier(.32,.72,0,1), max-width .28s cubic-bezier(.32,.72,0,1)" }}>
          {/* 헤더 */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "18px 20px 14px" }}>
            <span style={{ width: 38, height: 38, borderRadius: 11, background: headerTone.bg, display: "grid", placeItems: "center", flexShrink: 0 }}>
              {analysisState.label === "해결됨"
                ? <Check size={19} strokeWidth={2.4} style={{ color: headerTone.fg }} />
                : <AlertTriangle size={19} style={{ color: headerTone.fg }} />}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Mono>{name}</Mono>
                <Pill tone={analysisState.tone} label={analysisState.label} />
              </div>
              <div style={{ fontSize: TYPE.label2, color: UI.ink2, marginTop: 4 }}>{symptom}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "5px 16px", marginTop: 9 }}>
                {[
                  ["클러스터", cluster],
                  ["네임스페이스", ns],
                  ["종류", resourceKind ?? "미확인"],
                  ["대상", svc],
                ].map(([label, value]) => (
                  <span key={label} style={{ minWidth: 0, display: "flex", alignItems: "baseline", gap: 6, fontSize: TYPE.caption2 }}>
                    <span style={{ flexShrink: 0, color: UI.ink3 }}>{label}</span>
                    <span style={{ minWidth: 0, color: UI.ink2, fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value || "미확인"}</span>
                  </span>
                ))}
              </div>
            </div>
            <button type="button" aria-label="상세 닫기" onClick={onClose} style={{ width: 30, height: 30, padding: 0, borderRadius: 999, border: "none", background: inkA(0.06), color: UI.ink2, cursor: "pointer", flexShrink: 0, display: "grid", placeItems: "center", lineHeight: 1 }}><X size={15} /></button>
          </div>
          <div role="tablist" aria-label="이슈 상세 보기" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", padding: "0 20px", borderBottom: `1px solid ${UI.line}` }}>
            {([
              ["detail", "이슈 상세"],
              ["recovery", "복구 계획"],
            ] as const).map(([id, label]) => {
              const selected = activeTab === id;
              return (
                <button key={id} type="button" role="tab" aria-selected={selected} onClick={() => setActiveTab(id)}
                  style={{ position: "relative", height: 42, border: "none", background: "transparent", color: selected ? UI.ink : UI.ink3, fontSize: TYPE.label2, fontWeight: selected ? 700 : 600, cursor: "pointer" }}>
                  {label}
                  {selected && <span aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, bottom: -1, height: 2, background: BLUE, borderRadius: "2px 2px 0 0" }} />}
                </button>
              );
            })}
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 20, padding: "18px 20px" }}>
            {activeTab === "detail" ? <>
            <section aria-labelledby="issue-summary-heading" style={{ flexShrink: 0, display: "grid", gap: 14, border: `1px solid ${UI.line}`, borderRadius: 10, background: UI.card, padding: 16, boxShadow: `0 6px 16px -10px ${inkA(0.26)}, 0 1px 3px ${inkA(0.06)}` }}>
              <h2 id="issue-summary-heading" style={{ margin: 0, fontSize: TYPE.caption, fontWeight: 700, color: UI.ink2 }}>상황 요약</h2>
              <p style={{ margin: 0, fontSize: TYPE.body, fontWeight: 600, color: UI.ink, lineHeight: 1.65 }}>{situationSummary?.trim() || "상황 요약 정보가 아직 없습니다."}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                <span style={{ border: `1px solid ${UI.line}`, borderRadius: 999, padding: "3px 9px", fontSize: TYPE.caption, color: UI.ink2, background: UI.card }}>{observedStatus}</span>
                {conf !== null && <span style={{ border: `1px solid ${UI.line}`, borderRadius: 999, padding: "3px 9px", fontSize: TYPE.caption, color: UI.ink2, background: UI.card }}>신뢰도 {conf}%</span>}
                <span style={{ border: `1px solid ${UI.line}`, borderRadius: 999, padding: "3px 9px", fontSize: TYPE.caption, color: UI.ink2, background: UI.card }}>확인된 근거 {support.length}</span>
              </div>
              {missing.length > 0 && (
                <div style={{ display: "grid", gap: 8, border: `1px solid ${TINT.warn.bd}`, borderRadius: 8, background: TINT.warn.bg, padding: 11 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: TYPE.caption, fontWeight: 700, color: UI.ink2 }}><ShieldAlert size={14} style={{ color: TINT.warn.fg }} />추가 확인 필요</div>
                  <ul style={{ display: "grid", gap: 5, margin: 0, paddingLeft: 17 }}>
                    {missing.map((item, index) => <li key={`${item}-${index}`} style={{ fontSize: TYPE.caption2, color: UI.ink2, lineHeight: 1.45 }}>{item}</li>)}
                  </ul>
                </div>
              )}
            </section>

            <RcaCardSection title="최근 변경">
              <div>
                {recentChanges.status === "loading" ? (
                  <div style={{ padding: 14, fontSize: TYPE.label2, color: UI.ink2 }}>최근 변경을 불러오는 중…</div>
                ) : recentChanges.status === "unavailable" ? (
                  <div role="alert" style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: 9, padding: 15, color: TINT.crit.fg }}>
                    <CircleAlert size={15} style={{ marginTop: 1 }} />
                    <div style={{ display: "grid", gap: 4 }}>
                      <span style={{ fontSize: TYPE.label2, fontWeight: 700 }}>최근 변경을 불러올 수 없습니다.</span>
                      <span style={{ fontSize: TYPE.caption2, lineHeight: 1.45 }}>요청한 최근 변경 기록을 확인할 수 없습니다.</span>
                    </div>
                  </div>
                ) : recentChanges.status === "idle" || recentChanges.items.length === 0 ? (
                  <div style={{ padding: 14, fontSize: TYPE.label2, color: UI.ink2 }}>장애 이전에 확인된 변경이 없습니다.</div>
                ) : recentChanges.items.map((change, index) => (
                  <div key={change.event_id} style={{ display: "grid", gap: 8, padding: 13, borderTop: index > 0 ? `1px solid ${UI.line2}` : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <span style={{ minWidth: 0, fontSize: TYPE.label2, fontWeight: 700, color: UI.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{change.resource_kind} · {change.resource_name}</span>
                      <time dateTime={change.changed_at} style={{ flexShrink: 0, fontSize: TYPE.caption, color: UI.ink2 }}>{fromNow(change.changed_at)}</time>
                    </div>
                    {(change.image_before || change.image_after) && (
                      <div style={{ display: "grid", gap: 8, borderRadius: 8, background: UI.bg2, padding: 10, fontSize: TYPE.caption2, color: UI.ink2 }}>
                        {change.image_before && <div style={{ display: "grid", gridTemplateColumns: "auto 88px minmax(0, 1fr)", alignItems: "center", gap: 8 }}>
                          <ArrowLeft size={13} style={{ color: UI.ink2 }} />
                          <span style={{ color: UI.ink2 }}>이전 배포 버전</span>
                          <span title={change.image_before} style={{ minWidth: 0, fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{change.image_before}</span>
                        </div>}
                        {change.image_after && <div style={{ display: "grid", gridTemplateColumns: "auto 88px minmax(0, 1fr)", alignItems: "center", gap: 8 }}>
                          <ArrowRight size={13} style={{ color: UI.ink2 }} />
                          <span style={{ color: UI.ink2 }}>현재 배포 버전</span>
                          <span title={change.image_after} style={{ minWidth: 0, fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{change.image_after}</span>
                        </div>}
                      </div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "76px minmax(0, 1fr)", gap: "6px 10px", paddingTop: 2, fontSize: TYPE.caption, color: UI.ink2 }}>
                      {change.commit_sha && <><span>커밋</span><b title={change.commit_sha} style={{ minWidth: 0, color: UI.ink2, fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{change.commit_sha.slice(0, 7)}</b></>}
                      {(change.repository_id || change.repo_ref) && <><span>저장소</span><span style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 7, color: UI.ink2, overflow: "hidden" }}>{change.repo_ref && <span style={{ flexShrink: 0, borderRadius: 6, background: inkA(0.06), padding: "2px 7px", fontSize: TYPE.micro, color: UI.ink2 }}>{change.repo_ref}</span>}<span title={change.repository_id} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{change.repository_id || "저장소 미확인"}</span></span></>}
                      {change.workflow_run_id && <><span>배포 실행</span><span title={`CI/CD 배포 실행 ID: ${change.workflow_run_id}`} style={{ minWidth: 0, color: UI.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{change.workflow_run_id}</span></>}
                    </div>
                    {change.pr_url && <a href={change.pr_url} target="_blank" rel="noopener noreferrer" style={{ justifySelf: "end", display: "inline-flex", alignItems: "center", gap: 5, color: BLUE, fontSize: TYPE.caption2, fontWeight: 700, textDecoration: "none" }}><ExternalLink size={13} />Pull request 열기</a>}
                  </div>
                ))}
              </div>
            </RcaCardSection>

            <RcaCardSection title="RCA 보고서">
              <div style={{ display: "grid", gap: 15, padding: 15 }}>
                <div style={{ display: "grid", gap: 7 }}>
                  <span style={{ fontSize: TYPE.caption, fontWeight: 700, color: UI.ink2 }}>최종 원인</span>
                  <p style={{ margin: 0, fontSize: TYPE.body, fontWeight: 600, color: UI.ink, lineHeight: 1.6 }}>{rootCause || "원인 정보가 아직 없습니다."}</p>
                </div>
                <div style={{ display: "grid", gap: 8, paddingTop: 13, borderTop: `1px dashed ${UI.line}` }}>
                  <span style={{ fontSize: TYPE.caption, fontWeight: 700, color: UI.ink2 }}>판단 근거</span>
                  {support.length === 0 ? <span style={{ fontSize: TYPE.label2, color: UI.ink2 }}>확인된 근거가 없습니다.</span> : (
                    <ul style={{ display: "grid", gap: 7, margin: 0, padding: 0, listStyle: "none" }}>
                      {support.map((item, index) => <li key={`${item}-${index}`} style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: 8, fontSize: TYPE.label2, color: UI.ink2, lineHeight: 1.5 }}><Check size={14} style={{ color: TINT.ok.fg, marginTop: 2 }} />{item}</li>)}
                    </ul>
                  )}
                </div>
                {(evidenceSummary || evidenceBundleSummary) && <div style={{ display: "grid", gap: 7, paddingTop: 13, borderTop: `1px dashed ${UI.line}` }}>
                  <span style={{ fontSize: TYPE.caption, fontWeight: 700, color: UI.ink2 }}>근거 요약</span>
                  {evidenceSummary && <p style={{ margin: 0, fontSize: TYPE.label2, color: UI.ink2, lineHeight: 1.55 }}>{evidenceSummary}</p>}
                  {evidenceBundleSummary && <p style={{ margin: 0, fontSize: TYPE.caption2, color: UI.ink2, lineHeight: 1.5 }}>{evidenceBundleSummary}</p>}
                </div>}
                <div style={{ display: "grid", gap: 7, paddingTop: 13, borderTop: `1px dashed ${UI.line}` }}>
                  <span style={{ fontSize: TYPE.caption, fontWeight: 700, color: UI.ink2 }}>권장 조치</span>
                  <p style={{ margin: 0, fontSize: TYPE.label2, color: UI.ink2, lineHeight: 1.55 }}>{recommendedActionSummary || "권장 조치가 아직 없습니다."}</p>
                </div>
                <button onClick={() => onOpenRef(resourceKind ?? "Pod", name)} style={{ justifySelf: "start", border: "none", background: "transparent", color: BLUE, fontSize: TYPE.label2, fontWeight: 700, cursor: "pointer", padding: 0 }}>대상 리소스 스펙 보기 →</button>
              </div>
            </RcaCardSection>
            </> : <>
            {/* 복구 계획 — 실 계약의 후보만. 실제 실행은 서버 실행(capability/CSRF) 미배선 → 컨트롤 비활성 */}
            <RcaSection title="복구 계획">
              {recovery.status === "idle" ? (
                <div style={{ fontSize: TYPE.label2, color: UI.ink3 }}>복구 계획 없음</div>
              ) : recovery.status === "loading" ? (
                <div style={{ fontSize: TYPE.label2, color: UI.ink3 }}>복구 계획 불러오는 중…</div>
              ) : recovery.status === "unavailable" || recovery.plan === null ? (
                <div style={{ fontSize: TYPE.label2, color: UI.ink3 }}>복구 계획을 불러오지 못했습니다.</div>
              ) : recovery.plan.candidates.length === 0 ? (
                <div style={{ fontSize: TYPE.label2, color: UI.ink3 }}>관측된 복구 후보 없음</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {recovery.plan.candidates.map((r) => { const rt = recoveryRiskTone(r.risk_level); const picked = r.action_id === recovery.plan!.recommended_action_id; return (
                    <div key={r.action_id} style={{ border: `1px solid ${picked ? blueA(0.35) : UI.line}`, background: picked ? blueA(0.03) : UI.card, borderRadius: 12, padding: 13 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                        <span style={{ fontSize: TYPE.body, fontWeight: 700, color: UI.ink }}>{r.title}</span>
                        {picked && <span style={{ fontSize: TYPE.micro, fontWeight: 700, color: BLUE, background: blueA(0.1), borderRadius: 4, padding: "1px 6px" }}>권고</span>}
                        {r.risk_level && <span style={{ marginLeft: "auto", fontSize: TYPE.caption, fontWeight: 700, color: rt.fg, background: rt.bg, border: `1px solid ${rt.bd}`, borderRadius: 999, padding: "2px 9px" }}>위험 {r.risk_level}</span>}
                        {r.approval_required && <span style={{ fontSize: TYPE.caption, fontWeight: 700, color: TINT.warn.fg, background: TINT.warn.bg, border: `1px solid ${TINT.warn.bd}`, borderRadius: 999, padding: "2px 9px" }}>승인 필요</span>}
                      </div>
                      {r.description && <div style={{ fontSize: TYPE.label2, color: UI.ink2, lineHeight: 1.5 }}>{r.description}</div>}
                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10 }}>
                        {r.blast_radius && <span style={{ fontSize: TYPE.caption, color: UI.ink3 }}>폭발 반경 · <b style={{ color: UI.ink2, fontWeight: 600 }}>{r.blast_radius}</b></span>}
                        {r.rollback_plan && <span style={{ fontSize: TYPE.caption, color: UI.ink3 }}>롤백 · <b style={{ color: UI.ink2, fontWeight: 600 }}>{r.rollback_plan}</b></span>}
                      </div>
                      {(r.prerequisites.length > 0 || r.validation_checks.length > 0) && (
                        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8 }}>
                          {r.prerequisites.length > 0 && <span style={{ flex: "1 1 200px", minWidth: 0 }}><span style={{ fontSize: TYPE.caption, fontWeight: 700, color: UI.ink3 }}>전제조건</span><ul style={{ margin: "4px 0 0", paddingLeft: 15 }}>{r.prerequisites.map((p, pi) => <li key={pi} style={{ fontSize: TYPE.caption2, color: UI.ink2 }}>{p}</li>)}</ul></span>}
                          {r.validation_checks.length > 0 && <span style={{ flex: "1 1 200px", minWidth: 0 }}><span style={{ fontSize: TYPE.caption, fontWeight: 700, color: UI.ink3 }}>검증</span><ul style={{ margin: "4px 0 0", paddingLeft: 15 }}>{r.validation_checks.map((c, ci) => <li key={ci} style={{ fontSize: TYPE.caption2, color: UI.ink2 }}>{c}</li>)}</ul></span>}
                        </div>
                      )}
                      {/* 실 복구 실행 경로(capability 게이트 + CSRF)가 이 데모에 배선되어 있지 않다.
                          타이머로 성공을 위조하지 않고 실행 컨트롤을 비활성 + 정직한 미지원 상태로 둔다. */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                        <button disabled title="복구 실행 불가"
                          style={{ border: "none", background: inkA(0.1), color: UI.ink3, borderRadius: 9, padding: "7px 14px", fontSize: TYPE.label2, fontWeight: 700, cursor: "not-allowed" }}>복구 실행</button>
                        <span style={{ fontSize: TYPE.caption2, color: UI.ink3 }}>실행 불가</span>
                        {picked && <button onClick={onAskAi} style={{ marginLeft: "auto", border: `1px solid ${blueA(0.4)}`, background: blueA(0.06), color: BLUE, borderRadius: 9, padding: "7px 14px", fontSize: TYPE.label2, fontWeight: 700, cursor: "pointer" }}>AI에게 계속 질문</button>}
                      </div>
                    </div>
                  ); })}
                </div>
              )}
            </RcaSection>
            </>}
          </div>
      </motion.div>
    </>
  );
}

// ── 이슈 /issues — 진행 중 | RCA | 예방 점검 (5.8 + 5.10 통합) ──
// RcaIncident: 상세 드로어로 넘기는 이슈 식별자 + 서버가 준 관측 RCA 필드(전부 선택적).
// 지도 등 상관관계 없는 진입점은 기본 5필드만 채우고, 상세는 정직한 "관측 안 됨"으로.
export type RcaIncident = {
  name: string; symptom: string; cluster: string; svc: string; ns: string;
  resourceKind?: string | null;
  incidentId?: string | null;
  currentSubject?: string | null;
  correlationId?: string;
  status?: string;
  severity?: "critical" | "warning" | null;
  rootCause?: string | null;
  confidence?: number | null;
  supportingEvidence?: string[];
  missingEvidence?: string[];
  situationSummary?: string | null;
  recommendedActionSummary?: string | null;
  evidenceSummary?: string | null;
  evidenceBundleSummary?: string | null;
};

type IssueSeverityFilter = "all" | "critical" | "warning";

type RecoveryCardProgress = {
  label: "복구 대기" | "복구 요청됨" | "복구 실행 중" | "검증 중" | "복구 완료" | "복구 실패";
  step: number;
  tone: "approval" | "active" | "completed" | "failed";
};

function IssueSeverityFilters({ active, criticalCount, warningCount, onChange, totalCount }: {
  active: IssueSeverityFilter;
  criticalCount: number;
  warningCount: number;
  onChange: (filter: IssueSeverityFilter) => void;
  totalCount: number;
}) {
  const filters: { id: IssueSeverityFilter; label: string; value: number }[] = [
    { id: "all", label: "전체", value: totalCount },
    { id: "critical", label: "장애", value: criticalCount },
    { id: "warning", label: "주의", value: warningCount },
  ];
  return (
    <div aria-label="진행 중 이슈 심각도 필터" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {filters.map((filter) => {
        const selected = active === filter.id;
        const selectedTone = filter.id === "critical" ? TINT.crit : filter.id === "warning" ? TINT.warn : TINT.blue;
        return (
          <button
            key={filter.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(filter.id)}
            style={{ ...segStyle, borderColor: selected ? selectedTone.bd : UI.line, background: selected ? selectedTone.bg : UI.card, color: selected ? selectedTone.fg : UI.ink2, cursor: "pointer" }}
          >
            {filter.label} <b style={numStyle}>{filter.value}</b>
          </button>
        );
      })}
    </div>
  );
}

function recoveryCardProgress(): RecoveryCardProgress {
  return { label: "복구 대기", step: 0, tone: "approval" };
}

function RecoveryProgress({ progress }: { progress: RecoveryCardProgress }) {
  const activeColor = progress.tone === "failed" ? HP.crit
    : progress.tone === "completed" ? HP.ok
      : progress.tone === "approval" ? HP.warn
        : BLUE;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: UI.ink2 }}>
      <span>{progress.label}</span>
      <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
        {Array.from({ length: 5 }, (_, index) => (
          <span key={index} style={{ width: 11, height: 5, borderRadius: 3, background: index < progress.step ? activeColor : HP.pending, opacity: index < progress.step ? 1 : 0.7 }} />
        ))}
      </span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{progress.step}/5</span>
    </span>
  );
}

function IssueCard({ issue, onOpen, onOpenTarget }: { issue: RcaIssueDetailView; onOpen: () => void; onOpenTarget: (() => void) | null }) {
  const [targetActive, setTargetActive] = useState(false);
  const state = issueAnalysisState(issue);
  const recovery = recoveryCardProgress();
  const title = issue.resourceName ?? "대상 미확인";
  const symptom = issue.symptom ?? "증상 미확인";
  const rootCause = issue.rootCause ?? "원인 미확인";
  const severityLabel = issue.severity === "critical" ? "장애" : issue.severity === "warning" ? "주의" : "정보";
  const indicatorLabel = state.label === "해결됨" ? "해결됨" : severityLabel;
  const indicatorColor = state.label === "해결됨"
    ? HP.ok
    : issue.severity === "critical" ? HP.crit : issue.severity === "warning" ? HP.warn : BLUE;
  const symptomWithCode = issue.rawSymptom && issue.rawSymptom !== symptom
    ? `${symptom} (${issue.rawSymptom})`
    : symptom;
  const evidenceCount = issue.supportingEvidence.length;
  const target = [issue.resourceKind, issue.resourceName].filter(Boolean).join(" · ") || "대상 미확인";
  const scope = [issue.clusterId, issue.namespace].filter(Boolean).join(" · ") || "범위 미확인";

  return (
    <motion.div
      onClick={onOpen}
      whileHover={{ y: -1 }}
      transition={{ duration: DUR.micro }}
      style={{
        width: "100%", minWidth: 0, display: "block",
        padding: 0, overflow: "hidden", textAlign: "left", cursor: "pointer",
        border: `1px solid ${UI.line}`, borderRadius: 10, background: UI.card,
        boxShadow: `0 1px 2px ${inkA(0.04)}`, color: UI.ink,
      }}
    >
      <span style={{ minWidth: 0, display: "grid", gap: 10, padding: "13px 14px 12px" }}>
        <span style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ minWidth: 0, flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
            <span role="img" aria-label={`상태: ${indicatorLabel}`} title={`상태: ${indicatorLabel}`} style={{ width: 12, height: 12, flexShrink: 0, alignSelf: "center", cursor: "help", borderRadius: 999, background: indicatorColor }} />
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: TYPE.bodyStrong, lineHeight: 1.35, fontWeight: 700 }}>{title}</span>
          </span>
          <time dateTime={issue.updatedAt ?? undefined} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4, fontSize: TYPE.caption2, color: UI.ink3 }}>
            <Clock size={12} />{fromNow(issue.updatedAt)}
          </time>
        </span>

        <span style={{ minWidth: 0, display: "grid", gap: 5, fontSize: TYPE.label2, lineHeight: 1.45 }}>
          <span style={{ color: UI.ink2 }}><strong style={{ color: UI.ink, fontWeight: 600 }}>증상</strong><span style={{ margin: "0 7px", color: UI.line }}>|</span>{symptomWithCode}</span>
          <span style={{ color: UI.ink2 }}><strong style={{ color: UI.ink, fontWeight: 600 }}>원인</strong><span style={{ margin: "0 7px", color: UI.line }}>|</span>{rootCause}</span>
          <span style={{ color: UI.ink2 }}>
            <strong style={{ color: UI.ink, fontWeight: 600 }}>대상</strong><span style={{ margin: "0 7px", color: UI.line }}>|</span>
            {onOpenTarget ? (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onOpenTarget();
                }}
                onMouseEnter={() => setTargetActive(true)}
                onMouseLeave={() => setTargetActive(false)}
                onFocus={() => setTargetActive(true)}
                onBlur={() => setTargetActive(false)}
                style={{ maxWidth: "100%", border: "none", borderRadius: 7, background: targetActive ? TINT.gray.bd : TINT.gray.bg, color: targetActive ? UI.ink : UI.ink2, padding: "2px 7px", fontSize: TYPE.caption2, fontWeight: 400, lineHeight: 1.35, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "middle", transition: `background ${DUR.micro}s ease, color ${DUR.micro}s ease` }}
                title={`${target} 리소스 상세 열기`}
              >
                {target}
              </button>
            ) : target}
          </span>
          <span style={{ color: UI.ink2 }}><strong style={{ color: UI.ink, fontWeight: 600 }}>복구</strong><span style={{ margin: "0 7px", color: UI.line }}>|</span><RecoveryProgress progress={recovery} /></span>
        </span>

        <span style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", paddingTop: 9, borderTop: `1px dashed ${UI.line}`, fontSize: TYPE.caption2, color: UI.ink3 }}>
          <span style={{ minWidth: 0, display: "inline-flex", alignItems: "center", gap: 4 }}><MapPin size={12} /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{scope}</span></span>
          <span>판단 근거 {evidenceCount}개</span>
        </span>

        <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <Pill tone={state.tone} label={state.label} />
          <button type="button" onClick={(event) => { event.stopPropagation(); onOpen(); }} style={{ display: "inline-flex", alignItems: "center", gap: 3, border: "none", background: "transparent", padding: 0, color: BLUE, fontSize: TYPE.label2, fontWeight: 700, cursor: "pointer" }}>열기 <ChevronRight size={14} /></button>
        </span>
      </span>
    </motion.div>
  );
}

export function IssuesSurface({ incidentClusterIds, sessionRules: _sessionRules = [], onOpenRef, onAskAi, onOpenRca }: {
  incidentClusterIds: readonly string[]; sessionRules?: string[]; onOpenRef: (kind: string, name: string) => void; onAskAi: () => void; onOpenRca?: (i: RcaIncident) => void;
}) {
  const [tab, setTab] = useState("진행 중");
  const [severityFilter, setSeverityFilter] = useState<IssueSeverityFilter>("all");
  // 이슈 탭 — 실 RCA 이슈 큐(GET /api/dashboard/rca/issues, 홈 W2와 동일 소스).
  // 큐 항목이 관측 RCA 필드(원인/확신도/증거/AI 요약)를 이미 실어주므로 상세 드로어로 그대로 전달한다.
  const issues = useRcaIssueDetails(incidentClusterIds);
  const activeIssues = issues.items.filter(isActiveRcaIssue);
  const resolvedIssues = issues.items.filter((issue) => !isActiveRcaIssue(issue));
  const critCount = activeIssues.filter((issue) => issue.severity === "critical").length;
  const warnCount = activeIssues.filter((issue) => issue.severity === "warning").length;
  const visibleIssues = tab === "해결됨"
    ? resolvedIssues
    : activeIssues.filter((issue) => severityFilter === "all" || issue.severity === severityFilter);
  const setRca = (iss: RcaIssueDetailView) => onOpenRca?.({
    name: iss.resourceName ?? iss.correlationId.slice(0, 12),
    symptom: iss.symptom ?? iss.status,
    cluster: iss.clusterId ?? "-",
    svc: iss.resourceName ?? (iss.resourceName ?? iss.correlationId.slice(0, 12)),
    ns: iss.namespace ?? "-",
    resourceKind: iss.resourceKind,
    correlationId: iss.correlationId,
    incidentId: iss.incidentId,
    currentSubject: iss.currentSubject,
    status: iss.status,
    severity: iss.severity,
    rootCause: iss.rootCause,
    confidence: iss.confidence,
    supportingEvidence: iss.supportingEvidence,
    missingEvidence: iss.missingEvidence,
    situationSummary: iss.situationSummary,
    recommendedActionSummary: iss.recommendedActionSummary,
    evidenceSummary: iss.evidenceSummary,
    evidenceBundleSummary: iss.evidenceBundleSummary,
  });
  return (
    <Page title="이슈" icon={AlertTriangle} tabs={["진행 중", "해결됨", "예방 점검"]} tab={tab} onTab={setTab}
      action={tab === "진행 중" ? <button onClick={onAskAi} style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${blueA(0.4)}`, background: blueA(0.07), color: BLUE, borderRadius: 9, padding: "6px 13px", fontSize: TYPE.label2, fontWeight: 700, cursor: "pointer" }}>AI로 원인 분석</button> : null}>
      {tab === "진행 중" && (
        <IssueSeverityFilters active={severityFilter} criticalCount={critCount} warningCount={warnCount} onChange={setSeverityFilter} totalCount={activeIssues.length} />
      )}
      {tab !== "예방 점검" && (
        <div style={{ display: "grid", gap: 8 }}>
          {issues.status === "loading" ? (
            <Card><div style={{ fontSize: TYPE.label2, color: UI.ink3 }}>불러오는 중…</div></Card>
          ) : issues.status === "unavailable" ? (
            <Card><div style={{ fontSize: TYPE.label2, color: UI.ink3 }}>이슈를 불러오지 못했습니다.</div></Card>
          ) : visibleIssues.length === 0 ? (
            <Card><div style={{ fontSize: TYPE.label2, color: UI.ink2 }}>{tab === "해결됨" ? "해결된 이슈가 없습니다." : severityFilter === "all" ? "진행 중인 이슈가 없습니다." : `${severityFilter === "critical" ? "장애" : "주의"} 이슈가 없습니다.`}</div></Card>
          ) : visibleIssues.map((iss) => {
            const resourceKind = iss.resourceKind;
            const resourceName = iss.resourceName;
            return (
              <IssueCard
                key={iss.correlationId}
                issue={iss}
                onOpen={() => setRca(iss)}
                onOpenTarget={resourceKind && resourceName ? () => onOpenRef(resourceKind, resourceName) : null}
              />
            );
          })}
        </div>
      )}
      {tab === "예방 점검" && <ChecksContent />}
    </Page>
  );
}

// ── 타임라인 /timeline (5.9 — P-21 문법 + 유형 필터 칩 P-22) ──
// UI-PHASE2-001 §2: 실 timeline API로 재배선. 활동 개요·문제 수·커버리지 공백은
// GET /api/timeline/capabilities → POST /api/timeline/overview에서, 고정 항목은
// GET /api/timeline/pins에서 조회한다(useTimelineBoard). 읽을 수 있는 변경 스트림은
// 실 GET /api/changes(useChangeTimeline). 예전의 "핀·라이브 스트림·전체 스냅샷은
// 미지원" 오판 표기를 제거하고, 실제 데이터가 비면 정직한 빈 상태로 둔다.
type TlCat = "전체" | "이슈" | "배포" | "구성";
function changeCat(kind: string): Exclude<TlCat, "전체"> {
  if (kind === "incident") return "이슈";
  if (kind === "deployment") return "배포";
  return "구성"; // inventory_event · gitops_change
}
function changeTone(severity: string): "ok" | "warn" | "crit" {
  if (severity === "critical") return "crit";
  if (severity === "warning") return "warn";
  return "ok";
}
export function TimelineSurface({ onOpenRef: _onOpenRef }: { onOpenRef: (kind: string, name: string) => void }) {
  const [cat, setCat] = useState<TlCat>("전체");
  const [page, setPage] = useState(0);
  const feed = useChangeTimeline();
  const board = useTimelineBoard();
  const items = feed.events.map((e) => ({
    id: e.id,
    time: fromNow(e.occurredMs),
    tone: changeTone(e.severity),
    cat: changeCat(e.kind),
    title: e.title,
  }));
  const shown = cat === "전체" ? items : items.filter((i) => i.cat === cat);
  // 수백 개 변경을 한 프레임에 motion 노드로 만들면 진입 시 긴 작업과 레이아웃
  // 이동이 발생한다. 모든 항목은 보존하되 화면 DOM은 페이지당 60개로 제한한다.
  const pageSize = 60;
  const pageCount = Math.max(1, Math.ceil(shown.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visibleItems = shown.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const activityChips = board.activityFacets.filter((f) => f.count > 0);
  return (
    <Page title="타임라인" icon={Clock}>
      {/* 실 timeline/overview 파생 요약(대표 클러스터 스코프) + 실 timeline/pins 고정 수 */}
      <ChipRow chips={[
        { label: "이벤트", value: board.overviewStatus === "ready" ? board.totalEvents : "—" },
        { label: "문제", value: board.overviewStatus === "ready" ? board.totalProblems : "—", warn: board.overviewStatus === "ready" && board.totalProblems > 0 },
        { label: "커버리지 공백", value: board.overviewStatus === "ready" ? board.coverageGaps : "—", warn: board.overviewStatus === "ready" && board.coverageGaps > 0 },
        { label: "고정", value: board.pins.status === "ready" ? board.pins.items.length : "—" },
      ]} />
      {activityChips.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {activityChips.map((f) => (
            <span key={f.activity} style={segStyle}>{koLabel(f.activity)} <b style={numStyle}>{f.count}</b></span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        {(["전체", "배포", "이슈", "구성"] as const).map((c) => (
          <button key={c} onClick={() => { setCat(c); setPage(0); }}
            style={{ display: "flex", alignItems: "center", gap: 5, border: `1px solid ${cat === c ? blueA(0.45) : UI.line}`, background: cat === c ? blueA(0.07) : UI.card, color: cat === c ? BLUE : UI.ink2, borderRadius: 999, padding: "4px 13px", fontSize: TYPE.label, fontWeight: 700, cursor: "pointer" }}>{c}
            <span style={{ fontFamily: MONO, fontSize: TYPE.micro, color: cat === c ? BLUE : UI.ink3 }}>{c === "전체" ? items.length : items.filter((i) => i.cat === c).length}</span>
          </button>
        ))}
      </div>
      <Card pad={0}>
        <div style={{ height: 440, overflowY: "auto", padding: 15, scrollbarGutter: "stable" }}>
          {feed.status === "loading" ? (
            <span style={{ fontSize: TYPE.label2, color: UI.ink3 }}>불러오는 중…</span>
          ) : feed.status === "unavailable" ? (
            <span style={{ fontSize: TYPE.label2, color: UI.ink3 }}>타임라인을 불러오지 못했습니다.</span>
          ) : shown.length === 0 ? (
            <span style={{ fontSize: TYPE.label2, color: UI.ink3 }}>최근 24시간 내 관측된 변경 없음</span>
          ) : (
            <MiniTimeline items={visibleItems.map(({ cat: _c, ...it }) => it)} />
          )}
        </div>
        {shown.length > pageSize && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, minHeight: 38, padding: "5px 12px", borderTop: `1px solid ${UI.line2}` }}>
            <span style={{ marginRight: "auto", fontSize: TYPE.caption2, color: UI.ink3 }}>
              {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, shown.length)} / {shown.length}
            </span>
            <button type="button" disabled={safePage === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}
              style={{ border: `1px solid ${UI.line}`, background: UI.card, color: safePage === 0 ? UI.ink3 : UI.ink2, borderRadius: 7, padding: "4px 9px", fontSize: TYPE.caption2, cursor: safePage === 0 ? "default" : "pointer" }}>이전</button>
            <button type="button" disabled={safePage >= pageCount - 1} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
              style={{ border: `1px solid ${UI.line}`, background: UI.card, color: safePage >= pageCount - 1 ? UI.ink3 : UI.ink2, borderRadius: 7, padding: "4px 9px", fontSize: TYPE.caption2, cursor: safePage >= pageCount - 1 ? "default" : "pointer" }}>다음</button>
          </div>
        )}
      </Card>
      {/* 고정한 항목 — 실 GET /api/timeline/pins(서버 진실). 비면 정직한 빈 상태 */}
      <Card pad={0}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 15px", borderBottom: `1px solid ${UI.line2}` }}>
          <Pin size={13} style={{ color: BLUE }} />
          <span style={{ fontSize: TYPE.label, fontWeight: 700, color: UI.ink3 }}>고정한 항목</span>
        </div>
        {board.pins.status === "loading" ? emptyRow("불러오는 중…")
          : board.pins.status === "unavailable" ? emptyRow("고정 항목을 불러오지 못했습니다.")
          : board.pins.status === "unsupported" ? emptyRow("고정 기능 없음")
          : board.pins.items.length === 0 ? emptyRow("고정한 항목 없음")
          : board.pins.items.map((p) => (
            <div key={p.pinId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 15px", borderTop: `1px solid ${UI.line2}` }}>
              <Pill tone="info" label={p.kind === "resource" ? "리소스" : "애플리케이션"} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: "block", fontSize: TYPE.label2, fontWeight: 700, fontFamily: MONO, color: UI.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.label}</span>
                {p.sublabel && <span style={{ display: "block", fontSize: TYPE.caption2, color: UI.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.sublabel}</span>}
              </span>
            </div>
          ))}
      </Card>
      {/* 정직한 표기 — 개요/문제/커버리지/고정은 실 timeline API 조회값이다. 관측 소스 모드만 부기 */}
      <span style={{ fontSize: TYPE.caption2, color: UI.ink3 }}>
        {board.status === "unavailable"
          ? "타임라인 개요를 불러오지 못했습니다 · 변경 스트림은 최근 24시간"
          : `개요·고정은 실 timeline API 조회 · 관측 소스 ${board.selectedSourceMode ? koLabel(board.selectedSourceMode) : "—"} · 변경 스트림은 최근 24시간`}
      </span>
    </Page>
  );
}

// ── 점검 /checks (5.10 — 정책 결과, 대상 클릭=상세 시트) ──
// UI-PHASE2-001: 실 GET /api/checks/overview. 현 dev 계약은 결과/카탈로그 관측
// unavailable(collector 미통합)이며 실 스코프 커버리지만 제공. 미지원 점검을
// "통과"로 위조하지 않고 정직한 unavailable + 스코프 커버리지를 렌더한다.
function ChecksContent() {
  const checks = useChecksOverview();
  if (checks.status === "loading") {
    return <Card><span style={{ fontSize: TYPE.label2, color: UI.ink3 }}>불러오는 중…</span></Card>;
  }
  if (checks.status === "error") {
    return <Card><span style={{ fontSize: TYPE.label2, color: UI.ink3 }}>점검 정보를 불러오지 못했습니다.</span></Card>;
  }
  const availabilityLabel = (a: string | null) => a === "available" ? "관측됨" : a === "partial" ? "부분 관측" : "관측 안 됨";
  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <Pill tone={checks.resultAvailability === "available" ? "ok" : "warn"} label={`점검 결과 ${availabilityLabel(checks.resultAvailability)}`} />
        <Pill tone={checks.catalogAvailability === "available" ? "ok" : "warn"} label={`카탈로그 ${availabilityLabel(checks.catalogAvailability)}`} />
        <span style={{ fontSize: TYPE.label, color: UI.ink3 }}>스코프 클러스터 {checks.scopes.length}개</span>
      </div>
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "4px 2px" }}>
          <span style={{ fontSize: TYPE.title3, fontWeight: 700, color: UI.ink2 }}>점검 결과 관측 안 됨</span>
          <span style={{ fontSize: TYPE.label2, color: UI.ink3 }}>점검 결과 없음</span>
          <ReasonNotes codes={checks.reasonCodes} />
        </div>
      </Card>
      <Card pad={0}>
        <div style={{ padding: "11px 15px", borderBottom: `1px solid ${UI.line2}`, fontSize: TYPE.label, fontWeight: 700, color: UI.ink3 }}>스코프 커버리지 · {availabilityLabel(checks.scopeAvailability)}</div>
        {checks.scopes.length === 0
          ? <div style={{ padding: "12px 15px", fontSize: TYPE.label2, color: UI.ink3 }}>스코프에 포함된 클러스터가 없습니다.</div>
          : checks.scopes.map((s) => (
            <div key={s.clusterId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 15px", borderTop: `1px solid ${UI.line2}` }}>
              <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: TYPE.label2, fontWeight: 700, fontFamily: MONO, color: UI.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.clusterId}</span>
                <span style={{ fontSize: TYPE.caption2, color: UI.ink3 }}>{s.namespaces.length ? `${s.namespaces.length}개 네임스페이스` : "전체 네임스페이스"}</span>
              </span>
              <Pill tone={s.freshness === "live" ? "ok" : s.freshness === "disconnected" ? "crit" : "warn"} label={koLabel(s.freshness)} />
            </div>
          ))}
      </Card>
    </>
  );
}

// 이전 /checks 진입점은 호환성을 위해 남겨 두되, 주 내비게이션에서는 이슈의
// '예방 점검' 탭을 사용한다. 두 진입점은 동일한 실 계약과 콘텐츠를 공유한다.
export function ChecksSurface({ onOpenRef: _onOpenRef }: { onOpenRef: (kind: string, name: string) => void }) {
  return (
    <Page title="예방 점검" icon={ShieldCheck}>
      <ChecksContent />
    </Page>
  );
}

// ── 비용 /cost (UI-PHASE2-001: 홈 W7과 같은 useCostOverview 단일 소스) ──
// 현 dev 계약은 비용 관측 unavailable. 가짜 총액/노드 가격을 backfill하지 않고 정직 상태를 렌더한다.
export function CostSurface({ onOpenRef: _onOpenRef }: { onOpenRef: (kind: string, name: string) => void }) {
  const cost = useCostOverview();
  return (
    <Page title="비용" icon={Coins}>
      <Card>
        {cost.status === "loading" ? (
          <span style={{ fontSize: TYPE.label2, color: UI.ink3 }}>불러오는 중…</span>
        ) : cost.status === "error" ? (
          <span style={{ fontSize: TYPE.label2, color: UI.ink3 }}>비용을 불러오지 못했습니다.</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "6px 4px" }}>
            <span style={{ fontSize: TYPE.title3, fontWeight: 700, color: UI.ink2 }}>비용 관측 데이터가 아직 없습니다</span>
            <span style={{ fontSize: TYPE.label2, color: UI.ink3 }}>현재 스코프에 대해 비용 관측이 아직 연동되지 않았습니다.</span>
            <ReasonNotes codes={cost.reasonCodes.length ? cost.reasonCodes : ["cost_observation_unavailable"]} />
          </div>
        )}
      </Card>
    </Page>
  );
}

// ── 설정 /settings (D20 — 전역 앱 설정만. 연결·클러스터 관리는 각자의 문맥에) ──
// UI-PHASE2-001 §3: 워크스페이스·계정은 실 GET /api/auth/session. 테마·언어는 실
// GET/PUT /api/settings(UiPreferences)로 저장한다(낙관적 UI, 실패 시 서버 진실로
// 롤백, CSRF는 api 레이어). 접근 프로필은 GET /api/settings/access, 자동 갱신
// 정책은 GET /api/refresh-policies 실 조회. 예전의 "미지원/변경할 수 없습니다/연결
// 상태 확인 불가" 오판 표기를 제거했다. 토스트 토글만 이 브라우저 로컬 설정으로 남긴다.
function Segmented<T extends string>({ value, options, onPick, disabled }: {
  value: T | null; options: { id: T; label: string }[]; onPick: (id: T) => void; disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 2, background: inkA(0.05), borderRadius: 9, padding: 2 }}>
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button key={o.id} onClick={() => { if (!disabled && !active) onPick(o.id); }} disabled={disabled}
            style={{ border: "none", background: active ? UI.card : "transparent", color: active ? UI.ink : UI.ink3, borderRadius: 7, padding: "4px 12px", fontSize: TYPE.label, fontWeight: 700, cursor: disabled ? "not-allowed" : active ? "default" : "pointer", boxShadow: active ? `0 1px 3px ${inkA(0.14)}` : "none", opacity: disabled ? 0.55 : 1 }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
export function SettingsSurface() {
  const session = useSession();
  const prefs = useUiPreferences();
  const refresh = useRefreshPolicies();
  const access = useSettingsAccess();
  const [noise, setNoise] = useState(() => { try { return sessionStorage.getItem("opsia-demo-toast-crit-only") === "1"; } catch { return false; } });
  const toggleNoise = () => setNoise((v) => { const n = !v; try { sessionStorage.setItem("opsia-demo-toast-crit-only", n ? "1" : "0"); } catch { /* 데모 */ } return n; });
  const workspaceSub = session.status === "loading" ? "세션 확인 중…"
    : session.status === "error" ? "세션을 불러오지 못했습니다"
    : `${session.workspaceId ?? "—"}${session.authMode ? ` · ${koLabel(session.authMode)}` : ""}`;
  const accountName = session.displayName ?? session.email ?? session.userId ?? "—";
  const accountSub = session.status !== "ready" ? "—"
    : session.roles.length ? session.roles.map(koLabel).join(", ") : "역할 없음";
  const prefsReady = prefs.status === "ready";
  const prefsDisabled = !prefsReady || prefs.saving;
  const prefsSub = prefs.status === "loading" ? "환경설정 불러오는 중…"
    : prefs.status === "unavailable" ? "환경설정을 불러오지 못했습니다"
    : prefs.saveError ? "저장 실패 · 이전 값으로 되돌렸습니다"
    : prefs.saving ? "저장 중…"
    : "이 계정의 서버 저장 환경설정입니다";
  return (
    <Page title="설정" icon={Building2}>
      <Card pad={0}>
        <SettingsRow icon={Building2} title="워크스페이스" sub={workspaceSub}
          right={session.status === "ready" && session.roles.length ? <Mono dim>{koLabel(session.roles[0])}</Mono> : <Mono dim>—</Mono>} />
        <SettingsRow icon={Building2} title="계정" sub={accountSub}
          right={<span style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontSize: TYPE.label2, color: UI.ink2, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{accountName}</span>
            <span style={{ width: 26, height: 26, borderRadius: 999, background: inkA(0.08), display: "grid", placeItems: "center", fontSize: TYPE.label, fontWeight: 700, color: UI.ink2 }}>{session.status === "ready" ? sessionInitial(session) : "?"}</span>
          </span>} />
        <SettingsRow icon={Palette} title="테마" sub={prefsSub} right={
          <Segmented value={prefsReady ? prefs.theme : null} disabled={prefsDisabled}
            onPick={(theme) => prefs.save({ theme })}
            options={[{ id: "system", label: "시스템" }, { id: "light", label: "라이트" }, { id: "dark", label: "다크" }]} />} />
        <SettingsRow icon={Globe} title="언어" sub="인터페이스 표시 언어 · 서버에 저장됩니다" right={
          <Segmented value={prefsReady ? prefs.locale : null} disabled={prefsDisabled}
            onPick={(locale) => prefs.save({ locale })}
            options={[{ id: "en", label: "English" }, { id: "ko", label: "한국어" }]} />} />
        <SettingsRow icon={Bell} title="토스트 알림" sub="장애 사건만 토스트로 알림 · 벨에는 전부 기록 · 이 브라우저에만 저장됩니다" right={
          <button type="button" role="switch" aria-label="장애 사건 토스트 알림" aria-checked={noise} onClick={toggleNoise} style={{ width: 34, height: 20, borderRadius: 999, border: "none", cursor: "pointer", background: noise ? HP.ok : inkA(0.15), position: "relative", transition: "background .2s" }}>
            <span style={{ position: "absolute", top: 2, left: noise ? 16 : 2, width: 16, height: 16, borderRadius: 999, background: UI.card, boxShadow: `0 1px 3px ${inkA(0.3)}`, transition: "left .2s" }} />
          </button>} />
      </Card>
      {/* 접근 권한 — 실 GET /api/settings/access(대표 클러스터 스코프) */}
      <Card pad={0}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 15px", borderBottom: `1px solid ${UI.line2}` }}>
          <Lock size={13} style={{ color: BLUE }} />
          <span style={{ fontSize: TYPE.label, fontWeight: 700, color: UI.ink3 }}>접근 권한{access.clusterId ? ` · ${access.clusterId}` : ""}</span>
        </div>
        {access.status === "loading" ? emptyRow("불러오는 중…")
          : access.status === "unavailable" ? emptyRow("접근 프로필을 불러오지 못했습니다.")
          : access.clusterId === null ? emptyRow("등록된 클러스터가 없어 접근 프로필을 조회할 수 없습니다.")
          : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 15px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                {access.roles.length ? access.roles.map((r) => <Pill key={r} tone="info" label={koLabel(r)} />) : <span style={{ fontSize: TYPE.label2, color: UI.ink3 }}>역할 없음</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={segStyle}>허용 권한 <b style={numStyle}>{access.allowedCount}/{access.permissionCount}</b></span>
                <Pill tone={access.kubernetesRulesObserved ? "ok" : "warn"} label={access.kubernetesRulesObserved ? "K8s 권한 관측됨" : "K8s 권한 미관측"} />
                {access.restrictedResourceCount !== null && access.restrictedResourceCount > 0 && (
                  <span style={segStyle}>제한 리소스 <b style={numStyle}>{access.restrictedResourceCount}</b></span>
                )}
              </div>
            </div>
          )}
      </Card>
      {/* 자동 갱신 정책 — 실 GET /api/refresh-policies(서버 소유 캐던스) */}
      <Card pad={0}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 15px", borderBottom: `1px solid ${UI.line2}` }}>
          <RefreshCw size={13} style={{ color: BLUE }} />
          <span style={{ fontSize: TYPE.label, fontWeight: 700, color: UI.ink3 }}>자동 갱신 정책</span>
        </div>
        {refresh.status === "loading" ? emptyRow("불러오는 중…")
          : refresh.status === "unavailable" ? emptyRow("자동 갱신 정책을 불러오지 못했습니다.")
          : refresh.items.length === 0 ? emptyRow("등록된 정책 없음")
          : (
            <div style={{ maxHeight: 260, overflowY: "auto" }}>
              {refresh.items.map((p) => (
                <div key={p.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 15px", borderTop: `1px solid ${UI.line2}` }}>
                  <Mono>{koLabel(p.key)}</Mono>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {p.eventInvalidation && <Pill tone="info" label="이벤트 무효화" />}
                    <span style={{ fontSize: TYPE.caption2, color: UI.ink3, fontFamily: MONO }}>{p.staleAfterSeconds !== null ? `오래됨 ${p.staleAfterSeconds}초 · ` : ""}갱신 {p.refreshAfterSeconds}초</span>
                  </span>
                </div>
              ))}
            </div>
          )}
      </Card>
      {/* 정직한 표기 — 테마·언어는 실 PUT /api/settings 저장(낙관적, 실패 시 롤백).
          접근·자동 갱신 정책은 실 조회. 토스트 토글만 이 브라우저 로컬 데모 설정. */}
      <span style={{ fontSize: TYPE.caption2, color: UI.ink3 }}>테마·언어는 서버에 저장됩니다(실패 시 이전 값으로 되돌림) · 접근·자동 갱신 정책은 실시간 조회</span>
      <span style={{ fontSize: TYPE.caption2, fontFamily: MONO, color: UI.ink3 }}>Kyro Console 0.1.0{prefs.revision !== null ? ` · prefs r${prefs.revision}` : ""}</span>
    </Page>
  );
}

// ── 알림 /alerts — 벨 팝오버의 "전체 보기" 목적지: 발생 이벤트 + 규칙 + 채널 ──
// UI-PHASE2-001: 실 GET /api/alert-events(발생 이벤트) · /api/alert-rules(규칙) ·
// /api/alert-channels(채널). 이벤트 목록은 현재 비어 있어 정직한 "관측된 알림
// 없음"으로 렌더한다. 규칙 활성/비활성·생성은 CSRF가 필요한 mutation이므로 여기
// 서는 읽기 전용(상태 pill)으로만 표시하고 자동 변형은 하지 않는다.
function severityTone(severity: string): "ok" | "warn" | "crit" | "info" {
  if (severity === "critical") return "crit";
  if (severity === "high" || severity === "warning" || severity === "medium") return "warn";
  return "info";
}
export function AlertsSurface({ onOpenRef }: { onOpenRef: (kind: string, name: string) => void }) {
  const events = useAlertEvents();
  const rules = useAlertRules();
  const channels = useAlertChannels();
  const evCols: [string, string][] = [["심각도", "88px"], ["대상", "minmax(220px,1.8fr)"], ["규칙", "minmax(90px,0.8fr)"], ["상태", "80px"], ["발생", "minmax(70px,0.5fr)"]];
  const ruleCols: [string, string][] = [["규칙", "minmax(160px,1.5fr)"], ["조건", "minmax(140px,1.2fr)"], ["심각도", "minmax(80px,0.6fr)"], ["채널", "56px"], ["활성", "72px"]];
  const chCols: [string, string][] = [["채널", "minmax(160px,1.5fr)"], ["종류", "minmax(90px,0.8fr)"], ["최소 심각도", "minmax(90px,0.8fr)"], ["활성", "72px"]];
  const firing = events.status === "ready" ? events.items.filter((e) => e.status === "firing").length : "—";
  return (
    <Page title="알림" icon={Bell}>
      <ChipRow chips={[
        { label: "발생 중", value: firing, crit: typeof firing === "number" && firing > 0 },
        { label: "이벤트", value: events.status === "ready" ? events.items.length : "—" },
        { label: "규칙", value: rules.status === "ready" ? rules.items.length : "—" },
        { label: "채널", value: channels.status === "ready" ? channels.items.length : "—" },
      ]} />
      <Card pad={0}>
        <div style={{ padding: "11px 15px", borderBottom: `1px solid ${UI.line2}`, fontSize: TYPE.label, fontWeight: 700, color: UI.ink3 }}>발생 이벤트</div>
        <THead cols={evCols} />
        {events.status === "loading" ? emptyRow("불러오는 중…")
          : events.status === "unavailable" ? emptyRow("알림 이벤트를 불러오지 못했습니다.")
          : events.items.length === 0 ? emptyRow("관측된 알림 없음")
          : events.items.map((n, i) => (
            <TRow key={n.eventId} cols={evCols} i={i} onClick={() => onOpenRef(n.kind, n.name)} cells={[
              <Pill key="s" tone={severityTone(n.severity)} label={koLabel(n.severity)} />,
              <span key="t" style={{ fontSize: TYPE.label2, color: UI.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.kind} · {n.name}{n.namespace ? ` · ${n.namespace}` : ""}</span>,
              <Mono key="r" dim>{n.ruleName ?? "—"}</Mono>,
              <span key="st" style={{ fontSize: TYPE.label, color: UI.ink3 }}>{koLabel(n.status)}</span>,
              <Mono key="w" dim>{fromNow(n.firedAt)}</Mono>,
            ]} />
          ))}
      </Card>
      <Card pad={0}>
        <div style={{ padding: "11px 15px", borderBottom: `1px solid ${UI.line2}`, fontSize: TYPE.label, fontWeight: 700, color: UI.ink3 }}>알림 규칙</div>
        <THead cols={ruleCols} />
        {rules.status === "loading" ? emptyRow("불러오는 중…")
          : rules.status === "unavailable" ? emptyRow("알림 규칙을 불러오지 못했습니다.")
          : rules.items.length === 0 ? emptyRow("등록된 규칙 없음")
          : rules.items.map((r, i) => (
            <TRow key={r.ruleId} cols={ruleCols} i={i} cells={[
              <Mono key="n">{r.name}</Mono>,
              <span key="c" style={{ fontSize: TYPE.label, color: UI.ink2, fontFamily: MONO }}>{r.metric} {r.comparator} {r.threshold}</span>,
              <Pill key="s" tone={severityTone(r.severity)} label={koLabel(r.severity)} />,
              <Mono key="ch">{r.channels.length}</Mono>,
              <Pill key="e" tone={r.enabled ? "ok" : "info"} label={r.enabled ? "활성" : "중지"} />,
            ]} />
          ))}
      </Card>
      <Card pad={0}>
        <div style={{ padding: "11px 15px", borderBottom: `1px solid ${UI.line2}`, fontSize: TYPE.label, fontWeight: 700, color: UI.ink3 }}>알림 채널</div>
        <THead cols={chCols} />
        {channels.status === "loading" ? emptyRow("불러오는 중…")
          : channels.status === "unavailable" ? emptyRow("알림 채널을 불러오지 못했습니다.")
          : channels.items.length === 0 ? emptyRow("등록된 채널 없음")
          : channels.items.map((c, i) => (
            <TRow key={c.channelId} cols={chCols} i={i} cells={[
              <Mono key="n">{c.name}</Mono>,
              <span key="k" style={{ fontSize: TYPE.label, color: UI.ink2 }}>{c.kind}</span>,
              <span key="m" style={{ fontSize: TYPE.label, color: UI.ink3 }}>{koLabel(c.minSeverity)}</span>,
              <Pill key="e" tone={c.enabled ? "ok" : "info"} label={c.enabled ? "활성" : "중지"} />,
            ]} />
          ))}
      </Card>
    </Page>
  );
}

// ── AI 대화 /ai — AI 패널 대화 내역 모아보기(행 클릭·새 대화 = 패널 열기, 죽은 컨트롤 없음) ──
// UI-PHASE2-001: 실 GET /api/ai/conversations(useAiConversations 재사용). 서버가
// 돌려준 대화만 렌더하고, 없으면 정직한 빈 상태, 실패는 정직한 unavailable로 둔다.
export function AiHistorySurface({ onOpenPanel }: { onOpenPanel: () => void }) {
  const feed = useAiConversations();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 행 클릭 시 선택한 대화 id로 상세(GET /api/ai/conversations/{id})를 조회해 실 Q&A를 렌더한다.
  const detail = useConversationDetail(selectedId);
  const cols: [string, string][] = [["대화", "minmax(260px,2fr)"], ["시간", "minmax(80px,0.6fr)"]];

  if (selectedId !== null) {
    const selected = feed.items.find((c) => c.id === selectedId);
    // user turn은 question 필드에, assistant turn은 parts(text)에 실 내용이 담긴다.
    const turnText = (turn: (typeof detail.turns)[number]) =>
      turn.role === "user"
        ? (turn.question ?? "")
        : (turn.parts ?? [])
            .filter((part): part is Extract<typeof part, { kind: "text" }> => part.kind === "text")
            .map((part) => part.markdown)
            .join("\n");
    return (
      <Page title={selected?.title ?? "AI 대화"} icon={Sparkles}
        action={<button onClick={() => setSelectedId(null)} style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${UI.line}`, background: UI.card, color: UI.ink2, borderRadius: 9, padding: "6px 13px", fontSize: TYPE.label2, fontWeight: 700, cursor: "pointer" }}>← 목록</button>}>
        <Card>
          {detail.status === "loading" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[0, 1, 2].map((n) => (
                <div key={n} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <span style={{ width: 36, height: 10, borderRadius: 4, background: inkA(0.07) }} />
                  <span style={{ width: n % 2 ? "62%" : "88%", height: 13, borderRadius: 5, background: inkA(0.05) }} />
                  <span style={{ width: "46%", height: 13, borderRadius: 5, background: inkA(0.05) }} />
                </div>
              ))}
            </div>
          )
            : detail.status === "unavailable" ? <div style={{ fontSize: TYPE.label2, color: UI.ink3, padding: "6px 2px" }}>이 대화의 상세 이력은 관측되지 않습니다.</div>
            : detail.turns.length === 0 ? <div style={{ fontSize: TYPE.label2, color: UI.ink3, padding: "6px 2px" }}>대화 메시지가 없습니다.</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {detail.turns.map((turn, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: TYPE.caption, fontWeight: 700, color: turn.role === "user" ? BLUE : UI.ink2 }}>{turn.role === "user" ? "질문" : "응답"}</span>
                    <div style={{ fontSize: TYPE.label2, color: UI.ink, whiteSpace: "pre-wrap", lineHeight: 1.65 }}>{turnText(turn) || "(내용 없음)"}</div>
                  </div>
                ))}
              </div>}
        </Card>
      </Page>
    );
  }

  return (
    <Page title="AI 대화" icon={Sparkles}
      action={<button onClick={onOpenPanel} style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: BLUE, color: UI.card, borderRadius: 9, padding: "6px 13px", fontSize: TYPE.label2, fontWeight: 700, cursor: "pointer" }}>새 대화</button>}>
      <Card pad={0}>
        <THead cols={cols} />
        {feed.status === "loading" ? emptyRow("불러오는 중…")
          : feed.status === "unavailable" ? emptyRow("대화 내역을 불러오지 못했습니다.")
          : feed.items.length === 0 ? emptyRow("저장된 AI 대화 없음")
          : feed.items.map((c, i) => (
            <TRow key={c.id} cols={cols} i={i} onClick={() => setSelectedId(c.id)} cells={[
              <span key="t" style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: TYPE.label2, fontWeight: 700, color: UI.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span>
                <span style={{ fontSize: TYPE.micro, fontFamily: MONO, color: UI.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.id}</span>
              </span>,
              <Mono key="w" dim>{fromNow(c.updatedAt)}</Mono>,
            ]} />
          ))}
      </Card>
    </Page>
  );
}

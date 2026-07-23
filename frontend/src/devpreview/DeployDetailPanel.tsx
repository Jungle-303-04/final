import { useEffect } from "react";
import { motion } from "motion/react";
import { GitBranch, Package, Rocket, X } from "lucide-react";

import type { ApplicationDriftEndpoint } from "../api/application-catalog-schemas";
import type { GitOpsApplicationDetailEndpoint } from "../api/gitops-application-detail-schemas";
import { BLUE, ELEV, HP, MONO, PRESENT_SCALE, RADIUS, SOFT, SPACE, TINT, TYPE, UI, blueA, critA, inkA } from "./theme";
import { statusLabel } from "./statusLabel";
import {
  useApplicationDetail,
  useHelmReleaseDetail,
  type DetailSection,
  type HelmReleaseIdentity,
} from "./deployDetailFeed";
import type { ApplicationRunView, DeployFeedStatus, WorkflowStepView } from "./deployFeed";

// ── 배포 상세 패널 — 전역 레이어 계약: scrim 70 / panel 71 (unified DetailOverlay와 동일층)
// 원칙: 모든 표시는 실제 계약 응답에서만 파생한다. 실패/미연동 섹션은 정직한
// 문구와 함께 그대로 노출하고, 동작하지 않는 컨트롤은 그리지 않는다(가짜 컨트롤 금지).

export type DeployDetailTarget =
  | { kind: "application"; applicationId: string; name: string }
  | { kind: "helm"; identity: HelmReleaseIdentity; displayNamespace: string }
  | { kind: "run"; workflowRunId: string };

interface PanelInsets {
  topInset: number;
  leftInset: number;
  rightInset: number;
}

const PANEL_WIDTH = 560;

// ── 소형 로컬 부품 — devpreview-surfaces와 같은 토큰 문법(순환 import 회피용 사본,
//    Phase 5에서 공용 모듈로 수렴 예정) ──────────────────────────────────────

function fromNow(input: string | null): string {
  if (input === null) return "—";
  const ms = Date.parse(input);
  if (!Number.isFinite(ms)) return "—";
  const diff = Date.now() - ms;
  if (diff < 0) return "방금";
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

type PillTone = "ok" | "warn" | "crit" | "info" | "gray";

function StatusPill({ tone, label }: { tone: PillTone; label: string }) {
  const palette = tone === "ok" ? TINT.ok
    : tone === "warn" ? TINT.warn
    : tone === "crit" ? { fg: TINT.crit.fg, bg: critA(0.09), bd: critA(0.3) }
    : tone === "info" ? { fg: TINT.blue.fg, bg: blueA(0.08), bd: blueA(0.25) }
    : TINT.gray;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: TYPE.caption, fontWeight: 600, borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap", color: palette.fg, background: palette.bg, border: `1px solid ${palette.bd}` }}>
      <span style={{ width: 5, height: 5, borderRadius: 999, background: tone === "info" ? BLUE : tone === "gray" ? UI.ink3 : HP[tone] }} />
      {label}
    </span>
  );
}

function statusTone(raw: string | null): PillTone {
  const value = raw?.trim().toLowerCase() ?? "";
  if (["succeeded", "synced", "healthy", "ready", "deployed", "in_sync"].includes(value)) return "ok";
  if (["failed", "degraded", "error", "critical", "unhealthy", "drifted"].includes(value)) return "crit";
  if (["pending", "progressing", "running", "waiting_for_approval", "superseded"].includes(value)) return "info";
  if (value === "") return "gray";
  return "warn";
}

function statusView(raw: string | null): React.ReactNode {
  if (raw === null || raw.trim() === "") return <span style={{ fontSize: TYPE.caption, color: UI.ink3 }}>관측 안 됨</span>;
  return <StatusPill tone={statusTone(raw)} label={statusLabel(raw)} />;
}

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section style={{ border: `1px solid ${UI.line}`, borderRadius: RADIUS.card, background: UI.card, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${UI.line2}`, background: UI.bg2 }}>
        <span style={{ fontSize: TYPE.caption, fontWeight: 700, letterSpacing: "0.04em", color: UI.ink2 }}>{title}</span>
        <span style={{ marginLeft: "auto" }}>{aside}</span>
      </div>
      <div style={{ padding: SPACE.stack, display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </section>
  );
}

function KV({ label, children, mono = false }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "112px minmax(0, 1fr)", gap: 10, alignItems: "baseline" }}>
      <span style={{ fontSize: TYPE.caption, color: UI.ink3 }}>{label}</span>
      <span style={{ minWidth: 0, fontSize: TYPE.label, color: UI.ink, fontFamily: mono ? MONO : undefined, overflowWrap: "anywhere" }}>{children}</span>
    </div>
  );
}

function gapText(value: string | null): React.ReactNode {
  return value !== null && value.trim() !== ""
    ? value
    : <span style={{ color: UI.ink3 }}>—</span>;
}

function SectionState({ status, emptyLabel }: { status: DeployFeedStatus; emptyLabel: string }) {
  return (
    <span style={{ fontSize: TYPE.label, color: UI.ink3, padding: "2px 0" }}>
      {status === "loading" ? "불러오는 중…" : status === "unavailable" ? emptyLabel : "관측된 항목 없음"}
    </span>
  );
}

// ── 패널 셸 ──────────────────────────────────────────────────────────────────

function PanelShell({ icon: Icon, title, subtitle, onClose, insets, children }: {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  title: string;
  subtitle: string | null;
  onClose: () => void;
  insets: PanelInsets;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={SOFT} aria-hidden="true" onClick={onClose}
        style={{ position: "fixed", top: insets.topInset, left: insets.leftInset, right: insets.rightInset, bottom: 0, background: inkA(0.22), zIndex: 70 }} />
      <motion.aside role="dialog" aria-modal="true" aria-label={title}
        initial={{ x: 24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={SOFT}
        style={{ position: "fixed", top: insets.topInset, right: insets.rightInset, bottom: 0, width: PANEL_WIDTH, maxWidth: `calc(100vw / ${PRESENT_SCALE} - ${insets.leftInset + insets.rightInset + 24}px)`, background: UI.card, borderLeft: `1px solid ${UI.line}`, boxShadow: ELEV.overlay, zIndex: 71, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: `${SPACE.stack}px ${SPACE.card}px`, borderBottom: `1px solid ${UI.line}` }}>
          <Icon size={16} style={{ color: BLUE, flexShrink: 0 }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: TYPE.section, fontWeight: 700, letterSpacing: "-0.01em", color: UI.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
            {subtitle && <div title={subtitle} style={{ marginTop: 1, fontFamily: MONO, fontSize: TYPE.caption, color: UI.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subtitle}</div>}
          </div>
          <button type="button" className="product-focusable product-control" onClick={onClose} aria-label="상세 패널 닫기"
            style={{ width: 30, height: 30, borderRadius: RADIUS.control, border: `1px solid ${UI.line}`, background: UI.card, color: UI.ink2, cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <X size={14} />
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", scrollbarGutter: "stable", display: "flex", flexDirection: "column", gap: SPACE.stack, padding: SPACE.card }}>
          {children}
        </div>
      </motion.aside>
    </>
  );
}

// ── 워크플로우 스텝 타임라인 — 서버가 기록한 스텝 evidence만 그린다 ─────────

function stepDotColor(status: string | null): string {
  const tone = statusTone(status);
  if (tone === "ok") return HP.ok;
  if (tone === "crit") return HP.crit;
  if (tone === "info") return BLUE;
  if (tone === "warn") return HP.warn;
  return HP.pending;
}

function StepTimeline({ steps }: { steps: WorkflowStepView[] }) {
  if (steps.length === 0) return <SectionState status="ready" emptyLabel="" />;
  return (
    <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column" }}>
      {steps.map((step, index) => (
        <li key={`${step.name}-${index}`} style={{ display: "flex", gap: 10, minWidth: 0 }}>
          <span aria-hidden="true" style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: stepDotColor(step.status), marginTop: 5, flexShrink: 0 }} />
            {index < steps.length - 1 && <span style={{ flex: 1, width: 1, background: UI.line2, marginTop: 3, marginBottom: 3, minHeight: 10 }} />}
          </span>
          <div style={{ minWidth: 0, flex: 1, paddingBottom: index < steps.length - 1 ? 10 : 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={{ fontSize: TYPE.label, fontWeight: 600, fontFamily: MONO, color: UI.ink }}>{step.name}</span>
              {statusView(step.status)}
              <span style={{ marginLeft: "auto", flexShrink: 0, fontSize: TYPE.caption, color: UI.ink3 }}>{fromNow(step.updatedAt)}</span>
            </div>
            {step.message && (
              <div title={step.message} style={{ marginTop: 2, fontSize: TYPE.caption, color: UI.ink2, lineHeight: 1.5, overflowWrap: "anywhere" }}>{step.message}</div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

// ── 애플리케이션 상세 ────────────────────────────────────────────────────────

function readText(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function readTextList(record: Record<string, unknown> | null, key: string): string[] {
  const value = record?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

function readMap(record: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  const value = record?.[key];
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const GITOPS_REASON_KO: Record<string, string> = {
  binding_scope_unavailable: "배포 바인딩 범위가 아직 확인되지 않았습니다",
  multiple_target_scopes: "여러 대상 범위가 감지되어 단일 범위를 확정할 수 없습니다",
  live_observation_not_integrated: "라이브 관측이 아직 연동되지 않았습니다",
  source_revision_unavailable: "소스 리비전 관측이 아직 없습니다",
  workflow_operation_unobserved: "워크플로우 작업 관측이 아직 없습니다",
  provider_operation_not_integrated: "공급자 작업 연동이 아직 없습니다",
  not_authorized: "권한이 없습니다",
  operation_in_progress: "작업이 진행 중입니다",
  provider_refresh_not_integrated: "공급자 refresh 연동이 아직 없습니다",
  provider_sync_not_integrated: "공급자 sync 연동이 아직 없습니다",
};

function gitOpsReason(code: string | null): string {
  return code === null ? "사유가 보고되지 않았습니다" : GITOPS_REASON_KO[code] ?? "관측 데이터가 아직 없습니다";
}

function GitOpsSection({ section }: { section: DetailSection<GitOpsApplicationDetailEndpoint["application"]> }) {
  const detail = section.data;
  if (detail === null) {
    return (
      <Section title="GitOps">
        <SectionState status={section.status} emptyLabel="GitOps 상세를 불러오지 못했습니다." />
      </Section>
    );
  }
  const scope = detail.scope.scope;
  return (
    <Section title="GitOps" aside={scope && <StatusPill tone={scope.freshness === "live" ? "ok" : scope.freshness === "disconnected" ? "crit" : "warn"} label={statusLabel(scope.freshness)} />}>
      <KV label="리소스" mono>{detail.resource.kind} · {gapText(detail.resource.namespace)} / {detail.resource.name}</KV>
      <KV label="클러스터" mono>{scope ? scope.cluster_id : gitOpsReason(detail.scope.reason_code)}</KV>
      <KV label="저장소" mono>{gapText(detail.source.repository_ref)}</KV>
      <KV label="브랜치" mono>{gapText(detail.source.default_branch)}</KV>
      <KV label="매니페스트" mono>{gapText(detail.source.manifest_path)}</KV>
      <KV label="선언/라이브 비교">
        {detail.desired_live_diff.availability === "available"
          ? gapText(detail.desired_live_diff.source_revision)
          : <span style={{ color: UI.ink3 }}>{gitOpsReason(detail.desired_live_diff.reason_code)}</span>}
      </KV>
      <KV label="진행 중 작업">
        {detail.operation.in_progress
          ? <span style={{ fontFamily: MONO }}>{detail.operation.workflow_run_id} · {statusLabel(detail.operation.status)}</span>
          : <span style={{ color: UI.ink3 }}>{detail.operation.availability === "available" ? "진행 중 작업 없음" : gitOpsReason(detail.operation.reason_code)}</span>}
      </KV>
      {/* refresh/sync capability — 서버 계약상 아직 enabled=false만 온다. 동작하지 않는
          버튼을 그리는 대신 비활성 사유를 정직하게 표기한다(가짜 컨트롤 금지). */}
      {detail.capabilities.map((capability) => (
        <KV key={capability.action} label={capability.action === "refresh" ? "Refresh" : "Sync"}>
          <span style={{ color: UI.ink3 }}>{gitOpsReason(capability.reason_code)}</span>
        </KV>
      ))}
    </Section>
  );
}

function DriftSection({ section }: { section: DetailSection<ApplicationDriftEndpoint> }) {
  const drift = section.data;
  if (drift === null) {
    return (
      <Section title="드리프트">
        <SectionState status={section.status} emptyLabel="드리프트 관측을 불러오지 못했습니다." />
      </Section>
    );
  }
  return (
    <Section title="드리프트" aside={statusView(drift.status)}>
      {drift.summary && <span style={{ fontSize: TYPE.label, color: UI.ink, lineHeight: 1.55 }}>{drift.summary}</span>}
      {drift.observed_at && <KV label="관측 시각">{fromNow(drift.observed_at)}</KV>}
      {drift.status !== "drifted" && !drift.summary && (
        <span style={{ fontSize: TYPE.label, color: UI.ink3 }}>
          {drift.status === "in_sync" ? "선언 상태와 라이브 상태가 일치합니다." : "드리프트 여부를 판정할 관측이 아직 없습니다."}
        </span>
      )}
      {drift.differences.map((difference, index) => (
        <div key={`${difference.resource}-${difference.field_path}-${index}`} style={{ border: `1px solid ${UI.line2}`, borderRadius: RADIUS.control, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontFamily: MONO, fontSize: TYPE.caption, color: UI.ink }}>{difference.resource} · {difference.field_path}</span>
          <span style={{ fontFamily: MONO, fontSize: TYPE.caption, color: UI.ink2, overflowWrap: "anywhere" }}>
            {difference.value_redacted
              ? "값이 마스킹되었습니다"
              : `${String(difference.old_value ?? "—")} → ${String(difference.new_value ?? "—")}`}
          </span>
          {(difference.changed_by || difference.changed_at) && (
            <span style={{ fontSize: TYPE.caption, color: UI.ink3 }}>
              {[difference.changed_by, difference.changed_at ? fromNow(difference.changed_at) : null].filter(Boolean).join(" · ")}
            </span>
          )}
        </div>
      ))}
    </Section>
  );
}

export function ApplicationDetailPanel({ target, runs, onClose, insets }: {
  target: Extract<DeployDetailTarget, { kind: "application" }>;
  runs: ApplicationRunView[];
  onClose: () => void;
  insets: PanelInsets;
}) {
  const detail = useApplicationDetail(target.applicationId);
  const record = detail.record.data;
  const health = readMap(record, "health");
  const delivery = readMap(record, "delivery");
  const environments = readTextList(record, "environments");
  const applicationRuns = runs.filter((run) => run.applicationId === target.applicationId);

  return (
    <PanelShell icon={Package} title={readText(record, "name") ?? target.name} subtitle={target.applicationId} onClose={onClose} insets={insets}>
      <Section title="개요" aside={statusView(readText(health, "status"))}>
        {detail.record.status !== "ready" ? (
          <SectionState status={detail.record.status} emptyLabel="애플리케이션을 불러오지 못했습니다." />
        ) : (
          <>
            <KV label="저장소" mono>{gapText(readText(record, "repository_ref"))}</KV>
            <KV label="브랜치" mono>{gapText(readText(record, "default_branch"))}</KV>
            <KV label="매니페스트" mono>{gapText(readText(record, "manifest_path"))}</KV>
            <KV label="환경">{environments.length > 0 ? environments.join(", ") : <span style={{ color: UI.ink3 }}>—</span>}</KV>
            <KV label="라이프사이클">{statusView(readText(record, "lifecycle_status"))}</KV>
            <KV label="배포 상태">{statusView(readText(delivery, "status"))}</KV>
            <KV label="배포 관측 시각">{fromNow(readText(delivery, "observed_at"))}</KV>
          </>
        )}
      </Section>
      <Section title="배포 바인딩" aside={detail.deployments.data && <span style={{ fontSize: TYPE.caption, color: UI.ink3 }}>{detail.deployments.data.length}개</span>}>
        {detail.deployments.data === null || detail.deployments.data.length === 0 ? (
          <SectionState status={detail.deployments.status} emptyLabel="배포 바인딩을 불러오지 못했습니다." />
        ) : detail.deployments.data.map((binding, index) => (
          <div key={index} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, borderBottom: index < (detail.deployments.data?.length ?? 0) - 1 ? `1px solid ${UI.line2}` : "none", paddingBottom: 6 }}>
            <span style={{ minWidth: 0, flex: 1, fontFamily: MONO, fontSize: TYPE.label, color: UI.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {[readText(binding, "environment"), readText(binding, "cluster_id"), readText(binding, "namespace")].filter(Boolean).join(" · ") || `바인딩 ${index + 1}`}
            </span>
            {statusView(readText(binding, "status"))}
          </div>
        ))}
      </Section>
      <Section title="워크플로우 실행" aside={<span style={{ fontSize: TYPE.caption, color: UI.ink3 }}>{applicationRuns.length}개</span>}>
        {applicationRuns.length === 0 ? (
          <span style={{ fontSize: TYPE.label, color: UI.ink3 }}>관측된 배포 실행 없음</span>
        ) : applicationRuns.slice(0, 5).map((run) => (
          <div key={run.workflowRunId} style={{ border: `1px solid ${UI.line2}`, borderRadius: RADIUS.control, padding: "9px 11px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span title={run.workflowRunId} style={{ minWidth: 0, flex: 1, fontFamily: MONO, fontSize: TYPE.caption, color: UI.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{run.workflowRunId}</span>
              {statusView(run.status)}
              <span style={{ flexShrink: 0, fontSize: TYPE.caption, color: UI.ink3 }}>{fromNow(run.updatedAt ?? run.createdAt)}</span>
            </div>
            <StepTimeline steps={run.steps} />
          </div>
        ))}
        {applicationRuns.length > 5 && (
          <span style={{ fontSize: TYPE.caption, color: UI.ink3 }}>최근 5개 표시 · {applicationRuns.length - 5}개 더 있음</span>
        )}
      </Section>
      <GitOpsSection section={detail.gitops} />
      <DriftSection section={detail.drift} />
    </PanelShell>
  );
}

// ── Helm 릴리스 상세 ─────────────────────────────────────────────────────────

function helmAvailabilityNote(reasonCode: string): string {
  const HELM_REASON_KO: Record<string, string> = {
    helm_manifest_not_integrated: "매니페스트 조회가 아직 연동되지 않았습니다",
    helm_values_not_integrated: "values 조회가 아직 연동되지 않았습니다",
    helm_owned_resources_not_integrated: "소유 리소스 관측이 아직 연동되지 않았습니다",
    helm_commands_not_integrated: "릴리스 명령이 아직 연동되지 않았습니다",
  };
  return HELM_REASON_KO[reasonCode] ?? "아직 연동되지 않았습니다";
}

export function HelmDetailPanel({ target, onClose, insets }: {
  target: Extract<DeployDetailTarget, { kind: "helm" }>;
  onClose: () => void;
  insets: PanelInsets;
}) {
  const feed = useHelmReleaseDetail(target.identity);
  const detail = feed.detail;
  const release = detail?.release ?? null;
  const ownedResources = detail !== null && "items" in detail.owned_resources ? detail.owned_resources : null;

  return (
    <PanelShell icon={Rocket} title={target.identity.name} subtitle={`${target.identity.clusterId} · ${target.displayNamespace}`} onClose={onClose} insets={insets}>
      {detail === null ? (
        <SectionState status={feed.status} emptyLabel="Helm 릴리스 상세를 불러오지 못했습니다." />
      ) : (
        <>
          <Section title="개요" aside={statusView(release?.status ?? null)}>
            <KV label="차트" mono>{gapText(release?.chart ?? null)}</KV>
            <KV label="차트 버전" mono>{gapText(release?.chart_version ?? null)}</KV>
            <KV label="리비전" mono>{release !== null && release.revision !== null ? String(release.revision) : "—"}</KV>
            <KV label="스토리지" mono>{release ? `${release.storage.kind} · ${release.storage_namespace}/${release.storage.name}` : "—"}</KV>
            <KV label="리소스 헬스">
              {release === null ? "—"
                : "resource_count" in release.resource_health
                  ? <span>{statusView(release.resource_health.health)} <span style={{ fontSize: TYPE.caption, color: UI.ink3 }}>· 리소스 {release.resource_health.resource_count}개</span></span>
                  : <span style={{ color: UI.ink3 }}>{helmAvailabilityNote(release.resource_health.reason_code)}</span>}
            </KV>
            <KV label="관측 시각">{fromNow(release?.observed_at ?? null)}</KV>
            <KV label="매니페스트"><span style={{ color: UI.ink3 }}>{helmAvailabilityNote(detail.manifest.reason_code)}</span></KV>
            <KV label="Values"><span style={{ color: UI.ink3 }}>{helmAvailabilityNote(detail.values.reason_code)}</span></KV>
          </Section>
          <Section title="리비전 히스토리" aside={<span style={{ fontSize: TYPE.caption, color: UI.ink3 }}>{detail.history.length}개</span>}>
            {detail.history.length === 0 ? (
              <span style={{ fontSize: TYPE.label, color: UI.ink3 }}>보존된 히스토리 관측 없음</span>
            ) : detail.history.map((entry, index) => (
              <div key={`${entry.storage.uid}-${index}`} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span style={{ flexShrink: 0, fontFamily: MONO, fontSize: TYPE.label, fontVariantNumeric: "tabular-nums", color: UI.ink, width: 44 }}>
                  {entry.revision !== null ? `r${entry.revision}` : "—"}
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>{statusView(entry.status)}</span>
                <span style={{ flexShrink: 0, fontSize: TYPE.caption, color: UI.ink3 }}>{fromNow(entry.observed_at)}</span>
              </div>
            ))}
          </Section>
          <Section title="소유 리소스" aside={ownedResources?.truncated ? <StatusPill tone="warn" label="일부 생략" /> : undefined}>
            {ownedResources === null ? (
              <span style={{ fontSize: TYPE.label, color: UI.ink3 }}>
                {"reason_code" in detail.owned_resources ? helmAvailabilityNote(detail.owned_resources.reason_code) : "관측된 소유 리소스 없음"}
              </span>
            ) : ownedResources.items.length === 0 ? (
              <span style={{ fontSize: TYPE.label, color: UI.ink3 }}>관측된 소유 리소스 없음</span>
            ) : ownedResources.items.map((owned, index) => (
              <div key={`${owned.resource.uid}-${index}`} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span style={{ minWidth: 0, flex: 1, fontFamily: MONO, fontSize: TYPE.caption, color: UI.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {owned.resource.kind} · {[owned.resource.namespace, owned.resource.name].filter(Boolean).join("/")}
                </span>
                {statusView(owned.health)}
              </div>
            ))}
          </Section>
        </>
      )}
    </PanelShell>
  );
}

// ── 워크플로우 실행 상세 ─────────────────────────────────────────────────────

export function RunDetailPanel({ target, runs, onClose, insets }: {
  target: Extract<DeployDetailTarget, { kind: "run" }>;
  runs: ApplicationRunView[];
  onClose: () => void;
  insets: PanelInsets;
}) {
  const run = runs.find((candidate) => candidate.workflowRunId === target.workflowRunId) ?? null;
  return (
    <PanelShell icon={GitBranch} title={run?.applicationName ?? "워크플로우 실행"} subtitle={target.workflowRunId} onClose={onClose} insets={insets}>
      {run === null ? (
        <span style={{ fontSize: TYPE.label, color: UI.ink3, padding: "2px 0" }}>이 실행 기록이 현재 관측 범위에 없습니다.</span>
      ) : (
        <>
          <Section title="개요" aside={statusView(run.status)}>
            <KV label="앱" mono>{run.applicationName}</KV>
            <KV label="저장소" mono>{gapText(run.repositoryRef)}</KV>
            <KV label="커밋" mono>
              {run.commitSha && run.repositoryRef
                ? <a href={`https://github.com/${run.repositoryRef}/commit/${run.commitSha}`} target="_blank" rel="noreferrer" style={{ color: BLUE, textDecoration: "none" }}>{run.commitSha.slice(0, 12)}</a>
                : gapText(run.commitSha)}
            </KV>
            <KV label="클러스터" mono>{gapText(run.clusterId)}</KV>
            <KV label="현재 단계" mono>{gapText(run.currentStep)}</KV>
            <KV label="시작">{fromNow(run.createdAt)}</KV>
            <KV label="마지막 갱신">{fromNow(run.updatedAt)}</KV>
          </Section>
          <Section title="단계 타임라인" aside={<span style={{ fontSize: TYPE.caption, color: UI.ink3 }}>{run.steps.length}단계</span>}>
            {run.steps.length === 0
              ? <span style={{ fontSize: TYPE.label, color: UI.ink3 }}>기록된 단계 없음</span>
              : <StepTimeline steps={run.steps} />}
          </Section>
          {run.promotionGate && <PromotionGateSection gate={run.promotionGate} />}
        </>
      )}
    </PanelShell>
  );
}

// promotion gate는 서버 계약상 jsonMap으로 오므로 각 필드를 방어적으로 읽는다.
function PromotionGateSection({ gate }: { gate: Record<string, unknown> }) {
  const readBool = (key: string): boolean | null => (typeof gate[key] === "boolean" ? gate[key] as boolean : null);
  const readCount = (key: string): number | null => {
    const value = gate[key];
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
  };
  const eligible = readBool("eligible");
  const applied = readBool("applied");
  const rolloutReady = readBool("rollout_ready");
  const failedCount = readCount("failed_resource_count");
  const commandStatus = typeof gate.command_status === "string" ? gate.command_status : null;
  const unobserved = <span style={{ color: UI.ink3 }}>관측 안 됨</span>;
  return (
    <Section title="프로모션 게이트"
      aside={eligible === null ? undefined : <StatusPill tone={eligible ? "ok" : "warn"} label={eligible ? "충족" : "대기"} />}>
      <KV label="커맨드">{statusView(commandStatus)}</KV>
      <KV label="적용">{applied === null ? unobserved : applied ? "적용됨" : "적용 실패"}</KV>
      <KV label="Rollout">{rolloutReady === null ? unobserved : rolloutReady ? "Ready" : "Not ready"}</KV>
      {failedCount !== null && failedCount > 0 && (
        <KV label="실패 리소스"><span style={{ color: TINT.crit.fg }}>{failedCount}개</span></KV>
      )}
    </Section>
  );
}

// ── 진입점 — DeploySurface가 detail 상태 하나로 세 패널을 라우팅한다 ────────

export function DeployDetailHost({ target, runs, onClose, topInset, leftInset, rightInset }: {
  target: DeployDetailTarget;
  runs: ApplicationRunView[];
  onClose: () => void;
} & PanelInsets) {
  const insets: PanelInsets = { topInset, leftInset, rightInset };
  if (target.kind === "application") return <ApplicationDetailPanel target={target} runs={runs} onClose={onClose} insets={insets} />;
  if (target.kind === "helm") return <HelmDetailPanel target={target} onClose={onClose} insets={insets} />;
  return <RunDetailPanel target={target} runs={runs} onClose={onClose} insets={insets} />;
}

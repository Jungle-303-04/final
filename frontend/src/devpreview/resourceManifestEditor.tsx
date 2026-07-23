import { useEffect, useRef, useState } from "react";

import {
  applyResourceManifestEdit,
  approveResourceManifestEdit,
  getCommandStatus,
  getResourceManifestSource,
  manifestIdempotencyKey,
  previewResourceManifestEdit,
  resourceManifestFailureRemediation,
  resourceManifestFailureText,
  resourceManifestSourceRemediation,
  type CommandStatus,
  type ResourceManifestApplyEndpoint,
  type ResourceManifestApproveEndpoint,
  type ResourceManifestPreviewEndpoint,
  type ResourceManifestSourceEndpoint,
  type ResourceManifestRemediation,
} from "./resourceManifestFeed";
import { grantApproval, rejectApproval } from "../api/approvals";
import { reasonLabel } from "./statusLabel";
import { BLUE, HP, MONO, TINT, TYPE, UI, inkA } from "./theme";

type Phase = "loading" | "ready" | "previewing" | "submitting" | "failed";

interface LiveResourceManifestEditorProps {
  resourceId: string;
  resolving?: boolean;
  refreshKey?: number;
  onConnectRepository?: () => void;
  onOpenDeploySurface?: () => void;
  onReauthenticate?: () => void;
  onRequestAccess?: () => void;
}

export function LiveResourceManifestEditor({
  resourceId,
  resolving = false,
  refreshKey = 0,
  onConnectRepository,
  onOpenDeploySurface,
  onReauthenticate,
  onRequestAccess,
}: LiveResourceManifestEditorProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [source, setSource] = useState<ResourceManifestSourceEndpoint | null>(null);
  const [applicationId, setApplicationId] = useState("");
  const [yaml, setYaml] = useState("");
  const [preview, setPreview] = useState<ResourceManifestPreviewEndpoint | null>(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [approval, setApproval] = useState<ResourceManifestApproveEndpoint | null>(null);
  const [approvalDecision, setApprovalDecision] = useState<"granted" | "rejected" | null>(null);
  const [approvalDecisionBusy, setApprovalDecisionBusy] = useState(false);
  const [approvalDecisionError, setApprovalDecisionError] = useState<string | null>(null);
  const [emergencyApproval, setEmergencyApproval] = useState<ResourceManifestApproveEndpoint | null>(null);
  const [applyReceipt, setApplyReceipt] = useState<ResourceManifestApplyEndpoint | null>(null);
  const [applyStatus, setApplyStatus] = useState<CommandStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failureRemediation, setFailureRemediation] = useState<ResourceManifestRemediation>("none");
  const controller = useRef<AbortController | null>(null);

  const load = async (selectedApplicationId?: string | null) => {
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    setPhase("loading");
    setError(null);
    setFailureRemediation("none");
    setPreview(null);
    setApproval(null);
    setEmergencyApproval(null);
    setApplyReceipt(null);
    setApplyStatus(null);
    try {
      const loaded = await getResourceManifestSource(resourceId, selectedApplicationId, next.signal);
      if (next.signal.aborted) return;
      setSource(loaded);
      setApplicationId(loaded.selected?.application_id ?? selectedApplicationId ?? "");
      setYaml(loaded.content ?? "");
      setPhase("ready");
    } catch (cause) {
      if (next.signal.aborted) return;
      setError(resourceManifestFailureText(cause));
      setFailureRemediation(resourceManifestFailureRemediation(cause));
      setPhase("failed");
    }
  };

  useEffect(() => {
    controller.current?.abort();
    if (!resourceId) return;
    const next = new AbortController();
    controller.current = next;
    void (async () => {
      try {
        const loaded = await getResourceManifestSource(resourceId, null, next.signal);
        if (next.signal.aborted) return;
        setSource(loaded);
        setApplicationId(loaded.selected?.application_id ?? "");
        setYaml(loaded.content ?? "");
        setPreview(null);
        setApproval(null);
        setEmergencyApproval(null);
        setApplyReceipt(null);
        setApplyStatus(null);
        setError(null);
        setFailureRemediation("none");
        setPhase("ready");
      } catch (cause) {
        if (next.signal.aborted) return;
        setSource(null);
        setError(resourceManifestFailureText(cause));
        setFailureRemediation(resourceManifestFailureRemediation(cause));
        setPhase("failed");
      }
    })();
    return () => next.abort();
  }, [refreshKey, resourceId]);

  useEffect(() => {
    if (!applyReceipt?.command_id) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      try {
        const next = await getCommandStatus(applyReceipt.command_id, abort.signal);
        if (abort.signal.aborted) return;
        setApplyStatus(next);
        if (next.status !== "completed" && next.status !== "failed") {
          timer = setTimeout(() => void poll(), 1_500);
        }
      } catch {
        // The immutable receipt remains visible. A transient status read must not
        // turn a successfully queued operation into a fabricated failure.
      }
    };
    void poll();
    return () => {
      abort.abort();
      if (timer !== null) clearTimeout(timer);
    };
  }, [applyReceipt?.command_id]);

  const sourceIsCurrent = source?.resource_id === resourceId;
  const editInput = sourceIsCurrent && source?.base_sha && source.source_sha256 && applicationId && yaml
    ? {
        applicationId,
        baseSha: source.base_sha,
        sourceSha256: source.source_sha256,
        editedYaml: yaml,
      }
    : null;
  const busy = phase === "loading" || phase === "previewing" || phase === "submitting";

  const runPreview = async () => {
    if (!editInput) return;
    setPhase("previewing");
    setError(null);
    setApproval(null);
    setApplyReceipt(null);
    try {
      setPreview(await previewResourceManifestEdit(resourceId, editInput));
      setPhase("ready");
    } catch (cause) {
      setError(resourceManifestFailureText(cause));
      setPhase("failed");
    }
  };

  const submitSafePr = async () => {
    if (!editInput || !preview?.valid || reason.trim().length < 3) return;
    setPhase("submitting");
    setError(null);
    try {
      setApprovalDecision(null);
      setApprovalDecisionError(null);
      setApproval(await approveResourceManifestEdit(resourceId, {
        ...editInput,
        confirmed: true,
        reason: reason.trim(),
      }));
      setPhase("ready");
    } catch (cause) {
      setError(resourceManifestFailureText(cause));
      setPhase("failed");
    }
  };

  const decideApproval = async (decision: "granted" | "rejected") => {
    if (!approval || approvalDecisionBusy) return;
    setApprovalDecisionBusy(true);
    setApprovalDecisionError(null);
    try {
      if (decision === "granted") {
        await grantApproval(approval.approval_id, { reason: reason.trim() || null });
      } else {
        await rejectApproval(approval.approval_id, { reason: reason.trim() || null });
      }
      setApprovalDecision(decision);
    } catch (cause) {
      setApprovalDecisionError(resourceManifestFailureText(cause));
    } finally {
      setApprovalDecisionBusy(false);
    }
  };

  const submitDirectApply = async () => {
    if (
      !editInput || !preview?.valid || preview.apply_availability !== "available" ||
      reason.trim().length < 3 || !confirmed
    ) return;
    setPhase("submitting");
    setError(null);
    try {
      const recorded = emergencyApproval ?? await approveResourceManifestEdit(resourceId, {
        ...editInput,
        confirmed: true,
        reason: reason.trim(),
      });
      setEmergencyApproval(recorded);
      setApplyStatus(null);
      setApplyReceipt(await applyResourceManifestEdit(resourceId, {
        ...editInput,
        expectedDesiredSha256: preview.desired_sha256,
        confirmation: true,
        reason: reason.trim(),
        idempotencyKey: manifestIdempotencyKey(resourceId, preview.desired_sha256),
      }));
      setPhase("ready");
    } catch (cause) {
      setError(resourceManifestFailureText(cause));
      setPhase("failed");
    }
  };

  if (!resourceId && resolving) {
    return <ManifestNotice title="YAML 정체성 확인 중">서버가 발급한 inventory key를 정확한 리소스 정체성으로 조회하고 있습니다.</ManifestNotice>;
  }
  if (!resourceId) {
    return <ManifestNotice tone="warn" title="YAML 정체성 확인 불가">이 행에는 서버가 발급한 inventory key가 없습니다.</ManifestNotice>;
  }
  if (phase === "loading" || (!sourceIsCurrent && phase !== "failed")) {
    return <ManifestNotice title="YAML 소스 확인 중">Git에 고정된 실제 매니페스트와 편집 권한을 조회하고 있습니다.</ManifestNotice>;
  }
  if (phase === "failed" && !source) {
    const title = failureRemediation === "reauthenticate"
      ? "로그인이 필요합니다"
      : failureRemediation === "request-access"
        ? "YAML 접근 권한이 없습니다"
        : "YAML 원본 조회 실패";
    return (
      <div style={{ padding: "18px 0", display: "grid", gap: 10 }}>
        <ManifestNotice tone="warn" title={title}>
          {failureRemediation === "reauthenticate"
            ? "세션을 다시 인증한 뒤 같은 리소스의 YAML을 조회하세요."
            : failureRemediation === "request-access"
              ? "워크스페이스 관리자에게 애플리케이션 매니페스트 조회 권한을 요청하세요."
              : error ?? "YAML 원본을 불러오지 못했습니다."}
        </ManifestNotice>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {failureRemediation === "reauthenticate" && onReauthenticate && (
            <ActionButton disabled={false} onClick={onReauthenticate}>다시 로그인</ActionButton>
          )}
          {failureRemediation === "request-access" && onRequestAccess && (
            <ActionButton disabled={false} onClick={onRequestAccess}>권한 요청</ActionButton>
          )}
          {failureRemediation === "retry" && (
            <ActionButton disabled={false} onClick={() => void load()}>다시 시도</ActionButton>
          )}
        </div>
      </div>
    );
  }
  if (source?.status === "ambiguous") {
    return (
      <div style={{ padding: "18px 0", display: "grid", gap: 10 }}>
        <LiveManifestPanel source={source} />
        <ManifestNotice tone="warn" title="애플리케이션 소스를 선택하세요">동일 리소스를 소유한 실제 Git 소스가 여러 개입니다.</ManifestNotice>
        <select aria-label="YAML 애플리케이션 소스" value={applicationId}
          onChange={(event) => { const id = event.currentTarget.value; setApplicationId(id); if (id) void load(id); }}
          style={selectStyle}>
          <option value="">애플리케이션 선택</option>
          {source.choices.map((choice) => (
            <option key={choice.application_id} value={choice.application_id}>
              {choice.application_name} · {choice.repository_ref}/{choice.manifest_path}
            </option>
          ))}
        </select>
      </div>
    );
  }
  if (!source || source.status !== "available" || !source.selected || !source.content) {
    const remediation = resourceManifestSourceRemediation(source?.reason ?? null);
    return (
      <div style={{ padding: "18px 0", display: "grid", gap: 10 }}>
        {source && <LiveManifestPanel source={source} />}
        <ManifestNotice tone="warn" title={remediation === "request-access" ? "YAML 접근 권한이 없습니다" : "편집 가능한 Git YAML 없음"}>
          {remediation === "connect-repository"
            ? "Git 원본이 연결되지 않아 수정할 수 없습니다. 저장소를 연결해 권한과 원본 경로를 확인하세요."
            : remediation === "request-access"
              ? "연결된 Git 원본이 있지만 현재 계정에는 애플리케이션 매니페스트 조회 권한이 없습니다."
              : source?.reason ? reasonLabel(source.reason) : error ?? "이 리소스에 연결된 현재 YAML 원본을 찾지 못했습니다."}
        </ManifestNotice>
        {remediation === "connect-repository" && onConnectRepository && (
          <ActionButton primary disabled={false} onClick={onConnectRepository}>저장소 연결</ActionButton>
        )}
        {remediation === "request-access" && onRequestAccess && (
          <ActionButton disabled={false} onClick={onRequestAccess}>권한 요청</ActionButton>
        )}
        {remediation === "none" && (
          <small style={{ color: UI.ink3, lineHeight: 1.5 }}>
            인벤토리 원문을 합성하지 않습니다. 활성 애플리케이션·배포 바인딩·GitHub raw YAML 연결이 있어야 편집할 수 있습니다.
          </small>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 0 24px", display: "grid", gap: 12 }}>
      <LiveManifestPanel source={source} />
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <b style={{ color: UI.ink, fontSize: TYPE.body }}>Git 원본 · IDE 편집</b>
        {source.edit_target && (
          <span style={{ color: UI.ink3, fontSize: TYPE.caption }}>
            {source.edit_target.relationship === "owner" ? "Owner " : ""}
            {source.edit_target.kind}/{source.edit_target.name}
          </span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", fontSize: TYPE.caption, color: UI.ink2 }}>
        <Pill>{source.selected.repository_ref}</Pill><Pill>{source.selected.branch}</Pill>
        <span style={{ fontFamily: MONO }}>{source.selected.manifest_path}</span>
        <span style={{ marginLeft: "auto", fontFamily: MONO, color: UI.ink3 }}>commit {source.base_sha?.slice(0, 12)}</span>
      </div>
      <textarea aria-label="Git YAML 원본 편집기" value={yaml} disabled={busy || !!approval || !!emergencyApproval || !!applyReceipt}
        onChange={(event) => { setYaml(event.currentTarget.value); setPreview(null); setConfirmed(false); }} spellCheck={false}
        style={{ width: "100%", minHeight: 360, resize: "vertical", boxSizing: "border-box", border: `1px solid ${UI.line}`, borderRadius: 12, padding: 14, background: "#0d1117", color: "#e6edf3", fontFamily: MONO, fontSize: TYPE.code, lineHeight: 1.6, outline: "none" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <ActionButton disabled={busy} onClick={() => void runPreview()}>
          {phase === "previewing" ? "검증 중…" : "변경 검증·미리보기"}
        </ActionButton>
        {preview && <Pill tone={preview.valid ? "ok" : "warn"}>{preview.valid ? "서버 검증 통과" : "YAML 오류"}</Pill>}
        {preview?.valid && <Pill tone={preview.apply_availability === "available" ? "ok" : "warn"}>
          {preview.apply_availability === "available" ? "즉시 적용 가능" : "Safe PR만 가능"}
        </Pill>}
      </div>
      {preview?.diff && <pre style={{ margin: 0, maxHeight: 280, overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere", border: `1px solid ${UI.line}`, borderRadius: 12, padding: 14, background: UI.bg2, color: UI.ink, fontFamily: MONO, fontSize: TYPE.code, lineHeight: 1.55 }}>{preview.diff}</pre>}
      {preview?.errors.map((item) => <ManifestNotice key={item} tone="error" title="검증 오류">{item}</ManifestNotice>)}
      {preview?.warnings.map((item) => <ManifestNotice key={item} tone="warn" title="검토 필요">{item}</ManifestNotice>)}
      {preview?.apply_reason_codes.map((item) => <ManifestNotice key={item} tone="warn" title="즉시 적용 제한">{reasonLabel(item)}</ManifestNotice>)}
      {error && <ManifestNotice tone="error" title="YAML 요청 실패">{error}</ManifestNotice>}
      {preview?.valid && !approval && !applyReceipt && (
        <div style={{ display: "grid", gap: 9, borderTop: `1px solid ${UI.line2}`, paddingTop: 12 }}>
          <input aria-label="변경 사유" value={reason} onChange={(event) => setReason(event.currentTarget.value)} placeholder="변경 사유 (3자 이상)"
            style={{ border: `1px solid ${UI.line}`, borderRadius: 9, padding: "8px 10px", fontSize: TYPE.body, color: UI.ink, background: UI.card }} />
          {preview.apply_availability === "available" && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: TYPE.label, color: UI.ink2 }}>
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.currentTarget.checked)} />
              동일 Git artifact를 Safe PR로 먼저 기록한 뒤 owner controller에 직접 적용하며 drift/PR pending 상태가 남음을 확인합니다.
            </label>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <ActionButton primary disabled={busy || reason.trim().length < 3} onClick={() => void submitSafePr()}>Safe PR 요청</ActionButton>
            {preview.apply_availability === "available" && (
              <ActionButton disabled={busy || reason.trim().length < 3 || !confirmed} onClick={() => void submitDirectApply()}>
                {emergencyApproval ? "긴급 적용 재시도" : "Git 기록 후 긴급 적용"}
              </ActionButton>
            )}
          </div>
        </div>
      )}
      {approval && (
        <ManifestNotice tone="ok" title="Safe PR 요청 접수">
          승인 {approval.approval_id} · 워크플로 {approval.workflow_run_id} · 기준 commit {source.base_sha?.slice(0, 12)}
          {approvalDecision === null && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <ActionButton
                primary
                disabled={approvalDecisionBusy}
                onClick={() => void decideApproval("granted")}
              >
                승인하고 배포 진행
              </ActionButton>
              <ActionButton disabled={approvalDecisionBusy} onClick={() => void decideApproval("rejected")}>
                거부
              </ActionButton>
            </div>
          )}
          {approvalDecision === "granted" && (
            <div style={{ marginTop: 6 }}>
              승인 완료 — 배포 파이프라인이 진행됩니다.
              {onOpenDeploySurface && (
                <div style={{ marginTop: 6 }}>
                  <ActionButton primary disabled={false} onClick={onOpenDeploySurface}>배포 게이트에서 추적</ActionButton>
                </div>
              )}
            </div>
          )}
          {approvalDecision === "rejected" && <div style={{ marginTop: 6 }}>거부됨 — 이 변경은 배포되지 않습니다.</div>}
          {approvalDecisionError && <div style={{ marginTop: 6 }}>결정 실패: {approvalDecisionError}</div>}
        </ManifestNotice>
      )}
      {emergencyApproval && <ManifestNotice tone="warn" title="Git artifact 기록 · PR pending">승인 {emergencyApproval.approval_id} · 기준 commit {source.base_sha?.slice(0, 12)} · 클러스터 직접 적용 후 PR 병합 전까지 drift 상태로 추적합니다.</ManifestNotice>}
      {applyReceipt && <ManifestNotice tone="ok" title="Owner controller 적용 명령 접수">명령 {applyReceipt.command_id} · 감사 이벤트 {applyReceipt.audit_event_id}</ManifestNotice>}
      {applyStatus && (
        <ManifestNotice
          tone={applyStatus.status === "failed" ? "error" : applyStatus.status === "completed" ? "ok" : "neutral"}
          title={`적용 상태 · ${commandStatusLabel(applyStatus.status)}`}
        >
          {commandResultSummary(applyStatus)}
        </ManifestNotice>
      )}
    </div>
  );
}

function commandStatusLabel(status: CommandStatus["status"]): string {
  if (status === "queued") return "대기";
  if (status === "leased") return "에이전트 수신";
  if (status === "running") return "적용 중";
  if (status === "completed") return "명령 완료";
  return "실패";
}

function commandResultSummary(command: CommandStatus): string {
  const message = typeof command.result.message === "string" ? command.result.message : null;
  const resources = Array.isArray(command.result.resources) ? command.result.resources : [];
  const rollout = resources
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => item.rollout)
    .find((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
  const phase = typeof rollout?.phase === "string" ? rollout.phase : null;
  const resource = typeof rollout?.resource === "string" ? rollout.resource : null;
  const rolloutText = phase ? `Rollout ${phase}${resource ? ` · ${resource}` : ""}` : null;
  return [message, rolloutText, command.completed_at ? `완료 ${command.completed_at}` : null]
    .filter((item): item is string => item !== null)
    .join(" · ") || "에이전트의 실제 적용 결과를 기다리고 있습니다.";
}

function LiveManifestPanel({ source }: { source: ResourceManifestSourceEndpoint }) {
  return (
    <section aria-label="Live YAML 읽기 전용" style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <b style={{ color: UI.ink, fontSize: TYPE.body }}>Live YAML · 읽기 전용</b>
        {source.live_observed_at && <span style={{ color: UI.ink3, fontVariantNumeric: "tabular-nums", fontSize: TYPE.caption }}>관측 {source.live_observed_at}</span>}
      </div>
      {source.live_yaml ? (
        <textarea aria-label="Live YAML" value={source.live_yaml} readOnly spellCheck={false}
          style={{ width: "100%", minHeight: 190, resize: "vertical", boxSizing: "border-box", border: `1px solid ${UI.line}`, borderRadius: 12, padding: 14, background: UI.bg2, color: UI.ink2, fontFamily: MONO, fontSize: TYPE.code, lineHeight: 1.6, outline: "none" }} />
      ) : (
        <ManifestNotice tone="warn" title="Live YAML 관측 불가">{source.live_reason ?? "현재 inventory snapshot에 원문이 없습니다."}</ManifestNotice>
      )}
    </section>
  );
}

function ManifestNotice({ title, tone = "neutral", children }: { title: string; tone?: "neutral" | "ok" | "warn" | "error"; children: React.ReactNode }) {
  const palette = tone === "ok" ? TINT.ok : tone === "warn" ? TINT.warn : tone === "error" ? TINT.crit : TINT.blue;
  return <div role={tone === "error" ? "alert" : "status"} style={{ border: `1px solid ${palette.bd}`, background: palette.bg, borderRadius: 10, padding: "10px 12px", color: UI.ink2, fontSize: TYPE.label, lineHeight: 1.5 }}>
    <b style={{ display: "block", color: palette.fg, marginBottom: 2 }}>{title}</b>{children}
  </div>;
}

function Pill({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "warn"; children: React.ReactNode }) {
  const color = tone === "ok" ? HP.ok : tone === "warn" ? HP.warn : UI.ink2;
  return <span style={{ border: `1px solid ${tone === "neutral" ? UI.line : `${color}55`}`, background: tone === "neutral" ? inkA(0.035) : `${color}12`, borderRadius: 999, padding: "3px 8px", color, fontSize: TYPE.caption, fontWeight: 700 }}>{children}</span>;
}

function ActionButton({ primary = false, disabled, onClick, children }: { primary?: boolean; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" disabled={disabled} onClick={onClick} style={{ border: primary ? "none" : `1px solid ${UI.line}`, background: primary ? BLUE : UI.card, color: primary ? UI.card : BLUE, borderRadius: 9, padding: "7px 12px", fontSize: TYPE.label, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}>{children}</button>;
}

const selectStyle: React.CSSProperties = { width: "100%", border: `1px solid ${UI.line}`, borderRadius: 9, padding: "8px 10px", background: UI.card, color: UI.ink, fontSize: TYPE.body };

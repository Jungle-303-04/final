import { useEffect, useRef, useState } from "react";

import {
  applyResourceManifestEdit,
  approveResourceManifestEdit,
  getResourceManifestSource,
  previewResourceManifestEdit,
} from "../api/resource-manifests";
import type {
  ResourceManifestApplyEndpoint,
  ResourceManifestApproveEndpoint,
  ResourceManifestPreviewEndpoint,
  ResourceManifestSourceEndpoint,
} from "../api/resource-manifests-schemas";
import { isApiError } from "../api/client";
import { reasonLabel } from "./statusLabel";
import { BLUE, HP, MONO, TINT, TYPE, UI, inkA } from "./theme";

type Phase = "loading" | "ready" | "previewing" | "submitting" | "failed";

export function LiveResourceManifestEditor({ resourceId }: { resourceId: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [source, setSource] = useState<ResourceManifestSourceEndpoint | null>(null);
  const [applicationId, setApplicationId] = useState("");
  const [yaml, setYaml] = useState("");
  const [preview, setPreview] = useState<ResourceManifestPreviewEndpoint | null>(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [approval, setApproval] = useState<ResourceManifestApproveEndpoint | null>(null);
  const [applyReceipt, setApplyReceipt] = useState<ResourceManifestApplyEndpoint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  const load = async (selectedApplicationId?: string | null) => {
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    setPhase("loading");
    setError(null);
    setPreview(null);
    setApproval(null);
    setApplyReceipt(null);
    try {
      const loaded = await getResourceManifestSource(resourceId, selectedApplicationId, next.signal);
      if (next.signal.aborted) return;
      setSource(loaded);
      setApplicationId(loaded.selected?.application_id ?? selectedApplicationId ?? "");
      setYaml(loaded.content ?? "");
      setPhase("ready");
    } catch (cause) {
      if (next.signal.aborted) return;
      setError(failureText(cause));
      setPhase("failed");
    }
  };

  useEffect(() => {
    controller.current?.abort();
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
        setApplyReceipt(null);
        setError(null);
        setPhase("ready");
      } catch (cause) {
        if (next.signal.aborted) return;
        setSource(null);
        setError(failureText(cause));
        setPhase("failed");
      }
    })();
    return () => next.abort();
  }, [resourceId]);

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
      setError(failureText(cause));
      setPhase("failed");
    }
  };

  const submitSafePr = async () => {
    if (!editInput || !preview?.valid || reason.trim().length < 3) return;
    setPhase("submitting");
    setError(null);
    try {
      setApproval(await approveResourceManifestEdit(resourceId, {
        ...editInput,
        confirmed: true,
        reason: reason.trim(),
      }));
      setPhase("ready");
    } catch (cause) {
      setError(failureText(cause));
      setPhase("failed");
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
      setApplyReceipt(await applyResourceManifestEdit(resourceId, {
        ...editInput,
        expectedDesiredSha256: preview.desired_sha256,
        confirmation: true,
        reason: reason.trim(),
        idempotencyKey: manifestIdempotencyKey(resourceId, preview.desired_sha256),
      }));
      setPhase("ready");
    } catch (cause) {
      setError(failureText(cause));
      setPhase("failed");
    }
  };

  if (!resourceId) {
    return <ManifestNotice tone="warn" title="YAML 정체성 확인 불가">이 행에는 서버가 발급한 inventory key가 없습니다.</ManifestNotice>;
  }
  if (phase === "loading" || (!sourceIsCurrent && phase !== "failed")) {
    return <ManifestNotice title="YAML 소스 확인 중">Git에 고정된 실제 매니페스트와 편집 권한을 조회하고 있습니다.</ManifestNotice>;
  }
  if (source?.status === "ambiguous") {
    return (
      <div style={{ padding: "18px 0", display: "grid", gap: 10 }}>
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
    return (
      <div style={{ padding: "18px 0", display: "grid", gap: 10 }}>
        <ManifestNotice tone="warn" title="편집 가능한 Git YAML 없음">
          {source?.reason ? reasonLabel(source.reason) : error ?? "이 리소스에 연결된 현재 YAML 원본을 찾지 못했습니다."}
        </ManifestNotice>
        <small style={{ color: UI.ink3, lineHeight: 1.5 }}>
          인벤토리 원문을 합성하지 않습니다. 활성 애플리케이션·배포 바인딩·GitHub raw YAML 연결이 있어야 편집할 수 있습니다.
        </small>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 0 24px", display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", fontSize: TYPE.caption2, color: UI.ink2 }}>
        <Pill>{source.selected.repository_ref}</Pill><Pill>{source.selected.branch}</Pill>
        <span style={{ fontFamily: MONO }}>{source.selected.manifest_path}</span>
        <span style={{ marginLeft: "auto", fontFamily: MONO, color: UI.ink3 }}>{source.base_sha?.slice(0, 12)}</span>
      </div>
      <textarea aria-label="YAML 매니페스트 편집기" value={yaml} disabled={busy || !!approval || !!applyReceipt}
        onChange={(event) => { setYaml(event.currentTarget.value); setPreview(null); setConfirmed(false); }} spellCheck={false}
        style={{ width: "100%", minHeight: 360, resize: "vertical", boxSizing: "border-box", border: `1px solid ${UI.line}`, borderRadius: 12, padding: 14, background: "#0d1117", color: "#e6edf3", fontFamily: MONO, fontSize: 12, lineHeight: 1.6, outline: "none" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <ActionButton disabled={busy} onClick={() => void runPreview()}>
          {phase === "previewing" ? "검증 중…" : "변경 검증·미리보기"}
        </ActionButton>
        {preview && <Pill tone={preview.valid ? "ok" : "warn"}>{preview.valid ? "YAML 유효" : "YAML 오류"}</Pill>}
        {preview?.valid && <Pill tone={preview.apply_availability === "available" ? "ok" : "warn"}>
          {preview.apply_availability === "available" ? "즉시 적용 가능" : "Safe PR만 가능"}
        </Pill>}
      </div>
      {preview?.diff && <pre style={{ margin: 0, maxHeight: 280, overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere", border: `1px solid ${UI.line}`, borderRadius: 12, padding: 14, background: UI.bg2, color: UI.ink, fontFamily: MONO, fontSize: 11, lineHeight: 1.55 }}>{preview.diff}</pre>}
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
              검증한 변경을 이 클러스터에 즉시 적용하며 감사 이벤트가 기록됨을 확인합니다.
            </label>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <ActionButton disabled={busy || reason.trim().length < 3} onClick={() => void submitSafePr()}>Safe PR 요청</ActionButton>
            {preview.apply_availability === "available" && (
              <ActionButton primary disabled={busy || reason.trim().length < 3 || !confirmed} onClick={() => void submitDirectApply()}>
                즉시 적용
              </ActionButton>
            )}
          </div>
        </div>
      )}
      {approval && <ManifestNotice tone="ok" title="Safe PR 요청 접수">승인 {approval.approval_id} · 워크플로 {approval.workflow_run_id}</ManifestNotice>}
      {applyReceipt && <ManifestNotice tone="ok" title="적용 명령 접수">명령 {applyReceipt.command_id} · 감사 이벤트 {applyReceipt.audit_event_id}</ManifestNotice>}
    </div>
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
  return <span style={{ border: `1px solid ${tone === "neutral" ? UI.line : `${color}55`}`, background: tone === "neutral" ? inkA(0.035) : `${color}12`, borderRadius: 999, padding: "3px 8px", color, fontSize: TYPE.caption2, fontWeight: 700 }}>{children}</span>;
}

function ActionButton({ primary = false, disabled, onClick, children }: { primary?: boolean; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" disabled={disabled} onClick={onClick} style={{ border: primary ? "none" : `1px solid ${UI.line}`, background: primary ? BLUE : UI.card, color: primary ? UI.card : BLUE, borderRadius: 9, padding: "7px 12px", fontSize: TYPE.label2, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}>{children}</button>;
}

const selectStyle: React.CSSProperties = { width: "100%", border: `1px solid ${UI.line}`, borderRadius: 9, padding: "8px 10px", background: UI.card, color: UI.ink, fontSize: TYPE.body };

function manifestIdempotencyKey(resourceId: string, desiredSha256: string): string {
  const safeResource = resourceId.replace(/[^A-Za-z0-9._:-]/g, "-").slice(-40);
  // 동일 리소스·동일 desired SHA의 재시도는 같은 작업이므로 같은 키를 사용한다.
  return `manifest-${safeResource}-${desiredSha256.slice(-16)}`;
}

function failureText(cause: unknown): string {
  if (isApiError(cause)) return cause.detail ?? cause.code ?? `${cause.kind}${cause.status ? ` (${cause.status})` : ""}`;
  return cause instanceof Error ? cause.message : "요청을 완료하지 못했습니다.";
}

import { useEffect, useState } from "react";
import { AlertTriangle, FileCog, KeyRound } from "lucide-react";

import { listConfigReferences } from "../api/config-references";
import type {
  ConfigReferenceCoverage,
  ConfigReferenceItem,
  ConfigReferenceKind,
  ConfigReferenceList,
  ConfigReferenceSource,
  ConfigReferenceUsage,
} from "../api/config-references-schemas";
import { BLUE, HP, MONO, TYPE, UI } from "./theme";

type ConfigPanelStatus = "loading" | "ready" | "unavailable";

interface OpsiaConfigPanelProps {
  activeCluster: string | null;
  selectedNamespace: string | null;
}

interface OpsiaConfigPanelView {
  status: ConfigPanelStatus;
  data: ConfigReferenceList | null;
}

const KIND_LABELS: Record<ConfigReferenceKind, string> = {
  ConfigMap: "ConfigMap",
  Secret: "Secret",
};

const SOURCE_LABELS: Record<ConfigReferenceSource, string> = {
  env: "env",
  env_from: "envFrom",
  volume: "volume",
  volume_mount: "mount",
};

const COVERAGE_REASON_LABELS: Record<string, string> = {
  inventory_snapshot_unavailable: "인벤토리 스냅샷이 아직 없습니다",
  inventory_resource_repository_unavailable: "인벤토리 리소스 저장소를 읽을 수 없습니다",
  invalid_namespace: "네임스페이스 필터가 올바르지 않습니다",
  workload_collection_not_observed: "workload 수집 범위가 확인되지 않았습니다",
  workload_collection_incomplete: "workload 수집 결과가 일부만 반영되었습니다",
  workload_collection_truncated: "workload 수집 결과가 잘렸습니다",
  deployment_projection_limit_reached: "Deployment 조회 한도까지 표시 중입니다",
  config_reference_projection_limit_reached: "구성 참조 결과가 일부 생략되었습니다",
  config_reference_reason_codes_truncated: "일부 사유가 생략되었습니다",
  source_resources_incomplete: "인벤토리 원본 리소스가 일부만 수집되었습니다",
  source_resources_truncated: "인벤토리 원본 리소스가 잘렸습니다",
};

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error
    && (error as { name?: unknown }).name === "AbortError";
}

function configStatusLabel(
  status: ConfigPanelStatus,
  count: number,
  coverage: ConfigReferenceCoverage | null,
): string {
  if (status === "loading") return "불러오는 중";
  if (status === "unavailable" || coverage?.availability === "unavailable") return "관측 불가";
  if (coverage?.availability === "partial") return `${count}개 · 일부`;
  return `${count}개`;
}

function useOpsiaConfigReferences(
  clusterId: string | null,
  namespace: string | null,
): OpsiaConfigPanelView {
  const [view, setView] = useState<OpsiaConfigPanelView & { key: string }>({
    status: "loading",
    data: null,
    key: "",
  });
  const cid = clusterId?.trim() ?? "";
  const ns = namespace?.trim() ?? "";
  const key = cid ? `${cid}\u0000${ns}` : "";

  useEffect(() => {
    if (!key) return;
    const [requestedClusterId, requestedNamespace = ""] = key.split("\u0000");
    const controller = new AbortController();
    void listConfigReferences(
      requestedClusterId,
      { namespace: requestedNamespace || null },
      controller.signal,
    ).then((response) => {
      if (controller.signal.aborted) return;
      setView({ status: "ready", data: response, key });
    }).catch((cause: unknown) => {
      if (controller.signal.aborted || isAbortError(cause)) return;
      setView({ status: "unavailable", data: null, key });
    });
    return () => controller.abort();
  }, [key]);

  if (!key) return { status: "ready", data: null };
  return view.key === key ? view : { status: "loading", data: null };
}

function PanelEmptyState({ label, hint }: { label: string; hint: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "26px 14px", textAlign: "center" }}>
      <FileCog size={20} style={{ color: UI.ink3 }} />
      <span style={{ fontSize: TYPE.label, fontWeight: 600, color: UI.ink2 }}>{label}</span>
      <span style={{ fontSize: TYPE.caption, color: UI.ink3, lineHeight: 1.5 }}>{hint}</span>
    </div>
  );
}

function ConfigSkeletonList() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "4px 2px" }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 9px" }}>
          <span className="op-skel" style={{ width: 14, height: 14, borderRadius: 4, flexShrink: 0 }} />
          <span style={{ flex: 1, display: "grid", gap: 5 }}>
            <span className="op-skel" style={{ width: `${72 - i * 7}%`, height: 10, borderRadius: 5 }} />
            <span className="op-skel" style={{ width: "54%", height: 8, borderRadius: 4 }} />
          </span>
        </div>
      ))}
    </div>
  );
}

function CoverageNote({ coverage }: { coverage: ConfigReferenceCoverage }) {
  if (coverage.availability !== "partial" || coverage.reason_codes.length === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "7px 8px", border: `1px solid ${HP.warn}33`, borderRadius: 8, background: `${HP.warn}0F`, color: UI.ink2 }}>
      <AlertTriangle size={13} style={{ color: HP.warn, flexShrink: 0, marginTop: 1 }} />
      <span style={{ fontSize: TYPE.caption, lineHeight: 1.45 }}>{coverageReasonText(coverage)}</span>
    </div>
  );
}

function ConfigKindChip({ kind }: { kind: ConfigReferenceKind }) {
  const color = kind === "Secret" ? HP.warn : BLUE;
  return (
    <span style={{ fontSize: TYPE.caption, fontWeight: 700, color, background: `${color}14`, border: `1px solid ${color}33`, borderRadius: 5, padding: "1px 6px", whiteSpace: "nowrap" }}>
      {KIND_LABELS[kind]}
    </span>
  );
}

function usageDetail(usage: ConfigReferenceUsage): string {
  if (usage.source === "env") {
    return [usage.env_name, usage.key].filter(Boolean).join(" · ") || SOURCE_LABELS[usage.source];
  }
  if (usage.source === "env_from") {
    return usage.prefix ? `prefix ${usage.prefix}` : SOURCE_LABELS[usage.source];
  }
  if (usage.source === "volume") {
    return usage.volume_name ?? SOURCE_LABELS[usage.source];
  }
  return [usage.volume_name, usage.mount_path].filter(Boolean).join(" · ") || SOURCE_LABELS[usage.source];
}

function usageLabel(usage: ConfigReferenceUsage): string {
  return `${usage.workload.name} · ${SOURCE_LABELS[usage.source]} · ${usageDetail(usage)}`;
}

function referencedWorkloadCount(item: ConfigReferenceItem): number {
  return new Set(
    item.referenced_by.map((usage) => (
      usage.workload.uid ?? `${usage.workload.namespace}/${usage.workload.name}`
    )),
  ).size;
}

function ConfigReferenceRow({ item }: { item: ConfigReferenceItem }) {
  const Icon = item.kind === "Secret" ? KeyRound : FileCog;
  const previewUsages = item.referenced_by.slice(0, 2);
  const hiddenUsageCount = Math.max(0, item.referenced_by.length - previewUsages.length);
  const workloadCount = referencedWorkloadCount(item);

  return (
    <div className="rrow" style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%", minHeight: 54, textAlign: "left", border: "1px solid transparent", background: "transparent", borderRadius: 9, padding: "7px 9px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <Icon size={14} style={{ color: UI.ink3, flexShrink: 0 }} />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span title={item.name} style={{ display: "block", fontSize: TYPE.label, fontWeight: 700, fontFamily: MONO, color: UI.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
          <span style={{ display: "block", fontSize: TYPE.caption, color: UI.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.namespace} · Deployment {workloadCount}개 참조</span>
        </span>
        <ConfigKindChip kind={item.kind} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, paddingLeft: 22 }}>
        {previewUsages.map((usage, index) => (
          <span key={`${usage.workload.namespace}/${usage.workload.name}/${usage.source}/${usageDetail(usage)}/${index}`} style={{ display: "block", fontSize: TYPE.caption, color: UI.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {usageLabel(usage)}
          </span>
        ))}
        {hiddenUsageCount > 0 && (
          <span style={{ fontSize: TYPE.caption, color: UI.ink3 }}>+{hiddenUsageCount}개 참조 더 있음</span>
        )}
      </div>
    </div>
  );
}

function emptyHint(namespace: string | null, coverage: ConfigReferenceCoverage | null): string {
  if (coverage?.reason_codes.includes("workload_collection_not_observed")) {
    return namespace
      ? `${namespace} 네임스페이스의 workload 수집 범위가 아직 확인되지 않았습니다.`
      : "workload 수집 범위가 아직 확인되지 않았습니다.";
  }
  return namespace
    ? `${namespace} 네임스페이스에서 Deployment가 참조하는 ConfigMap·Secret이 없습니다.`
    : "선택한 클러스터에서 Deployment가 참조하는 ConfigMap·Secret이 없습니다.";
}

function coverageReasonText(coverage: ConfigReferenceCoverage | null): string {
  const labels = coverage?.reason_codes.map((reason) => COVERAGE_REASON_LABELS[reason] ?? reason) ?? [];
  return labels.length > 0 ? labels.join(" · ") : "인벤토리 응답을 다시 확인하세요.";
}

export function OpsiaConfigPanel({ activeCluster, selectedNamespace }: OpsiaConfigPanelProps) {
  const namespaceFilter = selectedNamespace?.trim() || null;
  const configView = useOpsiaConfigReferences(activeCluster, namespaceFilter);
  const items = configView.data?.items ?? [];
  const coverage = configView.data?.coverage ?? null;
  const coverageUnavailable = coverage?.availability === "unavailable";
  const scopeLabel = activeCluster
    ? [activeCluster, namespaceFilter ?? "모든 네임스페이스"].join(" · ")
    : "클러스터 선택 필요";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "2px 2px 4px" }}>
        <span style={{ fontSize: TYPE.body, fontWeight: 700, color: UI.ink }}>구성</span>
        <span style={{ fontSize: TYPE.caption, color: UI.ink3 }}>
          {configStatusLabel(configView.status, items.length, coverage)}
        </span>
      </div>
      <span style={{ fontSize: TYPE.caption, color: UI.ink3, padding: "0 2px 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {scopeLabel}
      </span>
      {!activeCluster ? (
        <PanelEmptyState label="클러스터를 선택하세요" hint="구성 참조는 클러스터 범위에서 표시됩니다." />
      ) : configView.status === "loading" ? (
        <ConfigSkeletonList />
      ) : configView.status === "unavailable" ? (
        <PanelEmptyState label="구성 참조를 불러오지 못했습니다" hint="인벤토리 응답을 다시 확인하세요." />
      ) : coverageUnavailable ? (
        <PanelEmptyState label="구성 참조를 확인할 수 없습니다" hint={coverageReasonText(coverage)} />
      ) : items.length === 0 ? (
        <PanelEmptyState label="참조된 ConfigMap·Secret이 없습니다" hint={emptyHint(namespaceFilter, coverage)} />
      ) : (
        <>
          {coverage && <CoverageNote coverage={coverage} />}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {items.map((item) => (
              <ConfigReferenceRow key={`${item.kind}:${item.namespace}/${item.name}`} item={item} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

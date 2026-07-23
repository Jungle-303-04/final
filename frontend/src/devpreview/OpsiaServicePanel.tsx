import { useEffect, useState } from "react";
import { Network, Plug } from "lucide-react";

import { listInventoryResourcesByType } from "../api/inventory-query";
import type { InventoryResource } from "../api/inventory-schemas";
import { HP, MONO, TYPE, UI } from "./theme";
import { statusLabel } from "./statusLabel";

type ServicePanelStatus = "loading" | "ready" | "unavailable";
type OpsiaServiceRow = Record<string, unknown>;
const SERVICE_RESOURCE_TYPE = "service";

interface OpsiaServicePanelProps {
  activeCluster: string | null;
  selectedNamespace: string | null;
}

interface OpsiaServicePanelView {
  status: ServicePanelStatus;
  rows: OpsiaServiceRow[];
}

function textValue(value: unknown, fallback = "-"): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

function serviceHealthSeverity(health: string): "ok" | "warn" | "crit" | "unknown" {
  const normalized = health.toLowerCase();
  if (normalized === "healthy" || normalized === "ready") return "ok";
  if (normalized === "degraded" || normalized === "warning") return "warn";
  if (normalized === "critical" || normalized === "failed" || normalized === "unhealthy") return "crit";
  return "unknown";
}

// 레퍼런스 목업 문법 — 상태 칩 대신 우측 점 하나. 정상은 초록 점으로 조용히,
// 이상만 주황/빨강으로 드러나며, 라벨 폭을 칩이 잡아먹지 않는다.
function ServiceHealthDot({ health }: { health: string }) {
  const severity = serviceHealthSeverity(health);
  const color = severity === "crit" ? HP.crit : severity === "warn" ? HP.warn : severity === "ok" ? HP.ok : UI.ink3;
  return (
    <span
      title={statusLabel(health)}
      aria-label={`헬스 ${statusLabel(health)}`}
      style={{ width: 8, height: 8, borderRadius: 999, background: color, flexShrink: 0, opacity: severity === "unknown" ? 0.5 : 1 }}
    />
  );
}

function PanelEmptyState({ label, hint }: { label: string; hint: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "26px 14px", textAlign: "center" }}>
      <Network size={20} style={{ color: UI.ink3 }} />
      <span style={{ fontSize: TYPE.label, fontWeight: 600, color: UI.ink2 }}>{label}</span>
      <span style={{ fontSize: TYPE.caption, color: UI.ink3, lineHeight: 1.5 }}>{hint}</span>
    </div>
  );
}

function ServiceSkeletonList() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "4px 2px" }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 9px" }}>
          <span className="op-skel" style={{ width: 14, height: 14, borderRadius: 4, flexShrink: 0 }} />
          <span style={{ flex: 1, display: "grid", gap: 5 }}>
            <span className="op-skel" style={{ width: `${72 - i * 7}%`, height: 10, borderRadius: 5 }} />
            <span className="op-skel" style={{ width: "46%", height: 8, borderRadius: 4 }} />
          </span>
        </div>
      ))}
    </div>
  );
}

function serviceStatusLabel(status: ServicePanelStatus, count: number): string {
  if (status === "ready") return `${count}개`;
  if (status === "loading") return "불러오는 중";
  return "관측 안 됨";
}

const SERVICE_QUERY_LIMIT = 1000;

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error
    && (error as { name?: unknown }).name === "AbortError";
}

function toServiceRow(resource: InventoryResource): OpsiaServiceRow {
  return {
    name: resource.name,
    ns: resource.namespace ?? undefined,
    kind: resource.kind,
    status: resource.status,
    health: resource.health,
    resource_type: resource.resource_type,
    uid: resource.uid ?? undefined,
    created: resource.created_at ?? undefined,
    cluster: resource.cluster_id,
    _key: resource.inventory_key,
  };
}

function useOpsiaServices(
  clusterId: string | null,
  namespace: string | null,
): OpsiaServicePanelView {
  const [view, setView] = useState<OpsiaServicePanelView & { key: string }>({
    status: "loading",
    rows: [],
    key: "",
  });
  const cid = clusterId?.trim() ?? "";
  const ns = namespace?.trim() ?? "";
  const key = cid ? `${cid}\u0000${ns}` : "";

  useEffect(() => {
    if (!key) return;
    const [requestedClusterId, requestedNamespace = ""] = key.split("\u0000");
    const controller = new AbortController();
    void listInventoryResourcesByType(
      requestedClusterId,
      { resourceType: SERVICE_RESOURCE_TYPE, namespace: requestedNamespace || null, limit: SERVICE_QUERY_LIMIT },
      controller.signal,
    ).then((response) => {
      if (controller.signal.aborted) return;
      const rows = response.resources
        .filter((resource) => resource.kind.toLowerCase() === SERVICE_RESOURCE_TYPE)
        .map(toServiceRow);
      setView({ status: "ready", rows, key });
    }).catch((cause: unknown) => {
      if (controller.signal.aborted || isAbortError(cause)) return;
      setView({ status: "unavailable", rows: [], key });
    });
    return () => controller.abort();
  }, [key]);

  if (!key) return { status: "ready", rows: [] };
  return view.key === key ? view : { status: "loading", rows: [] };
}

export function OpsiaServicePanel({ activeCluster, selectedNamespace }: OpsiaServicePanelProps) {
  const namespaceFilter = selectedNamespace?.trim() || null;
  const serviceView = useOpsiaServices(activeCluster, namespaceFilter);
  const scopeLabel = activeCluster
    ? [activeCluster, namespaceFilter ?? "모든 네임스페이스"].join(" · ")
    : "클러스터 선택 필요";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "2px 2px 4px" }}>
        <span style={{ fontSize: TYPE.body, fontWeight: 600, color: UI.heading }}>서비스</span>
        <span style={{ fontSize: TYPE.caption, color: UI.ink3 }}>
          {serviceStatusLabel(serviceView.status, serviceView.rows.length)}
        </span>
      </div>
      <span style={{ fontSize: TYPE.caption, color: UI.ink3, padding: "0 2px 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {scopeLabel}
      </span>
      {!activeCluster ? (
        <PanelEmptyState label="클러스터를 선택하세요" hint="서비스 목록은 클러스터 범위에서 표시됩니다." />
      ) : serviceView.status === "loading" ? (
        <ServiceSkeletonList />
      ) : serviceView.status === "unavailable" ? (
        <PanelEmptyState label="서비스를 불러오지 못했습니다" hint="인벤토리 응답을 다시 확인하세요." />
      ) : serviceView.rows.length === 0 ? (
        <PanelEmptyState
          label="관측된 서비스가 없습니다"
          hint={namespaceFilter ? `${namespaceFilter} 네임스페이스에서 관측된 Service가 없습니다.` : "선택한 클러스터에서 관측된 Service가 없습니다."}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {serviceView.rows.map((service) => {
            const name = textValue(service.name, "이름 없음");
            const namespace = textValue(service.ns, "클러스터 범위");
            const status = textValue(service.status);
            const health = textValue(service.health, "unknown");
            return (
              <div key={textValue(service._key, `${namespace}/${name}`)} className="rrow"
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", minHeight: 48, textAlign: "left", border: "1px solid transparent", background: "transparent", borderRadius: 9, padding: "7px 9px" }}>
                <Plug size={14} style={{ color: UI.ink3, flexShrink: 0 }} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span title={name} style={{ display: "block", fontSize: TYPE.label, fontWeight: 600, fontFamily: MONO, color: UI.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                  <span style={{ display: "block", fontSize: TYPE.caption, color: UI.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{namespace} · {statusLabel(status)}</span>
                </span>
                <ServiceHealthDot health={health} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

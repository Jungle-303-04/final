import type {
  ResourceFacts,
  ResourceSummary,
} from "../../features/resources/resourcesContract";
import { useI18n } from "../../shared/i18n";
import { OverflowIdentity } from "../../shared/ui/OverflowIdentity";
import { StatusMark } from "../../shared/ui/StatusMark";
import type { ResourceTableColumnKey } from "./resourceTableModel";

export function ResourceTableSmartCell({
  column,
  item,
}: {
  column: ResourceTableColumnKey;
  item: ResourceSummary;
}) {
  const { formatDate, formatNumber, t } = useI18n();
  if (column === "namespace") return item.namespace ?? "—";
  if (column === "kind") return item.kind;
  if (column === "status") return item.status || t("common.state.unknown");
  if (column === "health") {
    return <StatusMark label={item.healthStatus || undefined} tone={item.health} />;
  }
  if (column === "observed") {
    return <span className="text-muted-foreground">{formatTime(item.observedAt, formatDate, t("resources.table.unobserved"))}</span>;
  }
  const value = factCell(item.facts, column, formatNumber, formatDate);
  return value === null ? (
    <span aria-label={t("common.state.unavailable")} className="text-muted-foreground">—</span>
  ) : value;
}

function factCell(
  facts: ResourceFacts,
  column: ResourceTableColumnKey,
  formatNumber: ReturnType<typeof useI18n>["formatNumber"],
  formatDate: ReturnType<typeof useI18n>["formatDate"],
) {
  if (facts.type === "pod") return podCell(facts, column, formatNumber);
  if (facts.type === "node") return nodeCell(facts, column, formatNumber);
  if (facts.type === "workload") return workloadCell(facts, column, formatNumber);
  if (facts.type === "service") return serviceCell(facts, column, formatNumber);
  if (facts.type === "event") return eventCell(facts, column, formatNumber, formatDate);
  return null;
}

function podCell(
  facts: Extract<ResourceFacts, { type: "pod" }>,
  column: ResourceTableColumnKey,
  formatNumber: ReturnType<typeof useI18n>["formatNumber"],
) {
  if (column === "ready") return ratio(facts.readiness?.ready, facts.readiness?.total, formatNumber);
  if (column === "cpu") return metric(facts.cpuMillicores, "mCPU", formatNumber);
  if (column === "memory") return metric(facts.memoryMebibytes, "MiB", formatNumber);
  if (column === "restarts") return numberOrNull(facts.restartCount, formatNumber);
  if (column === "node") {
    return facts.nodeName
      ? <OverflowIdentity className="max-w-40" value={facts.nodeName} />
      : null;
  }
  return null;
}

function nodeCell(
  facts: Extract<ResourceFacts, { type: "node" }>,
  column: ResourceTableColumnKey,
  formatNumber: ReturnType<typeof useI18n>["formatNumber"],
) {
  if (column === "ready") return facts.ready === null ? null : facts.ready ? "Ready" : "Not Ready";
  if (column === "cpu") return percent(facts.cpuRatio, formatNumber);
  if (column === "memory") return percent(facts.memoryRatio, formatNumber);
  if (column === "capacity") return numberOrNull(facts.podCapacity, formatNumber);
  return null;
}

function workloadCell(
  facts: Extract<ResourceFacts, { type: "workload" }>,
  column: ResourceTableColumnKey,
  formatNumber: ReturnType<typeof useI18n>["formatNumber"],
) {
  if (column === "ready") return ratio(facts.readyReplicas, facts.desiredReplicas, formatNumber);
  if (column === "updated") return numberOrNull(facts.updatedReplicas, formatNumber);
  if (column === "available") return numberOrNull(facts.availableReplicas, formatNumber);
  if (column === "unavailable") return numberOrNull(facts.unavailableReplicas, formatNumber);
  return null;
}

function serviceCell(
  facts: Extract<ResourceFacts, { type: "service" }>,
  column: ResourceTableColumnKey,
  formatNumber: ReturnType<typeof useI18n>["formatNumber"],
) {
  if (column === "serviceType") return facts.serviceType;
  if (column === "selector") {
    return facts.selector.length === 0 ? null : (
      <OverflowIdentity className="max-w-56" value={pairs(facts.selector)} />
    );
  }
  if (column === "ports") {
    if (facts.ports.length === 0) return null;
    const value = facts.ports.map((port) => [port.port, port.protocol].filter(Boolean).join("/")).join(", ");
    return <OverflowIdentity className="max-w-44" value={value} />;
  }
  if (column === "external") {
    const value = facts.externalUrl ?? facts.externalHosts[0] ?? null;
    return value ? <OverflowIdentity className="max-w-56" value={value} /> : null;
  }
  if (column === "count") return formatNumber(facts.ports.length);
  return null;
}

function eventCell(
  facts: Extract<ResourceFacts, { type: "event" }>,
  column: ResourceTableColumnKey,
  formatNumber: ReturnType<typeof useI18n>["formatNumber"],
  formatDate: ReturnType<typeof useI18n>["formatDate"],
) {
  if (column === "reason") return facts.reason;
  if (column === "object") {
    const involved = facts.involvedResource;
    return involved ? (
      <OverflowIdentity className="max-w-56" value={`${involved.kind}/${involved.name}`} />
    ) : null;
  }
  if (column === "count") return numberOrNull(facts.occurrenceCount, formatNumber);
  if (column === "lastSeen") return formatTime(facts.lastSeenAt, formatDate, null);
  return null;
}

function ratio(
  value: number | null | undefined,
  total: number | null | undefined,
  formatNumber: ReturnType<typeof useI18n>["formatNumber"],
) {
  return value === null || value === undefined || total === null || total === undefined
    ? null
    : `${formatNumber(value)}/${formatNumber(total)}`;
}

function metric(
  value: number | null,
  unit: string,
  formatNumber: ReturnType<typeof useI18n>["formatNumber"],
) {
  return value === null ? null : `${formatNumber(value, { maximumFractionDigits: 1 })} ${unit}`;
}

function percent(
  ratioValue: number | null,
  formatNumber: ReturnType<typeof useI18n>["formatNumber"],
) {
  return ratioValue === null
    ? null
    : formatNumber(ratioValue, { maximumFractionDigits: 1, style: "percent" });
}

function numberOrNull(
  value: number | null,
  formatNumber: ReturnType<typeof useI18n>["formatNumber"],
) {
  return value === null ? null : formatNumber(value);
}

function pairs(values: { key: string; value: string }[]) {
  return values.map(({ key, value }) => `${key}=${value}`).join(", ");
}

function formatTime(
  value: string | null,
  formatDate: ReturnType<typeof useI18n>["formatDate"],
  unavailable: string | null,
) {
  return value
    ? formatDate(new Date(value), { dateStyle: "short", timeStyle: "short" })
    : unavailable;
}

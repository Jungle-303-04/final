import type { MessageKey } from "../../shared/i18n";
import type {
  ResourceFacts,
  ResourceSummary,
} from "../../features/resources/resourcesContract";

export type ResourceTableColumnKey =
  | "name"
  | "namespace"
  | "kind"
  | "status"
  | "health"
  | "ready"
  | "cpu"
  | "memory"
  | "restarts"
  | "node"
  | "capacity"
  | "updated"
  | "available"
  | "unavailable"
  | "serviceType"
  | "selector"
  | "ports"
  | "external"
  | "reason"
  | "object"
  | "count"
  | "lastSeen"
  | "trend"
  | "observed";

export interface ResourceTableColumn {
  key: ResourceTableColumnKey;
  labelKey: MessageKey;
  sortable: boolean;
}

const column = (
  key: ResourceTableColumnKey,
  labelKey: MessageKey,
  sortable = true,
): ResourceTableColumn => ({ key, labelKey, sortable });

const NAME = column("name", "resources.table.name");
const NAMESPACE = column("namespace", "resources.table.namespace");
const STATUS = column("status", "resources.table.status");
const HEALTH = column("health", "resources.table.health");
const TREND = column("trend", "resources.table.trend", false);
const OBSERVED = column("observed", "resources.table.observedAt");

const COLUMNS: Record<ResourceFacts["type"], ResourceTableColumn[]> = {
  pod: [
    NAME,
    NAMESPACE,
    column("ready", "resources.table.ready"),
    STATUS,
    column("cpu", "resources.table.cpu"),
    column("memory", "resources.table.memory"),
    column("restarts", "resources.table.restarts"),
    column("node", "resources.table.node"),
    TREND,
    OBSERVED,
  ],
  node: [
    NAME,
    STATUS,
    column("ready", "resources.table.ready"),
    column("cpu", "resources.table.cpu"),
    column("memory", "resources.table.memory"),
    column("capacity", "resources.table.podCapacity"),
    TREND,
    OBSERVED,
  ],
  workload: [
    NAME,
    NAMESPACE,
    column("ready", "resources.table.ready"),
    column("updated", "resources.table.updated"),
    column("available", "resources.table.available"),
    column("unavailable", "resources.table.unavailable"),
    HEALTH,
    TREND,
    OBSERVED,
  ],
  service: [
    NAME,
    NAMESPACE,
    column("serviceType", "resources.table.serviceType"),
    column("selector", "resources.table.selector"),
    column("ports", "resources.table.ports"),
    column("external", "resources.table.external"),
    HEALTH,
    TREND,
    OBSERVED,
  ],
  event: [
    NAME,
    NAMESPACE,
    STATUS,
    column("reason", "resources.table.reason"),
    column("object", "resources.table.object"),
    column("count", "resources.table.count"),
    column("lastSeen", "resources.table.lastSeen"),
    TREND,
  ],
  generic: [
    NAME,
    NAMESPACE,
    column("kind", "resources.table.kind"),
    STATUS,
    HEALTH,
    TREND,
    OBSERVED,
  ],
};

export function resourceTableColumns(items: ResourceSummary[]): ResourceTableColumn[] {
  const types = new Set(items.map((item) => item.facts.type));
  return types.size === 1
    ? COLUMNS[items[0]?.facts.type ?? "generic"]
    : COLUMNS.generic;
}

export function resourceTableSortValue(
  item: ResourceSummary,
  key: ResourceTableColumnKey,
): string | number {
  if (key === "name") return item.name;
  if (key === "namespace") return item.namespace ?? "";
  if (key === "kind") return item.kind;
  if (key === "status") return item.status;
  if (key === "health") return item.healthStatus;
  if (key === "observed") return item.observedAt ?? "";
  if (key === "trend") return "";
  return factSortValue(item.facts, key);
}

function factSortValue(
  facts: ResourceFacts,
  key: ResourceTableColumnKey,
): string | number {
  if (facts.type === "pod") return podSortValue(facts, key);
  if (facts.type === "node") return nodeSortValue(facts, key);
  if (facts.type === "workload") return workloadSortValue(facts, key);
  if (facts.type === "service") return serviceSortValue(facts, key);
  if (facts.type === "event") return eventSortValue(facts, key);
  return "";
}

function podSortValue(facts: Extract<ResourceFacts, { type: "pod" }>, key: ResourceTableColumnKey) {
  if (key === "ready") return facts.readiness?.ready ?? -1;
  if (key === "cpu") return facts.cpuMillicores ?? -1;
  if (key === "memory") return facts.memoryMebibytes ?? -1;
  if (key === "restarts") return facts.restartCount ?? -1;
  if (key === "node") return facts.nodeName ?? "";
  return "";
}

function nodeSortValue(facts: Extract<ResourceFacts, { type: "node" }>, key: ResourceTableColumnKey) {
  if (key === "ready") return facts.ready === null ? -1 : Number(facts.ready);
  if (key === "cpu") return facts.cpuRatio ?? -1;
  if (key === "memory") return facts.memoryRatio ?? -1;
  if (key === "capacity") return facts.podCapacity ?? -1;
  return "";
}

function workloadSortValue(
  facts: Extract<ResourceFacts, { type: "workload" }>,
  key: ResourceTableColumnKey,
) {
  if (key === "ready") return facts.readyReplicas ?? -1;
  if (key === "updated") return facts.updatedReplicas ?? -1;
  if (key === "available") return facts.availableReplicas ?? -1;
  if (key === "unavailable") return facts.unavailableReplicas ?? -1;
  return "";
}

function serviceSortValue(facts: Extract<ResourceFacts, { type: "service" }>, key: ResourceTableColumnKey) {
  if (key === "serviceType") return facts.serviceType ?? "";
  if (key === "selector") return facts.selector.map(({ key: name, value }) => `${name}=${value}`).join(",");
  if (key === "ports") return facts.ports.length;
  if (key === "external") return facts.externalUrl ?? facts.externalHosts[0] ?? "";
  return "";
}

function eventSortValue(facts: Extract<ResourceFacts, { type: "event" }>, key: ResourceTableColumnKey) {
  if (key === "reason") return facts.reason ?? "";
  if (key === "object") return facts.involvedResource?.name ?? "";
  if (key === "count") return facts.occurrenceCount ?? -1;
  if (key === "lastSeen") return facts.lastSeenAt ?? "";
  return "";
}

import type { WorkloadDetailRequest, WorkloadDetailTab } from "../../features/workload-detail/workloadDetailContract";

const VALID_TABS = new Set<WorkloadDetailTab>(["overview", "pods", "events", "logs"]);

export interface WorkloadDetailRouteIdentity extends WorkloadDetailRequest {
  tab: WorkloadDetailTab;
}

export function parseWorkloadDetailRoute(
  params: Readonly<Record<string, string | undefined>>,
  search: URLSearchParams,
): WorkloadDetailRouteIdentity | null {
  const kind = text(params.kind);
  const namespaceSegment = text(params.namespace);
  const name = text(params.name);
  const clusterId = text(search.get("cluster"));
  const apiGroup = search.get("apiGroup") ?? "";
  const apiVersion = text(search.get("apiVersion"));
  if (!kind || !namespaceSegment || !name || !clusterId || !apiVersion) return null;
  if (!validApiGroup(apiGroup) || !validVersion(apiVersion)) return null;
  return {
    clusterId,
    apiGroup,
    apiVersion,
    kind,
    namespace: namespaceSegment === "_" ? null : namespaceSegment,
    name,
    tab: normalizeWorkloadDetailTab(search.get("tab")),
  };
}

export function workloadDetailHref(
  identity: Omit<WorkloadDetailRouteIdentity, "tab">,
  tab: WorkloadDetailTab = "overview",
): string {
  const namespace = identity.namespace === null ? "_" : identity.namespace;
  const params = new URLSearchParams({
    cluster: identity.clusterId,
    apiGroup: identity.apiGroup,
    apiVersion: identity.apiVersion,
  });
  if (tab !== "overview") params.set("tab", tab);
  return `/workload/${encode(identity.kind)}/${encode(namespace)}/${encode(identity.name)}?${params.toString()}`;
}

export function normalizeWorkloadDetailTab(value: string | null): WorkloadDetailTab {
  return value !== null && VALID_TABS.has(value as WorkloadDetailTab)
    ? value as WorkloadDetailTab
    : "overview";
}

function text(value: string | undefined | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function validApiGroup(value: string): boolean {
  return value === value.trim() && !value.includes("/") && !/\s/.test(value);
}

function validVersion(value: string): boolean {
  return value === value.trim() && value.length > 0 && !value.includes("/") && !/\s/.test(value);
}

function encode(value: string): string {
  return encodeURIComponent(value);
}

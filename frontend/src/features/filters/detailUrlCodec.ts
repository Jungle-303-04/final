import {
  createEmptyProductDetailQuery,
  type ProductDetailQuery,
  type CostRange,
  type HomePeriod,
  type RightsizingClassFilter,
  type TimelineRange,
} from "./filterContract";
import { parseBooleanQuery } from "./filterUrlScalars";
import {
  appendBoolean,
  appendList,
  appendNullableStableText,
  appendText,
  hasQueryKey,
  isKubernetesNamespace,
  readMultiValues,
  readQueryValue,
  readStableText,
  type StrictQuery,
} from "./filterUrlSyntax";

const LEGACY_RESOURCE_KIND_QUERY_KEY = "kind";
const WORKFLOW_VIEWS = ["overview", "edit", "runs", "yaml"] as const;
const RESOURCE_SURFACE_VIEWS = ["map", "list", "flow"] as const;
const RESOURCE_TOPOLOGY_VIEWS = ["physical", "relations"] as const;
const TIMELINE_RANGES = ["15m", "1h", "6h", "24h"] as const;
const COST_RANGES = ["6h", "24h", "7d"] as const;
const HOME_PERIODS = ["today", "7d", "30d"] as const;
const SURFACE_TABS = ["applications", "repositories", "helm", "incidents", "rules"] as const;
const RIGHTSIZING_CLASSES = ["increase", "reduction", "review", "in_range", "need_data"] as const;
const TRAFFIC_SINCE = ["1m", "5m", "15m", "1h"] as const;
const TRAFFIC_PROTOCOLS = ["tcp", "udp", "http", "grpc", "dns", "unknown"] as const;
const TRAFFIC_VERDICTS = ["forwarded", "dropped", "error", "unknown"] as const;
const TRAFFIC_SORT = ["connections", "last_seen", "source", "destination"] as const;
const TRAFFIC_ORDER = ["asc", "desc"] as const;

export function appendProductDetail(pairs: string[], detail: ProductDetailQuery) {
  appendNullableStableText(pairs, "detail", detail.detail);
  appendNullableStableText(pairs, "app", detail.application ?? null);
  if (detail.application !== null && detail.application !== undefined) {
    appendNullableStableText(pairs, "instance", detail.applicationInstance ?? null);
    appendNullableStableText(pairs, "workload", detail.applicationWorkload ?? null);
  }
  if (detail.detail === null) {
    appendNullableStableText(pairs, "resource", detail.resource);
    appendNullableStableText(pairs, "resourceKind", detail.resourceKind);
  }
  appendNullableStableText(pairs, "tab", detail.tab);
  appendBoolean(pairs, "full", detail.full);
  appendNullableStableText(pairs, "node", detail.node);
  appendNullableStableText(pairs, "plan", detail.workflowPlan ?? null);
  appendNullableStableText(
    pairs,
    "view",
    detail.resourceSurfaceView ?? detail.resourceTopologyView ?? detail.workflowView ?? null,
  );
  appendNullableStableText(pairs, "mode", detail.workflowMode ?? null);
  if (detail.timeRange && detail.timeRange !== "1h") {
    appendText(pairs, "t.range", detail.timeRange);
  }
  if (detail.costRange && detail.costRange !== "24h") {
    appendText(pairs, "cost.range", detail.costRange);
  }
  if (detail.rightsizingClass) appendText(pairs, "rfClass", detail.rightsizingClass);
  appendNullableStableText(pairs, "rfKind", detail.rightsizingKind ?? null);
  appendNullableStableText(pairs, "rfNs", detail.rightsizingNamespace ?? null);
  appendNullableStableText(pairs, "rfQ", detail.rightsizingQuery ?? null);
  if (detail.timeAt !== undefined) appendText(pairs, "t.at", String(detail.timeAt));
  if (detail.graphCollapsed) appendText(pairs, "graph", "0");
  if (detail.homePeriod && detail.homePeriod !== "today") {
    appendText(pairs, "home.period", detail.homePeriod);
  }
  if (detail.surfaceTab) appendText(pairs, "section", detail.surfaceTab);
  if (detail.trafficSince && detail.trafficSince !== "5m") {
    appendText(pairs, "traffic.since", detail.trafficSince);
  }
  appendList(pairs, "traffic.protocols", detail.trafficProtocols ?? []);
  appendList(pairs, "traffic.verdicts", detail.trafficVerdicts ?? []);
  if (detail.trafficSort && detail.trafficSort !== "connections") {
    appendText(pairs, "traffic.sort", detail.trafficSort);
  }
  if (detail.trafficOrder && detail.trafficOrder !== "desc") {
    appendText(pairs, "traffic.order", detail.trafficOrder);
  }
  appendNullableStableText(pairs, "traffic.flow", detail.trafficFlow ?? null);
  if (detail.trafficCursor) appendText(pairs, "traffic.cursor", detail.trafficCursor);
}

export function parseProductDetailQuery(
  params: StrictQuery,
  invalidFull: string[],
  invalidTimeRange: string[] = [],
  invalidCostRange: string[] = [],
  invalidTimeAt: string[] = [],
  invalidGraph: string[] = [],
  invalidHomePeriod: string[] = [],
): ProductDetailQuery {
  const detail = createEmptyProductDetailQuery();
  detail.detail = readStableText(params, "detail");
  const application = readStableText(params, "app");
  if (application !== null) detail.application = application;
  if (application !== null) detail.applicationInstance = readStableText(params, "instance");
  if (application !== null) detail.applicationWorkload = readStableText(params, "workload");
  detail.resource = readStableText(params, "resource");
  detail.resourceKind = readStableText(params, "resourceKind");
  if (!hasQueryKey(params, "resourceKind") && detail.resource !== null) {
    detail.resourceKind = readStableText(params, LEGACY_RESOURCE_KIND_QUERY_KEY);
  }
  detail.tab = readStableText(params, "tab");
  detail.full = parseBooleanQuery(params, "full", invalidFull, ["1"], ["0"]);
  detail.node = readStableText(params, "node");

  const workflowPlan = readStableText(params, "plan");
  if (workflowPlan !== null) detail.workflowPlan = workflowPlan;
  const workflowView = readStableText(params, "view");
  if (isWorkflowView(workflowView)) detail.workflowView = workflowView;
  if (isResourceSurfaceView(workflowView)) detail.resourceSurfaceView = workflowView;
  if (isResourceTopologyView(workflowView)) detail.resourceTopologyView = workflowView;
  if (readStableText(params, "mode") === "new") detail.workflowMode = "new";
  const timeRange = readScalar(params, "t.range", invalidTimeRange);
  if (timeRange !== null && isTimelineRange(timeRange)) detail.timeRange = timeRange;
  else if (timeRange !== null) invalidTimeRange.push(timeRange);
  const costRange = readScalar(params, "cost.range", invalidCostRange);
  if (costRange !== null && isCostRange(costRange)) detail.costRange = costRange;
  else if (costRange !== null) invalidCostRange.push(costRange);
  const rightsizingClass = readStableText(params, "rfClass");
  if (rightsizingClass !== null && isRightsizingClass(rightsizingClass)) {
    detail.rightsizingClass = rightsizingClass;
  }
  const rightsizingKind = boundedStableText(params, "rfKind", 253);
  if (rightsizingKind !== null) detail.rightsizingKind = rightsizingKind;
  const rightsizingNamespace = readStableText(params, "rfNs");
  if (rightsizingNamespace !== null && isKubernetesNamespace(rightsizingNamespace)) {
    detail.rightsizingNamespace = rightsizingNamespace;
  }
  const rightsizingQuery = boundedStableText(params, "rfQ", 200);
  if (rightsizingQuery !== null) detail.rightsizingQuery = rightsizingQuery;
  const timeAt = readScalar(params, "t.at", invalidTimeAt);
  if (timeAt !== null && /^\d{1,16}$/.test(timeAt)) {
    const parsed = Number(timeAt);
    if (Number.isSafeInteger(parsed) && parsed > 0) detail.timeAt = parsed;
    else invalidTimeAt.push(timeAt);
  } else if (timeAt !== null) invalidTimeAt.push(timeAt);
  const graph = readScalar(params, "graph", invalidGraph);
  if (graph === "0") detail.graphCollapsed = true;
  else if (graph !== null) invalidGraph.push(graph);
  const homePeriod = readScalar(params, "home.period", invalidHomePeriod);
  if (homePeriod !== null && isHomePeriod(homePeriod)) detail.homePeriod = homePeriod;
  else if (homePeriod !== null) invalidHomePeriod.push(homePeriod);
  const surfaceTab = readStableText(params, "section");
  if (isMember(SURFACE_TABS, surfaceTab)) detail.surfaceTab = surfaceTab;
  const trafficSince = readScalar(params, "traffic.since", []);
  if (isMember(TRAFFIC_SINCE, trafficSince)) detail.trafficSince = trafficSince;
  const trafficProtocols = readEnumList(params, "traffic.protocols", TRAFFIC_PROTOCOLS);
  if (trafficProtocols.length > 0) detail.trafficProtocols = trafficProtocols;
  const trafficVerdicts = readEnumList(params, "traffic.verdicts", TRAFFIC_VERDICTS);
  if (trafficVerdicts.length > 0) detail.trafficVerdicts = trafficVerdicts;
  const trafficSort = readScalar(params, "traffic.sort", []);
  if (isMember(TRAFFIC_SORT, trafficSort)) detail.trafficSort = trafficSort;
  const trafficOrder = readScalar(params, "traffic.order", []);
  if (isMember(TRAFFIC_ORDER, trafficOrder)) detail.trafficOrder = trafficOrder;
  const trafficFlow = readStableText(params, "traffic.flow");
  if (trafficFlow !== null && /^[0-9a-f]{64}$/.test(trafficFlow)) {
    detail.trafficFlow = trafficFlow;
  }
  const trafficCursor = readQueryValue(params, "traffic.cursor");
  if (
    trafficCursor !== null && trafficCursor.length <= 8192 &&
    /^[A-Za-z0-9_.-]+$/.test(trafficCursor)
  ) {
    detail.trafficCursor = trafficCursor;
  }
  return detail;
}

function readEnumList<T extends string>(
  params: StrictQuery,
  key: string,
  allowed: readonly T[],
): readonly T[] {
  const values = readMultiValues(params, key, []);
  return [...new Set(values.filter((value): value is T => isMember(allowed, value)))].sort();
}

function isMember<T extends string>(values: readonly T[], value: string | null): value is T {
  return value !== null && values.some((candidate) => candidate === value);
}

function readScalar(params: StrictQuery, key: string, invalid: string[]): string | null {
  const [value, ...extra] = readMultiValues(params, key, invalid);
  invalid.push(...extra);
  return value ?? null;
}

function isTimelineRange(value: string): value is TimelineRange {
  return TIMELINE_RANGES.some((range) => range === value);
}

function isCostRange(value: string): value is CostRange {
  return COST_RANGES.some((range) => range === value);
}

function isHomePeriod(value: string): value is HomePeriod {
  return HOME_PERIODS.some((period) => period === value);
}

function isRightsizingClass(value: string): value is RightsizingClassFilter {
  return RIGHTSIZING_CLASSES.some((classification) => classification === value);
}

function boundedStableText(
  params: StrictQuery,
  key: string,
  maxLength: number,
): string | null {
  const value = readStableText(params, key);
  return value !== null && value.length <= maxLength ? value : null;
}

function isResourceTopologyView(
  value: string | null,
): value is NonNullable<ProductDetailQuery["resourceTopologyView"]> {
  return value !== null && RESOURCE_TOPOLOGY_VIEWS.some((view) => view === value);
}

function isResourceSurfaceView(
  value: string | null,
): value is NonNullable<ProductDetailQuery["resourceSurfaceView"]> {
  return value !== null && RESOURCE_SURFACE_VIEWS.some((view) => view === value);
}

function isWorkflowView(value: string | null): value is NonNullable<ProductDetailQuery["workflowView"]> {
  return value !== null && WORKFLOW_VIEWS.some((view) => view === value);
}

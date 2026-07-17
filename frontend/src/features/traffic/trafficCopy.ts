import type { TranslationFunction } from "../../shared/i18n";

export type TrafficCopy = ReturnType<typeof createTrafficCopy>;

const trafficCopyCache = new WeakMap<TranslationFunction, TrafficCopy>();

/** Product-owned copy. Traffic values and provider descriptors remain server evidence. */
export function trafficCopy(t: TranslationFunction) {
  const cached = trafficCopyCache.get(t);
  if (cached) return cached;
  const copy = createTrafficCopy(t);
  trafficCopyCache.set(t, copy);
  return copy;
}

function createTrafficCopy(t: TranslationFunction) {
  return {
    title: t("traffic.title"),
    description: t("traffic.description"),
    refresh: t("common.action.refresh"),
    status: t("traffic.status.title"),
    statusUnavailable: t("traffic.status.unavailable"),
    scope: t("traffic.scope.title"),
    scopeUnavailable: t("traffic.scope.unavailable"),
    cluster: t("traffic.scope.cluster"),
    namespace: t("traffic.scope.namespaces"),
    freshness: t("traffic.scope.freshness"),
    noNamespaces: t("traffic.scope.allNamespaces"),
    notObserved: t("traffic.value.notObserved"),
    summary: t("traffic.summary.title"),
    totalFlows: t("traffic.summary.totalFlows"),
    deniedFlows: t("traffic.summary.deniedFlows"),
    externalFlows: t("traffic.summary.externalFlows"),
    relationships: t("traffic.relationships.title"),
    relationshipsUnavailable: t("traffic.relationships.unavailable"),
    observedEmpty: t("traffic.relationships.empty"),
    flowTable: t("traffic.flow.table"),
    flowMap: t("traffic.flow.map"),
    flowDetail: t("traffic.flow.detail"),
    flowIdentifier: t("traffic.flow.identifier"),
    sourceIntegration: t("traffic.flow.sourceIntegration"),
    source: t("traffic.flow.source"),
    destination: t("traffic.flow.destination"),
    protocol: t("traffic.flow.protocol"),
    verdict: t("traffic.flow.verdict"),
    connections: t("traffic.flow.connections"),
    observedAt: t("traffic.flow.observedAt"),
    external: t("traffic.flow.external"),
    timeRange: t("traffic.filter.timeRange"),
    oneMinute: t("traffic.filter.range.1m"),
    fiveMinutes: t("traffic.filter.range.5m"),
    fifteenMinutes: t("traffic.filter.range.15m"),
    oneHour: t("traffic.filter.range.1h"),
    allProtocols: t("traffic.filter.allProtocols"),
    allVerdicts: t("traffic.filter.allVerdicts"),
    sort: t("traffic.filter.sort"),
    order: t("traffic.filter.order"),
    ascending: t("traffic.filter.ascending"),
    descending: t("traffic.filter.descending"),
    nextPage: t("traffic.action.nextPage"),
    refreshFailed: t("traffic.refresh.failed"),
    sources: t("traffic.sources.title"),
    sourcesDescription: t("traffic.sources.description"),
    sourcesUnavailable: t("traffic.sources.unavailable"),
    sourceObservationFailed: t("traffic.sources.refreshFailed"),
    active: t("traffic.sources.active"),
    available: t("traffic.sources.available"),
    notDetected: t("traffic.sources.notDetected"),
    sourceError: t("traffic.sources.error"),
    version: t("traffic.sources.version"),
    clusterEnvironment: t("traffic.sources.clusterEnvironment"),
    reason: t("traffic.sources.reason"),
    reasonPlaceholder: t("traffic.sources.reasonPlaceholder"),
    actionDescription: t("traffic.sources.actionDescription"),
    confirm: t("traffic.sources.confirm"),
    commandPending: t("traffic.sources.commandPending"),
    commandFailed: t("traffic.sources.commandFailed"),
    reasonsLabel: t("traffic.reasons.label"),
  } as const;
}

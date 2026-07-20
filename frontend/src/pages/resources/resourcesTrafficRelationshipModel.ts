import type {
  TrafficAvailability,
  TrafficEndpoint,
  TrafficOverview,
  TrafficRelationship,
  TrafficServiceMetric,
} from "../../features/traffic/trafficContract";

export interface TrafficServiceProjection {
  key: string;
  endpoint: TrafficEndpoint;
  connections: number | null;
  unhealthyEdges: number | null;
  metricAvailability: TrafficAvailability | null;
  ratePerSecond: number | null;
  rateUnit: "requests" | "flows" | null;
  errorRatePercent: number | null;
  metricReasonCodes: readonly string[];
}

export function projectTrafficServices(
  overview: TrafficOverview | null,
): TrafficServiceProjection[] {
  if (overview === null) return [];
  const services = new Map<string, TrafficServiceProjection>();
  if (overview.relationships.availability !== "unavailable") {
    for (const edge of overview.relationships.edges) {
      const edgeServices = new Map<string, TrafficEndpoint>();
      for (const endpoint of [edge.source, edge.target]) {
        const service = openableServiceEndpoint(endpoint);
        if (service === null) continue;
        edgeServices.set(trafficServiceKey(service), service);
      }
      for (const [key, service] of edgeServices) {
        const current = services.get(key);
        services.set(key, {
          key,
          endpoint: service,
          connections: (current?.connections ?? 0) + edge.connections,
          unhealthyEdges: (current?.unhealthyEdges ?? 0) + (isUnhealthy(edge) ? 1 : 0),
          metricAvailability: current?.metricAvailability ?? null,
          ratePerSecond: current?.ratePerSecond ?? null,
          rateUnit: current?.rateUnit ?? null,
          errorRatePercent: current?.errorRatePercent ?? null,
          metricReasonCodes: current?.metricReasonCodes ?? [],
        });
      }
    }
  }
  const metricByService = new Map<string, TrafficServiceMetric>();
  for (const metric of overview.serviceMetrics) {
    const key = trafficMetricKey(metric);
    const current = metricByService.get(key);
    if (current === undefined || metricPriority(metric) > metricPriority(current) ||
      (metricPriority(metric) === metricPriority(current) && metric.observedAt > current.observedAt)) {
      metricByService.set(key, metric);
    }
    if (!services.has(key)) {
      services.set(key, {
        key,
        endpoint: metricEndpoint(metric),
        connections: overview.relationships.availability === "unavailable" ? null : 0,
        unhealthyEdges: overview.relationships.availability === "unavailable" ? null : 0,
        metricAvailability: null,
        ratePerSecond: null,
        rateUnit: null,
        errorRatePercent: null,
        metricReasonCodes: [],
      });
    }
  }
  for (const [key, service] of services) {
    const metric = metricByService.get(key);
    if (metric === undefined) continue;
    services.set(key, {
      ...service,
      metricAvailability: metric.availability,
      ratePerSecond: metric.availability === "available" ? metric.ratePerSecond : null,
      rateUnit: metric.availability === "available" ? metric.rateUnit : null,
      errorRatePercent: metric.availability === "available" ? metric.errorRatePercent : null,
      metricReasonCodes: metric.reasonCodes,
    });
  }
  return [...services.values()].sort((left, right) =>
    Number(hasTrafficIssue(right)) - Number(hasTrafficIssue(left)) ||
    (right.ratePerSecond ?? -1) - (left.ratePerSecond ?? -1) ||
    (right.connections ?? -1) - (left.connections ?? -1) ||
    left.endpoint.name.localeCompare(right.endpoint.name));
}

export function trafficServiceKey(endpoint: TrafficEndpoint): string {
  return [endpoint.clusterId, endpoint.namespace ?? "~", endpoint.service ?? endpoint.name].join("/");
}

export function hasTrafficIssue(service: TrafficServiceProjection): boolean {
  return (service.errorRatePercent ?? 0) > 0 || (service.unhealthyEdges ?? 0) > 0;
}

function openableServiceEndpoint(endpoint: TrafficEndpoint): TrafficEndpoint | null {
  if (endpoint.namespace === null) return null;
  const service = endpoint.service ??
    (endpoint.kind.toLocaleLowerCase() === "service" ? endpoint.name : null);
  return service === null ? null : { ...endpoint, name: service, service };
}

function isUnhealthy(edge: TrafficRelationship): boolean {
  return edge.verdict === "dropped" || edge.verdict === "error";
}

function trafficMetricKey(metric: TrafficServiceMetric): string {
  return [metric.clusterId, metric.namespace ?? "~", metric.service].join("/");
}

function metricEndpoint(metric: TrafficServiceMetric): TrafficEndpoint {
  return {
    clusterId: metric.clusterId,
    name: metric.service,
    namespace: metric.namespace,
    kind: "Service",
    workload: null,
    service: metric.service,
    ip: null,
    identityStability: "provider_observed",
  };
}

function metricPriority(metric: TrafficServiceMetric): number {
  if (metric.availability === "available") return 2;
  if (metric.availability === "partial") return 1;
  return 0;
}

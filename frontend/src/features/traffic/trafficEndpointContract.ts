import type { TrafficOverviewQuery } from "../../api/traffic-overview";
import type { TrafficOverviewEndpoint } from "../../api/traffic-overview-schemas";

export interface TrafficEndpointDependencies {
  getTrafficOverview(
    query: TrafficOverviewQuery,
    signal?: AbortSignal,
  ): Promise<TrafficOverviewEndpoint>;
  getTrafficSources(
    query: { clusterIds?: readonly string[] },
    signal?: AbortSignal,
  ): Promise<import("../../api/traffic-control-schemas").TrafficSourcesEndpoint>;
  setTrafficSource(
    payload: import("../../api/traffic-control").TrafficSourceCommandPayload,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<import("../../api/traffic-control-schemas").TrafficCommandReceiptEndpoint>;
  connectTrafficSource(
    payload: import("../../api/traffic-control").TrafficSourceCommandPayload,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<import("../../api/traffic-control-schemas").TrafficCommandReceiptEndpoint>;
}

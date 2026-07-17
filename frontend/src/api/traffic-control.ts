import { apiRequest } from "./client";
import type {
  TrafficSourceCommandPayload,
  TrafficSourcesQuery,
} from "../features/traffic/trafficEndpointContract";
import {
  trafficCommandReceiptSchema,
  trafficSourcesSchema,
  type TrafficCommandReceiptEndpoint,
  type TrafficSourcesEndpoint,
} from "./traffic-control-schemas";
import { canonicalFacetSelections } from "./resource-filter-query";
import { withQuery } from "./url";

export const TRAFFIC_SOURCES_PATH = "/api/traffic/sources" as const;
export const TRAFFIC_SOURCE_PATH = "/api/traffic/source" as const;
export const TRAFFIC_CONNECT_PATH = "/api/traffic/connect" as const;

export type {
  TrafficSourceCommandPayload,
  TrafficSourcesQuery,
} from "../features/traffic/trafficEndpointContract";

export function getTrafficSources(
  query: TrafficSourcesQuery = {},
  signal?: AbortSignal,
): Promise<TrafficSourcesEndpoint> {
  const clusters = canonicalFacetSelections("clusters", query.clusterIds);
  return apiRequest(withQuery(TRAFFIC_SOURCES_PATH, [
    ["clusters", clusters.length > 0 ? clusters.join(",") : undefined],
  ]), trafficSourcesSchema, { signal });
}

export function setTrafficSource(
  payload: TrafficSourceCommandPayload,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<TrafficCommandReceiptEndpoint> {
  return trafficSourceCommand(TRAFFIC_SOURCE_PATH, payload, idempotencyKey, signal);
}

export function connectTrafficSource(
  payload: TrafficSourceCommandPayload,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<TrafficCommandReceiptEndpoint> {
  return trafficSourceCommand(TRAFFIC_CONNECT_PATH, payload, idempotencyKey, signal);
}

function trafficSourceCommand(
  path: typeof TRAFFIC_SOURCE_PATH | typeof TRAFFIC_CONNECT_PATH,
  payload: TrafficSourceCommandPayload,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<TrafficCommandReceiptEndpoint> {
  if (idempotencyKey.trim().length < 8) {
    throw new TypeError("traffic source command requires an idempotency key");
  }
  return apiRequest(path, trafficCommandReceiptSchema, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(payload),
    signal,
  });
}

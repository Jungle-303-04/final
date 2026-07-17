import { apiRequest, type ApiPath } from "./client";
import {
  prometheusIntegrationStatusSchema,
  type PrometheusIntegrationEndpoint,
} from "./prometheus-integration-schemas";
import { withQuery } from "./url";

export const PROMETHEUS_INTEGRATION_PATH: ApiPath = "/api/integrations/prometheus";

export interface PrometheusIntegrationUpdateInput {
  clusterId: string;
  prometheusUrl: string;
  headers?: Readonly<Record<string, string>>;
}

export function getPrometheusIntegration(
  clusterId: string,
  signal?: AbortSignal,
): Promise<PrometheusIntegrationEndpoint> {
  return apiRequest(
    withQuery(PROMETHEUS_INTEGRATION_PATH, [["cluster_id", required(clusterId, "clusterId")]]),
    prometheusIntegrationStatusSchema,
    { signal },
  );
}

export function updatePrometheusIntegration(
  input: PrometheusIntegrationUpdateInput,
  signal?: AbortSignal,
): Promise<PrometheusIntegrationEndpoint> {
  return apiRequest(PROMETHEUS_INTEGRATION_PATH, prometheusIntegrationStatusSchema, {
    body: JSON.stringify({
      cluster_id: required(input.clusterId, "clusterId"),
      prometheus_url: required(input.prometheusUrl, "prometheusUrl"),
      ...(input.headers === undefined ? {} : { headers: input.headers }),
    }),
    headers: { "content-type": "application/json" },
    method: "PUT",
    signal,
  });
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`Prometheus integration ${field} is required`);
  return normalized;
}

/**
 * Compatibility definitions used by the existing API contract test.
 * Product surfaces must use backend-owned metric presets once their endpoint
 * functions receive an `API 완성:` record.
 */
import type { MetricsMessageKey } from "../../shared/i18n/keys/metrics";

export type MetricUnit = "ratio" | "count" | "count-per-second";

export type MetricPresetMessageKey = MetricsMessageKey;

export type MetricPresetTranslate = (key: MetricPresetMessageKey) => string;

export interface MetricPresetDefinition {
  readonly id: string;
  readonly queryName: string;
  readonly nameKey: MetricPresetMessageKey;
  readonly descriptionKey: MetricPresetMessageKey;
  readonly promql: string;
  readonly unit: MetricUnit;
  readonly rangeSeconds: number;
  readonly stepSeconds: number;
}

export interface PrometheusQueryDefinition {
  source: "prometheus";
  name: string;
  description: string;
  query: string;
  range_seconds: number;
  step_seconds: number;
}

export const METRIC_PRESETS = [
  preset(
    "node-cpu-usage",
    "node_cpu_usage_ratio",
    "metrics.preset.nodeCpuUsage.name",
    "metrics.preset.nodeCpuUsage.description",
    '1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m]))',
    "ratio",
  ),
  preset(
    "node-memory-usage",
    "node_memory_usage_ratio",
    "metrics.preset.nodeMemoryUsage.name",
    "metrics.preset.nodeMemoryUsage.description",
    "1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)",
    "ratio",
  ),
  preset(
    "node-filesystem-usage",
    "node_filesystem_usage_ratio",
    "metrics.preset.nodeFilesystemUsage.name",
    "metrics.preset.nodeFilesystemUsage.description",
    '1 - (node_filesystem_avail_bytes{fstype!~"tmpfs|overlay",mountpoint="/var"} / node_filesystem_size_bytes{fstype!~"tmpfs|overlay",mountpoint="/var"})',
    "ratio",
  ),
  preset(
    "pod-restart-rate",
    "pod_restart_rate_by_namespace",
    "metrics.preset.podRestartRate.name",
    "metrics.preset.podRestartRate.description",
    "sum by (namespace) (rate(kube_pod_container_status_restarts_total[5m]))",
    "count-per-second",
  ),
  preset(
    "namespace-pod-count",
    "namespace_pod_count",
    "metrics.preset.namespacePodCount.name",
    "metrics.preset.namespacePodCount.description",
    "count by (namespace) (kube_pod_info)",
    "count",
  ),
  preset(
    "sandbox-deployment-replicas",
    "sandbox_deployment_replicas",
    "metrics.preset.sandboxDeploymentReplicas.name",
    "metrics.preset.sandboxDeploymentReplicas.description",
    'kube_deployment_status_replicas{namespace="sandbox"}',
    "count",
  ),
] as const satisfies readonly MetricPresetDefinition[];

export type MetricPresetId = (typeof METRIC_PRESETS)[number]["id"];

export function getMetricPreset(presetId: MetricPresetId): MetricPresetDefinition {
  const metricPreset = METRIC_PRESETS.find(({ id }) => id === presetId);
  if (!metricPreset) throw new Error(`Unknown metric preset: ${presetId}`);
  return metricPreset;
}

export function buildPrometheusQuery(
  metricPreset: MetricPresetDefinition,
  executionId: string,
  translate: MetricPresetTranslate,
): PrometheusQueryDefinition {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(executionId) || executionId.length > 64) {
    throw new Error("executionId must contain only letters, digits, dot, underscore, or hyphen");
  }

  const name = `${metricPreset.queryName}__${executionId}`;
  if (name.length > 120 || !/^[A-Za-z_][A-Za-z0-9_.-]*$/u.test(name)) {
    throw new Error("query name must be a stable identifier with at most 120 characters");
  }

  return {
    source: "prometheus",
    name,
    description: translate(metricPreset.descriptionKey),
    query: metricPreset.promql,
    range_seconds: metricPreset.rangeSeconds,
    step_seconds: metricPreset.stepSeconds,
  };
}

export function resolveMetricPresetCopy(
  metricPreset: MetricPresetDefinition,
  translate: MetricPresetTranslate,
): { name: string; description: string } {
  return {
    name: translate(metricPreset.nameKey),
    description: translate(metricPreset.descriptionKey),
  };
}

function preset(
  id: string,
  queryName: string,
  nameKey: MetricPresetMessageKey,
  descriptionKey: MetricPresetMessageKey,
  promql: string,
  unit: MetricUnit,
): MetricPresetDefinition {
  return {
    id,
    queryName,
    nameKey,
    descriptionKey,
    promql,
    unit,
    rangeSeconds: 900,
    stepSeconds: 30,
  };
}

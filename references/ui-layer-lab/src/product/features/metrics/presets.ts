/**
 * Compatibility definitions used by the existing API contract test.
 * Product surfaces must use backend-owned metric presets once their endpoint
 * functions receive an `API 완성:` record.
 */
export type MetricUnit = "ratio" | "count" | "count-per-second";

export interface MetricPreset {
  readonly id: string;
  readonly queryName: string;
  readonly label: string;
  readonly description: string;
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
  preset("node-cpu-usage", "node_cpu_usage_ratio", "노드 CPU 사용률", "노드별 5분 평균 CPU 사용 비율", '1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m]))', "ratio"),
  preset("node-memory-usage", "node_memory_usage_ratio", "노드 메모리 사용률", "노드별 사용 가능한 메모리를 제외한 사용 비율", "1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)", "ratio"),
  preset("node-filesystem-usage", "node_filesystem_usage_ratio", "노드 파일시스템 사용률", "노드별 /var 파일시스템 사용 비율", '1 - (node_filesystem_avail_bytes{fstype!~"tmpfs|overlay",mountpoint="/var"} / node_filesystem_size_bytes{fstype!~"tmpfs|overlay",mountpoint="/var"})', "ratio"),
  preset("pod-restart-rate", "pod_restart_rate_by_namespace", "팟 재시작률", "네임스페이스별 최근 5분 컨테이너 재시작률", "sum by (namespace) (rate(kube_pod_container_status_restarts_total[5m]))", "count-per-second"),
  preset("namespace-pod-count", "namespace_pod_count", "네임스페이스별 팟 수", "네임스페이스별 관측 팟 수", "count by (namespace) (kube_pod_info)", "count"),
  preset("sandbox-deployment-replicas", "sandbox_deployment_replicas", "Sandbox 디플로이 레플리카", "sandbox 네임스페이스의 디플로이 레플리카 수", 'kube_deployment_status_replicas{namespace="sandbox"}', "count"),
] as const satisfies readonly MetricPreset[];

export type MetricPresetId = (typeof METRIC_PRESETS)[number]["id"];

export function getMetricPreset(presetId: MetricPresetId): MetricPreset {
  const metricPreset = METRIC_PRESETS.find(({ id }) => id === presetId);
  if (!metricPreset) throw new Error(`Unknown metric preset: ${presetId}`);
  return metricPreset;
}

export function buildPrometheusQuery(
  metricPreset: MetricPreset,
  executionId: string,
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
    description: metricPreset.description,
    query: metricPreset.promql,
    range_seconds: metricPreset.rangeSeconds,
    step_seconds: metricPreset.stepSeconds,
  };
}

function preset(
  id: string,
  queryName: string,
  label: string,
  description: string,
  promql: string,
  unit: MetricUnit,
): MetricPreset {
  return { id, queryName, label, description, promql, unit, rangeSeconds: 900, stepSeconds: 30 };
}

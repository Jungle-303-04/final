import {
  prometheusQueryDefinitionSchema,
  prometheusQueryNameSchema,
  queryExecutionIdSchema,
  type PrometheusQueryDefinition,
} from "../../api/metrics-schemas";

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

export const METRIC_PRESETS = [
  {
    id: "node-cpu-usage",
    queryName: "node_cpu_usage_ratio",
    label: "노드 CPU 사용률",
    description: "노드별 5분 평균 CPU 사용 비율",
    promql: '1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m]))',
    unit: "ratio",
    rangeSeconds: 900,
    stepSeconds: 30,
  },
  {
    id: "node-memory-usage",
    queryName: "node_memory_usage_ratio",
    label: "노드 메모리 사용률",
    description: "노드별 사용 가능한 메모리를 제외한 사용 비율",
    promql: "1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)",
    unit: "ratio",
    rangeSeconds: 900,
    stepSeconds: 30,
  },
  {
    id: "node-filesystem-usage",
    queryName: "node_filesystem_usage_ratio",
    label: "노드 파일시스템 사용률",
    description: "노드별 /var 파일시스템 사용 비율",
    promql:
      '1 - (node_filesystem_avail_bytes{fstype!~"tmpfs|overlay",mountpoint="/var"} / node_filesystem_size_bytes{fstype!~"tmpfs|overlay",mountpoint="/var"})',
    unit: "ratio",
    rangeSeconds: 900,
    stepSeconds: 30,
  },
  {
    id: "pod-restart-rate",
    queryName: "pod_restart_rate_by_namespace",
    label: "팟 재시작률",
    description: "네임스페이스별 최근 5분 컨테이너 재시작률",
    promql: "sum by (namespace) (rate(kube_pod_container_status_restarts_total[5m]))",
    unit: "count-per-second",
    rangeSeconds: 900,
    stepSeconds: 30,
  },
  {
    id: "namespace-pod-count",
    queryName: "namespace_pod_count",
    label: "네임스페이스별 팟 수",
    description: "네임스페이스별 관측 팟 수",
    promql: "count by (namespace) (kube_pod_info)",
    unit: "count",
    rangeSeconds: 900,
    stepSeconds: 30,
  },
  {
    id: "sandbox-deployment-replicas",
    queryName: "sandbox_deployment_replicas",
    label: "Sandbox 디플로이 레플리카",
    description: "sandbox 네임스페이스의 디플로이 레플리카 수",
    promql: 'kube_deployment_status_replicas{namespace="sandbox"}',
    unit: "count",
    rangeSeconds: 900,
    stepSeconds: 30,
  },
] as const satisfies readonly MetricPreset[];

export type MetricPresetId = (typeof METRIC_PRESETS)[number]["id"];

export function getMetricPreset(presetId: MetricPresetId): MetricPreset {
  const preset = METRIC_PRESETS.find(({ id }) => id === presetId);
  if (preset === undefined) {
    throw new Error(`Unknown metric preset: ${presetId}`);
  }
  return preset;
}

export function buildPrometheusQuery(
  preset: MetricPreset,
  executionId: string,
): PrometheusQueryDefinition {
  const suffix = queryExecutionIdSchema.parse(executionId);
  const name = prometheusQueryNameSchema.parse(`${preset.queryName}__${suffix}`);

  return prometheusQueryDefinitionSchema.parse({
    source: "prometheus",
    name,
    description: preset.description,
    query: preset.promql,
    range_seconds: preset.rangeSeconds,
    step_seconds: preset.stepSeconds,
  });
}

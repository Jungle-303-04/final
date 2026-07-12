import type { PrometheusQueryDefinition } from "./index";

export const NAMESPACE_POD_QUERY = {
  source: "prometheus",
  name: "namespace_pod_count__run-20260711-001",
  description: "Running Pods by namespace",
  query: "sum(kube_pod_status_phase{phase=\"Running\"}) by (namespace)",
  range_seconds: 900,
  step_seconds: 30,
} as const satisfies PrometheusQueryDefinition;

export const NODE_CPU_QUERY = {
  source: "prometheus",
  name: "node_cpu_usage_ratio__run-observed",
  description: "Node CPU usage ratio",
  query: "1 - avg(rate(node_cpu_seconds_total{mode=\"idle\"}[5m])) by (instance)",
  range_seconds: 900,
  step_seconds: 30,
} as const satisfies PrometheusQueryDefinition;

export function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function commandPayload(
  status: "queued" | "leased" | "running" | "completed" | "failed",
  result: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    command_id: "cmd-debug-1",
    cluster_id: "cluster-1",
    correlation_id: "corr-debug-1",
    action: "telemetry.query.run",
    status,
    result,
    completed_at: status === "completed" || status === "failed" ? "2026-07-11T00:00:00Z" : null,
  };
}

export function telemetryResult(
  query: PrometheusQueryDefinition,
  values: Array<{ timestamp: number; value: number }>,
): Record<string, unknown> {
  return {
    status: "completed",
    cluster_id: "cluster-1",
    applied: false,
    message: "telemetry query executed",
    retryable: false,
    resources: [],
    stdout: "",
    stderr: "",
    query: {
      source: "prometheus",
      name: query.name,
      description: query.description,
      query: query.query,
      range_seconds: query.range_seconds,
      step_seconds: query.step_seconds,
    },
    result: {
      source: "prometheus",
      results: {
        [query.name]: {
          query: query.query,
          query_mode: "range",
          range_seconds: query.range_seconds,
          step_seconds: query.step_seconds,
          result_type: "matrix",
          series: values.length === 0 ? [] : [{ metric: { instance: "node-1" }, values }],
          point_count: values.length,
        },
      },
    },
  };
}

import { describe, expect, it, vi } from "vitest";

import {
  buildPrometheusQuery,
  METRIC_PRESETS,
  resolveMetricPresetCopy,
  type MetricPresetMessageKey,
} from "./presets";

const expectedData = [
  [
    "node-cpu-usage",
    '1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m]))',
    "ratio",
  ],
  [
    "node-memory-usage",
    "1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)",
    "ratio",
  ],
  [
    "node-filesystem-usage",
    '1 - (node_filesystem_avail_bytes{fstype!~"tmpfs|overlay",mountpoint="/var"} / node_filesystem_size_bytes{fstype!~"tmpfs|overlay",mountpoint="/var"})',
    "ratio",
  ],
  [
    "pod-restart-rate",
    "sum by (namespace) (rate(kube_pod_container_status_restarts_total[5m]))",
    "count-per-second",
  ],
  ["namespace-pod-count", "count by (namespace) (kube_pod_info)", "count"],
  [
    "sandbox-deployment-replicas",
    'kube_deployment_status_replicas{namespace="sandbox"}',
    "count",
  ],
] as const;

describe("metrics preset copy boundary", () => {
  it("keeps stable ids, PromQL, and units while storing only message keys", () => {
    expect(METRIC_PRESETS.map(({ id, promql, unit }) => [id, promql, unit]))
      .toEqual(expectedData);
    expect(METRIC_PRESETS.every((preset) => (
      preset.nameKey.startsWith("metrics.preset.") &&
      preset.descriptionKey.startsWith("metrics.preset.") &&
      !("name" in preset) &&
      !("description" in preset)
    ))).toBe(true);
  });

  it("resolves display copy through the caller-owned i18n function", () => {
    const translate = vi.fn((key: MetricPresetMessageKey) => `translated:${key}`);
    const resolved = resolveMetricPresetCopy(METRIC_PRESETS[0], translate);

    expect(resolved).toEqual({
      name: "translated:metrics.preset.nodeCpuUsage.name",
      description: "translated:metrics.preset.nodeCpuUsage.description",
    });
    expect(translate).toHaveBeenCalledTimes(2);
  });

  it("uses translated description in the submitted query without changing PromQL", () => {
    const preset = METRIC_PRESETS[0];
    const query = buildPrometheusQuery(
      preset,
      "run-1",
      (key) => key === preset.descriptionKey ? "Five-minute Node CPU average" : key,
    );

    expect(query.description).toBe("Five-minute Node CPU average");
    expect(query.query).toBe(expectedData[0][1]);
    expect(query.name).toBe("node_cpu_usage_ratio__run-1");
  });
});

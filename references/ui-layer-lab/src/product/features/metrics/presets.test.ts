import { describe, expect, it } from "vitest";

import {
  METRIC_PRESETS,
  buildPrometheusQuery,
  getMetricPreset,
} from "./presets";

describe("metric presets", () => {
  it("keeps the six canonical, executable PromQL presets", () => {
    expect(METRIC_PRESETS).toHaveLength(6);
    expect(METRIC_PRESETS.map(({ id }) => id)).toEqual([
      "node-cpu-usage",
      "node-memory-usage",
      "node-filesystem-usage",
      "pod-restart-rate",
      "namespace-pod-count",
      "sandbox-deployment-replicas",
    ]);
    expect(METRIC_PRESETS.map(({ promql }) => promql)).toEqual([
      '1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m]))',
      "1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)",
      '1 - (node_filesystem_avail_bytes{fstype!~"tmpfs|overlay",mountpoint="/var"} / node_filesystem_size_bytes{fstype!~"tmpfs|overlay",mountpoint="/var"})',
      "sum by (namespace) (rate(kube_pod_container_status_restarts_total[5m]))",
      "count by (namespace) (kube_pod_info)",
      'kube_deployment_status_replicas{namespace="sandbox"}',
    ]);
  });

  it("uses the complete filesystem matcher on both sides of the ratio", () => {
    const filesystem = getMetricPreset("node-filesystem-usage");
    const matcher = '{fstype!~"tmpfs|overlay",mountpoint="/var"}';

    expect(filesystem.promql.split(matcher)).toHaveLength(3);
    expect(filesystem.promql).toContain(`node_filesystem_avail_bytes${matcher}`);
    expect(filesystem.promql).toContain(`node_filesystem_size_bytes${matcher}`);
  });

  it("suffixes every legitimate execution id without changing the PromQL", () => {
    const preset = getMetricPreset("node-cpu-usage");
    const seenNames = new Set<string>();
    let seed = 0x5eed1234;

    for (let index = 0; index < 256; index += 1) {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
      const executionId = `run-${index}-${seed.toString(16).padStart(8, "0")}`;
      const query = buildPrometheusQuery(preset, executionId);

      expect(query.name).toBe(`${preset.queryName}__${executionId}`);
      expect(query.query).toBe(preset.promql);
      expect(query.source).toBe("prometheus");
      expect(seenNames.has(query.name)).toBe(false);
      seenNames.add(query.name);
    }
  });

  it("rejects an execution id that cannot be used as a stable query suffix", () => {
    const preset = getMetricPreset("node-cpu-usage");

    expect(() => buildPrometheusQuery(preset, "contains spaces")).toThrow(
      "executionId",
    );
  });
});

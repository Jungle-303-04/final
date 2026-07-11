import {
  runPrometheusQuery,
  type PollCommandOptions,
  type PrometheusQueryRun,
} from "../../api/metrics";
import { buildPrometheusQuery, type MetricPreset } from "./presets";

export interface MetricPresetRun extends PrometheusQueryRun {
  preset: MetricPreset;
  executionId: string;
}

export async function runMetricPreset(
  clusterId: string,
  preset: MetricPreset,
  executionId: string,
  options: PollCommandOptions = {},
): Promise<MetricPresetRun> {
  const query = buildPrometheusQuery(preset, executionId);
  const run = await runPrometheusQuery(clusterId, query, options);
  return { ...run, preset, executionId };
}

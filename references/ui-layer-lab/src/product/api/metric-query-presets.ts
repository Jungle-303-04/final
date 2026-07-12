import { apiRequest, type ApiPath } from "./client";
import {
  metricQueryPresetListSchema,
  type MetricQueryPresetList,
} from "./metric-query-presets-schemas";
import { encodePathSegment } from "./url";

/** Loads the saved PromQL queries scoped to one cluster. */
export function listMetricQueryPresets(
  clusterId: string,
  signal?: AbortSignal,
): Promise<MetricQueryPresetList> {
  const path =
    `/api/clusters/${encodePathSegment(clusterId)}/metric-query-presets` as ApiPath;
  return apiRequest(path, metricQueryPresetListSchema, { signal });
}

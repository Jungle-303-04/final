export interface HelmChartCatalogUrlState {
  query: string;
  sourceId: string | null;
  provider: "repository" | "oci" | null;
  allVersions: boolean;
  selectedChart: string | null;
  selectedVersion: string | null;
}

const QUERY_KEY = "helmChartQuery";
const SOURCE_KEY = "helmChartSource";
const PROVIDER_KEY = "helmChartProvider";
const ALL_VERSIONS_KEY = "helmChartAllVersions";
const CHART_KEY = "helmChart";
const VERSION_KEY = "helmChartVersion";
const SOURCE_PATTERN = /^[a-z0-9-]{1,80}$/;
const CHART_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,510}[A-Za-z0-9])?$/;

export function parseHelmChartCatalogUrlState(
  params: URLSearchParams,
): HelmChartCatalogUrlState {
  const queryValue = params.get(QUERY_KEY) ?? "";
  const query = queryValue.length <= 200 ? queryValue : "";
  const sourceValue = params.get(SOURCE_KEY);
  const sourceId = sourceValue !== null && SOURCE_PATTERN.test(sourceValue) ? sourceValue : null;
  const providerValue = params.get(PROVIDER_KEY);
  const provider = providerValue === "repository" || providerValue === "oci"
    ? providerValue
    : null;
  const chartValue = params.get(CHART_KEY);
  const selectedChart = sourceId !== null
    && chartValue !== null
    && CHART_PATTERN.test(chartValue)
      ? chartValue
      : null;
  const versionValue = params.get(VERSION_KEY);
  const selectedVersion = selectedChart !== null
    && versionValue !== null
    && versionValue.length >= 1
    && versionValue.length <= 256
      ? versionValue
      : null;
  return {
    query,
    sourceId,
    provider,
    allVersions: params.get(ALL_VERSIONS_KEY) === "1",
    selectedChart,
    selectedVersion,
  };
}

export function writeHelmChartCatalogSearchParams(
  current: URLSearchParams,
  state: HelmChartCatalogUrlState,
): URLSearchParams {
  const next = new URLSearchParams(current);
  write(next, QUERY_KEY, state.query || null);
  write(next, SOURCE_KEY, state.sourceId);
  write(next, PROVIDER_KEY, state.provider);
  if (state.allVersions) next.set(ALL_VERSIONS_KEY, "1");
  else next.delete(ALL_VERSIONS_KEY);
  write(next, CHART_KEY, state.sourceId === null ? null : state.selectedChart);
  write(
    next,
    VERSION_KEY,
    state.sourceId === null || state.selectedChart === null ? null : state.selectedVersion,
  );
  return next;
}

function write(params: URLSearchParams, key: string, value: string | null): void {
  if (value === null) params.delete(key);
  else params.set(key, value);
}

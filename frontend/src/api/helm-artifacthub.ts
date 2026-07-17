import { apiRequest, type ApiPath } from "./client";
import {
  artifactHubChartDetailSchema,
  artifactHubSearchPageSchema,
  type ArtifactHubChartDetailEndpoint,
  type ArtifactHubSearchPageEndpoint,
} from "./helm-artifacthub-schemas";
import { encodePathSegment, withQuery } from "./url";

export const HELM_ARTIFACTHUB_SEARCH_PATH = "/api/helm/artifacthub/search" as const;
export const HELM_ARTIFACTHUB_CHART_PATH =
  "/api/helm/artifacthub/charts/{repository}/{chart}/{version}" as const;

export interface ArtifactHubSearchQuery {
  query: string;
  offset?: number;
  limit?: number;
  sort?: "relevance" | "stars" | "last_updated";
  official?: boolean;
  verified?: boolean;
}

export function searchArtifactHubCharts(
  query: ArtifactHubSearchQuery,
  signal?: AbortSignal,
): Promise<ArtifactHubSearchPageEndpoint> {
  const text = requiredText(query.query, "query", 200);
  const offset = boundedInteger(query.offset ?? 0, "offset", 0, 100_000);
  const limit = boundedInteger(query.limit ?? 20, "limit", 1, 60);
  return apiRequest(withQuery(HELM_ARTIFACTHUB_SEARCH_PATH, [
    ["q", text],
    ["offset", String(offset)],
    ["limit", String(limit)],
    ["sort", query.sort ?? "relevance"],
    ["official", String(query.official ?? false)],
    ["verified", String(query.verified ?? false)],
  ]), artifactHubSearchPageSchema, { signal });
}

export function getArtifactHubChart(
  input: { repository: string; chart: string; version?: string },
  signal?: AbortSignal,
): Promise<ArtifactHubChartDetailEndpoint> {
  const repository = encodePathSegment(requiredText(input.repository, "repository", 253));
  const chart = encodePathSegment(requiredText(input.chart, "chart", 253));
  const version = input.version === undefined
    ? ""
    : `/${encodePathSegment(requiredText(input.version, "version", 256))}`;
  const path = `/api/helm/artifacthub/charts/${repository}/${chart}${version}` as ApiPath;
  return apiRequest(path, artifactHubChartDetailSchema, { signal });
}

function requiredText(value: string, name: string, max: number): string {
  const normalized = value.trim();
  if (normalized === "" || normalized.length > max) throw new TypeError(`${name} is invalid`);
  return normalized;
}

function boundedInteger(value: number, name: string, min: number, max: number): number {
  if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(`${name} is invalid`);
  return value;
}

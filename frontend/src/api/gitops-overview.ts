import { apiRequest, type ApiPath } from "./client";
import {
  gitOpsOverviewSchema,
  type GitOpsOverviewEndpoint,
} from "./gitops-overview-schemas";

export const GITOPS_OVERVIEW_PATH = "/api/gitops/overview" as const;

export interface GitOpsOverviewQuery {
  clusters?: readonly string[];
  namespaces?: readonly string[];
  applications?: readonly string[];
  providers?: readonly ("argo" | "flux" | "internal")[];
  kinds?: readonly string[];
  labels?: Readonly<Record<string, string>>;
  q?: string;
  limit?: number;
}

export function listGitOpsOverview(
  query: GitOpsOverviewQuery = {},
  signal?: AbortSignal,
): Promise<GitOpsOverviewEndpoint> {
  const search = new URLSearchParams();
  appendList(search, "clusters", query.clusters);
  appendList(search, "namespaces", query.namespaces);
  appendList(search, "applications", query.applications);
  appendList(search, "providers", query.providers);
  appendList(search, "kinds", query.kinds);
  if (query.labels) {
    appendList(
      search,
      "labels",
      Object.entries(query.labels)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}=${value}`),
    );
  }
  if (query.q?.trim()) search.set("q", query.q.trim());
  if (query.limit !== undefined) search.set("limit", String(query.limit));
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return apiRequest(`${GITOPS_OVERVIEW_PATH}${suffix}` as ApiPath, gitOpsOverviewSchema, { signal });
}

function appendList(
  search: URLSearchParams,
  key: string,
  values: readonly string[] | undefined,
): void {
  const normalized = [...new Set(values?.map((value) => value.trim()).filter(Boolean) ?? [])].sort();
  if (normalized.length > 0) search.set(key, normalized.join(","));
}

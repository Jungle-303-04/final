import { apiRequest, type ApiPath } from "./client";
import { rcaIssueListSchema, type RcaIssueList } from "./schemas";
import { optionalQueryString, withQuery } from "./url";

export const RCA_ISSUES_DEFAULT_LIMIT = 50;
export const RCA_ISSUES_MAX_LIMIT = 100;

export interface ListRcaIssuesOptions {
  clusterId?: string;
  namespaces?: readonly string[];
  severities?: readonly ("critical" | "warning")[];
  categories?: readonly string[];
  limit?: number;
  signal?: AbortSignal;
}

/**
 * Read the versioned additive Issue queue representation. The default
 * representation remains legacy-compatible during a rolling deployment.
 */
export async function listRcaIssues(
  options: ListRcaIssuesOptions = {},
): Promise<RcaIssueList> {
  const limit = options.limit ?? RCA_ISSUES_DEFAULT_LIMIT;
  assertRcaIssuesLimit(limit);
  const namespaces = issueFilterValues(options.namespaces, "namespace");
  const severities = issueFilterValues(options.severities, "severity");
  const categories = issueFilterValues(options.categories, "category");
  const path = withQuery("/api/dashboard/rca/issues" as ApiPath, [
    ["cluster_id", optionalQueryString(options.clusterId)],
    ["namespaces", optionalQueryString(namespaces.join(","))],
    ["severity", optionalQueryString(severities.join(","))],
    ["category", optionalQueryString(categories.join(","))],
    ["contract_version", "2"],
    ["limit", limit],
  ]);
  return apiRequest(path, rcaIssueListSchema, { signal: options.signal });
}

function issueFilterValues(values: readonly string[] | undefined, field: string): string[] {
  if (values === undefined) return [];
  if (values.length > 100) throw new RangeError(`RCA issues ${field} filter has too many values`);
  const normalized = [...new Set(values.map((value) => value.trim().toLowerCase()))].sort();
  if (normalized.some((value) => value.length === 0 || value.length > 253 || value.includes(","))) {
    throw new RangeError(`RCA issues ${field} filter is invalid`);
  }
  return normalized;
}

function assertRcaIssuesLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > RCA_ISSUES_MAX_LIMIT) {
    throw new RangeError(
      `RCA issues limit must be an integer from 1 to ${RCA_ISSUES_MAX_LIMIT}`,
    );
  }
}

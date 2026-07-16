import type { GitOpsSyncTarget } from "./gitOpsContract";

export type GitOpsSyncCategory =
  | "synced"
  | "out-of-sync"
  | "checking"
  | "failed"
  | "unknown";

export function gitOpsSyncCategory(value: string | null): GitOpsSyncCategory {
  const normalized = value?.trim().toLowerCase().replace(/[\s-]+/g, "_") ?? "";
  if (normalized === "synced" || normalized === "synchronized" ||
      normalized === "success" || normalized === "succeeded") {
    return "synced";
  }
  if (normalized === "out_of_sync" || normalized === "outofsync" ||
      normalized === "drifted" || normalized === "diverged") {
    return "out-of-sync";
  }
  if (normalized === "pending" || normalized === "running" ||
      normalized === "polling" || normalized === "progressing") {
    return "checking";
  }
  if (normalized === "failed" || normalized === "error" || normalized === "degraded") {
    return "failed";
  }
  return "unknown";
}

export function filterGitOpsSyncTargets(
  rows: readonly GitOpsSyncTarget[],
  query: string,
): GitOpsSyncTarget[] {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery === "") return [...rows];
  return rows.filter((row) => searchableTargetText(row).includes(normalizedQuery));
}

function searchableTargetText(row: GitOpsSyncTarget): string {
  return normalizeSearchText([
    row.applicationName,
    row.applicationId,
    row.clusterId,
    row.namespace,
    row.environment,
    row.syncStatus,
    row.revision,
  ].filter((value): value is string => value !== null).join(" "));
}

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[\s_-]+/g, " ");
}

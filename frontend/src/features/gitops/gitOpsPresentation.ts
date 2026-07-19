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

import type { StatusTone } from "../../shared/ui/StatusMark";

export function applicationStatusTone(status: string | null): StatusTone {
  if (status === null) return "unknown";
  const normalized = status.toLowerCase();
  if (["active", "healthy", "ready", "succeeded", "completed", "in_sync"].includes(normalized)) {
    return "healthy";
  }
  if (["failed", "error", "blocked", "degraded", "unhealthy", "critical", "drifted"].includes(normalized)) {
    return "critical";
  }
  if (["pending", "running", "progressing", "warning"].includes(normalized)) return "warning";
  return "unknown";
}

export function shortSha(value: string | null): string | null {
  return value === null ? null : value.slice(0, 7);
}

export function formatObservedTime(value: string | null, locale: string): string | null {
  if (value === null) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
}

export function formatDriftValue(value: string | number | boolean | null): string {
  if (value === null) return "—";
  if (typeof value === "string") return value;
  return String(value);
}

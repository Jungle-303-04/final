import { workflowRunState } from "../../features/gitops/workflowModel";

export function workflowStatusKey(status: string) {
  const state = workflowRunState(status);
  if (state === "succeeded") return "workflows.status.succeeded" as const;
  if (state === "failed") return "workflows.status.failed" as const;
  if (state === "rollback_requested") return "workflows.status.rollbackRequested" as const;
  if (state === "cancelled") return "workflows.status.cancelled" as const;
  if (state === "waiting_for_approval") return "workflows.status.waitingApproval" as const;
  if (state === "paused") return "workflows.status.paused" as const;
  if (state === "running") return "workflows.status.running" as const;
  return "workflows.status.pending" as const;
}

export function workflowNotificationTone(
  status: string,
): "critical" | "healthy" | "info" | "warning" {
  const state = workflowRunState(status);
  if (state === "succeeded") return "healthy";
  if (state === "failed" || state === "rollback_requested") return "critical";
  if (["cancelled", "paused", "waiting_for_approval"].includes(state)) return "warning";
  return "info";
}

export function validRunTimestamp(value: string | undefined): string | null {
  return value && Number.isFinite(Date.parse(value)) ? value : null;
}

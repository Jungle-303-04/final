import type { MessageKey } from "../../shared/i18n";
import type { StatusTone } from "../../shared/ui/StatusMark";
import type { OperationStatus, OperationStatusSnapshot } from "./OperationStatusStore";

export interface OperationStatusSummary {
  attention: number;
  total: number;
}

/**
 * Keeps compact operation indicators derived from the same status model that
 * drives cards and retry controls. Consumers do not maintain their own
 * action/status lists.
 */
export function summarizeOperationStatuses(
  snapshots: readonly OperationStatusSnapshot[],
): OperationStatusSummary {
  return {
    attention: snapshots.filter((snapshot) => snapshot.status !== "completed").length,
    total: snapshots.length,
  };
}

export const operationStatusKeys: Record<OperationStatus, MessageKey> = {
  idle: "resources.detail.action.observation.idle",
  connecting: "resources.detail.action.observation.connecting",
  running: "resources.detail.action.observation.running",
  reconnecting: "resources.detail.action.observation.reconnecting",
  completed: "resources.detail.action.observation.completed",
  failed: "resources.detail.action.observation.failed",
  forbidden: "resources.detail.action.observation.forbidden",
  invalid: "resources.detail.action.observation.invalid",
  unavailable: "resources.detail.action.observation.unavailable",
};

export function canReobserveOperation(status: OperationStatus): boolean {
  return status === "forbidden" || status === "invalid" || status === "unavailable";
}

export function operationStatusTone(status: OperationStatus): StatusTone {
  switch (status) {
    case "completed":
      return "healthy";
    case "connecting":
    case "reconnecting":
    case "idle":
      return "unknown";
    case "running":
    case "invalid":
      return "warning";
    case "unavailable":
      return "stale";
    case "failed":
    case "forbidden":
      return "critical";
  }
}

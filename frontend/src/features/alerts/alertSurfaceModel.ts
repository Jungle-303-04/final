import type { ProductNotification } from "../notifications/ProductNotificationsProvider";
import type { OperationStatusSnapshot } from "../operations/OperationStatusStore";
import type { AlertEvent } from "./alertEventsContract";
import { buildNotificationLedger } from "./notificationLedger";

export type AlertSurfaceCategory = "configuration" | "deployment" | "issue";
export type AlertSurfaceTone = "critical" | "healthy" | "warning";

export interface AlertSurfaceProgressItem {
  completed: number | null;
  description: string | null;
  href: string;
  id: string;
  progress: number | null;
  title: string;
  total: number | null;
}

export interface AlertSurfaceRow {
  category: AlertSurfaceCategory;
  href: string;
  id: string;
  occurredAt: string;
  title: string;
  tone: AlertSurfaceTone;
}

export interface AlertSurfaceData {
  criticalCount: number;
  inProgress: readonly AlertSurfaceProgressItem[];
  rows: readonly AlertSurfaceRow[];
}

export function buildAlertSurfaceData(
  alerts: readonly AlertEvent[],
  operations: readonly OperationStatusSnapshot[],
  localNotifications: readonly ProductNotification[],
): AlertSurfaceData {
  const ledger = buildNotificationLedger(alerts, operations, localNotifications);
  const rows = ledger.recent.map(({ category, href, id, occurredAt, title, tone }) => ({
    category,
    href,
    id,
    occurredAt,
    title,
    tone: tone === "info" ? "healthy" as const : tone,
  }));
  return {
    criticalCount: rows.filter(({ tone }) => tone === "critical").length,
    inProgress: ledger.active.map(({ completed, description, href, id, progress, title, total }) => ({
      completed, description, href, id, progress, title, total,
    })),
    rows,
  };
}

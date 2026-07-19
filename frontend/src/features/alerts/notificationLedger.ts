import type { ProductNotification } from "../notifications/ProductNotificationsProvider";
import type { OperationStatusSnapshot } from "../operations/OperationStatusStore";
import { alertEventResourceHref } from "../filters/alertEventResourceHref";
import type { AlertEvent } from "./alertEventsContract";

export type NotificationLedgerCategory = "configuration" | "deployment" | "issue";
export type NotificationLedgerTone = "critical" | "healthy" | "info" | "warning";

export interface NotificationLedgerItem {
  category: NotificationLedgerCategory;
  completed: number | null;
  description: string | null;
  href: string;
  id: string;
  occurredAt: string;
  progress: number | null;
  source: "alert" | "local" | "operation";
  title: string;
  tone: NotificationLedgerTone;
  total: number | null;
}

export interface NotificationLedger {
  active: readonly NotificationLedgerItem[];
  recent: readonly NotificationLedgerItem[];
}

/** Canonical browser projection used by both the /alerts surface and the header bell. */
export function buildNotificationLedger(
  alerts: readonly AlertEvent[],
  operations: readonly OperationStatusSnapshot[],
  localNotifications: readonly ProductNotification[],
): NotificationLedger {
  return {
    active: canonicalize(operations.filter(({ status }) => !isTerminal(status)).map(toOperationItem)),
    recent: canonicalize([
      ...alerts.map(toAlertItem),
      ...operations.filter(({ status }) => isTerminal(status)).map(toOperationItem),
      ...localNotifications.map(toLocalItem),
    ]),
  };
}

function toAlertItem(event: AlertEvent): NotificationLedgerItem {
  const title = alertTitle(event);
  return {
    category: "issue",
    completed: null,
    description: [event.subject.cluster, event.subject.namespace, event.subject.name]
      .filter(Boolean).join(" · "),
    href: alertEventResourceHref(event.subject),
    id: `alert:${event.event_id}`,
    occurredAt: event.resolved_at ?? event.fired_at,
    progress: null,
    source: "alert",
    title,
    tone: alertTone(event),
    total: null,
  };
}

function toOperationItem(operation: OperationStatusSnapshot): NotificationLedgerItem {
  const payload = operation.event?.payload;
  const href = operationHref(operation);
  const completed = payloadNumber(payload, ["completed", "current"]);
  const total = payloadNumber(payload, ["total"]);
  const directProgress = payloadNumber(payload, ["progress", "percent", "percentage"]);
  return {
    category: operationCategory(href, payload),
    completed,
    description: payloadText(payload, ["message", "description", "status"]),
    href,
    id: `operation:${operation.commandId}`,
    occurredAt: operation.event?.occurredAt ?? new Date(operation.updatedAt).toISOString(),
    progress: boundedProgress(directProgress, completed, total),
    source: "operation",
    title: payloadText(payload, ["title", "operation", "action", "phase"])
      ?? operation.commandId,
    tone: operationTone(operation.status),
    total,
  };
}

function toLocalItem(notification: ProductNotification): NotificationLedgerItem {
  return {
    category: hrefCategory(notification.href),
    completed: null,
    description: notification.description,
    href: notification.href,
    id: canonicalLocalId(notification.id),
    occurredAt: notification.occurredAt,
    progress: null,
    source: "local",
    title: notification.title,
    tone: notification.tone,
    total: null,
  };
}

function operationHref(operation: OperationStatusSnapshot): string {
  const payload = operation.event?.payload;
  const direct = payloadText(payload, ["href"]);
  if (direct?.startsWith("/")) return direct;
  const workflowRunId = payloadText(payload, ["workflow_run_id", "workflowRunId"]);
  if (workflowRunId) return workflowRunHref(workflowRunId);
  const domain = payloadText(payload, ["category", "domain", "kind", "type"]);
  const runId = payloadText(payload, ["run_id", "runId"]);
  if (runId && domain && /workflow|release|deploy/iu.test(domain)) return workflowRunHref(runId);
  const subject = payload?.subject;
  if (isAlertSubject(subject)) return alertEventResourceHref(subject);
  return `/timeline?detail=${encodeURIComponent(operation.commandId)}`;
}

function workflowRunHref(runId: string): string {
  return `/deploy?section=workflows&view=runs&detail=${encodeURIComponent(runId)}`;
}

function operationCategory(
  href: string,
  payload: Readonly<Record<string, unknown>> | undefined,
): NotificationLedgerCategory {
  const domain = payloadText(payload, ["category", "domain", "kind", "type"]);
  if (domain && /deploy|gitops|helm|release|rollout|sync|workflow/iu.test(domain)) return "deployment";
  if (domain && /config|setting|scale|policy|channel/iu.test(domain)) return "configuration";
  return hrefCategory(href);
}

function hrefCategory(href: string): NotificationLedgerCategory {
  if (/^\/(?:deploy|applications|gitops|helm|workflows)(?:[/?#]|$)/u.test(href)) return "deployment";
  if (/^\/(?:settings|checks)(?:[/?#]|$)/u.test(href)) return "configuration";
  return "issue";
}

function canonicalize(items: readonly NotificationLedgerItem[]): NotificationLedgerItem[] {
  const byId = new Map<string, NotificationLedgerItem>();
  for (const item of items) {
    if (!Number.isFinite(Date.parse(item.occurredAt))) continue;
    const current = byId.get(item.id);
    if (!current || timestamp(item.occurredAt) > timestamp(current.occurredAt)) byId.set(item.id, item);
  }
  return [...byId.values()].sort((left, right) => timestamp(right.occurredAt) - timestamp(left.occurredAt));
}

function canonicalLocalId(id: string): string {
  return /^(?:alert|local|operation):/u.test(id) ? id : `local:${id}`;
}

function alertTitle(event: AlertEvent): string {
  const ruleName = event.rule_name?.trim();
  if (!ruleName) return event.subject.name;
  if (ruleName.toLocaleLowerCase().includes(event.subject.name.toLocaleLowerCase())) return ruleName;
  return `${event.subject.name} · ${ruleName}`;
}

function alertTone(event: AlertEvent): NotificationLedgerTone {
  if (event.severity === "critical" || event.severity === "high") return "critical";
  if (event.severity === "warning" || event.severity === "medium" || event.status === "firing") return "warning";
  return "info";
}

function operationTone(status: OperationStatusSnapshot["status"]): NotificationLedgerTone {
  if (["failed", "forbidden", "invalid", "unavailable"].includes(status)) return "critical";
  if (status === "cancelled") return "warning";
  if (["idle", "connecting", "running", "reconnecting"].includes(status)) return "info";
  return "healthy";
}

function boundedProgress(direct: number | null, completed: number | null, total: number | null): number | null {
  const value = direct ?? (completed !== null && total !== null && total > 0 ? completed / total * 100 : null);
  return value === null ? null : Math.min(100, Math.max(0, value));
}

function payloadText(payload: Readonly<Record<string, unknown>> | undefined, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = payload?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function payloadNumber(payload: Readonly<Record<string, unknown>> | undefined, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = payload?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function isTerminal(status: OperationStatusSnapshot["status"]): boolean {
  return ["completed", "failed", "cancelled", "forbidden", "invalid", "unavailable"].includes(status);
}

function isAlertSubject(value: unknown): value is { cluster: string; kind: string; name: string; namespace: string | null } {
  if (typeof value !== "object" || value === null) return false;
  const subject = value as Record<string, unknown>;
  return typeof subject.cluster === "string" && typeof subject.kind === "string" &&
    typeof subject.name === "string" && (subject.namespace === null || typeof subject.namespace === "string");
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

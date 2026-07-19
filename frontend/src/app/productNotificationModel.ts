import type { AlertEvent } from "../features/alerts/alertEventsContract";
import { alertEventResourceHref } from "../features/filters/alertEventResourceHref";
import type {
  OperationStatusSnapshot,
} from "../features/operations/OperationStatusStore";
import type { ProductNotification } from "../features/notifications/ProductNotificationsProvider";
import type { TranslationFunction } from "../shared/i18n";

export interface ProductNotificationItem {
  description: string;
  href: string;
  id: string;
  occurredAt: string;
  progress: number | null;
  title: string;
  tone: ProductNotification["tone"];
}

export interface ProductNotificationGroups {
  earlier: readonly ProductNotificationItem[];
  inProgress: readonly ProductNotificationItem[];
  today: readonly ProductNotificationItem[];
}

export interface ProductNotificationPreferences {
  dismissedIds: readonly string[];
  lastViewedAt: string | null;
}

export const EMPTY_NOTIFICATION_PREFERENCES: ProductNotificationPreferences = {
  dismissedIds: [],
  lastViewedAt: null,
};

export function buildProductNotificationGroups(
  alerts: readonly AlertEvent[],
  operations: readonly OperationStatusSnapshot[],
  local: readonly ProductNotification[],
  dismissedIds: ReadonlySet<string>,
  now: Date,
  t: TranslationFunction,
): ProductNotificationGroups {
  const inProgress = operations
    .filter((snapshot) => !isTerminal(snapshot.status))
    .map((snapshot) => operationItem(snapshot, t))
    .filter((item) => !dismissedIds.has(item.id));
  const recent = dedupeItems([
    ...alerts.map((event) => alertItem(event, t)),
    ...operations.filter((snapshot) => isTerminal(snapshot.status))
      .map((snapshot) => operationItem(snapshot, t)),
    ...local.map((item) => ({ ...item, progress: null })),
  ]).filter((item) => !dismissedIds.has(item.id));
  return {
    earlier: recent.filter((item) => !isSameDay(item.occurredAt, now)),
    inProgress,
    today: recent.filter((item) => isSameDay(item.occurredAt, now)),
  };
}

export function notificationUnreadCount(
  groups: ProductNotificationGroups,
  lastViewedAt: string | null,
): number {
  if (lastViewedAt === null) return groups.today.length + groups.earlier.length;
  const boundary = Date.parse(lastViewedAt);
  return [...groups.today, ...groups.earlier].filter(
    (item) => Date.parse(item.occurredAt) > boundary,
  ).length;
}

export function operationTerminalEventKey(snapshot: OperationStatusSnapshot): string {
  return `${snapshot.commandId}:${snapshot.sequence ?? 0}:${snapshot.status}`;
}

export function readNotificationPreferences(key: string): ProductNotificationPreferences {
  if (typeof window === "undefined") return EMPTY_NOTIFICATION_PREFERENCES;
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? "null");
    if (typeof value !== "object" || value === null) return EMPTY_NOTIFICATION_PREFERENCES;
    const record = value as Partial<ProductNotificationPreferences>;
    return {
      dismissedIds: Array.isArray(record.dismissedIds)
        ? record.dismissedIds.filter((id): id is string => typeof id === "string").slice(-500)
        : [],
      lastViewedAt: typeof record.lastViewedAt === "string" ? record.lastViewedAt : null,
    };
  } catch {
    return EMPTY_NOTIFICATION_PREFERENCES;
  }
}

export function persistNotificationPreferences(
  key: string,
  preferences: ProductNotificationPreferences,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(preferences));
  } catch {
    // The current tab still retains the read state when browser storage is unavailable.
  }
}

export function notificationRelativeTime(
  value: string,
  now: Date,
  locale: "en" | "ko",
): string {
  const deltaSeconds = Math.round((Date.parse(value) - now.getTime()) / 1_000);
  const [amount, unit] = Math.abs(deltaSeconds) < 60
    ? [deltaSeconds, "second" as const]
    : Math.abs(deltaSeconds) < 3_600
      ? [Math.round(deltaSeconds / 60), "minute" as const]
      : Math.abs(deltaSeconds) < 86_400
        ? [Math.round(deltaSeconds / 3_600), "hour" as const]
        : [Math.round(deltaSeconds / 86_400), "day" as const];
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(amount, unit);
}

function alertItem(event: AlertEvent, t: TranslationFunction): ProductNotificationItem {
  return {
    description: [event.subject.cluster, event.subject.namespace, event.subject.name]
      .filter(Boolean).join(" · "),
    href: alertEventResourceHref(event.subject),
    id: `alert:${event.event_id}`,
    occurredAt: event.resolved_at ?? event.fired_at,
    progress: null,
    title: event.rule_name ?? t("alerts.toast.new"),
    tone: event.severity === "critical" || event.severity === "high"
      ? "critical"
      : event.severity === "warning" || event.severity === "medium"
        ? "warning"
        : "info",
  };
}

function operationItem(
  snapshot: OperationStatusSnapshot,
  t: TranslationFunction,
): ProductNotificationItem {
  const payload = snapshot.event?.payload;
  return {
    description: operationDescription(payload) ?? t(`resources.detail.action.observation.${snapshot.status}`),
    href: operationHref(snapshot),
    id: `operation:${snapshot.commandId}`,
    occurredAt: snapshot.event?.occurredAt ?? new Date(snapshot.updatedAt).toISOString(),
    progress: operationProgress(payload),
    title: operationTitle(payload) ?? snapshot.commandId,
    tone: snapshot.status === "completed"
      ? "healthy"
      : snapshot.status === "failed" || snapshot.status === "forbidden"
        ? "critical"
        : snapshot.status === "running"
          ? "info"
          : "warning",
  };
}

function operationTitle(payload: Readonly<Record<string, unknown>> | undefined): string | null {
  return stringField(payload, ["title", "operation", "action", "phase"]);
}

function operationDescription(payload: Readonly<Record<string, unknown>> | undefined): string | null {
  return stringField(payload, ["message", "description", "status"]);
}

function operationHref(snapshot: OperationStatusSnapshot): string {
  const payload = snapshot.event?.payload;
  const href = stringField(payload, ["href"]);
  if (href?.startsWith("/")) return href;
  const subject = payload?.subject;
  if (isSubject(subject)) return alertEventResourceHref(subject);
  return `/timeline?detail=${encodeURIComponent(snapshot.commandId)}`;
}

function operationProgress(payload: Readonly<Record<string, unknown>> | undefined): number | null {
  const direct = numberField(payload, ["progress", "percent", "percentage"]);
  if (direct !== null) return Math.min(100, Math.max(0, direct));
  const completed = numberField(payload, ["completed", "current"]);
  const total = numberField(payload, ["total"]);
  return completed !== null && total !== null && total > 0
    ? Math.min(100, Math.max(0, completed / total * 100))
    : null;
}

function dedupeItems(items: readonly ProductNotificationItem[]): ProductNotificationItem[] {
  const byId = new Map<string, ProductNotificationItem>();
  for (const item of items) {
    const current = byId.get(item.id);
    if (!current || Date.parse(item.occurredAt) > Date.parse(current.occurredAt)) {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()].sort((left, right) => (
    Date.parse(right.occurredAt) - Date.parse(left.occurredAt)
  ));
}

function isSameDay(value: string, now: Date): boolean {
  const date = new Date(value);
  return date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
}

function isTerminal(status: OperationStatusSnapshot["status"]): boolean {
  return ["completed", "failed", "cancelled", "forbidden", "invalid", "unavailable"].includes(status);
}

function stringField(
  record: Readonly<Record<string, unknown>> | undefined,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function numberField(
  record: Readonly<Record<string, unknown>> | undefined,
  keys: readonly string[],
): number | null {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function isSubject(value: unknown): value is {
  cluster: string;
  kind: string;
  name: string;
  namespace: string | null;
} {
  if (typeof value !== "object" || value === null) return false;
  const subject = value as Record<string, unknown>;
  return typeof subject.cluster === "string" &&
    typeof subject.kind === "string" &&
    typeof subject.name === "string" &&
    (subject.namespace === null || typeof subject.namespace === "string");
}

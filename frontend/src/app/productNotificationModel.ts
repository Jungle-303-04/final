import type {
  NotificationLedger,
  NotificationLedgerItem,
} from "../features/alerts/notificationLedger";
import type { OperationStatusSnapshot } from "../features/operations/OperationStatusStore";

export interface ProductNotificationGroups {
  earlier: readonly NotificationLedgerItem[];
  inProgress: readonly NotificationLedgerItem[];
  today: readonly NotificationLedgerItem[];
}

export interface ProductNotificationPreferences {
  dismissedIds: readonly string[];
  lastViewedAt: string | null;
}

export const EMPTY_NOTIFICATION_PREFERENCES: ProductNotificationPreferences = {
  dismissedIds: [],
  lastViewedAt: null,
};

/**
 * Applies browser-only read state to the canonical notification ledger. The
 * ledger itself owns source projection, IDs, deduplication, ordering and links
 * so the header bell and the /alerts surface can never disagree.
 */
export function groupNotificationLedger(
  ledger: NotificationLedger,
  dismissedIds: ReadonlySet<string>,
  now: Date,
): ProductNotificationGroups {
  const inProgress = ledger.active.filter((item) => !dismissedIds.has(item.id));
  const recent = ledger.recent.filter((item) => !dismissedIds.has(item.id));
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

function isSameDay(value: string, now: Date): boolean {
  const date = new Date(value);
  return date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
}

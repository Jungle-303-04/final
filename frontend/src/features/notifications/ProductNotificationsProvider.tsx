import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useOptionalProductSession } from "../auth/ProductSessionContext";

const MAX_LOCAL_NOTIFICATIONS = 100;
const STORAGE_PREFIX = "opsia:notifications:v1";

export interface ProductNotification {
  description: string;
  href: string;
  id: string;
  occurredAt: string;
  title: string;
  tone: "critical" | "healthy" | "info" | "warning";
}

interface ProductNotificationsController {
  notifications: readonly ProductNotification[];
  publish(notification: ProductNotification): void;
}

const ProductNotificationsContext = createContext<ProductNotificationsController | null>(null);

export function ProductNotificationsProvider({ children }: { children: ReactNode }) {
  const session = useOptionalProductSession();
  const storageKey = `${STORAGE_PREFIX}:${session?.workspaceId ?? "anonymous"}:${session?.userId ?? "anonymous"}`;
  const [record, setRecord] = useState<{
    key: string;
    notifications: readonly ProductNotification[];
  }>(() => ({ key: storageKey, notifications: readNotifications(storageKey) }));
  const notifications = record.key === storageKey
    ? record.notifications
    : readNotifications(storageKey);
  const publish = useCallback((notification: ProductNotification) => {
    setRecord((current) => {
      const source = current.key === storageKey ? current.notifications : readNotifications(storageKey);
      const next = [
        notification,
        ...source.filter((candidate) => candidate.id !== notification.id),
      ].slice(0, MAX_LOCAL_NOTIFICATIONS);
      persistNotifications(storageKey, next);
      return { key: storageKey, notifications: next };
    });
  }, [storageKey]);
  const value = useMemo(() => ({ notifications, publish }), [notifications, publish]);
  return (
    <ProductNotificationsContext.Provider value={value}>
      {children}
    </ProductNotificationsContext.Provider>
  );
}

export function useOptionalProductNotifications(): ProductNotificationsController | null {
  return useContext(ProductNotificationsContext);
}

export function useProductNotifications(): ProductNotificationsController {
  const value = useOptionalProductNotifications();
  if (!value) throw new Error("ProductNotificationsProvider is required.");
  return value;
}

function readNotifications(key: string): readonly ProductNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isProductNotification) : [];
  } catch {
    return [];
  }
}

function persistNotifications(key: string, notifications: readonly ProductNotification[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(notifications));
  } catch {
    // Persistence is a progressive enhancement; the in-memory center remains authoritative.
  }
}

function isProductNotification(value: unknown): value is ProductNotification {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<ProductNotification>;
  return typeof candidate.description === "string" &&
    typeof candidate.href === "string" &&
    candidate.href.startsWith("/") &&
    typeof candidate.id === "string" &&
    typeof candidate.occurredAt === "string" &&
    typeof candidate.title === "string" &&
    ["critical", "healthy", "info", "warning"].includes(candidate.tone ?? "");
}

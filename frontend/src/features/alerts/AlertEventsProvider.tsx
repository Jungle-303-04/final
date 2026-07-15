import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";

import { toast } from "../../shared/ui/primitives/sonner";
import { useI18n } from "../../shared/i18n";
import type { AlertEvent, AlertEventsPort } from "./alertEventsContract";

const POLL_INTERVAL_MS = 10_000;

interface AlertEventsContextValue {
  events: readonly AlertEvent[];
  error: Error | null;
  initialLoading: boolean;
  pending: Readonly<Record<string, "ack" | "promote">>;
  unreadCount: number;
  acknowledge(eventId: string): Promise<void>;
  promote(eventId: string): Promise<void>;
  refresh(): void;
}

const AlertEventsContext = createContext<AlertEventsContextValue | null>(null);

export function AlertEventsProvider({
  children,
  port,
}: {
  children: ReactNode;
  port: AlertEventsPort;
}) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [events, setEvents] = useState<readonly AlertEvent[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [pending, setPending] = useState<Record<string, "ack" | "promote">>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    let controller: AbortController | null = null;

    const load = async () => {
      if (inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      controller = new AbortController();
      try {
        const response = sortNewest(await port.list(controller.signal));
        if (!active) return;
        const currentIds = new Set(response.map((event) => event.event_id));
        if (seen.current !== null) {
          for (const event of response) {
            if (event.status !== "firing" || seen.current.has(event.event_id)) continue;
            toast.warning(event.rule_name ?? t("alerts.toast.new"), {
              description: alertTarget(event),
              action: {
                label: t("alerts.toast.view"),
                onClick: () => navigate("/alerts"),
              },
            });
          }
        }
        seen.current = currentIds;
        setEvents(response);
        setError(null);
      } catch (cause) {
        if (!active || isAbortError(cause)) return;
        setError(cause instanceof Error ? cause : new Error(t("alerts.list.failure")));
      } finally {
        if (active) setInitialLoading(false);
        inFlight = false;
      }
    };

    void load();
    const interval = window.setInterval(() => void load(), POLL_INTERVAL_MS);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [navigate, port, refreshKey, t]);

  const runMutation = useCallback(async (
    eventId: string,
    action: "ack" | "promote",
  ) => {
    setPending((current) => ({ ...current, [eventId]: action }));
    try {
      if (action === "ack") {
        const acknowledged = await port.acknowledge(eventId);
        setEvents((current) => replaceEvent(current, acknowledged));
        toast.success(t("alerts.toast.acknowledged"));
      } else {
        const promotion = await port.promote(eventId);
        setEvents((current) => current.map((event) => (
          event.event_id === eventId
            ? { ...event, incident_id: promotion.incident_id }
            : event
        )));
        toast.success(t("alerts.toast.promoted"), {
          action: {
            label: t("alerts.toast.incidentView"),
            onClick: () => navigate("/issues"),
          },
        });
      }
    } catch (cause) {
      toast.error(action === "ack"
        ? t("alerts.toast.ackFailed")
        : t("alerts.toast.promoteFailed"));
      throw cause;
    } finally {
      setPending((current) => {
        const next = { ...current };
        delete next[eventId];
        return next;
      });
    }
  }, [navigate, port, t]);

  const value = useMemo<AlertEventsContextValue>(() => ({
    events,
    error,
    initialLoading,
    pending,
    unreadCount: events.filter((event) => event.status === "firing").length,
    acknowledge: (eventId) => runMutation(eventId, "ack"),
    promote: (eventId) => runMutation(eventId, "promote"),
    refresh: () => setRefreshKey((current) => current + 1),
  }), [error, events, initialLoading, pending, runMutation]);

  return <AlertEventsContext.Provider value={value}>{children}</AlertEventsContext.Provider>;
}

export function useAlertEvents(): AlertEventsContextValue {
  const value = useContext(AlertEventsContext);
  if (!value) throw new Error("useAlertEvents must be used within AlertEventsProvider");
  return value;
}

function sortNewest(events: readonly AlertEvent[]): readonly AlertEvent[] {
  return [...events].sort((left, right) => (
    Date.parse(right.fired_at) - Date.parse(left.fired_at)
  ));
}

function replaceEvent(events: readonly AlertEvent[], replacement: AlertEvent): readonly AlertEvent[] {
  return events.map((event) => event.event_id === replacement.event_id ? replacement : event);
}

function alertTarget(event: AlertEvent): string {
  return [
    event.subject.cluster,
    event.subject.namespace,
    event.subject.name,
  ].filter(Boolean).join(" · ");
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

import {
  Activity,
  Bell,
  BellRing,
  CheckCircle2,
  CircleAlert,
  Trash2,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAlertEvents } from "../features/alerts/AlertEventsProvider";
import {
  buildNotificationLedger,
  type NotificationLedgerItem,
} from "../features/alerts/notificationLedger";
import { useOptionalProductSession } from "../features/auth/ProductSessionContext";
import { useProductNotifications } from "../features/notifications/ProductNotificationsProvider";
import { useOptionalOperationStatusSnapshots } from "../features/operations/OperationStatusStore";
import { operationStatusKeys } from "../features/operations/operationPresentation";
import { useI18n } from "../shared/i18n";
import { cn } from "../shared/lib/cn";
import { ProgressFill } from "../shared/ui/charts";
import { Badge } from "../shared/ui/primitives/badge";
import { Button } from "../shared/ui/primitives/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../shared/ui/primitives/popover";
import { toast } from "../shared/ui/primitives/sonner";
import {
  groupNotificationLedger,
  notificationRelativeTime,
  notificationUnreadCount,
  operationTerminalEventKey,
  persistNotificationPreferences,
  readNotificationPreferences,
} from "./productNotificationModel";

const PREFERENCES_PREFIX = "opsia:notification-center:v1";

export function ProductNotificationCenter() {
  const alerts = useAlertEvents();
  const local = useProductNotifications();
  const operations = useOptionalOperationStatusSnapshots();
  const session = useOptionalProductSession();
  const navigate = useNavigate();
  const { locale, t } = useI18n();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const storageKey = `${PREFERENCES_PREFIX}:${session?.workspaceId ?? "anonymous"}:${session?.userId ?? "anonymous"}`;
  const [record, setRecord] = useState(() => ({
    key: storageKey,
    preferences: readNotificationPreferences(storageKey),
  }));
  const preferences = record.key === storageKey
    ? record.preferences
    : readNotificationPreferences(storageKey);
  const dismissed = useMemo(
    () => new Set(preferences.dismissedIds),
    [preferences.dismissedIds],
  );
  const now = new Date();
  const ledger = buildNotificationLedger(alerts.events, operations, local.notifications);
  const groups = groupNotificationLedger(
    ledger,
    dismissed,
    now,
  );
  const unreadCount = notificationUnreadCount(groups, preferences.lastViewedAt);
  const seenTerminalEvents = useRef(new Set<string>());

  useEffect(() => {
    for (const snapshot of operations) {
      if (!["completed", "failed", "cancelled"].includes(snapshot.status)) continue;
      const eventKey = operationTerminalEventKey(snapshot);
      if (seenTerminalEvents.current.has(eventKey)) continue;
      seenTerminalEvents.current.add(eventKey);
      const item = [...groups.today, ...groups.earlier]
        .find((candidate) => candidate.id === `operation:${snapshot.commandId}`);
      const title = t(operationStatusKeys[snapshot.status]);
      const options = item ? {
        action: { label: t("alerts.center.view"), onClick: () => navigate(item.href) },
        description: item.title,
        id: eventKey,
      } : { id: eventKey };
      if (snapshot.status === "completed") toast.success(title, options);
      else toast.error(title, options);
    }
  }, [groups.earlier, groups.today, navigate, operations, t]);

  const updatePreferences = (next: typeof preferences) => {
    persistNotificationPreferences(storageKey, next);
    setRecord({ key: storageKey, preferences: next });
  };
  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (next) updatePreferences({ ...preferences, lastViewedAt: new Date().toISOString() });
  };
  const clear = () => {
    const ids = [...groups.inProgress, ...groups.today, ...groups.earlier]
      .map((item) => item.id);
    updatePreferences({
      dismissedIds: [...new Set([...preferences.dismissedIds, ...ids])].slice(-500),
      lastViewedAt: new Date().toISOString(),
    });
  };
  const itemCount = groups.inProgress.length + groups.today.length + groups.earlier.length;

  return (
    <>
      <output aria-atomic="true" aria-live="polite" className="sr-only">
        {unreadCount > 0 ? t("alerts.center.announcement", { count: unreadCount }) : ""}
      </output>
      <Popover onOpenChange={changeOpen} open={open}>
        <PopoverTrigger
          render={(
            <Button
              aria-label={t("alerts.center.trigger", { count: unreadCount })}
              className="relative size-[2.375rem] rounded-full bg-foreground/[0.043] text-muted-foreground hover:bg-foreground/[0.075] hover:text-foreground"
              size="icon"
              variant="ghost"
            />
          )}
        >
          <Bell aria-hidden="true" />
          {unreadCount > 0 ? (
            <span
              aria-hidden="true"
              className="absolute -right-1 -top-1 grid min-w-4 animate-in place-items-center rounded-full bg-status-critical px-1 text-[10px] font-semibold leading-4 text-white zoom-in-50 duration-(--motion-soft) motion-reduce:animate-none"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </PopoverTrigger>
        <PopoverContent
          align="end"
          aria-labelledby={titleId}
          className="w-[min(24rem,calc(100vw-2rem))] overflow-hidden border bg-popover/90 p-0 backdrop-blur-xl"
        >
          <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
            <span className="flex min-w-0 items-center gap-2">
              <BellRing aria-hidden="true" className="size-4 text-muted-foreground" />
              <h2 className="truncate text-sm font-semibold" id={titleId}>
                {t("alerts.center.title")}
              </h2>
            </span>
            <Button
              disabled={itemCount === 0}
              onClick={clear}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Trash2 aria-hidden="true" />
              {t("alerts.center.clear")}
            </Button>
          </header>
          {alerts.error ? (
            <p className="border-b px-4 py-2 text-xs text-status-warning" role="status">
              {t("alerts.center.stale")}
            </p>
          ) : null}
          <div className="grid max-h-[min(34rem,calc(100vh-7rem))] overflow-y-auto">
            {itemCount === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                {t("alerts.center.empty")}
              </p>
            ) : (
              <>
                <NotificationSection
                  groups={groups.inProgress}
                  icon={Activity}
                  label={t("alerts.center.inProgress")}
                  locale={locale}
                  now={now}
                  progress
                />
                <NotificationSection
                  groups={groups.today}
                  icon={CircleAlert}
                  label={t("alerts.center.today")}
                  locale={locale}
                  now={now}
                />
                <NotificationSection
                  groups={groups.earlier}
                  icon={CheckCircle2}
                  label={t("alerts.center.earlier")}
                  locale={locale}
                  now={now}
                />
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}

function NotificationSection({
  groups,
  icon: Icon,
  label,
  locale,
  now,
  progress = false,
}: {
  groups: readonly NotificationLedgerItem[];
  icon: typeof Activity;
  label: string;
  locale: "en" | "ko";
  now: Date;
  progress?: boolean;
}) {
  if (groups.length === 0) return null;
  return (
    <section aria-label={label} className="border-b last:border-b-0">
      <h3 className="flex items-center gap-2 px-4 pb-1 pt-3 text-xs font-semibold text-muted-foreground">
        <Icon aria-hidden="true" className="size-3.5" />
        {label}
        <Badge className="ml-auto" variant="secondary">{groups.length}</Badge>
      </h3>
      <ul className="grid px-2 pb-2">
        {groups.map((item) => (
          <li key={item.id}>
            <Link
              className="grid min-w-0 gap-1 rounded-lg border border-transparent px-2 py-2 text-left outline-none transition-colors hover:border-border-subtle hover:bg-muted/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              to={item.href}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className={cn("size-2 shrink-0 rounded-full", toneClass(item.tone))}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>
                <time className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {notificationRelativeTime(item.occurredAt, now, locale)}
                </time>
              </span>
              {item.description ? (
                <span className="line-clamp-2 pl-4 text-xs leading-5 text-muted-foreground">
                  {item.description}
                </span>
              ) : null}
              {progress ? (
                <ProgressFill
                  ariaLabel={`${item.title} · ${item.description ?? item.title}`}
                  className="ml-4 mt-1"
                  value={item.progress}
                />
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function toneClass(tone: NotificationLedgerItem["tone"]): string {
  if (tone === "critical") return "bg-status-critical";
  if (tone === "warning") return "bg-status-warning";
  if (tone === "healthy") return "bg-status-healthy";
  return "bg-primary";
}

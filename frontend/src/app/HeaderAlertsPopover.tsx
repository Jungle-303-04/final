import {
  Bell,
  BellRing,
  CheckCheck,
  ChevronDown,
  CircleCheck,
  CircleX,
  ExternalLink,
  LoaderCircle,
  PauseCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAlertEvents } from "../features/alerts/AlertEventsProvider";
import type { AlertEvent } from "../features/alerts/alertEventsContract";
import { useActivityNotifications } from "../features/notifications/ActivityNotificationsProvider";
import type { ActivityNotification } from "../features/notifications/activityNotificationsContract";
import { useI18n } from "../shared/i18n";
import { cn } from "../shared/lib/cn";
import { Badge } from "../shared/ui/primitives/badge";
import { Button } from "../shared/ui/primitives/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../shared/ui/primitives/popover";
import { Progress } from "../shared/ui/primitives/progress";
import { ScrollArea } from "../shared/ui/primitives/scroll-area";
import { Separator } from "../shared/ui/primitives/separator";

interface HeaderAlertsPopoverProps {
  alertsHref: string;
}

type HeaderNotification =
  | { kind: "alert"; id: string; timestamp: string; event: AlertEvent }
  | { kind: "activity"; id: string; timestamp: string; activity: ActivityNotification };

export function HeaderAlertsPopover({ alertsHref }: HeaderAlertsPopoverProps) {
  const alerts = useAlertEvents();
  const activityNotifications = useActivityNotifications();
  const navigate = useNavigate();
  const { formatDate, t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(false);
  const notifications = useMemo<readonly HeaderNotification[]>(() => [
    ...alerts.notifications.map((event): HeaderNotification => ({
      kind: "alert",
      id: event.event_id,
      timestamp: event.fired_at,
      event,
    })),
    ...activityNotifications.inboxActivities.map((activity): HeaderNotification => ({
      kind: "activity",
      id: activity.id,
      timestamp: activity.updatedAt,
      activity,
    })),
  ].sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp)), [
    activityNotifications.inboxActivities,
    alerts.notifications,
  ]);
  const visibleNotifications = expanded ? notifications : notifications.slice(0, 1);
  const notificationCount = notifications.length;

  const changeOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) setExpanded(false);
  };
  const openNotification = (notification: HeaderNotification) => {
    changeOpen(false);
    if (notification.kind === "activity") {
      activityNotifications.openActivity(notification.id);
      return;
    }
    alerts.markNotificationRead(notification.id);
    navigate(alertsHref);
  };
  const markAllRead = () => {
    alerts.markAllNotificationsRead();
    activityNotifications.markAllActivitiesRead();
    setExpanded(false);
  };

  const notificationList = (
    <div className="grid gap-1 p-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200">
      {visibleNotifications.map((notification, index) => (
        <NotificationRow
          formatDate={formatDate}
          highlighted={index === 0}
          key={`${notification.kind}:${notification.id}`}
          notification={notification}
          onOpen={() => openNotification(notification)}
        />
      ))}
    </div>
  );

  return (
    <Popover onOpenChange={changeOpen} open={open}>
      <PopoverTrigger
        render={(
          <Button
            aria-label={t("alerts.header.open", { count: notificationCount })}
            className="relative"
            size="icon"
            variant="ghost"
          />
        )}
      >
        <Bell aria-hidden="true" />
        {notificationCount > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[0.625rem] font-semibold leading-4 text-primary-foreground motion-safe:animate-in motion-safe:zoom-in-75"
          >
            {notificationCount > 99 ? "99+" : notificationCount}
          </span>
        ) : null}
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl p-0 shadow-xl"
        side="bottom"
        sideOffset={8}
      >
        <div className="flex min-h-12 items-center justify-between gap-3 bg-muted/25 px-4 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="font-semibold">{t("alerts.title")}</h2>
            {notificationCount > 0 ? <Badge variant="secondary">{notificationCount}</Badge> : null}
            {activityNotifications.activeCount > 0 ? (
              <Badge className="gap-1" variant="outline">
                <LoaderCircle aria-hidden="true" className="size-3 animate-spin motion-reduce:animate-none" />
                {t("alerts.activity.section")} {activityNotifications.activeCount}
              </Badge>
            ) : null}
          </div>
          {notificationCount > activityNotifications.activeCount ? (
            <Button onClick={markAllRead} size="sm" type="button" variant="ghost">
              <CheckCheck aria-hidden="true" />
              {t("alerts.header.markAllRead")}
            </Button>
          ) : null}
        </div>
        <Separator />

        {notificationCount === 0 ? (
          <div className="grid min-h-32 place-items-center px-6 py-8 text-center">
            <div>
              <Bell aria-hidden="true" className="mx-auto mb-2 size-5 text-muted-foreground" />
              <p className="text-sm font-medium">{t("alerts.empty.title")}</p>
            </div>
          </div>
        ) : expanded ? (
          <ScrollArea aria-label={t("alerts.list.aria")} className="h-80" orientation="vertical">
            {notificationList}
          </ScrollArea>
        ) : notificationList}

        {notificationCount > 1 ? (
          <div className="px-3 pb-3">
            <Button
              className="w-full"
              onClick={() => setExpanded((current) => !current)}
              type="button"
              variant="outline"
            >
              {expanded
                ? t("alerts.header.collapse")
                : t("alerts.header.showMore", { count: notificationCount - 1 })}
              <ChevronDown
                aria-hidden="true"
                className={cn("transition-transform", expanded && "rotate-180")}
              />
            </Button>
          </div>
        ) : null}

        <Separator />
        <div className="bg-muted/20 p-2">
          {import.meta.env.DEV ? (
            <div className="mb-2 rounded-lg border border-primary/20 bg-primary/5 p-2">
              <Button
                className="w-full"
                disabled={alerts.initialLoading || alerts.creatingTestEvent}
                onClick={() => void alerts.createTestEvent()}
                type="button"
                variant="outline"
              >
                {alerts.creatingTestEvent ? (
                  <LoaderCircle aria-hidden="true" className="animate-spin" />
                ) : (
                  <BellRing aria-hidden="true" />
                )}
                {alerts.creatingTestEvent
                  ? t("alerts.header.testing")
                  : t("alerts.header.test")}
              </Button>
              <p className="px-1 pt-2 text-xs leading-relaxed text-muted-foreground">
                {t("alerts.header.testHint")}
              </p>
            </div>
          ) : null}
          <Button className="w-full" onClick={() => {
            changeOpen(false);
            navigate(alertsHref);
          }} type="button" variant="ghost">
            {t("alerts.header.viewAll")}
            <ExternalLink aria-hidden="true" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NotificationRow({
  formatDate,
  highlighted,
  notification,
  onOpen,
}: {
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string;
  highlighted: boolean;
  notification: HeaderNotification;
  onOpen: () => void;
}) {
  return notification.kind === "activity" ? (
    <ActivityRow
      activity={notification.activity}
      formatDate={formatDate}
      highlighted={highlighted}
      onOpen={onOpen}
    />
  ) : (
    <AlertRow
      event={notification.event}
      formatDate={formatDate}
      highlighted={highlighted}
      onOpen={onOpen}
    />
  );
}

function ActivityRow({
  activity,
  formatDate,
  highlighted,
  onOpen,
}: {
  activity: ActivityNotification;
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string;
  highlighted: boolean;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  const progress = Math.round(activity.currentStep / activity.totalSteps * 100);
  const active = activity.status === "running" || activity.status === "waiting";
  return (
    <Button
      className={cn(
        "h-auto min-w-0 items-start justify-start gap-3 whitespace-normal px-3 py-3 text-left",
        highlighted && "bg-accent/45",
      )}
      onClick={onOpen}
      type="button"
      variant="ghost"
    >
      <ActivityStatusIcon activity={activity} />
      <span className="grid min-w-0 flex-1 gap-1.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-semibold">{activity.title}</span>
          <time className="shrink-0 text-xs font-normal text-muted-foreground" dateTime={activity.updatedAt}>
            {formatAlertTime(activity.updatedAt, formatDate)}
          </time>
        </span>
        <span className="line-clamp-2 text-xs font-normal leading-relaxed text-muted-foreground">
          {activity.description}
        </span>
        {active && activity.totalSteps > 1 ? (
          <span className="grid gap-1">
            <span className="flex justify-between text-[0.6875rem] font-medium text-muted-foreground">
              <span>{activity.target}</span>
              <span>{t("alerts.activity.step", { current: activity.currentStep, total: activity.totalSteps })}</span>
            </span>
            <Progress
              aria-label={activity.title}
              className="[&_[data-slot=progress-track]]:h-1"
              value={progress}
            />
          </span>
        ) : null}
      </span>
    </Button>
  );
}

function ActivityStatusIcon({ activity }: { activity: ActivityNotification }) {
  if (activity.status === "running") {
    return <LoaderCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 animate-spin text-sky-600 motion-reduce:animate-none" />;
  }
  if (activity.status === "waiting") {
    return <PauseCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-600" />;
  }
  if (activity.status === "succeeded") {
    return <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-emerald-600" />;
  }
  return <CircleX aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />;
}

function AlertRow({
  event,
  formatDate,
  highlighted,
  onOpen,
}: {
  event: AlertEvent;
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string;
  highlighted: boolean;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  return (
    <Button
      className={cn(
        "h-auto min-w-0 justify-start gap-3 whitespace-normal px-3 py-3 text-left",
        highlighted && "bg-accent/45",
      )}
      onClick={onOpen}
      type="button"
      variant="ghost"
    >
      <span aria-hidden="true" className={cn("mt-1.5 size-2 shrink-0 rounded-full", severityDotClass(event))} />
      <span className="grid min-w-0 flex-1 gap-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-semibold">
            {event.rule_name ?? t("alerts.event.external")}
          </span>
          <time className="shrink-0 text-xs font-normal text-muted-foreground" dateTime={event.fired_at}>
            {formatAlertTime(event.fired_at, formatDate)}
          </time>
        </span>
        <span className="truncate text-xs font-normal text-muted-foreground">{alertTarget(event)}</span>
      </span>
    </Button>
  );
}

function alertTarget(event: AlertEvent): string {
  return [
    event.subject.cluster,
    event.subject.namespace,
    event.subject.kind,
    event.subject.name,
  ].filter(Boolean).join(" · ");
}

function severityDotClass(event: AlertEvent): string {
  if (event.severity === "critical" || event.severity === "high") return "bg-destructive";
  if (event.severity === "warning" || event.severity === "medium") return "bg-amber-500";
  return "bg-sky-500";
}

function formatAlertTime(
  value: string,
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string,
): string {
  return formatDate(new Date(value), { hour: "2-digit", minute: "2-digit" });
}

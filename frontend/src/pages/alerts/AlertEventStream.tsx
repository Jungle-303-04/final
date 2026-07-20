import { Check, ExternalLink, MoreHorizontal, Siren } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import type { AlertEvent } from "../../features/alerts/alertEventsContract";
import type {
  AlertSurfaceData,
  AlertSurfaceProgressItem,
  AlertSurfaceRow,
  AlertSurfaceTone,
} from "../../features/alerts/alertSurfaceModel";
import { alertEventResourceHref } from "../../features/filters/alertEventResourceHref";
import {
  SurfaceRowMotion,
  SurfaceRowMotionProvider,
  SurfaceRowPresence,
} from "../../motion/SurfaceRowMotion";
import { useI18n, type TranslationFunction } from "../../shared/i18n";
import type { AlertsMessageKey } from "../../shared/i18n/keys/alerts";
import { cn } from "../../shared/lib/cn";
import { ProgressFill } from "../../shared/ui/charts";
import { Surface } from "../../shared/ui/Surface";
import { StatusPill } from "../../shared/ui/status";
import { Button, buttonVariants } from "../../shared/ui/primitives/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../shared/ui/primitives/popover";

const INITIAL_VISIBLE_ROWS = 25;
const EVENT_SOURCE_KEYS = {
  alertmanager: "alerts.source.alertmanager",
  opsia: "alerts.source.opsia",
} as const;
const EVENT_STATUS_KEYS = {
  acked: "alerts.status.acked",
  firing: "alerts.status.firing",
  resolved: "alerts.status.resolved",
} as const;
const ALERT_CATEGORY_KEYS = {
  configuration: "alerts.category.configuration",
  deployment: "alerts.category.deployment",
  issue: "alerts.category.issue",
} satisfies Readonly<Record<AlertSurfaceRow["category"], AlertsMessageKey>>;
const ALERT_TONE_KEYS = {
  critical: "alerts.tone.critical",
  healthy: "alerts.tone.healthy",
  warning: "alerts.tone.warning",
} satisfies Readonly<Record<AlertSurfaceTone, AlertsMessageKey>>;

export function AlertEventStream({ acknowledge, data, events, pending, promote }: {
  acknowledge(eventId: string): Promise<void>;
  data: AlertSurfaceData;
  events: readonly AlertEvent[];
  pending: Readonly<Record<string, "ack" | "promote">>;
  promote(eventId: string): Promise<void>;
}) {
  const { formatNumber, locale, t } = useI18n();
  const [visibleRows, setVisibleRows] = useState(INITIAL_VISIBLE_ROWS);
  const eventsById = useMemo(() => new Map(events.map((event) => [
    `alert:${event.event_id}`,
    event,
  ])), [events]);
  return (
    <SurfaceRowMotionProvider>
      <Surface aria-label={t("alerts.list.aria")} className="min-w-0 overflow-hidden rounded-card">
        <div aria-hidden="true" className="grid h-[2.54296875rem] min-w-0 grid-cols-[6.875rem_minmax(15rem,1.8fr)_minmax(5.46875rem,0.5fr)_minmax(5.9375rem,0.5fr)] items-center gap-[0.9375rem] border-b bg-muted/35 px-[1.09375rem] py-[0.625rem]">
          <ColumnLabel>{t("alerts.table.status")}</ColumnLabel>
          <ColumnLabel>{t("alerts.table.content")}</ColumnLabel>
          <ColumnLabel>{t("alerts.table.category")}</ColumnLabel>
          <ColumnLabel>{t("alerts.table.time")}</ColumnLabel>
        </div>
        <div role="list">
          <SurfaceRowPresence>
            {data.rows.slice(0, visibleRows).map((row, index) => (
              <AlertEventRow
                acknowledge={acknowledge}
                event={eventsById.get(row.id)}
                index={index}
                key={row.id}
                locale={locale}
                pending={pending[row.id.replace(/^alert:/u, "")]}
                promote={promote}
                row={row}
                t={t}
              />
            ))}
          </SurfaceRowPresence>
        </div>
        {visibleRows < data.rows.length ? (
          <div className="flex justify-center border-t px-3 py-2">
            <Button onClick={() => setVisibleRows((current) => current + INITIAL_VISIBLE_ROWS)} size="sm" type="button" variant="ghost">
              {t("alerts.action.more", { count: formatNumber(Math.min(INITIAL_VISIBLE_ROWS, data.rows.length - visibleRows)) })}
            </Button>
          </div>
        ) : null}
      </Surface>
    </SurfaceRowMotionProvider>
  );
}

export function AlertActiveOperation({ item, t }: { item: AlertSurfaceProgressItem; t: TranslationFunction }) {
  const stage = item.completed !== null && item.total !== null
    ? t("alerts.progress.stage", { completed: item.completed, total: item.total })
    : item.description ?? t("alerts.progress.observing");
  return (
    <Surface aria-label={t("alerts.progress.aria")} className="min-h-[3.984375rem] rounded-card px-[1.171875rem] py-[1.171875rem]">
      <div className="flex min-w-0 items-center gap-[0.78125rem]">
        <span aria-hidden="true" className="motion-live-dot size-[0.546875rem] shrink-0 rounded-full bg-primary" />
        <Link className="min-w-0 truncate text-body font-bold hover:underline" to={item.href}>{item.title}</Link>
        <span className="min-w-0 truncate font-mono text-label text-caption-foreground tabular-nums">{stage}</span>
        <ProgressFill ariaLabel={t("alerts.progress.value", { title: item.title })} className="ml-auto h-[0.46875rem] w-[12.5rem] shrink-0" value={item.progress} />
      </div>
    </Surface>
  );
}

function AlertEventRow({ acknowledge, event, index, locale, pending, promote, row, t }: {
  acknowledge(eventId: string): Promise<void>;
  event: AlertEvent | undefined;
  index: number;
  locale: "en" | "ko";
  pending: "ack" | "promote" | undefined;
  promote(eventId: string): Promise<void>;
  row: AlertSurfaceRow;
  t: TranslationFunction;
}) {
  const navigate = useNavigate();
  const rowLabel = t("alerts.table.row", { category: categoryLabel(row.category, t), status: toneLabel(row.tone, t), title: row.title });
  return (
    <SurfaceRowMotion className={cn(
      "group relative grid min-h-[3.5078125rem] min-w-0 grid-cols-[6.875rem_minmax(15rem,1.8fr)_minmax(5.46875rem,0.5fr)_minmax(5.9375rem,0.5fr)] items-center gap-[0.9375rem] border-b border-border-subtle px-[1.09375rem] py-[0.78125rem] last:border-b-0",
      "transition-[background-color] duration-(--motion-micro) hover:bg-muted/35 focus-within:bg-muted/35 motion-reduce:transition-none",
    )} index={index} role="listitem">
      <button aria-label={rowLabel} className="absolute inset-0 z-0 cursor-pointer rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60" onClick={() => navigate(row.href)} type="button" />
      <span className="pointer-events-none relative z-1 min-w-0"><StatusPill className="gap-[0.390625rem] px-[0.703125rem] py-[0.234375rem] text-micro [&>span:first-child]:size-[0.390625rem]" label={toneLabel(row.tone, t)} tone={row.tone} /></span>
      <span className="pointer-events-none relative z-1 min-w-0 truncate text-label-2 text-foreground">{row.title}</span>
      <span className="pointer-events-none relative z-1 min-w-0 truncate text-label text-caption-foreground">{categoryLabel(row.category, t)}</span>
      <time className="pointer-events-none relative z-1 min-w-0 truncate pr-9 font-mono text-label text-caption-foreground tabular-nums" dateTime={row.occurredAt}>{relativeTime(row.occurredAt, locale)}</time>
      {event ? <EventActions acknowledge={acknowledge} event={event} pending={pending} promote={promote} t={t} /> : null}
    </SurfaceRowMotion>
  );
}

function EventActions({ acknowledge, event, pending, promote, t }: {
  acknowledge(eventId: string): Promise<void>;
  event: AlertEvent;
  pending: "ack" | "promote" | undefined;
  promote(eventId: string): Promise<void>;
  t: TranslationFunction;
}) {
  const { formatNumber } = useI18n();
  return (
    <Popover>
      <PopoverTrigger render={<Button aria-label={t("alerts.action.menu", { title: event.rule_name ?? event.subject.name })} className="absolute right-1 top-1/2 z-2 -translate-y-1/2 opacity-0 shadow-sm transition-opacity duration-(--motion-micro) group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none" size="icon-sm" variant="outline" />}>
        <MoreHorizontal aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-72 gap-1 p-1.5">
        <div className="grid gap-2 border-b px-2 pb-2 pt-1">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <StatusPill label={t(EVENT_STATUS_KEYS[event.status])} tone={event.status === "resolved" ? "healthy" : event.status === "acked" ? "warning" : "critical"} />
            <span className="truncate text-label text-caption-foreground">
              {t(EVENT_SOURCE_KEYS[event.source])}
            </span>
          </div>
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-label">
            <dt className="text-caption-foreground">{t("alerts.event.measurement")}</dt>
            <dd className="m-0 font-mono font-semibold tabular-nums">{measurement(event, formatNumber, t)}</dd>
            <dt className="text-caption-foreground">{t("alerts.event.evidenceCount", { count: event.evidence.length })}</dt>
            <dd className="m-0 font-mono font-semibold tabular-nums">{formatNumber(event.evidence.length)}</dd>
          </dl>
        </div>
        {event.status === "firing" ? <Button className="justify-start" disabled={pending !== undefined} onClick={() => void acknowledge(event.event_id).catch(() => undefined)} size="sm" variant="ghost"><Check aria-hidden="true" />{pending === "ack" ? t("alerts.action.acking") : t("alerts.action.ack")}</Button> : null}
        {event.incident_id === null ? <Button className="justify-start" disabled={pending !== undefined} onClick={() => void promote(event.event_id).catch(() => undefined)} size="sm" variant="ghost"><Siren aria-hidden="true" />{pending === "promote" ? t("alerts.action.promoting") : t("alerts.action.promote")}</Button> : null}
        {event.incident_id !== null ? <p className="px-2 py-1 text-label font-medium text-muted-foreground">{t("alerts.action.incidentLinked")}</p> : null}
        <Link className={buttonVariants({ className: "justify-start", size: "sm", variant: "ghost" })} to={alertEventResourceHref(event.subject)}><ExternalLink aria-hidden="true" />{t("alerts.action.resource")}</Link>
      </PopoverContent>
    </Popover>
  );
}

function ColumnLabel({ children }: { children: string }) {
  return <span className="min-w-0 truncate text-micro font-semibold tracking-[0.05em] text-caption-foreground">{children}</span>;
}

function categoryLabel(category: AlertSurfaceRow["category"], t: TranslationFunction): string {
  return t(ALERT_CATEGORY_KEYS[category]);
}

function toneLabel(tone: AlertSurfaceTone, t: TranslationFunction): string {
  return t(ALERT_TONE_KEYS[tone]);
}

function relativeTime(value: string, locale: "en" | "ko"): string {
  const deltaSeconds = Math.round((Date.parse(value) - Date.now()) / 1_000);
  const [amount, unit] = Math.abs(deltaSeconds) < 60
    ? [deltaSeconds, "second" as const]
    : Math.abs(deltaSeconds) < 3_600
      ? [Math.round(deltaSeconds / 60), "minute" as const]
      : Math.abs(deltaSeconds) < 86_400
        ? [Math.round(deltaSeconds / 3_600), "hour" as const]
        : [Math.round(deltaSeconds / 86_400), "day" as const];
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(amount, unit);
}

function measurement(
  event: AlertEvent,
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string,
  t: TranslationFunction,
): string {
  if (event.observed_value === null || event.threshold === null) {
    return t("alerts.measurement.unavailable");
  }
  const metric = event.evidence.find(({ metric: value }) => value !== null)?.metric;
  const unit = metric === "cpu_pct" || metric === "mem_pct" ? "%" : "";
  const options = { maximumFractionDigits: 2 };
  return `${formatNumber(event.observed_value, options)}${unit} / ${formatNumber(event.threshold, options)}${unit}`;
}

import { BellRing, Check, ExternalLink, RefreshCw, Siren } from "lucide-react";
import { Link } from "react-router-dom";

import { useAlertEvents } from "../../features/alerts/AlertEventsProvider";
import type {
  AlertEvent,
  AlertEventSeverity,
} from "../../features/alerts/alertEventsContract";
import { alertEventResourceHref } from "../../features/filters/alertEventResourceHref";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button, buttonVariants } from "../../shared/ui/primitives/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../shared/ui/primitives/card";
import { cn } from "../../shared/lib/cn";
import { useI18n, type TranslationFunction } from "../../shared/i18n";
import { OverflowIdentity } from "../../shared/ui/OverflowIdentity";

export function AlertsPage() {
  const alerts = useAlertEvents();
  const { formatDate, formatNumber, t } = useI18n();

  return (
    <ProductPageFrame className="gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight">{t("alerts.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("alerts.description")}
          </p>
        </div>
        <Button
          aria-label={t("alerts.refresh")}
          onClick={alerts.refresh}
          size="icon"
          type="button"
          variant="outline"
        >
          <RefreshCw aria-hidden="true" />
        </Button>
      </header>

      <div aria-label={t("alerts.tabs.label")} className="flex items-center gap-1 border-b" role="tablist">
        <button
          aria-selected="true"
          className="border-b-2 border-foreground px-3 py-2 text-sm font-medium"
          role="tab"
          type="button"
        >
          {t("alerts.tabs.events")}
          {alerts.unreadCount > 0 ? (
            <Badge className="ml-2" variant="destructive">{alerts.unreadCount}</Badge>
          ) : null}
        </button>
        <button
          aria-disabled="true"
          aria-selected="false"
          className="px-3 py-2 text-sm text-muted-foreground"
          disabled
          role="tab"
          type="button"
        >
          {t("alerts.tabs.rules")}
        </button>
        <button
          aria-disabled="true"
          aria-selected="false"
          className="px-3 py-2 text-sm text-muted-foreground"
          disabled
          role="tab"
          type="button"
        >
          {t("alerts.tabs.channels")}
        </button>
      </div>

      {alerts.initialLoading ? (
        <ProductStateScreen kind="loading" placement="content" />
      ) : alerts.error && alerts.events.length === 0 ? (
        <ProductStateScreen
          issue={{ code: "server", safeDetail: t("alerts.list.failure") }}
          kind="error"
          placement="content"
          retry={{ onRetry: alerts.refresh, pending: false }}
        />
      ) : alerts.events.length === 0 ? (
        <div className="grid min-h-52 place-items-center rounded-xl border border-dashed p-8 text-center">
          <div>
            <BellRing aria-hidden="true" className="mx-auto mb-3 size-6 text-muted-foreground" />
            <p className="font-medium">{t("alerts.empty.title")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("alerts.empty.description")}
            </p>
          </div>
        </div>
      ) : (
        <section aria-label={t("alerts.list.aria")} className="grid gap-3">
          {alerts.error ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
              {t("alerts.list.stale")}
            </p>
          ) : null}
          {alerts.events.map((event) => (
            <AlertEventCard
              acknowledge={() => alerts.acknowledge(event.event_id)}
              event={event}
              formatDate={formatDate}
              formatNumber={formatNumber}
              key={event.event_id}
              pending={alerts.pending[event.event_id]}
              promote={() => alerts.promote(event.event_id)}
              t={t}
            />
          ))}
        </section>
      )}
    </ProductPageFrame>
  );
}

function AlertEventCard({
  acknowledge,
  event,
  formatDate,
  formatNumber,
  pending,
  promote,
  t,
}: {
  acknowledge(): Promise<void>;
  event: AlertEvent;
  formatDate(value: Date | number, options?: Intl.DateTimeFormatOptions): string;
  formatNumber(value: number | bigint, options?: Intl.NumberFormatOptions): string;
  pending: "ack" | "promote" | undefined;
  promote(): Promise<void>;
  t: TranslationFunction;
}) {
  const resolved = event.status === "resolved";
  const target = [
    event.subject.cluster,
    event.subject.namespace,
    event.subject.kind,
    event.subject.name,
  ].filter(Boolean).join(" / ");
  return (
    <Card className={cn(
      "min-w-0",
      resolved && "bg-muted/45 text-muted-foreground",
    )} data-alert-status={event.status}>
      <CardHeader className="grid-cols-[minmax(0,1fr)_auto] gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <SeverityBadge severity={event.severity} t={t} />
            <Badge variant={resolved ? "outline" : event.status === "acked" ? "secondary" : "default"}>
              {statusLabel(event.status, t)}
            </Badge>
            <span className="text-xs text-muted-foreground">{sourceLabel(event.source, t)}</span>
          </div>
          <CardTitle className="min-w-0">
            <OverflowIdentity value={event.rule_name ?? t("alerts.event.external")} />
          </CardTitle>
          <p className="mt-1 min-w-0 text-sm text-muted-foreground">
            <OverflowIdentity value={target} />
          </p>
        </div>
        <time className="whitespace-nowrap text-xs text-muted-foreground" dateTime={event.fired_at}>
          {formatTimestamp(event.fired_at, formatDate)}
        </time>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 rounded-lg border bg-background/55 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div>
            <p className="text-xs text-muted-foreground">{t("alerts.event.measurement")}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {measurement(event, t, formatNumber)}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("alerts.event.evidenceCount", { count: event.evidence.length })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {event.status === "firing" ? (
            <Button
              disabled={pending !== undefined}
              onClick={() => void acknowledge().catch(() => undefined)}
              size="sm"
              type="button"
              variant="outline"
            >
              <Check aria-hidden="true" />
              {pending === "ack" ? t("alerts.action.acking") : t("alerts.action.ack")}
            </Button>
          ) : null}
          {event.incident_id === null ? (
            <Button
              disabled={pending !== undefined}
              onClick={() => void promote().catch(() => undefined)}
              size="sm"
              type="button"
              variant="outline"
            >
              <Siren aria-hidden="true" />
              {pending === "promote" ? t("alerts.action.promoting") : t("alerts.action.promote")}
            </Button>
          ) : (
            <Badge variant="secondary">{t("alerts.action.incidentLinked")}</Badge>
          )}
          <Link
            className={buttonVariants({ className: "sm:ml-auto", size: "sm", variant: "ghost" })}
            to={alertEventResourceHref(event.subject)}
          >
            {t("alerts.action.resource")}
            <ExternalLink aria-hidden="true" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function SeverityBadge({ severity, t }: { severity: AlertEventSeverity; t: TranslationFunction }) {
  const destructive = severity === "critical" || severity === "high";
  return <Badge variant={destructive ? "destructive" : "outline"}>{severityLabel(severity, t)}</Badge>;
}

function severityLabel(severity: AlertEventSeverity, t: TranslationFunction): string {
  return ({
    critical: t("alerts.severity.critical"),
    high: t("alerts.severity.high"),
    medium: t("alerts.severity.medium"),
    low: t("alerts.severity.low"),
    warning: t("alerts.severity.warning"),
    info: t("alerts.severity.info"),
  } as const)[severity];
}

function statusLabel(status: AlertEvent["status"], t: TranslationFunction): string {
  return ({
    firing: t("alerts.status.firing"),
    resolved: t("alerts.status.resolved"),
    acked: t("alerts.status.acked"),
  } as const)[status];
}

function sourceLabel(source: AlertEvent["source"], t: TranslationFunction): string {
  return source === "opsia" ? t("alerts.source.opsia") : t("alerts.source.alertmanager");
}

function measurement(
  event: AlertEvent,
  t: TranslationFunction,
  formatNumber: (value: number | bigint, options?: Intl.NumberFormatOptions) => string,
): string {
  if (event.observed_value === null || event.threshold === null) {
    return t("alerts.measurement.unavailable");
  }
  const metric = event.evidence.find((item) => item.metric !== null)?.metric;
  const unit = metric === "cpu_pct" || metric === "mem_pct" ? "%" : "";
  const options = { maximumFractionDigits: 2 };
  return `${formatNumber(event.observed_value, options)}${unit} / ${formatNumber(event.threshold, options)}${unit}`;
}

function formatTimestamp(
  value: string,
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string,
): string {
  return formatDate(new Date(value), {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

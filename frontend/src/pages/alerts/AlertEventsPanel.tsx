import { BellRing, RefreshCw } from "lucide-react";

import { RefreshAction } from "../../motion/RefreshAction";
import type { AlertEvent } from "../../features/alerts/alertEventsContract";
import type {
  AlertSurfaceData,
} from "../../features/alerts/alertSurfaceModel";
import { useI18n } from "../../shared/i18n";
import { Surface } from "../../shared/ui/Surface";
import { TintChip } from "../../shared/ui/status";
import { Button } from "../../shared/ui/primitives/button";
import { Skeleton } from "../../shared/ui/primitives/skeleton";
import { AlertActiveOperation, AlertEventStream } from "./AlertEventStream";

export function AlertEventsPanel({
  acknowledge,
  data,
  error,
  events,
  loading,
  onRulesSelect,
  pending,
  promote,
  refresh,
}: {
  acknowledge(eventId: string): Promise<void>;
  data: AlertSurfaceData;
  error: Error | null;
  events: readonly AlertEvent[];
  loading: boolean;
  onRulesSelect(): void;
  pending: Readonly<Record<string, "ack" | "promote">>;
  promote(eventId: string): Promise<void>;
  refresh(): void;
}) {
  const { t } = useI18n();

  if (loading) return <AlertEventsLoading />;

  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <SummaryMetric label={t("alerts.summary.inProgress")} value={data.inProgress.length} />
        <SummaryMetric label={t("alerts.summary.recent")} value={data.rows.length} />
        <SummaryMetric
          label={t("alerts.summary.critical")}
          tone={data.criticalCount > 0 ? "critical" : "healthy"}
          value={data.criticalCount}
        />
        <span className="ml-auto">
          <RefreshAction
            hasFailed={error !== null}
            iconOnly
            label={t("alerts.refresh")}
            onRefresh={refresh}
            size="widget-icon"
            statusCopy={{
              cancelled: t("common.freshness.refreshCancelled"),
              failed: t("common.freshness.refreshFailed"),
              pending: t("common.freshness.refreshPending"),
              reconnecting: t("alerts.refresh.reconnecting"),
              succeeded: t("common.freshness.refreshSucceeded"),
            }}
            variant="ghost"
          />
        </span>
      </div>

      {data.inProgress[0] ? <AlertActiveOperation item={data.inProgress[0]} t={t} /> : null}

      {error && data.rows.length > 0 ? (
        <p
          className="rounded-card border border-tint-warn-border bg-tint-warn-bg px-3 py-2 text-body text-tint-warn-fg"
          role="status"
        >
          {t("alerts.list.stale")}
        </p>
      ) : null}

      {error && data.rows.length === 0 ? (
        <FailureState refresh={refresh} />
      ) : data.rows.length === 0 ? (
        <EmptyState onRulesSelect={onRulesSelect} />
      ) : (
        <AlertEventStream
          acknowledge={acknowledge}
          data={data}
          events={events}
          pending={pending}
          promote={promote}
        />
      )}
    </div>
  );
}

function SummaryMetric({ label, tone = "neutral", value }: {
  label: string;
  tone?: "critical" | "healthy" | "neutral";
  value: number;
}) {
  const { formatNumber } = useI18n();
  return (
    <TintChip
      className="gap-[5px] rounded-full px-[11px] py-[5px] text-label font-semibold"
      label={(
        <span className="inline-flex items-baseline gap-1">
          <span>{label}</span>
          <strong className="font-mono text-label font-bold tabular-nums text-foreground">
            {formatNumber(value)}
          </strong>
        </span>
      )}
      tone={tone}
    />
  );
}

function EmptyState({ onRulesSelect }: { onRulesSelect(): void }) {
  const { t } = useI18n();
  return (
    <Surface aria-label={t("alerts.empty.title")} className="grid min-h-52 place-items-center rounded-card p-8 text-center">
      <div className="grid max-w-md justify-items-center gap-2">
        <BellRing aria-hidden="true" className="size-6 text-caption-foreground" />
        <p className="font-semibold">{t("alerts.empty.title")}</p>
        <p className="text-body text-muted-foreground">{t("alerts.empty.description")}</p>
        <Button onClick={onRulesSelect} size="page-action">
          {t("alerts.empty.action")}
        </Button>
      </div>
    </Surface>
  );
}

function FailureState({ refresh }: { refresh(): void }) {
  const { t } = useI18n();
  return (
    <Surface aria-label={t("alerts.list.failure")} className="grid min-h-52 place-items-center rounded-card p-8 text-center">
      <div className="grid max-w-md justify-items-center gap-2">
        <BellRing aria-hidden="true" className="size-6 text-destructive" />
        <p className="font-semibold">{t("alerts.list.failure")}</p>
        <Button onClick={refresh} size="page-secondary" variant="outline">
          <RefreshCw aria-hidden="true" />
          {t("common.action.retry")}
        </Button>
      </div>
    </Surface>
  );
}

function AlertEventsLoading() {
  return (
    <div aria-busy="true" className="grid min-w-0 gap-4">
      <div className="flex gap-2"><Skeleton className="h-7 w-24 rounded-full" /><Skeleton className="h-7 w-20 rounded-full" /><Skeleton className="h-7 w-20 rounded-full" /></div>
      <Skeleton className="h-16 w-full rounded-card" />
      <Skeleton className="h-80 w-full rounded-card" />
    </div>
  );
}

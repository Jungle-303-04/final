import {
  MultiLine,
  RankList,
  RatioBar,
} from "../../shared/ui/charts";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../shared/ui/primitives/button";
import { Skeleton } from "../../shared/ui/primitives/skeleton";
import { useI18n } from "../../shared/i18n";
import {
  issueResourceLabel,
  issueSeverityTone,
  issueTitle,
  sortIssuesForQueue,
} from "../../features/issues/issuePresentation";
import type {
  HomeBoardResource,
  HomeSyncSummary,
} from "./useHomeBoardData";
import type { IssueList } from "../../features/issues/issuesContract";
import type { HomeActivityOverview } from "../../features/home-activity/homeActivityContract";

export function IncidentWidget({
  href,
  resource,
}: {
  href: string;
  resource: HomeBoardResource<IssueList>;
}) {
  const { locale, t } = useI18n();
  return (
    <WidgetResource resource={resource}>
      {(data) => {
        const items = sortIssuesForQueue(data.items).slice(0, 3);
        if (items.length === 0) return <WidgetEmpty href={href} />;
        return (
          <div className="grid gap-2">
            {data.completeness === "exact" && data.visibility.completeness === "exact" ? null : (
              <p className="text-caption text-muted-foreground" role="status">
                {t("common.state.partial")}
              </p>
            )}
            <RankList
              ariaLabel={t("home.issue.list")}
              items={items.map((issue) => ({
                ariaLabel: issueTitle(issue),
                description: issueResourceLabel(issue) ?? t("home.issue.resourceUnknown"),
                displayValue: elapsedLabel(issue.updatedAt, locale),
                href,
                id: issue.id,
                indicator: "dot",
                label: issueTitle(issue),
                max: 1,
                tone: issueSeverityTone(issue.severity) ?? "unknown",
                value: null,
              }))}
            />
          </div>
        );
      }}
    </WidgetResource>
  );
}

export function SyncWidget({
  href,
  resource,
}: {
  href: string;
  resource: HomeBoardResource<HomeSyncSummary>;
}) {
  const { formatDate, formatNumber, t } = useI18n();
  return (
    <WidgetResource resource={resource}>
      {(data) => {
        if (data.known === 0 && data.repositories === 0) return <WidgetEmpty href={href} />;
        const syncedPercent = data.known > 0
          ? Math.round((data.synced / data.known) * 100)
          : null;
        return (
          <div className="grid gap-4">
            <RatioBar
              ariaLabel={t("workflows.sync.table.status")}
              segments={[
                { id: "synced", tone: "healthy", value: data.synced },
                { id: "out-of-sync", tone: "warning", value: data.outOfSync },
              ]}
            />
            <div className="grid grid-cols-2 gap-3">
              <Metric
                label={t("workflows.sync.status.synced")}
                value={syncedPercent === null ? "—" : `${formatNumber(syncedPercent)}%`}
              />
              <Metric
                label={t("workflows.sync.status.outOfSync")}
                value={formatNumber(data.outOfSync)}
              />
              <Metric
                label={t("shell.deploy.repositories")}
                value={formatNumber(data.repositories)}
              />
              <Metric
                label={t("common.freshness.updatedAt", { time: "" }).trim()}
                value={data.lastObservedAt
                  ? formatDate(new Date(data.lastObservedAt), {
                    dateStyle: "short",
                    timeStyle: "short",
                  })
                  : "—"}
              />
            </div>
          </div>
        );
      }}
    </WidgetResource>
  );
}

export function ActivityWidget({
  href,
  resource,
}: {
  href: string;
  resource: HomeBoardResource<HomeActivityOverview>;
}) {
  const { formatDate, t } = useI18n();
  return (
    <WidgetResource resource={resource}>
      {(data) => data.buckets.length === 0 ? <WidgetEmpty href={href} /> : (
        <MultiLine
          ariaLabel={t("timeline.toolbar.activity")}
          formatPoint={(index) => {
            const bucket = data.buckets[index];
            return bucket
              ? formatDate(bucket.toMs, { dateStyle: "short", timeStyle: "short" })
              : "—";
          }}
          labels={data.buckets.map((bucket) => String(bucket.toMs))}
          series={[
            {
              id: "deployments",
              label: t("shell.nav.deploy"),
              tone: "primary",
              values: data.buckets.map((bucket) => bucket.deployments),
            },
            {
              id: "alerts",
              label: t("alerts.title"),
              tone: "warning",
              values: data.buckets.map((bucket) => bucket.alerts),
            },
            {
              id: "critical",
              label: t("status.tone.critical"),
              tone: "critical",
              values: data.buckets.map((bucket) => bucket.critical),
            },
          ]}
        />
      )}
    </WidgetResource>
  );
}

export function WidgetResource<T>({
  children,
  resource,
}: {
  children: (data: T) => ReactNode;
  resource: HomeBoardResource<T>;
}) {
  const { t } = useI18n();
  if (resource.phase === "loading") {
    return (
      <div
        aria-busy="true"
        aria-label={t("common.state.loading")}
        aria-live="polite"
        className="grid gap-3"
        role="status"
      >
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
    );
  }
  if (resource.phase === "failed") {
    return (
      <div
        aria-live="assertive"
        className="grid min-h-28 place-items-center gap-3 text-center"
        role="alert"
      >
        <p className="text-body text-muted-foreground">{t("common.state.unavailable")}</p>
        <Button onClick={resource.retry} size="sm" type="button" variant="outline">
          {t("common.action.retry")}
        </Button>
      </div>
    );
  }
  return children(resource.data);
}

export function WidgetEmpty({ href }: { href: string }) {
  const { t } = useI18n();
  return (
    <div
      className="grid min-h-28 place-items-center gap-3 text-center text-body text-muted-foreground"
    >
      <span aria-live="polite" role="status">{t("common.state.empty")}</span>
      <Button nativeButton={false} render={<Link to={href} />} size="sm" variant="outline">
        {t("common.action.open")}
      </Button>
    </div>
  );
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="grid min-w-0 gap-1">
      <span className="text-caption text-caption-foreground">{label}</span>
      <strong className="truncate font-mono text-body-strong tabular-nums">{value}</strong>
    </span>
  );
}

function elapsedLabel(value: string | null, locale: string): string {
  if (!value) return "—";
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 1_000));
  if (!Number.isFinite(elapsedSeconds)) return "—";
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (elapsedSeconds < 3_600) return formatter.format(-Math.floor(elapsedSeconds / 60), "minute");
  if (elapsedSeconds < 86_400) return formatter.format(-Math.floor(elapsedSeconds / 3_600), "hour");
  return formatter.format(-Math.floor(elapsedSeconds / 86_400), "day");
}

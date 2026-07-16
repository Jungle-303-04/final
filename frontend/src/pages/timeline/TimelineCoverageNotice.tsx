import type { ReactNode } from "react";

import type { TimelineCoverage } from "../../features/timeline/timelineContract";
import { timelineCoverageKey } from "../../features/timeline/timelineCoverageIdentity";
import type { I18nController } from "../../shared/i18n";
import { TIMELINE_COVERAGE_REASON_LABEL, TIMELINE_SOURCE_LABEL } from "./timelineLabels";

export function TimelineCoverageNotice({
  coverage,
  formatDate,
  t,
}: {
  coverage: readonly TimelineCoverage[];
  formatDate: I18nController["formatDate"];
  t: I18nController["t"];
}) {
  if (coverage.length === 0) return null;

  return (
    <aside
      aria-atomic="true"
      aria-label={t("timeline.coverage.aria")}
      aria-live="polite"
      className="grid min-w-0 gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-muted-foreground dark:border-amber-400/40 dark:bg-amber-400/10"
      role="region"
    >
      <div className="grid min-w-0 gap-1">
        <h3 className="font-medium text-foreground">{t("timeline.coverage.title")}</h3>
        <p className="text-sm text-muted-foreground">{t("timeline.coverage.description")}</p>
      </div>
      <ol className="grid min-w-0 gap-2">
        {coverage.map((interval) => (
          <CoverageInterval
            coverage={interval}
            formatDate={formatDate}
            key={timelineCoverageKey(interval)}
            t={t}
          />
        ))}
      </ol>
    </aside>
  );
}

function CoverageInterval({
  coverage,
  formatDate,
  t,
}: {
  coverage: TimelineCoverage;
  formatDate: I18nController["formatDate"];
  t: I18nController["t"];
}) {
  const namespaces = coverage.scope.namespaces ?? [];
  const from = new Date(coverage.fromMs);
  const to = new Date(coverage.toMs);

  // Coverage is already authorized and filtered by the server. Re-filtering it
  // here could disclose or hide a gap relative to the snapshot it describes.
  return (
    <li
      className="grid min-w-0 gap-2 rounded-lg border border-amber-500/20 bg-background/60 p-3 break-words dark:border-amber-400/30 dark:bg-background/30"
      data-coverage-from={coverage.fromMs}
      data-coverage-to={coverage.toMs}
      data-timeline-coverage
    >
      <dl className="grid min-w-0 gap-x-4 gap-y-2 sm:grid-cols-[minmax(8rem,auto)_minmax(0,1fr)]">
        <CoverageRow label={t("timeline.details.source")}>{t(TIMELINE_SOURCE_LABEL[coverage.source])}</CoverageRow>
        <CoverageRow label={t("timeline.details.workspace")}>{coverage.scope.workspaceId}</CoverageRow>
        <CoverageRow label={t("timeline.details.cluster")}>{coverage.scope.clusterId}</CoverageRow>
        <CoverageRow label={t("timeline.details.namespaces")}>
          {namespaces.length > 0 ? namespaces.join(", ") : t("timeline.details.allNamespaces")}
        </CoverageRow>
        <CoverageRow label={t("timeline.coverage.interval")}>
          <time dateTime={from.toISOString()}>{formatDate(from, { dateStyle: "medium", timeStyle: "medium" })}</time>
          <span aria-hidden="true"> — </span>
          <time dateTime={to.toISOString()}>{formatDate(to, { dateStyle: "medium", timeStyle: "medium" })}</time>
        </CoverageRow>
        <CoverageRow label={t("timeline.coverage.reason")}>
          {t(TIMELINE_COVERAGE_REASON_LABEL[coverage.reason])}
        </CoverageRow>
      </dl>
    </li>
  );
}

function CoverageRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="contents">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-foreground">{children}</dd>
    </div>
  );
}

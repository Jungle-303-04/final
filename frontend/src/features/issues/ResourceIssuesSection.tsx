import { ChevronDown, Clock3, TriangleAlert } from "lucide-react";
import { Link } from "react-router-dom";

import { cn } from "@/shared/lib/cn";
import { useI18n } from "../../shared/i18n";
import { Badge } from "../../shared/ui/primitives/badge";
import { Skeleton } from "../../shared/ui/primitives/skeleton";
import type { ResourceIssuesFrame } from "../../pages/resources/useResourceIssuesDataFrame";
import { IssueStatusMark } from "./IssueStatusMark";
import {
  ISSUE_STATUS_MESSAGE,
  issueSeverityTone,
  issueStatusTone,
  issueTitle,
  sortIssuesForQueue,
} from "./issuePresentation";
import { humanizeFilterValue } from "../../shared/presentation/humanizeFilterValue";
import { serializeRouteSearch } from "../filters/routeSearchAdapter";

export function ResourceIssuesSection({ frame }: { frame: ResourceIssuesFrame }) {
  const { formatDate, t } = useI18n();
  if (frame.phase === "idle") return null;
  if (frame.phase === "loading") {
    return <Skeleton aria-label={t("resources.detail.issues.loading")} className="h-20 w-full" />;
  }
  if (frame.phase === "failed") {
    return (
      <section className="border-l-2 border-status-warning bg-status-warning/5 py-3 pl-3 pr-2" role="status">
        <h3 className="font-medium">{t("resources.detail.issues.title")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {frame.failure.code === "forbidden"
            ? t("resources.detail.issues.forbidden")
            : t("resources.detail.issues.failed")}
        </p>
      </section>
    );
  }
  if (frame.data.items.length === 0) return null;
  const issues = sortIssuesForQueue(frame.data.items);
  return (
    <section
      aria-labelledby="resource-issues-title"
      className="grid min-w-0 gap-3 border-y py-4"
      data-slot="resource-issues"
    >
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h3 className="font-heading font-semibold" id="resource-issues-title">
          {t("resources.detail.issues.count", { count: issues.length })}
        </h3>
        <Badge variant={frame.data.scope.freshness === "live" ? "secondary" : "outline"}>
          {t(`resources.detail.issues.freshness.${frame.data.scope.freshness}`)}
        </Badge>
      </header>
      {frame.data.hasMore ? (
        <p className="text-xs text-muted-foreground" role="status">
          {t("resources.detail.issues.bounded", { count: frame.data.limit })}
        </p>
      ) : null}
      <div className="divide-y border-y">
        {issues.map((issue) => {
          const tone = issueSeverityTone(issue.severity) ?? issueStatusTone(issue.status);
          const title = issueTitle(issue);
          const statusMessage = ISSUE_STATUS_MESSAGE[issue.status.trim().toLowerCase()];
          const statusLabel = statusMessage
            ? t(statusMessage)
            : humanizeFilterValue(issue.status);
          return (
            <details className="group min-w-0 overflow-hidden" key={issue.id}>
              <summary className="flex min-w-0 cursor-pointer list-none items-start gap-3 p-3 marker:content-none">
                <TriangleAlert aria-hidden="true" className={cn(
                  "mt-0.5 size-4 shrink-0 text-muted-foreground",
                  tone === "critical" && "text-destructive",
                  tone === "warning" && "text-status-warning",
                )} />
                <span className="grid min-w-0 flex-1 gap-1">
                  <span className="min-w-0 break-words text-sm font-medium">{title}</span>
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    {issue.severity ? (
                      <Badge variant={issue.severity === "critical" ? "destructive" : "warning"}>
                        {t(`issues.severity.${issue.severity}`)}
                      </Badge>
                    ) : null}
                    <IssueStatusMark label={statusLabel} tone={tone} />
                  </span>
                </span>
                <ChevronDown aria-hidden="true" className="mt-0.5 size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
              </summary>
              <div className="grid gap-2 border-t px-3 py-3 text-sm">
                {issue.rootCause ? (
                  <p className="break-words text-foreground/85">{issue.rootCause}</p>
                ) : null}
                <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock3 aria-hidden="true" className="size-3.5 shrink-0" />
                  <span>{t("resources.detail.issues.firstObserved")}</span>
                  <time dateTime={issue.onset.firstObservedAt}>
                    {formatDate(new Date(issue.onset.firstObservedAt))}
                  </time>
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("resources.detail.issues.timingUnavailable")}
                </p>
                {issue.clusterId && issue.incidentId ? (
                  <Link
                    className="w-fit text-xs font-medium text-primary underline-offset-4 hover:underline"
                    to={`/issues${serializeRouteSearch([
                      ["clusters", issue.clusterId],
                      ["detail", issue.incidentId],
                    ])}`}
                  >
                    {t("resources.detail.issues.open")}
                  </Link>
                ) : null}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

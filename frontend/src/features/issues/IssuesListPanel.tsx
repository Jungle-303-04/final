import {
  Bell,
  BrainCircuit,
  ChevronRight,
  CircleCheckBig,
  Clock3,
  Cuboid,
  Layers3,
  MapPin,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { Skeleton } from "../../shared/ui/primitives/skeleton";
import { humanizeFilterValue } from "../../shared/presentation/humanizeFilterValue";
import type { IssueList, IssueSummary } from "./issuesContract";
import { IssueStatusMark } from "./IssueStatusMark";
import {
  isResolvedIssue,
  issueEvidenceCount,
  issueResourceLabel,
  issueSeverityTone,
  issueStatusTone,
  issueTitle,
  sortIssuesForQueue,
} from "./issuePresentation";
import type { IssuesSurfaceCopy, SectionState } from "./issuesSurfaceContract";

export function IssuesListPanel({
  copy,
  detailRegionId,
  list,
  onSelect,
  selected,
}: {
  copy: IssuesSurfaceCopy;
  detailRegionId: string;
  list: SectionState<IssueList>;
  onSelect: (issue: IssueSummary) => void;
  selected: IssueSummary | null;
}) {
  if (list.data === null && list.loading) {
    return (
      <div className="grid gap-2 py-3" role="status">
        <span className="sr-only">{copy.listLoading}</span>
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    );
  }
  if (list.data === null && list.failure) {
    return (
      <div className="grid gap-1 py-4 text-sm text-destructive" role="alert">
        <span>{copy.genericFailure}</span>
        <span>{copy.failureDetail(list.failure.code)}</span>
      </div>
    );
  }
  if (list.data === null || list.data.items.length === 0) {
    const scope = list.data?.clusterId;
    const suffix = scope ? `?clusters=${encodeURIComponent(scope)}` : "";
    return (
      <div className="mx-auto grid max-w-md justify-items-center gap-2 px-4 py-12 text-center" role="status">
        <span className="grid size-10 place-items-center rounded-full bg-status-healthy/10 text-status-healthy">
          <CircleCheckBig aria-hidden="true" className="size-5" />
        </span>
        <p className="text-sm font-medium text-foreground">{copy.listEmpty}</p>
        <div className="mt-2 flex items-center gap-2">
          <Button render={<a href={`/resources${suffix}`} />} size="sm" variant="outline">
            <Cuboid aria-hidden="true" />
            {copy.listBrowseResources}
          </Button>
          <Button render={<a href={`/alerts${suffix}`} />} size="sm" variant="ghost">
            <Bell aria-hidden="true" />
            {copy.listBrowseAlerts}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="grid gap-3 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Badge variant="secondary">{copy.listCount(list.data.returned)}</Badge>
        {statusBreakdown(list.data.items).map(([status, count]) => (
          <Badge className="max-w-48" key={status} variant="outline">
            <IssueStatusMark label={copy.statusLabel(status)} labelMode="sr-only" tone={issueStatusTone(status)} />
            <span className="truncate">{copy.statusLabel(status)}</span>
            <span className="tabular-nums text-muted-foreground">{copy.listCount(count)}</span>
          </Badge>
        ))}
      </div>
      {list.data.excludedCount > 0 ? (
        <p className="text-sm text-muted-foreground" role="status">
          {copy.partial(list.data.excludedCount)}
        </p>
      ) : null}
      {list.failure ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="status">
          {copy.genericFailure} {copy.failureDetail(list.failure.code)}
        </p>
      ) : null}
      <ul className="grid gap-2" role="list">
        {sortIssuesForQueue(list.data.items).map((issue) => (
          <IssueQueueRow
            copy={copy}
            detailRegionId={detailRegionId}
            issue={issue}
            key={issue.id}
            onSelect={onSelect}
            selected={selected?.id === issue.id}
          />
        ))}
      </ul>
    </div>
  );
}

function IssueQueueRow({
  copy,
  detailRegionId,
  issue,
  onSelect,
  selected,
}: {
  copy: IssuesSurfaceCopy;
  detailRegionId: string;
  issue: IssueSummary;
  onSelect: (issue: IssueSummary) => void;
  selected: boolean;
}) {
  const title = issueTitle(issue);
  const resource = issueResourceLabel(issue);
  const evidenceCount = issueEvidenceCount(issue);
  const missingCount = issue.missingEvidence?.length ?? null;
  const resolved = isResolvedIssue(issue.status);
  const tone = issueSeverityTone(issue.severity) ?? issueStatusTone(issue.status);
  const confidence = issue.confidence === null
    ? null
    : `${Math.round(issue.confidence * 100)}%`;
  const updatedAt = issue.updatedAt === null ? null : copy.auditTime(issue.updatedAt);

  return (
    <li>
      <Button
        aria-controls={selected ? detailRegionId : undefined}
        aria-current={selected ? "true" : undefined}
        aria-label={title}
        className={cn(
          "group/issue h-auto w-full min-w-0 items-stretch justify-start overflow-hidden whitespace-normal rounded-xl border border-border/80 bg-card p-0 text-left shadow-xs transition-[border-color,box-shadow,background-color,opacity] hover:border-foreground/20 hover:bg-card hover:shadow-sm",
          selected && "border-primary/50 bg-primary/[0.035] shadow-sm ring-1 ring-primary/20",
          resolved && !selected && "opacity-65 hover:opacity-100",
        )}
        onClick={() => onSelect(issue)}
        type="button"
        variant="ghost"
      >
        <span
          aria-hidden="true"
          className={cn(
            "w-1 shrink-0 bg-status-unknown",
            tone === "healthy" && "bg-status-healthy",
            tone === "warning" && "bg-status-warning",
            tone === "critical" && "bg-destructive",
          )}
        />
        <span className="grid min-w-0 flex-1 gap-2 px-3 py-3">
          <span className="flex min-w-0 items-start gap-3">
            <span className="grid min-w-0 flex-1 gap-1">
              <span className="line-clamp-2 break-words text-sm font-semibold leading-snug text-foreground">
                {title}
              </span>
              {resource !== null ? (
                <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <Layers3 aria-hidden="true" className="size-3.5 shrink-0" />
                  <span className="truncate" title={resource}>{resource}</span>
                </span>
              ) : null}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {issue.severity ? (
                <Badge variant={issue.severity === "critical" ? "destructive" : "warning"}>
                  {copy.severityLabel(issue.severity)}
                </Badge>
              ) : null}
              <IssueStatusMark label={copy.statusLabel(issue.status)} tone={tone} />
              <ChevronRight
                aria-hidden="true"
                className={cn(
                  "size-4 text-muted-foreground transition-transform group-hover/issue:translate-x-0.5",
                  selected && "text-primary",
                )}
              />
            </span>
          </span>

          {issue.rootCause ? (
            <span className="flex min-w-0 items-start gap-1.5 rounded-md bg-muted/60 px-2 py-1.5 text-xs leading-relaxed text-foreground/85">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-status-warning" />
              <span className="line-clamp-2 break-words">{copy.causeLabel(issue.rootCause)}</span>
            </span>
          ) : null}

          {issue.errorReason ? (
            <span className="flex min-w-0 items-start gap-1.5 rounded-md border border-status-warning/25 bg-status-warning/5 px-2 py-1.5 text-xs leading-relaxed text-foreground/80">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-status-warning" />
              <span className="line-clamp-2 break-words" title={issue.errorReason}>
                {humanizeFilterValue(issue.errorReason)}
              </span>
            </span>
          ) : null}

          <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {issue.clusterId ? (
              <span className="flex min-w-0 items-center gap-1">
                <MapPin aria-hidden="true" className="size-3 shrink-0" />
                <span className="max-w-40 truncate">{issue.clusterId}</span>
              </span>
            ) : null}
            {confidence !== null ? (
              <span className="flex items-center gap-1" title={copy.confidence}>
                <BrainCircuit aria-hidden="true" className="size-3" />
                <span className="tabular-nums">{confidence}</span>
              </span>
            ) : null}
            {evidenceCount !== null ? (
              <span className="tabular-nums" title={copy.supportingEvidence}>
                {copy.supportingEvidence} {copy.listCount(evidenceCount)}
              </span>
            ) : null}
            {missingCount !== null && missingCount > 0 ? (
              <span className="text-status-warning tabular-nums" title={copy.missingEvidence}>
                {copy.missingEvidence} {copy.listCount(missingCount)}
              </span>
            ) : null}
            {updatedAt !== null ? (
              <time
                className="ml-auto flex items-center gap-1 tabular-nums"
                dateTime={issue.updatedAt ?? undefined}
                title={copy.updated}
              >
                <Clock3 aria-hidden="true" className="size-3" />
                {updatedAt}
              </time>
            ) : null}
          </span>
        </span>
      </Button>
    </li>
  );
}

function statusBreakdown(items: readonly IssueSummary[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const status = item.status.trim() || "unknown";
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => {
    const toneRank = { critical: 0, warning: 1, unknown: 2, stale: 3, healthy: 4 } as const;
    const toneOrder = toneRank[issueStatusTone(a[0])] - toneRank[issueStatusTone(b[0])];
    return toneOrder || b[1] - a[1] || a[0].localeCompare(b[0]);
  });
}

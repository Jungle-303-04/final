import { Bell, Check, CircleCheckBig, CircleDot, Cuboid } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { cn } from "@/shared/lib/cn";
import { Badge } from "../../shared/ui/primitives/badge";
import { buttonVariants } from "../../shared/ui/primitives/button";
import { Skeleton } from "../../shared/ui/primitives/skeleton";
import type { IssueList, IssueSummary } from "./issuesContract";
import type { IssuesSurfaceCopy, SectionState } from "./issuesSurfaceContract";
import { isResolvedIssue } from "./issuePresentation";
import {
  IssueSeverityFilterSelect,
  IssueStateTab,
  VisibilityNotice,
} from "./IssuesListControls";
import { IssueQueueRow } from "./IssueQueueRow";
import {
  filterIssuesBySeverity,
  sortIssuesByUpdatedAt,
  type IssueSeverityFilter,
} from "./issuesListPresentation";

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
  const [activeState, setActiveState] = useState<"open" | "closed">("open");
  const [severityFilter, setSeverityFilter] = useState<IssueSeverityFilter>("all");

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
    const visibilityState = list.data?.visibility?.state ?? "unknown";
    if (visibilityState === "partial" || visibilityState === "restricted") {
      return <VisibilityNotice copy={copy} state={visibilityState} />;
    }
    const scope = list.data?.clusterId;
    const suffix = scope ? `?clusters=${encodeURIComponent(scope)}` : "";
    return (
      <div className="mx-auto grid max-w-md justify-items-center gap-2 px-4 py-12 text-center" role="status">
        <span className="grid size-10 place-items-center rounded-full bg-status-healthy/10 text-status-healthy">
          <CircleCheckBig aria-hidden="true" className="size-5" />
        </span>
        <p className="text-sm font-medium text-foreground">{copy.listEmpty}</p>
        <div className="mt-2 flex items-center gap-2">
          <a className={cn(buttonVariants({ size: "sm", variant: "outline" }), "cursor-pointer")} href={`/resources${suffix}`} onClick={(event) => openProductHref(event, `/resources${suffix}`)}>
            <Cuboid aria-hidden="true" />
            {copy.listBrowseResources}
          </a>
          <a className={cn(buttonVariants({ size: "sm", variant: "ghost" }), "cursor-pointer")} href={`/alerts${suffix}`} onClick={(event) => openProductHref(event, `/alerts${suffix}`)}>
            <Bell aria-hidden="true" />
            {copy.listBrowseAlerts}
          </a>
        </div>
      </div>
    );
  }
  const total = list.data.total ?? list.data.returned;
  const totalMatched = list.data.totalMatched ?? total;
  const visibilityState = list.data.visibility?.state ?? "unknown";
  const openIssues = sortIssuesByUpdatedAt(list.data.items.filter((issue) => !isResolvedIssue(issue.status)));
  const closedIssues = sortIssuesByUpdatedAt(list.data.items.filter((issue) => isResolvedIssue(issue.status)));
  const visibleIssues = activeState === "open" ? openIssues : closedIssues;
  const filteredIssues = filterIssuesBySeverity(visibleIssues, severityFilter);

  return (
    <div className="grid gap-3 py-3">
      <div className="flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto border-b px-1 pb-2 text-sm">
        <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-muted/70 p-0.5">
          <IssueStateTab
            active={activeState === "open"}
            count={openIssues.length}
            icon={<CircleDot aria-hidden="true" className="size-4" />}
            label={copy.lifecycleOpen}
            onClick={() => setActiveState("open")}
          />
          <IssueStateTab
            active={activeState === "closed"}
            count={closedIssues.length}
            icon={<Check aria-hidden="true" className="size-4" />}
            label={copy.lifecycleClosed}
            onClick={() => setActiveState("closed")}
          />
        </div>
        <Badge variant="secondary">
          {totalMatched > total
            ? copy.listMatchedCount(total, totalMatched)
            : copy.listCount(total)}
        </Badge>
        <IssueSeverityFilterSelect
          copy={copy}
          onValueChange={setSeverityFilter}
          value={severityFilter}
        />
      </div>
      {visibilityState === "partial" || visibilityState === "restricted" ? (
        <VisibilityNotice copy={copy} state={visibilityState} />
      ) : null}
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
      {filteredIssues.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground" role="status">
          {copy.listEmpty}
        </p>
      ) : (
        <ul className="divide-y" role="list">
          {filteredIssues.map((issue) => (
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
      )}
    </div>
  );
}

function openProductHref(event: MouseEvent<HTMLAnchorElement>, href: string): void {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  window.history.pushState(null, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

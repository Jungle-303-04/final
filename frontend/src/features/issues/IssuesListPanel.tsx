import { cn } from "@/shared/lib/cn";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { Skeleton } from "../../shared/ui/primitives/skeleton";
import type { IssueList, IssueSummary } from "./issuesContract";
import type { IssuesSurfaceCopy, SectionState } from "./issuesSurfaceContract";

/** 상태 문자열을 모니터링 톤(빨강·앰버·초록)으로 매핑한다. */
function statusDotClass(status: string): string {
  const value = status.toLowerCase();
  if (/(resolv|recover|healthy|closed|정상|해소|복구)/.test(value)) return "bg-status-healthy";
  if (/(fire|firing|detect|active|open|crash|error|장애|발생|감지)/.test(value)) return "bg-destructive";
  return "bg-status-warning";
}

function targetLabel(issue: IssueSummary): string | null {
  const location =
    issue.namespace && issue.resourceName
      ? `${issue.namespace}/${issue.resourceName}`
      : (issue.resourceName ?? issue.namespace);
  const parts = [issue.resourceKind, location].filter(
    (value): value is string => Boolean(value),
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

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
    return <p className="py-4 text-sm text-muted-foreground">{copy.listEmpty}</p>;
  }
  return (
    <div className="grid gap-2 py-2">
      {list.data.excludedCount > 0 ? (
        <p className="text-sm text-muted-foreground" role="status">
          {copy.partial(list.data.excludedCount)}
        </p>
      ) : null}
      <ul className="grid gap-2">
        {list.data.items.map((issue) => (
          <li key={issue.id}>
            <Button
              aria-controls={selected?.id === issue.id ? detailRegionId : undefined}
              aria-current={selected?.id === issue.id ? "true" : undefined}
              className="h-auto w-full min-w-0 items-start justify-start whitespace-normal rounded-lg border px-3 py-2.5 text-left"
              disabled={issue.incidentId === null}
              onClick={() => onSelect(issue)}
              type="button"
              variant={selected?.id === issue.id ? "secondary" : "ghost"}
            >
              <span className="grid w-full min-w-0 gap-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={cn("size-2 shrink-0 rounded-full", statusDotClass(issue.status))}
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {issue.symptom ?? issue.currentSubject}
                  </span>
                  {issue.updatedAt ? (
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {copy.auditTime(issue.updatedAt)}
                    </span>
                  ) : null}
                </span>
                <span className="flex min-w-0 items-center gap-2 pl-4">
                  {targetLabel(issue) ? (
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={targetLabel(issue) ?? undefined}>
                      {targetLabel(issue)}
                    </span>
                  ) : <span className="min-w-0 flex-1" />}
                  {issue.confidence !== null ? (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {Math.round(issue.confidence * 100)}%
                    </span>
                  ) : null}
                  <Badge className="shrink-0" variant="outline">{issue.status}</Badge>
                </span>
              </span>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

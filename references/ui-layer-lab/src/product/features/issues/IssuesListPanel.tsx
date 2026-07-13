import { Button } from "../../shared/ui/primitives/button";
import { Skeleton } from "../../shared/ui/primitives/skeleton";
import type { IssueList, IssueSummary } from "./issuesContract";
import type { IssuesSurfaceCopy, SectionState } from "./issuesSurfaceContract";

export function IssuesListPanel({
  copy,
  list,
  onSelect,
  selected,
}: {
  copy: IssuesSurfaceCopy;
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
              className="h-auto w-full min-w-0 justify-start whitespace-normal px-3 py-3 text-left"
              disabled={issue.incidentId === null}
              onClick={() => onSelect(issue)}
              type="button"
              variant={selected?.id === issue.id ? "secondary" : "ghost"}
            >
              <span className="min-w-0 break-words">
                {issue.symptom ?? issue.currentSubject}
              </span>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

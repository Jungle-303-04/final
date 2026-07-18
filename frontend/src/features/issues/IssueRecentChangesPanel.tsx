import { ArrowLeft, ArrowRight, CircleAlert, ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../shared/ui/primitives/card";
import type { IssueRecentChanges } from "./issuesContract";
import type { IssuesSurfaceCopy, SectionState } from "./issuesSurfaceContract";

export function IssueRecentChangesPanel({
  copy,
  state,
}: {
  copy: IssuesSurfaceCopy;
  state: SectionState<IssueRecentChanges>;
}) {
  const hasChanges = state.data !== null && state.data.items.length > 0;
  if (!hasChanges && state.failure === null) return null;

  return (
    <Card
      aria-label={copy.recentChangesLabel}
      className="gap-0 py-0"
      data-testid="issue-recent-changes"
      role="region"
    >
      <CardHeader className="border-b bg-muted/45 p-4">
        <CardTitle>{copy.recentChangesLabel}</CardTitle>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-3 p-4">
        {state.failure ? (
          <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-2 text-sm text-destructive">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <div className="grid min-w-0 gap-1">
              <p className="font-medium">{copy.recentChangesUnavailable}</p>
              <p className="break-words text-xs">{copy.failureDetail(state.failure.code)}</p>
            </div>
          </div>
        ) : null}
        {hasChanges ? (
          <ul className="grid min-w-0 gap-3">
            {state.data?.items.map((change) => (
              <li
                className="grid min-w-0 gap-3 border-b pb-4 last:border-b-0 last:pb-0"
                key={change.eventId}
              >
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 break-words font-medium">
                    {change.namespace} / {change.resourceKind} / {change.resourceName}
                  </p>
                  <time
                    className="min-w-0 break-all text-right text-xs text-muted-foreground"
                    dateTime={change.changedAt}
                  >
                    {copy.recentChangesTime(change.changedAt)}
                  </time>
                </div>
                {change.imageBefore !== null || change.imageAfter !== null ? (
                  <dl className="grid min-w-0 gap-2 rounded-md bg-muted/35 p-3">
                    <RecentImageFact
                      icon={<ArrowLeft aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />}
                      label={copy.recentChangesImageBeforeLabel}
                      value={change.imageBefore}
                    />
                    <RecentImageFact
                      icon={<ArrowRight aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />}
                      label={copy.recentChangesImageAfterLabel}
                      value={change.imageAfter}
                    />
                  </dl>
                ) : null}
                <dl className="grid min-w-0 border-t text-sm">
                  <RecentChangeFact
                    label={copy.recentChangesCommitLabel}
                    short
                    value={change.commitSha}
                  />
                  <div className="grid min-w-0 grid-cols-[6.5rem_minmax(0,1fr)] gap-3 border-b py-2 last:border-b-0">
                    <dt className="text-xs text-muted-foreground">
                      {copy.recentChangesRepositoryLabel}
                    </dt>
                    <dd className="flex min-w-0 items-center gap-2">
                      <span
                        className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                        title={change.repoRef ?? undefined}
                      >
                        {change.repoRef}
                      </span>
                      <span className="min-w-0 truncate" title={change.repositoryId ?? undefined}>
                        {change.repositoryId}
                      </span>
                    </dd>
                  </div>
                  <RecentChangeFact
                    label={copy.recentChangesWorkflowLabel}
                    value={change.workflowRunId}
                  />
                </dl>
                {change.pullRequestUrl !== null ? (
                  <a
                    className="inline-flex min-w-0 items-center gap-1.5 justify-self-end break-all text-sm font-medium underline underline-offset-4"
                    href={change.pullRequestUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
                    <span className="min-w-0 break-all">{copy.recentChangesPullRequest}</span>
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RecentChangeFact({
  label,
  value,
  short = false,
}: {
  label: string;
  value: string | null;
  /** 커밋 해시처럼 앞 7자만 보여주고 나머지는 호버로 확인 */
  short?: boolean;
}) {
  if (value === null) return null;
  const display = short && value.length > 10 ? value.slice(0, 7) : value;
  return (
    <div className="grid min-w-0 grid-cols-[6.5rem_minmax(0,1fr)] gap-3 border-b py-2 last:border-b-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate" title={value}>
        {display}
      </dd>
    </div>
  );
}

function RecentImageFact({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string | null;
}) {
  if (value === null) return null;
  return (
    <div className="grid min-w-0 grid-cols-[auto_5.5rem_minmax(0,1fr)] gap-2">
      <dt className="contents">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </dt>
      <dd className="min-w-0 break-all text-xs leading-relaxed" title={value}>{value}</dd>
    </div>
  );
}

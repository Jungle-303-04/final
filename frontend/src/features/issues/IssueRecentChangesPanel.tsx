import { CircleAlert, ExternalLink } from "lucide-react";
import { cn } from "@/shared/lib/cn";
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
          <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-2 text-sm text-[#F74720]">
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
                <div className="grid min-w-0 gap-1">
                  <p className="min-w-0 break-all font-medium">
                    {change.namespace} / {change.resourceKind} / {change.resourceName}
                  </p>
                  <time
                    className="min-w-0 break-all text-sm text-muted-foreground"
                    dateTime={change.changedAt}
                  >
                    {copy.recentChangesTime(change.changedAt)}
                  </time>
                </div>
                {change.imageBefore !== null || change.imageAfter !== null ? (
                  <dl className="grid min-w-0 gap-2 sm:grid-cols-2">
                    <RecentChangeFact
                      label={copy.recentChangesImageBeforeLabel}
                      mono
                      value={change.imageBefore}
                    />
                    <RecentChangeFact
                      label={copy.recentChangesImageAfterLabel}
                      mono
                      value={change.imageAfter}
                    />
                  </dl>
                ) : null}
                <dl className="grid min-w-0 gap-2 sm:grid-cols-3">
                  <RecentChangeFact
                    label={copy.recentChangesCommitLabel}
                    mono
                    short
                    value={change.commitSha}
                  />
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">
                      {copy.recentChangesRepositoryLabel}
                    </dt>
                    <dd className="grid min-w-0 gap-0.5">
                      <span className="min-w-0 truncate" title={change.repositoryId ?? undefined}>
                        {change.repositoryId}
                      </span>
                      <span
                        className="min-w-0 truncate text-muted-foreground"
                        title={change.repoRef ?? undefined}
                      >
                        {change.repoRef}
                      </span>
                    </dd>
                  </div>
                  <RecentChangeFact
                    label={copy.recentChangesWorkflowLabel}
                    mono
                    value={change.workflowRunId}
                  />
                </dl>
                {change.pullRequestUrl !== null ? (
                  <a
                    className="inline-flex min-w-0 items-center gap-1.5 justify-self-start break-all text-sm font-medium underline underline-offset-4"
                    href={change.pullRequestUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <ExternalLink aria-hidden="true" className="shrink-0" />
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
  mono = false,
  short = false,
}: {
  label: string;
  value: string | null;
  /** 해시·태그처럼 고정폭이 어울리는 값 */
  mono?: boolean;
  /** 커밋 해시처럼 앞 7자만 보여주고 나머지는 호버로 확인 */
  short?: boolean;
}) {
  if (value === null) return null;
  const display = short && value.length > 10 ? value.slice(0, 7) : value;
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 truncate", mono && "font-mono text-sm")} title={value}>
        {display}
      </dd>
    </div>
  );
}

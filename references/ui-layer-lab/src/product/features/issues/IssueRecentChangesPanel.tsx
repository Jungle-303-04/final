import { CircleAlert, ExternalLink } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "../../shared/ui/primitives/alert";
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
      data-testid="issue-recent-changes"
      role="region"
    >
      <CardHeader className="border-b">
        <CardTitle>{copy.recentChangesLabel}</CardTitle>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-3">
        {state.failure ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>{copy.recentChangesUnavailable}</AlertTitle>
            <AlertDescription>{copy.failureDetail(state.failure.code)}</AlertDescription>
          </Alert>
        ) : null}
        {hasChanges ? (
          <ul className="grid min-w-0 gap-3">
            {state.data?.items.map((change) => (
              <li
                className="grid min-w-0 gap-3 rounded-lg border p-3"
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
                      value={change.imageBefore}
                    />
                    <RecentChangeFact
                      label={copy.recentChangesImageAfterLabel}
                      value={change.imageAfter}
                    />
                  </dl>
                ) : null}
                <dl className="grid min-w-0 gap-2 sm:grid-cols-3">
                  <RecentChangeFact
                    label={copy.recentChangesCommitLabel}
                    value={change.commitSha}
                  />
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">
                      {copy.recentChangesRepositoryLabel}
                    </dt>
                    <dd className="grid min-w-0 gap-0.5">
                      <span className="min-w-0 break-all">{change.repositoryId}</span>
                      <span className="min-w-0 break-all text-muted-foreground">
                        {change.repoRef}
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
}: {
  label: string;
  value: string | null;
}) {
  if (value === null) return null;
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-all">{value}</dd>
    </div>
  );
}

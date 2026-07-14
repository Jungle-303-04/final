import { GitCommitHorizontal, GitPullRequestArrow, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../../shared/i18n";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { StatusMark } from "../../shared/ui/StatusMark";
import { Surface } from "../../shared/ui/Surface";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { Skeleton } from "../../shared/ui/primitives/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../shared/ui/primitives/table";
import { applicationsGitOpsCopy } from "./applicationsGitOpsCopy";
import type {
  ApplicationSummary,
  ApplicationsGitOpsPort,
  DeploymentTarget,
  WorkflowRunSummary,
} from "./applicationsGitOpsContract";
import { applicationStatusTone, SurfaceFailure } from "./ApplicationsSurface";
import { useApplicationsCatalog, useGitOpsSnapshot } from "./useApplicationsGitOpsData";

export function GitOpsSurface({ port }: { port: ApplicationsGitOpsPort }) {
  const { locale } = useI18n();
  const copy = applicationsGitOpsCopy(locale);
  const [catalog, refreshCatalog] = useApplicationsCatalog(port);
  const [requestedApplicationId, setRequestedApplicationId] = useState<string | null>(null);
  const applications = catalog.phase === "ready" ? catalog.data.applications : [];
  const selectedId = applications.some(
    (application) => application.id === requestedApplicationId,
  )
    ? requestedApplicationId
    : applications[0]?.id ?? null;

  const [snapshot, refreshSnapshot] = useGitOpsSnapshot(port, selectedId);
  if (catalog.phase === "loading") {
    return <ProductStateScreen kind="loading" placement="content" />;
  }
  if (catalog.phase === "failed") {
    return <SurfaceFailure failure={catalog.failure} onRetry={refreshCatalog} />;
  }

  const selected = applications.find((application) => application.id === selectedId) ?? null;
  const refreshing = catalog.refreshing || (snapshot.phase === "ready" && snapshot.refreshing);
  const refresh = () => {
    refreshCatalog();
    refreshSnapshot();
  };

  return (
    <ProductPageFrame>
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <h2 className="text-2xl font-semibold tracking-tight">{copy.gitops.title}</h2>
          <p className="text-sm text-muted-foreground">{copy.gitops.description}</p>
        </div>
        <Button
          aria-label={copy.common.refresh}
          disabled={refreshing}
          onClick={refresh}
          size="icon"
          type="button"
          variant="outline"
        >
          <RefreshCw aria-hidden="true" className={refreshing ? "motion-safe:animate-spin" : undefined} />
        </Button>
      </header>

      {applications.length === 0 ? (
        <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          {copy.applications.empty}
        </p>
      ) : (
        <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <ApplicationPicker
            applications={applications}
            onSelect={setRequestedApplicationId}
            selectedId={selectedId}
          />
          <div className="grid min-w-0 gap-4">
            {selected ? <SelectedApplicationHeader application={selected} /> : null}
            {snapshot.phase === "loading" ? <GitOpsLoading /> : null}
            {snapshot.phase === "failed" ? (
              <SurfaceFailure failure={snapshot.failure} onRetry={refreshSnapshot} />
            ) : null}
            {snapshot.phase === "ready" && snapshot.data ? (
              <>
                <DeploymentPanel deployments={snapshot.data.deployments} />
                <WorkflowPanel runs={snapshot.data.runs} />
              </>
            ) : null}
          </div>
        </div>
      )}
    </ProductPageFrame>
  );
}

function ApplicationPicker({
  applications,
  onSelect,
  selectedId,
}: {
  applications: readonly ApplicationSummary[];
  onSelect: (applicationId: string) => void;
  selectedId: string | null;
}) {
  const { locale } = useI18n();
  const copy = applicationsGitOpsCopy(locale);
  return (
    <Surface aria-labelledby="gitops-application-list-title" className="min-w-0 p-2">
      <h3 className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground" id="gitops-application-list-title">
        {copy.gitops.applicationList}
      </h3>
      <ul className="grid gap-1">
        {applications.map((application) => (
          <li key={application.id}>
            <Button
              aria-pressed={selectedId === application.id}
              className="h-auto w-full min-w-0 justify-start px-2 py-2 text-left"
              onClick={() => onSelect(application.id)}
              type="button"
              variant={selectedId === application.id ? "secondary" : "ghost"}
            >
              <span className="min-w-0 truncate">{application.name}</span>
            </Button>
          </li>
        ))}
      </ul>
    </Surface>
  );
}

function SelectedApplicationHeader({ application }: { application: ApplicationSummary }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-4 py-3">
      <div className="min-w-0">
        <h3 className="truncate font-medium">{application.name}</h3>
        <p className="truncate font-mono text-xs text-muted-foreground">{application.id}</p>
      </div>
      <StatusMark label={application.status ?? undefined} tone={applicationStatusTone(application.status)} />
    </div>
  );
}

function GitOpsLoading() {
  return (
    <div className="grid gap-4" role="status">
      <span className="sr-only">Loading GitOps data</span>
      <Skeleton className="h-40" />
      <Skeleton className="h-56" />
    </div>
  );
}

function DeploymentPanel({ deployments }: { deployments: readonly DeploymentTarget[] }) {
  const { locale } = useI18n();
  const copy = applicationsGitOpsCopy(locale);
  return (
    <Surface aria-labelledby="gitops-deployments-title" className="min-w-0 overflow-hidden">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <GitPullRequestArrow aria-hidden="true" className="size-4 text-muted-foreground" />
        <h3 className="font-medium" id="gitops-deployments-title">{copy.gitops.deployments}</h3>
        <Badge className="ml-auto" variant="secondary">{deployments.length}</Badge>
      </div>
      {deployments.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">{copy.gitops.emptyDeployments}</p>
      ) : (
        <Table scrollAreaLabel={copy.gitops.deployments}>
          <TableHeader>
            <TableRow>
              <TableHead>{copy.gitops.cluster}</TableHead>
              <TableHead>{copy.gitops.namespace}</TableHead>
              <TableHead>{copy.gitops.environment}</TableHead>
              <TableHead>{copy.gitops.poll}</TableHead>
              <TableHead>{copy.gitops.revision}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deployments.map((deployment) => (
              <TableRow key={deployment.id}>
                <TableCell>{value(deployment.clusterId, copy.common.unavailable)}</TableCell>
                <TableCell>{value(deployment.namespace, copy.common.unavailable)}</TableCell>
                <TableCell>{value(deployment.environment, copy.common.unavailable)}</TableCell>
                <TableCell>
                  <StatusMark label={deployment.pollStatus ?? copy.common.unknown} tone={applicationStatusTone(deployment.pollStatus)} />
                </TableCell>
                <TableCell className="max-w-48 truncate font-mono text-xs" title={deployment.lastCommitSha ?? undefined}>
                  {value(deployment.lastCommitSha, copy.common.unavailable)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Surface>
  );
}

function WorkflowPanel({ runs }: { runs: readonly WorkflowRunSummary[] }) {
  const { formatDate, locale } = useI18n();
  const copy = applicationsGitOpsCopy(locale);
  return (
    <Surface aria-labelledby="gitops-runs-title" className="min-w-0 overflow-hidden">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <GitCommitHorizontal aria-hidden="true" className="size-4 text-muted-foreground" />
        <h3 className="font-medium" id="gitops-runs-title">{copy.gitops.runs}</h3>
        <Badge className="ml-auto" variant="secondary">{runs.length}</Badge>
      </div>
      {runs.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">{copy.gitops.emptyRuns}</p>
      ) : (
        <Table scrollAreaLabel={copy.gitops.runs}>
          <TableHeader>
            <TableRow>
              <TableHead>{copy.gitops.workflow}</TableHead>
              <TableHead>{copy.applications.status}</TableHead>
              <TableHead>{copy.gitops.step}</TableHead>
              <TableHead>{copy.gitops.promotion}</TableHead>
              <TableHead>{copy.gitops.observed}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run) => (
              <TableRow key={run.id}>
                <TableCell className="max-w-52 truncate font-mono text-xs" title={run.id}>{run.id}</TableCell>
                <TableCell>
                  <StatusMark label={run.status ?? copy.common.unknown} tone={applicationStatusTone(run.status)} />
                </TableCell>
                <TableCell>{value(run.currentStep, copy.common.unavailable)}</TableCell>
                <TableCell>
                  <Badge variant={run.promotionGate === "blocked" ? "destructive" : run.promotionGate === "eligible" ? "default" : "outline"}>
                    {copy.gitops[run.promotionGate]}
                  </Badge>
                </TableCell>
                <TableCell>{formatObserved(run.updatedAt, formatDate, copy.common.unavailable)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Surface>
  );
}

function value(candidate: string | null, unavailable: string): string {
  return candidate ?? unavailable;
}

function formatObserved(
  timestamp: string | null,
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string,
  unavailable: string,
): string {
  if (timestamp === null) return unavailable;
  const value = Date.parse(timestamp);
  if (Number.isNaN(value)) return unavailable;
  return formatDate(value, { dateStyle: "medium", timeStyle: "short" });
}

import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { useI18n } from "../../shared/i18n";
import { StatusMark } from "../../shared/ui/StatusMark";
import { Button } from "../../shared/ui/primitives/button";
import { Card, CardContent } from "../../shared/ui/primitives/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../shared/ui/primitives/table";
import { ApplicationsFailureState } from "./ApplicationsState";
import { applicationsCopy } from "../../shared/i18n/applicationSurfaceCopy";
import { OverflowIdentity } from "../../shared/ui/OverflowIdentity";
import type { ApplicationsResource } from "./useApplicationsData";
import type { ApplicationDeploymentModel } from "./applicationsContract";
import { applicationStatusTone, formatObservedTime } from "./applicationPresentation";

export function ApplicationDeploymentsPanel({
  hrefForChange,
  resource,
  retry,
}: {
  hrefForChange: (changeId: string) => string;
  resource: ApplicationsResource<readonly ApplicationDeploymentModel[] | null>;
  retry: () => void;
}) {
  const { locale, t } = useI18n();
  const copy = applicationsCopy(t);
  if (resource.phase === "loading") return <p className="p-6 text-sm text-muted-foreground">{copy.loading}</p>;
  if (resource.phase === "failed") return <ApplicationsFailureState failure={resource.failure} onRetry={retry} />;
  const deployments = resource.data ?? [];
  if (deployments.length === 0) {
    return <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">{copy.noDeployments}</p>;
  }
  return (
    <Card>
      <CardContent className="p-0">
        <Table scrollAreaLabel={copy.deployments}>
          <TableHeader><TableRow>
            <TableHead>{copy.time}</TableHead><TableHead>{copy.environment}</TableHead>
            <TableHead>{copy.version}</TableHead><TableHead>{copy.gitSha}</TableHead>
            <TableHead>{copy.actor}</TableHead><TableHead>{copy.status}</TableHead>
            <TableHead><span className="sr-only">GitOps</span></TableHead>
          </TableRow></TableHeader>
          <TableBody>{deployments.map((deployment) => (
            <TableRow key={deployment.id}>
              <TableCell>{formatObservedTime(deployment.deployedAt, locale) ?? copy.unavailable}</TableCell>
              <TableCell>{deployment.environment ?? copy.unavailable}</TableCell>
              <TableCell>{deployment.version ?? copy.unavailable}</TableCell>
              <TableCell className="max-w-44 font-mono text-xs">
                {deployment.gitSha ? <OverflowIdentity value={deployment.gitSha} /> : copy.unavailable}
              </TableCell>
              <TableCell>{deployment.deployedBy ?? copy.unavailable}</TableCell>
              <TableCell><StatusMark label={deployment.status ?? copy.unknown} tone={applicationStatusTone(deployment.status)} /></TableCell>
              <TableCell>{deployment.gitOpsChangeId ? (
                <Button render={<Link to={hrefForChange(deployment.gitOpsChangeId)} />} size="sm" variant="ghost">
                  {copy.gitOpsChange}<ExternalLink aria-hidden="true" />
                </Button>
              ) : null}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

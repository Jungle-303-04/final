import { Boxes } from "lucide-react";
import { useI18n } from "../../shared/i18n";
import { StatusMark } from "../../shared/ui/StatusMark";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../shared/ui/primitives/table";
import { applicationsCopy } from "../../shared/i18n/applicationSurfaceCopy";
import type { ApplicationCardModel } from "./applicationsContract";
import { applicationStatusTone } from "./applicationPresentation";
import {
  ApplicationBatchRuntimeChannel,
  ApplicationDeploymentChannel,
  ApplicationDeliveryStateChannel,
  ApplicationDriftChannel,
  ApplicationIncidentChannel,
  ApplicationReadyBar,
} from "./ApplicationCatalogSignals";

export function ApplicationsTable({
  applications,
  onOpen,
}: {
  applications: readonly ApplicationCardModel[];
  onOpen: (applicationId: string) => void;
}) {
  const { locale } = useI18n();
  const copy = applicationsCopy(locale);
  const deliveryLabels = {
    succeeded: copy.deliverySucceeded,
    failed: copy.deliveryFailed,
    running: copy.deliveryRunning,
    pending: copy.deliveryPending,
    unknown: copy.deliveryUnknown,
  } as const;
  const batchLabels = {
    running: copy.batchRunning,
    failed: copy.batchFailed,
    succeeded: copy.batchSucceeded,
    suspended: copy.batchSuspended,
    unknown: copy.batchUnknown,
  } as const;
  const batchCounterLabels = {
    active: copy.activeRuns,
    failed: copy.failedRuns,
    succeeded: copy.succeededRuns,
  } as const;
  return (
    <div className="rounded-xl border bg-card">
      <Table scrollAreaLabel={copy.title}>
        <TableHeader>
          <TableRow>
            <TableHead>{copy.title}</TableHead>
            <TableHead>{copy.runtime}</TableHead>
            <TableHead>{copy.pods}</TableHead>
            <TableHead>{copy.delivery}</TableHead>
            <TableHead>{copy.deployment}</TableHead>
            <TableHead>{copy.batchRuntime}</TableHead>
            <TableHead>{copy.drift}</TableHead>
            <TableHead>{copy.incidents}</TableHead>
            <TableHead>{copy.resources}</TableHead>
            <TableHead><span className="sr-only">{copy.details}</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {applications.map((application) => (
            <TableRow key={application.id}>
              <TableCell>
                <div className="flex min-w-48 items-center gap-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Boxes aria-hidden="true" className="size-4" />
                  </span>
                  <span className="grid min-w-0 gap-1">
                    <span className="truncate font-medium">{application.name}</span>
                    <span className="flex min-w-0 flex-wrap gap-1">
                      {application.environments.length === 0 ? (
                        <span className="text-xs text-muted-foreground">{copy.unavailable}</span>
                      ) : application.environments.map((environment) => (
                        <Badge key={environment} variant="outline">{environment}</Badge>
                      ))}
                    </span>
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <StatusMark label={application.runtimeReadiness.status} tone={applicationStatusTone(application.runtimeReadiness.status)} />
              </TableCell>
              <TableCell>
                <ApplicationReadyBar runtimeReadiness={application.runtimeReadiness} label={copy.pods} unavailable={copy.unavailable} />
              </TableCell>
              <TableCell>
                <ApplicationDeliveryStateChannel delivery={application.delivery} labels={deliveryLabels} unavailable={copy.unavailable} />
              </TableCell>
              <TableCell>
                <ApplicationDeploymentChannel deployment={application.currentDeployment} unavailable={copy.unavailable} />
              </TableCell>
              <TableCell>
                <ApplicationBatchRuntimeChannel batchRuntime={application.batchRuntime} counterLabels={batchCounterLabels} labels={batchLabels} partial={copy.partial} unavailable={copy.unavailable} />
              </TableCell>
              <TableCell className="max-w-56">
                <ApplicationDriftChannel aligned={copy.aligned} application={application} drift={copy.drift} unavailable={copy.unavailable} />
              </TableCell>
              <TableCell>
                <ApplicationIncidentChannel count={application.openIncidents} noIncidents={copy.noIncidents} openIncidents={copy.openIncidents} unavailable={copy.unavailable} />
              </TableCell>
              <TableCell className="font-mono text-xs tabular-nums">{resourceTotal(application) ?? copy.unavailable}</TableCell>
              <TableCell className="text-right">
                <Button onClick={() => onOpen(application.id)} size="sm" type="button" variant="ghost">{copy.details}</Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function resourceTotal(application: ApplicationCardModel): number | null {
  return application.resourceCounts?.reduce((sum, item) => sum + item.count, 0) ?? null;
}

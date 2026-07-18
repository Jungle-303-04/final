import { Boxes } from "lucide-react";
import { useI18n } from "../../shared/i18n";
import { StatusMark } from "../../shared/ui/StatusMark";
import { Badge } from "../../shared/ui/primitives/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../shared/ui/primitives/card";
import { applicationsCopy } from "../../shared/i18n/applicationSurfaceCopy";
import type { ApplicationCardModel } from "./applicationsContract";
import {
  applicationStatusTone,
  formatObservedTime,
} from "./applicationPresentation";
import {
  ApplicationBatchRuntimeChannel,
  ApplicationDeploymentChannel,
  ApplicationDeliveryStateChannel,
  ApplicationDriftChannel,
  ApplicationIncidentChannel,
  ApplicationReadyBar,
} from "./ApplicationCatalogSignals";

export function ApplicationCard({
  application,
  onOpen,
}: {
  application: ApplicationCardModel;
  onOpen: () => void;
}) {
  const { locale, t } = useI18n();
  const copy = applicationsCopy(t);
  const deployment = application.currentDeployment;
  const resourceTotal = application.resourceCounts?.reduce((sum, item) => sum + item.count, 0) ?? null;
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
    <button
      aria-label={`${application.name} ${copy.details}`}
      className="block h-full w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onOpen}
      type="button"
    >
      <Card className="h-full min-w-0 transition-shadow hover:ring-primary/35 motion-reduce:transition-none" size="sm">
        <CardHeader className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3">
          <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
            <Boxes aria-hidden="true" className="size-4" />
          </div>
          <div className="min-w-0">
            <CardTitle className="truncate" title={application.name}>{application.name}</CardTitle>
            <div className="mt-1 flex min-w-0 flex-wrap gap-1 text-muted-foreground">
              {application.environments.length === 0 ? copy.unavailable : application.environments.map((environment) => (
                <Badge key={environment} variant="outline">{environment}</Badge>
              ))}
            </div>
          </div>
          <div className="self-start pt-1">
            <StatusMark
              label={application.runtimeReadiness.status}
              tone={applicationStatusTone(application.runtimeReadiness.status)}
            />
          </div>
        </CardHeader>
        <CardContent className="grid flex-1 content-start px-0">
          <div className="divide-y border-t">
            <div className="flex min-w-0 items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="text-muted-foreground">{copy.runtime}</span>
              <ApplicationReadyBar
                runtimeReadiness={application.runtimeReadiness}
                label={copy.pods}
                unavailable={copy.unavailable}
              />
            </div>
            <div className="grid gap-1 px-4 py-3 text-sm" data-testid="application-deployment-panel">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {copy.delivery}
              </span>
              <ApplicationDeliveryStateChannel
                delivery={application.delivery}
                labels={deliveryLabels}
                unavailable={copy.unavailable}
              />
              <span className="pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {copy.deployment}
              </span>
              <ApplicationDeploymentChannel
                deployment={deployment}
                unavailable={copy.unavailable}
                withIcon
              />
              {deployment ? (
                <span className="truncate text-xs text-muted-foreground">
                  {[formatObservedTime(deployment.deployedAt, locale), deployment.deployedBy].filter(Boolean).join(" · ")}
                </span>
              ) : null}
            </div>
            <div className="flex min-w-0 items-center justify-between gap-3 px-4 py-3">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {copy.batchRuntime}
              </span>
              <ApplicationBatchRuntimeChannel
                batchRuntime={application.batchRuntime}
                counterLabels={batchCounterLabels}
                labels={batchLabels}
                partial={copy.partial}
                unavailable={copy.unavailable}
              />
            </div>
            <div className="grid grid-cols-2 divide-x">
              <div className="grid min-w-0 gap-1 px-4 py-3">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {copy.drift}
                </span>
                <ApplicationDriftChannel
                  aligned={copy.aligned}
                  application={application}
                  drift={copy.drift}
                  unavailable={copy.unavailable}
                />
              </div>
              <div className="grid min-w-0 gap-1 px-4 py-3">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {copy.incidents}
                </span>
                <ApplicationIncidentChannel
                  count={application.openIncidents}
                  noIncidents={copy.noIncidents}
                  openIncidents={copy.openIncidents}
                  unavailable={copy.unavailable}
                />
              </div>
            </div>
            <div className="flex min-h-11 items-center justify-end px-4 py-3 text-xs text-muted-foreground">
              {resourceTotal === null ? null : (
                <span>{copy.resources} <strong className="font-medium tabular-nums text-foreground">{resourceTotal}</strong>{application.resourceCountsCompleteness === "partial" ? ` · ${copy.partial}` : ""}</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

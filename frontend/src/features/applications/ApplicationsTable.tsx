import { Boxes, ChevronDown } from "lucide-react";
import { Fragment, type ReactNode, useState } from "react";
import { useI18n, type TranslationFunction } from "../../shared/i18n";
import { applicationsCopy } from "../../shared/i18n/applicationSurfaceCopy";
import { cn } from "../../shared/lib/cn";
import { StatusPill } from "../../shared/ui/status";
import { Button } from "../../shared/ui/primitives/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../shared/ui/primitives/table";
import type { ApplicationCardModel } from "./applicationsContract";
import { applicationStatusTone, shortSha } from "./applicationPresentation";
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
  refreshControl,
}: {
  applications: readonly ApplicationCardModel[];
  onOpen: (applicationId: string) => void;
  refreshControl?: ReactNode;
}) {
  const { t } = useI18n();
  const copy = applicationsCopy(t);
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table className="min-w-[50rem] table-fixed" scrollAreaLabel={copy.title}>
        <colgroup>
          <col className="w-[30%]" />
          <col className="w-[16%]" />
          <col className="w-[14%]" />
          <col className="w-[14%]" />
          <col className="w-[11%]" />
          <col className="w-[15%]" />
        </colgroup>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <CatalogHead>{t("workflows.sync.table.application")}</CatalogHead>
            <CatalogHead>{copy.environment}</CatalogHead>
            <CatalogHead>{t("workflows.sync.table.status")}</CatalogHead>
            <CatalogHead>{copy.health}</CatalogHead>
            <CatalogHead>{copy.pods}</CatalogHead>
            <CatalogHead>
              <span className="flex min-w-0 items-center justify-between gap-2">
                <span className="truncate">{t("workflows.sync.table.revision")}</span>
                {refreshControl}
              </span>
            </CatalogHead>
          </TableRow>
        </TableHeader>
        <TableBody className="[&_td]:py-[0.34375rem]">
          {applications.map((application) => {
            const expanded = expandedId === application.id;
            const detailId = `application-catalog-detail-${application.id}`;
            const sync = syncPresentation(application, t);
            const revision = shortSha(application.currentDeployment?.gitSha ?? null);
            const environment = application.environments.join(" · ");

            return (
              <Fragment key={application.id}>
                <TableRow aria-expanded={expanded}>
                  <TableCell className="overflow-hidden px-4">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        <Boxes aria-hidden="true" className="size-4" />
                      </span>
                      <Button
                        aria-label={copy.details}
                        className="h-auto min-w-0 max-w-full justify-start overflow-hidden p-0 text-left font-semibold text-foreground hover:bg-transparent hover:text-primary"
                        onClick={() => onOpen(application.id)}
                        type="button"
                        variant="ghost"
                      >
                        <span className="truncate" title={application.name}>{application.name}</span>
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="overflow-hidden px-4 font-mono text-xs text-muted-foreground">
                    <span className="block truncate" title={environment || copy.unavailable}>
                      {environment || copy.unavailable}
                    </span>
                  </TableCell>
                  <TableCell className="overflow-hidden px-4">
                    <StatusPill className="max-w-full" label={sync.label} tone={sync.tone} />
                  </TableCell>
                  <TableCell className="overflow-hidden px-4">
                    <StatusPill
                      className="max-w-full capitalize"
                      label={application.runtimeReadiness.status}
                      tone={applicationStatusTone(application.runtimeReadiness.status)}
                    />
                  </TableCell>
                  <TableCell
                    aria-label={podAriaLabel(application, copy.pods, copy.unavailable)}
                    className="overflow-hidden px-4 font-mono text-xs font-semibold tabular-nums"
                    title={podAriaLabel(application, copy.pods, copy.unavailable)}
                  >
                    {application.runtimeReadiness.readyPods === null ||
                    application.runtimeReadiness.totalPods === null
                      ? copy.unavailable
                      : `${application.runtimeReadiness.readyPods}/${application.runtimeReadiness.totalPods}`}
                  </TableCell>
                  <TableCell className="overflow-hidden px-4">
                    <span className="flex min-w-0 items-center justify-between gap-2">
                      <code
                        className="block min-w-0 truncate text-xs text-muted-foreground"
                        title={application.currentDeployment?.gitSha ?? copy.unavailable}
                      >
                        {revision ?? copy.unavailable}
                      </code>
                      <Button
                        aria-controls={detailId}
                        aria-expanded={expanded}
                        aria-label={`${copy.details}: ${application.name}`}
                        className="shrink-0 rounded-full"
                        onClick={() => setExpandedId((current) => current === application.id ? null : application.id)}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <ChevronDown
                          aria-hidden="true"
                          className={cn("size-4 transition-transform motion-reduce:transition-none", expanded && "rotate-180")}
                        />
                      </Button>
                    </span>
                  </TableCell>
                </TableRow>
                {expanded ? (
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableCell className="whitespace-normal px-4 py-3" colSpan={6}>
                      <div
                        aria-label={`${application.name} ${copy.details}`}
                        className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-3 xl:grid-cols-4"
                        id={detailId}
                        role="region"
                      >
                        <CatalogFact label={copy.runtime}>
                          <span className="flex min-w-0 items-center gap-2">
                            <ApplicationReadyBar runtimeReadiness={application.runtimeReadiness} label={copy.pods} unavailable={copy.unavailable} />
                            {application.runtimeReadiness.restarts === null ? null : (
                              <span className="truncate text-xs text-muted-foreground">
                                {copy.restarts} <span className="font-mono tabular-nums">{application.runtimeReadiness.restarts}</span>
                              </span>
                            )}
                          </span>
                        </CatalogFact>
                        <CatalogFact label={copy.delivery}>
                          <ApplicationDeliveryStateChannel delivery={application.delivery} labels={deliveryLabels} unavailable={copy.unavailable} />
                        </CatalogFact>
                        <CatalogFact label={copy.deployment}>
                          <ApplicationDeploymentChannel deployment={application.currentDeployment} unavailable={copy.unavailable} />
                        </CatalogFact>
                        <CatalogFact label={copy.batchRuntime}>
                          <ApplicationBatchRuntimeChannel batchRuntime={application.batchRuntime} counterLabels={batchCounterLabels} labels={batchLabels} partial={copy.partial} unavailable={copy.unavailable} />
                        </CatalogFact>
                        <CatalogFact label={copy.drift}>
                          <ApplicationDriftChannel aligned={copy.aligned} application={application} drift={copy.drift} unavailable={copy.unavailable} />
                        </CatalogFact>
                        <CatalogFact label={copy.incidents}>
                          <ApplicationIncidentChannel count={application.openIncidents} noIncidents={copy.noIncidents} openIncidents={copy.openIncidents} unavailable={copy.unavailable} />
                        </CatalogFact>
                        <CatalogFact label={copy.resources}>
                          <span className="font-mono text-xs tabular-nums">{resourceTotal(application) ?? copy.unavailable}</span>
                        </CatalogFact>
                        <CatalogFact label={copy.source}>
                          <SourceSummary application={application} unavailable={copy.unavailable} />
                        </CatalogFact>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function CatalogHead({ children }: { children: ReactNode }) {
  return (
    <TableHead className="overflow-hidden px-4 text-micro font-semibold tracking-[0.05em] text-caption-foreground">
      {children}
    </TableHead>
  );
}

function CatalogFact({ children, label }: { children: ReactNode; label: string }) {
  return (
    <dl className="min-w-0 space-y-1">
      <dt className="truncate text-micro font-semibold tracking-[0.05em] text-caption-foreground">{label}</dt>
      <dd className="min-w-0 overflow-hidden">{children}</dd>
    </dl>
  );
}

function SourceSummary({
  application,
  unavailable,
}: {
  application: ApplicationCardModel;
  unavailable: string;
}) {
  const values = [application.repositoryRef, application.defaultBranch, application.manifestPath]
    .filter((value): value is string => Boolean(value));
  const summary = values.join(" · ");
  return (
    <span className="block truncate font-mono text-xs text-muted-foreground" title={summary || unavailable}>
      {summary || unavailable}
    </span>
  );
}

function syncPresentation(
  application: ApplicationCardModel,
  t: TranslationFunction,
) {
  if (application.hasDrift === null) {
    return { label: t("workflows.sync.status.unknown"), tone: "unknown" as const };
  }
  if (application.hasDrift) {
    return { label: t("workflows.sync.status.outOfSync"), tone: "warning" as const };
  }
  return { label: t("workflows.sync.status.synced"), tone: "healthy" as const };
}

function podAriaLabel(application: ApplicationCardModel, label: string, unavailable: string): string {
  const { readyPods, totalPods } = application.runtimeReadiness;
  return readyPods === null || totalPods === null
    ? `${label}: ${unavailable}`
    : `${label}: ${readyPods}/${totalPods}`;
}

function resourceTotal(application: ApplicationCardModel): number | null {
  return application.resourceCounts?.reduce((sum, item) => sum + item.count, 0) ?? null;
}

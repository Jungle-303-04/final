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
  ApplicationDeploymentChannel,
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
  const { locale } = useI18n();
  const copy = applicationsCopy(locale);
  const deployment = application.currentDeployment;
  const resourceTotal = application.resourceCounts?.reduce((sum, item) => sum + item.count, 0) ?? null;
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
              label={application.health.status ?? copy.unknown}
              tone={applicationStatusTone(application.health.status)}
            />
          </div>
        </CardHeader>
        <CardContent className="grid flex-1 content-start gap-3">
          <div className="flex min-w-0 items-center justify-between gap-3 border-y py-2.5 text-sm">
            <span className="text-muted-foreground">{copy.pods}</span>
            <ApplicationReadyBar
              health={application.health}
              label={copy.pods}
              unavailable={copy.unavailable}
            />
          </div>
          <div className="grid gap-1 rounded-lg bg-muted/45 px-3 py-2.5 text-sm" data-testid="application-deployment-panel">
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
          <div className="grid grid-cols-2 gap-2">
            <div className="grid min-w-0 gap-1 rounded-lg border bg-background/60 px-2.5 py-2">
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
            <div className="grid min-w-0 gap-1 rounded-lg border bg-background/60 px-2.5 py-2">
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
          <div className="flex min-h-5 items-center justify-end text-xs text-muted-foreground">
            {resourceTotal === null ? null : (
              <span>{copy.resources} <strong className="font-medium tabular-nums text-foreground">{resourceTotal}</strong>{application.resourceCountsCompleteness === "partial" ? ` · ${copy.partial}` : ""}</span>
            )}
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

import { AlertTriangle, Boxes, GitCommitHorizontal, Siren } from "lucide-react";
import { useI18n } from "../../shared/i18n";
import { StatusMark } from "../../shared/ui/StatusMark";
import { Badge } from "../../shared/ui/primitives/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../shared/ui/primitives/card";
import { applicationsCopy } from "../../shared/i18n/applicationSurfaceCopy";
import type { ApplicationCardModel } from "./applicationsContract";
import {
  applicationStatusTone,
  formatObservedTime,
  shortSha,
} from "./applicationPresentation";

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
    <button className="block h-full w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={onOpen} type="button">
      <Card className="h-full min-w-0 transition-colors hover:border-primary/40 motion-reduce:transition-none">
        <CardHeader>
          <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
            <Boxes aria-hidden="true" className="size-4" />
          </div>
          <CardTitle className="mt-2 truncate" title={application.name}>{application.name}</CardTitle>
          <CardDescription className="flex flex-wrap gap-1">
            {application.environments.length === 0 ? copy.unavailable : application.environments.map((environment) => (
              <Badge key={environment} variant="outline">{environment}</Badge>
            ))}
          </CardDescription>
          <CardAction>
            <StatusMark
              label={application.health.status ?? copy.unknown}
              tone={applicationStatusTone(application.health.status)}
            />
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{copy.pods}</span>
            <span className="font-medium tabular-nums">{podRatio(application, copy.unavailable)}</span>
          </div>
          {deployment ? (
            <div className="grid gap-1 rounded-lg bg-muted/45 p-3 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <GitCommitHorizontal aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate font-medium">
                  {[deployment.version, shortSha(deployment.gitSha)].filter(Boolean).join(" · ") || copy.unavailable}
                </span>
              </div>
              <span className="truncate text-xs text-muted-foreground">
                {[formatObservedTime(deployment.deployedAt, locale), deployment.deployedBy].filter(Boolean).join(" · ")}
              </span>
            </div>
          ) : null}
          {application.hasDrift === true ? (
            <div className="flex min-w-0 items-center gap-2 text-sm text-destructive">
              <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate">{application.driftSummary ?? copy.drift}</span>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            {resourceTotal === null ? null : (
              <span>{copy.resources} <strong className="tabular-nums">{resourceTotal}</strong>{application.resourceCountsCompleteness === "partial" ? ` · ${copy.partial}` : ""}</span>
            )}
            {application.openIncidents === null ? null : application.openIncidents === 0 ? (
              <span className="text-muted-foreground">{copy.noIncidents}</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-destructive">
                <Siren aria-hidden="true" className="size-4" />
                {copy.openIncidents} {application.openIncidents}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

function podRatio(application: ApplicationCardModel, unavailable: string): string {
  const { readyPods, totalPods } = application.health;
  return readyPods === null || totalPods === null ? unavailable : `${readyPods}/${totalPods}`;
}

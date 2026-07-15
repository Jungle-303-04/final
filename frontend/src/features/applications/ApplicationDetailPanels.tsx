import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { useI18n } from "../../shared/i18n";
import { StatusMark } from "../../shared/ui/StatusMark";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../shared/ui/primitives/card";
import { Separator } from "../../shared/ui/primitives/separator";
import { applicationsCopy } from "../../shared/i18n/applicationSurfaceCopy";
import { OverflowIdentity } from "../../shared/ui/OverflowIdentity";
import type {
  ApplicationDetailModel,
  ApplicationUnavailableEvidence,
  ApplicationWorkloadDetail,
} from "./applicationsContract";
import { applicationStatusTone, formatObservedTime } from "./applicationPresentation";
import {
  ApplicationBatchRuntimeChannel,
  ApplicationDeliveryStateChannel,
} from "./ApplicationCatalogSignals";

export function ApplicationOverviewPanel({ detail }: { detail: ApplicationDetailModel }) {
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
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>{copy.runtime}</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <Fact label={copy.status} value={<StatusMark label={detail.runtimeReadiness.status} tone={applicationStatusTone(detail.runtimeReadiness.status)} />} />
          <Fact label={copy.pods} value={podRatio(detail, copy.unavailable)} />
          <Fact label={copy.restarts} value={detail.runtimeReadiness.restarts} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{copy.deployment}</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <Fact label={copy.delivery} value={<ApplicationDeliveryStateChannel delivery={detail.delivery} labels={deliveryLabels} unavailable={copy.unavailable} />} />
          <Fact label={copy.version} value={detail.currentDeployment?.version} />
          <Fact label={copy.gitSha} value={detail.currentDeployment?.gitSha ?? null} mono />
          <Fact label={copy.digest} value={detail.currentDeployment?.imageDigest} mono />
          <Fact label={copy.deployedAt} value={formatObservedTime(detail.currentDeployment?.deployedAt ?? null, locale)} />
          <Fact label={copy.deployedBy} value={detail.currentDeployment?.deployedBy} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{copy.batchRuntime}</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <ApplicationBatchRuntimeChannel
            batchRuntime={detail.batchRuntime}
            counterLabels={batchCounterLabels}
            labels={batchLabels}
            partial={copy.partial}
            unavailable={copy.unavailable}
          />
        </CardContent>
      </Card>
      <ApplicationSourcePanel source={detail.source} />
      <Card>
        <CardHeader><CardTitle>{copy.endpoints}</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          {detail.endpoints === null ? <Unavailable /> : detail.endpoints.length === 0 ? (
            <p className="text-sm text-muted-foreground">{copy.unavailable}</p>
          ) : detail.endpoints.map((endpoint) => (
            <div className="grid min-w-0 gap-1" key={endpoint.id}>
              <span className="text-xs text-muted-foreground">{endpoint.kind} · {endpoint.name}</span>
              <OverflowIdentity className="text-sm" value={endpoint.address ?? copy.unavailable} />
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{copy.recentActivity}</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          {detail.recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">{copy.noActivity}</p>
          ) : detail.recentActivity.map((activity, index) => (
            <div key={activity.id}>
              {index > 0 ? <Separator className="mb-3" /> : null}
              <div className="grid gap-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{activity.type}</Badge>
                  <span className="min-w-0 truncate text-sm font-medium">{activity.summary ?? copy.unavailable}</span>
                </div>
                <span className="text-xs text-muted-foreground">{formatObservedTime(activity.occurredAt, locale) ?? copy.unavailable}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export function ApplicationWorkloadOverviewPanel({
  workload,
}: {
  workload: ApplicationWorkloadDetail;
}) {
  const { locale } = useI18n();
  const copy = applicationsCopy(locale);
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <Card data-testid="application-workload-runtime">
        <CardHeader><CardTitle>{copy.workloadRuntime}</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <Fact label={copy.resource} value={`${workload.workload.resource.kind}/${workload.workload.resource.name}`} />
          <Fact label={copy.status} value={<StatusMark label={workload.runtimeReadiness.status} tone={applicationStatusTone(workload.runtimeReadiness.status)} />} />
          <Fact label={copy.pods} value={workloadPodRatio(workload, copy.unavailable)} />
          <Fact label={copy.restarts} value={workload.runtimeReadiness.restarts} />
          {workload.runtimeReadiness.completeness === "partial" ? <Badge className="w-fit" variant="outline">{copy.partial}</Badge> : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{copy.resources}</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          {workload.resourceCounts === null ? <Unavailable /> : workload.resourceCounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{copy.unavailable}</p>
          ) : workload.resourceCounts.map((item) => (
            <Fact key={item.kind} label={item.kind} value={item.count} />
          ))}
          {workload.resourceCountsCompleteness === "partial" ? <Badge className="w-fit" variant="outline">{copy.partial}</Badge> : null}
        </CardContent>
      </Card>
    </div>
  );
}

export function ApplicationUnavailableEvidencePanel({
  evidence,
  title,
}: {
  evidence: ApplicationUnavailableEvidence;
  title: string;
}) {
  const { locale } = useI18n();
  const copy = applicationsCopy(locale);
  return (
    <Card data-testid="application-workload-unavailable-evidence">
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="grid gap-2">
        <p className="text-sm text-muted-foreground">{workloadUnavailableMessage(evidence, copy)}</p>
      </CardContent>
    </Card>
  );
}

export function ApplicationSourcePanel({
  source,
}: {
  source: ApplicationDetailModel["source"];
}) {
  const { locale } = useI18n();
  const copy = applicationsCopy(locale);
  if (source.availability === "unavailable") {
    return (
      <Card>
        <CardHeader><CardTitle>{copy.source}</CardTitle></CardHeader>
        <CardContent><Unavailable /></CardContent>
      </Card>
    );
  }
  const conflict = sourceConflictPresentation(source.conflict, copy);
  return (
    <Card data-testid="application-source-evidence">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>{copy.source}</CardTitle>
        {source.completeness === "partial" ? <Badge variant="outline">{copy.partial}</Badge> : null}
      </CardHeader>
      <CardContent className="grid gap-3">
        <Fact label={copy.status} value={<StatusMark label={conflict.label} tone={conflict.tone} />} />
        <Fact label={copy.repository} value={source.repositoryRef} />
        <Fact label={copy.branch} value={source.defaultBranch} />
        <Fact label={copy.manifest} value={source.manifestPath} mono />
      </CardContent>
    </Card>
  );
}

export function ApplicationHistoryPanel({
  history,
}: {
  history: ApplicationDetailModel["history"];
}) {
  const { locale } = useI18n();
  const copy = applicationsCopy(locale);
  if (history.availability === "unavailable" || history.entries === null) {
    return <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">{copy.unavailable}</p>;
  }
  return (
    <Card data-testid="application-history-evidence">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>{copy.history}</CardTitle>
        {history.completeness === "partial" ? <Badge variant="outline">{copy.partial}</Badge> : null}
      </CardHeader>
      <CardContent className="grid gap-3">
        {history.entries.length === 0 ? <p className="text-sm text-muted-foreground">{copy.noActivity}</p> : history.entries.map((entry, index) => (
          <div className="grid gap-2" key={entry.id}>
            {index > 0 ? <Separator /> : null}
            <div className="flex min-w-0 items-center justify-between gap-3">
              <Badge variant="outline">{entry.type}</Badge>
              <StatusMark label={entry.status} tone={applicationStatusTone(entry.status)} />
            </div>
            <span className="min-w-0 truncate text-sm font-medium">{entry.summary ?? copy.unavailable}</span>
            <span className="text-xs text-muted-foreground">{formatObservedTime(entry.occurredAt, locale) ?? copy.unavailable}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function ApplicationResourcesPanel({
  detail,
  href,
}: {
  detail: ApplicationDetailModel;
  href: string;
}) {
  const { locale } = useI18n();
  const copy = applicationsCopy(locale);
  return (
    <Card>
      <CardHeader><CardTitle>{copy.resources}</CardTitle></CardHeader>
      <CardContent className="grid gap-4">
        {detail.resourceCounts === null ? <Unavailable /> : detail.resourceCounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{copy.unavailable}</p>
        ) : (
          <dl className="grid gap-2">
            {detail.resourceCounts.map((item) => (
              <div className="flex items-center justify-between gap-4 border-b py-2 last:border-0" key={item.kind}>
                <dt className="font-medium">{item.kind}</dt>
                <dd className="tabular-nums">{item.count}</dd>
              </div>
            ))}
          </dl>
        )}
        {detail.resourceCountsCompleteness === "partial" ? <Badge className="w-fit" variant="outline">{copy.partial}</Badge> : null}
        <Button render={<Link to={href} />} variant="outline">
          {copy.fullResources}<ExternalLink aria-hidden="true" />
        </Button>
      </CardContent>
    </Card>
  );
}

export function ApplicationIncidentsPanel({
  detail,
  href,
}: {
  detail: ApplicationDetailModel;
  href: string;
}) {
  const { locale } = useI18n();
  const copy = applicationsCopy(locale);
  return (
    <Card>
      <CardHeader><CardTitle>{copy.incidents}</CardTitle></CardHeader>
      <CardContent className="grid gap-4">
        {detail.recentIncidents.length === 0 ? (
          <p className="text-sm text-muted-foreground">{copy.noIncidentHistory}</p>
        ) : detail.recentIncidents.map((incident) => (
          <div className="grid gap-1 border-b pb-3 last:border-0 last:pb-0" key={incident.id}>
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate font-medium">{incident.title ?? copy.unavailable}</span>
              {incident.status ? <Badge variant="outline">{incident.status}</Badge> : null}
            </div>
            <span className="text-xs text-muted-foreground">{formatObservedTime(incident.startedAt, locale) ?? copy.unavailable}</span>
          </div>
        ))}
        <Button render={<Link to={href} />} variant="outline">
          {copy.fullIssues}<ExternalLink aria-hidden="true" />
        </Button>
      </CardContent>
    </Card>
  );
}

function Fact({ label, mono = false, value }: { label: string; mono?: boolean; value: React.ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(7rem,0.35fr)_minmax(0,1fr)] items-start gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {value === null || value === undefined
        ? <Unavailable />
        : typeof value === "string"
          ? <OverflowIdentity className={mono ? "font-mono text-xs" : undefined} value={value} />
          : <span className={mono ? "min-w-0 font-mono text-xs" : "min-w-0"}>{value}</span>}
    </div>
  );
}

function Unavailable() {
  const { locale } = useI18n();
  return <span className="text-sm text-muted-foreground">{applicationsCopy(locale).unavailable}</span>;
}

function podRatio(detail: ApplicationDetailModel, unavailable: string): string {
  return detail.runtimeReadiness.readyPods === null || detail.runtimeReadiness.totalPods === null
    ? unavailable
    : `${detail.runtimeReadiness.readyPods}/${detail.runtimeReadiness.totalPods}`;
}

function workloadPodRatio(workload: ApplicationWorkloadDetail, unavailable: string): string {
  return workload.runtimeReadiness.readyPods === null || workload.runtimeReadiness.totalPods === null
    ? unavailable
    : `${workload.runtimeReadiness.readyPods}/${workload.runtimeReadiness.totalPods}`;
}

function workloadUnavailableMessage(
  evidence: ApplicationUnavailableEvidence,
  copy: ReturnType<typeof applicationsCopy>,
): string {
  if (evidence.reasonCodes.includes("workload_history_link_not_persisted")) {
    return copy.workloadHistoryUnavailable;
  }
  if (evidence.reasonCodes.includes("cost_observation_not_integrated")) {
    return copy.workloadCostUnavailable;
  }
  if (evidence.reasonCodes.includes("workload_action_capabilities_not_connected")) {
    return copy.workloadActionsUnavailable;
  }
  return copy.workloadEvidenceUnavailable;
}

function sourceConflictPresentation(
  conflict: ApplicationDetailModel["source"]["conflict"],
  copy: ReturnType<typeof applicationsCopy>,
) {
  if (conflict === "aligned") return { label: copy.sourceAligned, tone: "healthy" as const };
  if (conflict === "conflict") return { label: copy.sourceConflict, tone: "critical" as const };
  return { label: copy.sourceUnknown, tone: "unknown" as const };
}

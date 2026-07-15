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
import type { ApplicationDetailModel } from "./applicationsContract";
import { applicationStatusTone, formatObservedTime } from "./applicationPresentation";

export function ApplicationOverviewPanel({ detail }: { detail: ApplicationDetailModel }) {
  const { locale } = useI18n();
  const copy = applicationsCopy(locale);
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>{copy.health}</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <Fact label={copy.status} value={<StatusMark label={detail.health.status ?? copy.unknown} tone={applicationStatusTone(detail.health.status)} />} />
          <Fact label={copy.pods} value={podRatio(detail, copy.unavailable)} />
          <Fact label={copy.restarts} value={detail.health.restarts} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{copy.deployment}</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <Fact label={copy.version} value={detail.currentDeployment?.version} />
          <Fact label={copy.gitSha} value={detail.currentDeployment?.gitSha ?? null} mono />
          <Fact label={copy.digest} value={detail.currentDeployment?.imageDigest} mono />
          <Fact label={copy.deployedAt} value={formatObservedTime(detail.currentDeployment?.deployedAt ?? null, locale)} />
          <Fact label={copy.deployedBy} value={detail.currentDeployment?.deployedBy} />
        </CardContent>
      </Card>
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
  return detail.health.readyPods === null || detail.health.totalPods === null
    ? unavailable
    : `${detail.health.readyPods}/${detail.health.totalPods}`;
}

import { useI18n } from "../../shared/i18n";
import { Badge } from "../../shared/ui/primitives/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../shared/ui/primitives/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../shared/ui/primitives/table";
import { ApplicationsFailureState } from "./ApplicationsState";
import { applicationsCopy } from "../../shared/i18n/applicationSurfaceCopy";
import type { ApplicationDriftModel } from "./applicationsContract";
import { formatDriftValue, formatObservedTime } from "./applicationPresentation";
import type { ApplicationsResource } from "./useApplicationsData";

export function ApplicationDriftPanel({
  resource,
  retry,
}: {
  resource: ApplicationsResource<ApplicationDriftModel | null>;
  retry: () => void;
}) {
  const { locale, t } = useI18n();
  const copy = applicationsCopy(t);
  if (resource.phase === "loading") return <p className="p-6 text-sm text-muted-foreground">{copy.loading}</p>;
  if (resource.phase === "failed") return <ApplicationsFailureState failure={resource.failure} onRetry={retry} />;
  const drift = resource.data;
  if (drift === null || drift.status === "unknown") {
    return <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">{copy.driftUnknown}</p>;
  }
  if (drift.status === "in_sync") {
    return <p className="rounded-xl border bg-card p-8 text-center text-sm">{copy.aligned}</p>;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{drift.summary ?? copy.drift}</CardTitle>
        {drift.observedAt ? <p className="text-xs text-muted-foreground">{formatObservedTime(drift.observedAt, locale)}</p> : null}
      </CardHeader>
      <CardContent className="p-0">
        <Table scrollAreaLabel={copy.differences}>
          <TableHeader><TableRow>
            <TableHead>{copy.resource}</TableHead><TableHead>{copy.field}</TableHead>
            <TableHead>{copy.desired}</TableHead><TableHead>{copy.live}</TableHead>
            <TableHead>{copy.actor}</TableHead><TableHead>{copy.time}</TableHead>
          </TableRow></TableHeader>
          <TableBody>{drift.differences.map((difference) => (
            <TableRow key={`${difference.resource}:${difference.fieldPath}`}>
              <TableCell>{difference.resource}</TableCell>
              <TableCell className="font-mono text-xs">{difference.fieldPath}</TableCell>
              <TableCell>{difference.valueRedacted ? <Badge variant="outline">{copy.redacted}</Badge> : formatDriftValue(difference.oldValue)}</TableCell>
              <TableCell>{difference.valueRedacted ? <Badge variant="outline">{copy.redacted}</Badge> : formatDriftValue(difference.newValue)}</TableCell>
              <TableCell>{difference.changedBy ?? copy.unavailable}</TableCell>
              <TableCell>{formatObservedTime(difference.changedAt, locale) ?? copy.unavailable}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

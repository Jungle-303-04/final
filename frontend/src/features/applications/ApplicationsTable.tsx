import { useI18n } from "../../shared/i18n";
import { StatusMark } from "../../shared/ui/StatusMark";
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
import { applicationStatusTone, shortSha } from "./applicationPresentation";

export function ApplicationsTable({
  applications,
  onOpen,
}: {
  applications: readonly ApplicationCardModel[];
  onOpen: (applicationId: string) => void;
}) {
  const { locale } = useI18n();
  const copy = applicationsCopy(locale);
  return (
    <div className="rounded-xl border bg-card">
      <Table scrollAreaLabel={copy.title}>
        <TableHeader>
          <TableRow>
            <TableHead>{copy.title}</TableHead>
            <TableHead>{copy.environment}</TableHead>
            <TableHead>{copy.health}</TableHead>
            <TableHead>{copy.pods}</TableHead>
            <TableHead>{copy.deployment}</TableHead>
            <TableHead>{copy.resources}</TableHead>
            <TableHead>{copy.incidents}</TableHead>
            <TableHead><span className="sr-only">{copy.details}</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {applications.map((application) => (
            <TableRow key={application.id}>
              <TableCell className="font-medium">{application.name}</TableCell>
              <TableCell>{application.environments.join(", ") || copy.unavailable}</TableCell>
              <TableCell>
                <StatusMark label={application.health.status ?? copy.unknown} tone={applicationStatusTone(application.health.status)} />
              </TableCell>
              <TableCell>{podRatio(application, copy.unavailable)}</TableCell>
              <TableCell>{[application.currentDeployment?.version, shortSha(application.currentDeployment?.gitSha ?? null)].filter(Boolean).join(" · ") || copy.unavailable}</TableCell>
              <TableCell>{resourceTotal(application) ?? copy.unavailable}</TableCell>
              <TableCell>{application.openIncidents ?? copy.unavailable}</TableCell>
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

function podRatio(application: ApplicationCardModel, unavailable: string): string {
  const { readyPods, totalPods } = application.health;
  return readyPods === null || totalPods === null ? unavailable : `${readyPods}/${totalPods}`;
}

function resourceTotal(application: ApplicationCardModel): number | null {
  return application.resourceCounts?.reduce((sum, item) => sum + item.count, 0) ?? null;
}

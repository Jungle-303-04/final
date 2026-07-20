import { ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";

import type { ChecksFinding, ChecksOverview } from "../../features/checks/checksContract";
import { checksCopy } from "../../features/checks/checksCopy";
import { alertEventResourceHref } from "../../features/filters/alertEventResourceHref";
import { useI18n } from "../../shared/i18n";
import { SurfaceSection } from "../../shared/ui/Surface";
import { Badge } from "../../shared/ui/primitives/badge";
import { ChecksAvailabilityReasons } from "./ChecksAvailabilityReasons";

export function ChecksSummaryChips({ overview }: { overview: ChecksOverview }) {
  const { t } = useI18n();
  const copy = checksCopy(t);
  const result = overview.resultSet;
  const findings = result.availability === "unavailable" ? [] : result.checks;
  const warning = findings.filter((finding) => finding.severity === "warning").length;
  const danger = findings.filter((finding) => finding.severity === "danger").length;
  const evaluated = result.availability === "unavailable" ? null : result.totalCheckCount;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2" aria-label={copy.resultStatus}>
      <Badge className="h-7 gap-1.5 px-3 tabular-nums" variant="outline">{copy.catalogStatus} <strong>{evaluated ?? "—"}</strong></Badge>
      <Badge className="h-7 gap-1.5 px-3 tabular-nums" variant="warning">{t("timeline.severity.warning")} <strong>{result.availability === "unavailable" ? "—" : warning}</strong></Badge>
      <Badge className="h-7 gap-1.5 px-3 tabular-nums" variant="destructive">{t("timeline.severity.critical")} <strong>{result.availability === "unavailable" ? "—" : danger}</strong></Badge>
    </div>
  );
}

export function FindingsSection({ resultSet }: { resultSet: Extract<ChecksOverview["resultSet"], { availability: "available" | "partial" }> }) {
  const copy = checksCopy(useI18n().t);
  return (
    <SurfaceSection className="grid min-w-0 gap-0 p-0">
      <div className="flex min-w-0 items-center justify-between gap-3 border-b bg-muted/35 px-3.5 py-2">
        <h3 className="truncate text-label-2 font-semibold">{copy.resultStatus}</h3>
        <span className="shrink-0 font-mono text-caption text-muted-foreground">{copy.findingCount}: {resultSet.totalFindingCount}</span>
      </div>
      {resultSet.checks.length === 0
        ? <p className="grid min-h-40 place-items-center p-6 text-sm text-muted-foreground">{copy.noFindings}</p>
        : <FindingsList findings={resultSet.checks} />}
      {resultSet.reasonCodes.length === 0 ? null : <div className="border-t px-3.5 py-2"><ChecksAvailabilityReasons reasons={resultSet.reasonCodes} /></div>}
    </SurfaceSection>
  );
}

export function FindingsList({ findings }: { findings: readonly ChecksFinding[] }) {
  const { t } = useI18n();
  const copy = checksCopy(t);
  return (
    <ul className="min-w-0" aria-label={copy.resultStatus}>
      {findings.map((finding) => (
        <li className="grid min-w-0 animate-in grid-cols-[5.75rem_minmax(8rem,1fr)_minmax(10rem,1.65fr)] items-center gap-3 border-b border-border-subtle px-3.5 py-2.5 fade-in-0 slide-in-from-bottom-1 duration-(--motion-soft) ease-(--ease-soft) last:border-b-0 hover:bg-muted/35 motion-reduce:animate-none" key={`${finding.clusterId}:${finding.findingId}`}>
          <Badge variant={finding.severity === "danger" ? "destructive" : "warning"}>{t(finding.severity === "danger" ? "timeline.severity.critical" : "timeline.severity.warning")}</Badge>
          <div className="min-w-0">
            <Link className="block min-w-0 truncate text-label-2 font-semibold underline-offset-4 hover:text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" to={alertEventResourceHref({ cluster: finding.clusterId, kind: finding.resource.kind, name: finding.resource.name, namespace: finding.resource.namespace })} title={`${finding.resource.kind}/${finding.resource.name}`}>
              {finding.resource.kind}/{finding.resource.name}
            </Link>
            <p className="mt-0.5 truncate font-mono text-caption text-muted-foreground" title={`${finding.clusterId} · ${finding.resource.namespace ?? copy.noNamespaces}`}>{finding.clusterId} · {finding.resource.namespace ?? copy.noNamespaces}</p>
          </div>
          <p className="min-w-0 truncate text-label text-muted-foreground" title={finding.message}>{finding.message}</p>
        </li>
      ))}
    </ul>
  );
}

export function CatalogSection({ catalog }: { catalog: Extract<ChecksOverview["catalog"], { availability: "available" | "partial" }> }) {
  const copy = checksCopy(useI18n().t);
  return (
    <SurfaceSection className="min-w-0 p-0">
      <details className="group min-w-0">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3.5 py-2 outline-none marker:hidden hover:bg-muted/35 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/40">
          <span className="truncate text-label-2 font-semibold">{copy.catalogStatus}</span>
          <Badge className="ml-auto" variant="outline">{catalog.entries.length}</Badge>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform duration-(--motion-quick) group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <ul className="min-w-0 border-t" aria-label={copy.catalogStatus}>
          {catalog.entries.map((entry) => (
            <li className="grid min-w-0 gap-0.5 border-b border-border-subtle px-3.5 py-2.5 last:border-b-0" key={entry.checkId}>
              <p className="truncate text-label-2 font-semibold" title={entry.title}>{entry.title}</p>
              <p className="truncate text-caption text-muted-foreground" title={entry.description}>{entry.description}</p>
            </li>
          ))}
        </ul>
        {catalog.reasonCodes.length === 0 ? null : <div className="border-t px-3.5 py-2"><ChecksAvailabilityReasons reasons={catalog.reasonCodes} /></div>}
      </details>
    </SurfaceSection>
  );
}

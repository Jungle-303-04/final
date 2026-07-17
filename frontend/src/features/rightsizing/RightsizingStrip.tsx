import { Gauge } from "lucide-react";

import { useI18n } from "../../shared/i18n";
import { StatusMark } from "../../shared/ui/StatusMark";
import { Badge } from "../../shared/ui/primitives/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../shared/ui/primitives/card";
import type {
  RightsizingMetric,
  RightsizingWorkloadEvidence,
} from "./rightsizingContract";
import { groupRightsizingRows } from "./rightsizingModel";
import {
  formatRightsizingQuantity,
  rightsizingActionPresentation,
  rightsizingFitKey,
  rightsizingSignalKey,
} from "./rightsizingPresentation";

export function RightsizingStrip({
  evidence,
}: {
  evidence: RightsizingWorkloadEvidence;
}) {
  const { formatDate, t } = useI18n();
  if (evidence.availability === "unavailable") {
    return (
      <Card data-testid="rightsizing-unavailable">
        <CardHeader><CardTitle>{t("rightsizing.title")}</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm text-muted-foreground">
          <p>{t("rightsizing.description")}</p>
          <p>{t("rightsizing.unavailable")}</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card data-testid="rightsizing-observed">
      <CardHeader className="grid gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Gauge aria-hidden="true" className="size-4 text-muted-foreground" />
          <CardTitle>{t("rightsizing.title")}</CardTitle>
          {evidence.availability === "partial" ? (
            <Badge variant="outline">{t("rightsizing.partial")}</Badge>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">{t("rightsizing.description")}</p>
        <p className="text-xs text-muted-foreground">
          {t("rightsizing.provenance", {
            start: formatDate(Date.parse(evidence.provenance.windowStartedAt)),
            end: formatDate(Date.parse(evidence.provenance.windowEndedAt)),
            collector: evidence.provenance.collector,
            revision: evidence.provenance.algorithmRevision,
          })}
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        {evidence.scaledToZero ? (
          <p className="rounded-lg border p-3 text-sm text-muted-foreground" role="status">
            {t("rightsizing.scaledToZero")}
          </p>
        ) : null}
        {groupRightsizingRows(evidence.rows).map((group) => (
          <section className="grid gap-2" key={group.container}>
            <h3 className="truncate text-sm font-semibold">{group.container}</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {group.rows.map((row) => (
                <RightsizingMetricCard key={row.resource} row={row} />
              ))}
            </div>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}

function RightsizingMetricCard({ row }: { row: RightsizingMetric }) {
  const { formatNumber, t } = useI18n();
  const action = rightsizingActionPresentation(row.action);
  const quantity = (value: RightsizingMetric["currentRequest"]) =>
    formatRightsizingQuantity(value, formatNumber, t("rightsizing.unset"));
  return (
    <article className="grid min-w-0 gap-3 rounded-lg border p-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <span className="font-medium uppercase">{row.resource}</span>
        <StatusMark label={t(action.key)} tone={action.tone} />
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <Fact label={t("rightsizing.current")} value={quantity(row.currentRequest)} />
        <Fact label={t("rightsizing.suggested")} value={quantity(row.recommendedRequest)} />
        <Fact label={t("rightsizing.observed")} value={quantity(row.observedDemand)} />
      </dl>
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{t(rightsizingFitKey(row.fit))}</Badge>
        <Badge variant="outline">{t("rightsizing.confidence", { confidence: row.confidence })}</Badge>
        {row.signals.map((signal) => (
          <Badge key={signal} variant="outline">{t(rightsizingSignalKey(signal))}</Badge>
        ))}
      </div>
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium tabular-nums" title={value}>{value}</dd>
    </div>
  );
}

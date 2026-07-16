import { useI18n } from "../../shared/i18n";
import { Badge } from "../../shared/ui/primitives/badge";
import type { RelationTopologyFrame } from "./useRelationTopologyDataFrame";

export function RelationTopologyEvidenceStatus({
  frame,
}: {
  frame: Extract<RelationTopologyFrame, { phase: "ready" }>;
}) {
  const { formatDate, formatNumber, t } = useI18n();
  const { data } = frame;
  const evidenceLabel = data.availability === "unavailable"
    ? t("resources.graph.relations.evidence.unavailable")
    : data.relationCompleteness === "partial"
      ? t("resources.graph.relations.evidence.partial")
      : t("resources.graph.relations.evidence.exact");
  const observedAt = data.snapshot.observedAt;
  const freshnessLabel = observedAt === null
    ? t("resources.graph.relations.freshness.missing")
    : data.snapshot.stale
      ? t("resources.graph.relations.freshness.stale")
      : frame.refreshing
        ? t("resources.graph.relations.freshness.refreshing")
        : t("resources.graph.relations.freshness.current");
  return (
    <aside
      aria-live="polite"
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/50 px-3 py-1.5 text-[0.6875rem] text-muted-foreground"
      data-slot="relation-topology-evidence-status"
      role="status"
    >
      <Badge variant={data.availability === "unavailable" ? "destructive" : "outline"}>
        {evidenceLabel}
      </Badge>
      {data.relationCompleteness === "partial" ? (
        <span>{t("resources.graph.relations.evidence.reasons", {
          count: formatNumber(data.partialReasonCodes.length),
        })}</span>
      ) : null}
      <span className="ml-auto shrink-0 tabular-nums" data-stale={data.snapshot.stale ? "true" : "false"}>
        {freshnessLabel}
        {observedAt === null ? null : (
          <time dateTime={observedAt} title={formatDate(new Date(observedAt), {
            dateStyle: "medium",
            timeStyle: "medium",
          })}>
            {" · "}{formatDate(new Date(observedAt), { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </time>
        )}
      </span>
      {frame.refreshFailure === null ? null : (
        <span className="shrink-0 text-warning">{t("resources.graph.relations.freshness.refreshFailed")}</span>
      )}
    </aside>
  );
}

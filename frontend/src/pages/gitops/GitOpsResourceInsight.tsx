import type { GitOpsResourceInsights } from "../../features/gitops/gitOpsContract";
import { useI18n } from "../../shared/i18n";
import { Surface } from "../../shared/ui/Surface";
import { StatusPill } from "../../shared/ui/status";

export function GitOpsResourceInsight({ insights }: { insights: GitOpsResourceInsights }) {
  const { t } = useI18n();
  return (
    <div className="grid min-w-0 content-start gap-3">
      <Surface aria-labelledby="gitops-resource-insights-title" as="section" className="min-w-0 p-3">
        <header className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <h4 className="text-label font-bold" id="gitops-resource-insights-title">{t("workflows.resource.insights")}</h4>
          <StatusPill
            label={insights.health ?? insights.status ?? t("common.value.unavailable")}
            tone={statusTone(insights.health ?? insights.status)}
          />
        </header>
        <dl className="mt-2 grid min-w-0 gap-1.5">
          <Fact label={t("workflows.detail.status")} value={insights.status} />
          <Fact label={t("workflows.resource.health")} value={insights.health} />
          <Fact label={t("workflows.sync.table.revision")} value={insights.revision} mono />
          <Fact label={t("workflows.detail.source")} value={insights.source?.name} />
        </dl>
      </Surface>
      {insights.conditions.length ? (
        <Surface aria-label={t("workflows.resource.insights")} as="section" className="min-w-0 overflow-hidden p-0">
          <ul className="m-0 grid list-none divide-y divide-border-subtle p-0">
            {insights.conditions.map((condition, index) => (
              <li className="grid min-w-0 gap-0.5 px-3 py-2" key={`${condition.type}:${index}`}>
                <span className="flex min-w-0 items-center justify-between gap-2">
                  <strong className="truncate text-label-2">{condition.type}</strong>
                  <span className="font-mono text-caption text-caption-foreground">{condition.status}</span>
                </span>
                <span className="truncate text-caption text-caption-foreground" title={condition.message ?? undefined}>
                  {[condition.reason, condition.message, condition.observedAt].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </Surface>
      ) : null}
      {insights.history.length ? (
        <Surface aria-labelledby="gitops-resource-history-title" as="section" className="min-w-0 overflow-hidden p-0">
          <h4 className="border-b border-border-subtle px-3 py-2.5 text-label font-bold" id="gitops-resource-history-title">
            {t("workflows.resource.history")}
          </h4>
          <ul className="m-0 grid list-none divide-y divide-border-subtle p-0">
            {insights.history.map((entry, index) => (
              <li className="grid min-w-0 gap-0.5 px-3 py-2" key={entry.id ?? `${entry.revision}:${index}`}>
                <span className="flex min-w-0 items-center justify-between gap-2">
                  <strong className="truncate font-mono text-label-2">{entry.revision ?? t("common.value.unavailable")}</strong>
                  <span className="shrink-0 text-caption text-caption-foreground">{entry.phase ?? t("common.value.unavailable")}</span>
                </span>
                <span className="truncate text-caption text-caption-foreground" title={entry.message ?? undefined}>
                  {[entry.initiatedBy, entry.message, entry.deployedAt].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </Surface>
      ) : null}
    </div>
  );
}

function Fact({ label, mono = false, value }: { label: string; mono?: boolean; value: string | null | undefined }) {
  const { t } = useI18n();
  return (
    <div className="grid min-w-0 grid-cols-[minmax(5.5rem,0.45fr)_minmax(0,1fr)] gap-2 text-caption-2">
      <dt className="text-caption-foreground">{label}</dt>
      <dd className={`m-0 truncate text-right ${mono ? "font-mono" : ""}`} title={value ?? undefined}>
        {value ?? t("common.value.unavailable")}
      </dd>
    </div>
  );
}

function statusTone(value: string | null): "healthy" | "warning" | "critical" | "unknown" {
  const normalized = value?.toLowerCase() ?? "";
  if (["healthy", "synced", "ready", "succeeded"].includes(normalized)) return "healthy";
  if (["progressing", "pending", "suspended", "degraded"].includes(normalized)) return "warning";
  if (["failed", "missing", "error", "unhealthy"].includes(normalized)) return "critical";
  return "unknown";
}

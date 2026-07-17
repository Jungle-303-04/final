import type { GitOpsSyncTarget } from "../../features/gitops/gitOpsContract";
import { useI18n } from "../../shared/i18n";

export function GitOpsSyncTargetDetails({
  row,
  statusLabel,
}: {
  row: GitOpsSyncTarget;
  statusLabel: string;
}) {
  const { formatDate, t } = useI18n();
  const unavailable = t("common.value.unavailable");
  const items = [
    [t("workflows.sync.table.application"), row.applicationId],
    [t("workflows.sync.table.target"), [row.clusterId, row.namespace].filter(Boolean).join(" / ") || unavailable],
    [t("workflows.sync.table.environment"), row.environment ?? unavailable],
    [t("workflows.sync.table.status"), row.syncStatus ?? statusLabel],
    [t("workflows.sync.table.revision"), row.revision ?? unavailable],
    [t("workflows.sync.table.observed"), formatObserved(row.observedAt, formatDate, unavailable)],
  ] as const;

  return (
    <dl
      aria-label={`${row.applicationName} ${t("common.action.details")}`}
      className="grid gap-x-6 gap-y-3 px-4 py-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      {items.map(([label, value]) => (
        <div className="min-w-0" key={label}>
          <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
          <dd className="mt-1 break-all text-sm">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function formatObserved(
  value: string | null,
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string,
  unavailable: string,
): string {
  if (value === null) return unavailable;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return unavailable;
  return formatDate(timestamp, { dateStyle: "medium", timeStyle: "short" });
}

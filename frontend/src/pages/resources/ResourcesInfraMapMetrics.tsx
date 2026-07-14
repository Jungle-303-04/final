import { useI18n } from "../../shared/i18n";
import { Progress } from "../../shared/ui/primitives/progress";

export type InfraMapMetricMode = "cpu" | "memory";

export function RatioMetric({
  label,
  ratio,
}: {
  label: string;
  ratio: number | null;
}) {
  const { formatNumber, t } = useI18n();
  const percent = ratio === null ? null : ratio * 100;
  const display = ratio === null
    ? t("common.value.unavailable")
    : ratioSplitText(ratio, formatNumber);
  return <MetricBar label={label} value={percent} valueText={display} />;
}

export function CountMetric({
  label,
  total,
  value,
}: {
  label: string;
  total: number | null;
  value: number;
}) {
  const { formatNumber, t } = useI18n();
  const ratio = total !== null && total > 0 ? value / total : null;
  const display = total === null
    ? formatNumber(value)
    : t("resources.infraMap.podCapacityValue", {
        capacity: formatNumber(total),
        count: formatNumber(value),
      });
  return (
    <MetricBar
      label={label}
      value={ratio === null ? null : ratio * 100}
      valueText={display}
    />
  );
}

export function ratioSplitText(
  ratio: number,
  formatNumber: ReturnType<typeof useI18n>["formatNumber"],
): string {
  const used = Math.max(0, ratio);
  const available = Math.max(0, 1 - used);
  return `${formatPercent(used, formatNumber)} / ${formatPercent(available, formatNumber)}`;
}

function MetricBar({
  label,
  value,
  valueText,
}: {
  label: string;
  value: number | null;
  valueText: string;
}) {
  return (
    <div className="grid grid-cols-[4.25rem_minmax(0,1fr)_5.5rem] items-center gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {value === null ? (
        <div
          aria-label={`${label} ${valueText}`}
          className="h-2 rounded-full border border-dashed bg-muted/40"
          role="img"
        />
      ) : (
        <Progress
          aria-label={label}
          className="[&_[data-slot=progress-indicator]]:bg-primary"
          value={clampPercent(value)}
          valueText={valueText}
        />
      )}
      <span className="truncate text-right tabular-nums text-muted-foreground" title={valueText}>
        {valueText}
      </span>
    </div>
  );
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function formatPercent(
  value: number,
  formatNumber: ReturnType<typeof useI18n>["formatNumber"],
): string {
  return formatNumber(value, {
    maximumFractionDigits: 0,
    style: "percent",
  });
}

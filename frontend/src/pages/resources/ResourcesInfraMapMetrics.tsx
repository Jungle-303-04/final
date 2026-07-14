import { useI18n } from "../../shared/i18n";
import { Progress } from "../../shared/ui/primitives/progress";
import type { InfraMapPodMetric } from "./resourcesInfraMapModel";

export function RatioMetric({
  label,
  ratio,
  valueText,
}: {
  label: string;
  ratio: number | null;
  valueText: string | null;
}) {
  const { formatNumber, t } = useI18n();
  const percent = ratio === null ? null : ratio * 100;
  const display = percent === null
    ? valueText ?? t("common.value.unavailable")
    : t("resources.infraMap.percentWithValue", {
        percent: formatNumber(percent / 100, {
          maximumFractionDigits: 0,
          style: "percent",
        }),
        value: valueText ?? "",
      });
  return <MetricBar label={label} value={percent} valueText={display} />;
}

export function PodMetric({
  label,
  metric,
  unit,
}: {
  label: string;
  metric: InfraMapPodMetric;
  unit: string;
}) {
  const { formatNumber, t } = useI18n();
  const valueText = metric.value === null
    ? t("common.value.unavailable")
    : t("resources.infraMap.podUsageValue", {
        unit,
        value: formatNumber(metric.value, { maximumFractionDigits: 1 }),
      });
  return (
    <MetricBar
      label={label}
      value={metric.scale === null ? null : metric.scale * 100}
      valueText={valueText}
    />
  );
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
    <div className="grid grid-cols-[4.25rem_minmax(0,1fr)_4rem] items-center gap-2 text-xs">
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

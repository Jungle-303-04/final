import { Cpu, MemoryStick } from "lucide-react";

import { useI18n } from "../../shared/i18n";
import { Badge } from "../../shared/ui/primitives/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../shared/ui/primitives/card";
import { Progress } from "../../shared/ui/primitives/progress";
import type { CostCurrentAllocation } from "./costContract";
import { allocationUsePercent, formatCostMicros } from "./costFormat";

export function CurrentAllocationUse({
  allocation,
  currency,
}: {
  allocation: CostCurrentAllocation;
  currency: string;
}) {
  const { formatNumber, t } = useI18n();
  return (
    <Card data-testid="workload-current-allocation">
      <CardHeader>
        <CardTitle>{t("cost.workload.current.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("cost.workload.current.description")}</p>
      </CardHeader>
      <CardContent className="grid gap-5">
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <CostFact label={t("cost.workload.hourly")} value={formatCostMicros(allocation.hourlyRateMicros, currency, formatNumber)} />
          <CostFact label={t("cost.workload.daily")} value={formatCostMicros(allocation.projectedDailyMicros, currency, formatNumber)} />
          <CostFact label={t("cost.workload.monthly")} value={formatCostMicros(allocation.projectedMonthlyMicros, currency, formatNumber)} />
          <CostFact label={t("cost.workload.replicas")} value={formatNumber(allocation.replicas)} />
        </dl>
        <div className="grid gap-3 md:grid-cols-2">
          <AllocationResource
            icon={<Cpu aria-hidden="true" className="size-4" />}
            label={t("cost.workload.cpu")}
            rateMicros={allocation.cpuRateMicros}
            useBasisPoints={allocation.cpuAllocationUseBasisPoints}
            currency={currency}
          />
          <AllocationResource
            icon={<MemoryStick aria-hidden="true" className="size-4" />}
            label={t("cost.workload.memory")}
            rateMicros={allocation.memoryRateMicros}
            useBasisPoints={allocation.memoryAllocationUseBasisPoints}
            currency={currency}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function AllocationResource({
  currency,
  icon,
  label,
  rateMicros,
  useBasisPoints,
}: {
  currency: string;
  icon: React.ReactNode;
  label: string;
  rateMicros: number;
  useBasisPoints: number | null;
}) {
  const { formatNumber, t } = useI18n();
  const percentage = allocationUsePercent(useBasisPoints);
  const progressValue = rateMicros === 0 ? 0 : percentage;
  const useLabel = rateMicros === 0
    ? t("cost.workload.noAllocation")
    : percentage === null
      ? t("cost.workload.usageUnavailable")
      : t("cost.workload.usageMeasured", {
          percentage: formatNumber(percentage / 100, { maximumFractionDigits: 1, style: "percent" }),
        });
  return (
    <section className="grid min-w-0 gap-3 rounded-lg border p-4">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h4 className="flex min-w-0 items-center gap-2 font-medium">{icon}<span className="truncate">{label}</span></h4>
        <Badge className="shrink-0 tabular-nums" variant="outline">
          {formatCostMicros(rateMicros, currency, formatNumber)}
        </Badge>
      </div>
      <Progress aria-label={t("cost.workload.usageLabel", { resource: label })} value={progressValue} valueText={useLabel} />
      <p className="text-xs text-muted-foreground">{useLabel}</p>
    </section>
  );
}

function CostFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-lg border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-semibold tabular-nums" title={value}>{value}</dd>
    </div>
  );
}

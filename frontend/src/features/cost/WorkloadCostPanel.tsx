import { useI18n } from "../../shared/i18n";
import { Badge } from "../../shared/ui/primitives/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../shared/ui/primitives/card";
import { CurrentAllocationUse } from "./CurrentAllocationUse";
import { CostTrendChart } from "./CostTrendChart";
import type { CostWorkloadAllocation } from "./costContract";

export function WorkloadCostPanel({ cost }: { cost: CostWorkloadAllocation }) {
  const { t } = useI18n();
  if (cost.availability === "unavailable") {
    return (
      <Card data-testid="workload-cost-unavailable">
        <CardHeader><CardTitle>{t("cost.workload.title")}</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {t("cost.status.unavailable")}
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="grid min-w-0 gap-4">
      {cost.availability === "partial" ? (
        <Badge className="w-fit" variant="outline">{t("cost.trend.partial")}</Badge>
      ) : null}
      <CurrentAllocationUse allocation={cost.current} currency={cost.currency} />
      <CostTrendChart timeRange={cost.trend.timeRange} trend={cost.trend} />
    </div>
  );
}

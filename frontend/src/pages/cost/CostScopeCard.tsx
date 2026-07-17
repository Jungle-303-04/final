import type { CostClusterScope, CostOverview } from "../../features/cost/costContract";
import { useI18n, type TranslationFunction } from "../../shared/i18n";
import { Badge } from "../../shared/ui/primitives/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../shared/ui/primitives/card";

export function CostScopeCard({ overview }: { overview: CostOverview }) {
  const { t } = useI18n();
  const coverage = overview.scopeCoverage;
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{t("cost.scope.title")}</CardTitle>
        {coverage.availability === "available" ? null : <p className="text-sm text-muted-foreground">{t("cost.scope.unavailable")}</p>}
      </CardHeader>
      <CardContent className="grid min-w-0 gap-3">
        {coverage.scopes.length === 0 ? <p className="text-sm text-muted-foreground">{t("cost.value.notObserved")}</p> : (
          <ul className="grid min-w-0 gap-2" aria-label={t("cost.scope.title")}>
            {coverage.scopes.map((scope) => <CostScopeRow key={scope.clusterId} scope={scope} />)}
          </ul>
        )}
        <AvailabilityReasons reasons={coverage.reasonCodes} />
      </CardContent>
    </Card>
  );
}

export function AvailabilityReasons({ reasons }: { reasons: readonly string[] }) {
  const { t } = useI18n();
  if (reasons.length === 0) return null;
  return (
    <ul className="grid gap-1 pt-1 text-xs text-muted-foreground" aria-label={t("cost.reasons.label")}>
      {humanAvailabilityReasons(reasons, t).map((reason) => <li key={reason}>{reason}</li>)}
    </ul>
  );
}

function CostScopeRow({ scope }: { scope: CostClusterScope }) {
  const { t } = useI18n();
  return (
    <li className="grid min-w-0 gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <p className="truncate font-medium" title={scope.clusterId}>{scope.clusterId}</p>
        <p className="mt-0.5 break-words text-xs text-muted-foreground">{t("cost.scope.allNamespaces")}</p>
      </div>
      <Badge variant={scope.freshness === "live" ? "secondary" : "outline"}>{scope.freshness}</Badge>
    </li>
  );
}

function humanAvailabilityReasons(
  reasons: readonly string[],
  t: TranslationFunction,
): readonly string[] {
  const messages = new Set<string>();
  for (const reason of reasons) {
    if (reason === "authorization_scope_empty") messages.add(t("cost.scope.reason.authorization"));
    else if (reason.startsWith("inventory_snapshot_unavailable:")) messages.add(t("cost.scope.reason.unavailable"));
    else if (reason.startsWith("inventory_snapshot_incomplete:") || reason === "agent_snapshot_truncated") messages.add(t("cost.scope.reason.partial"));
    else if (reason !== "cost_observation_not_integrated") messages.add(t("cost.scope.reason.generic"));
  }
  return [...messages];
}

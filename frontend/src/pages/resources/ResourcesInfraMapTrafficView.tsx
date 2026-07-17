import { Activity, Network, RefreshCw, Route, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

import type {
  TrafficClusterScope,
  TrafficOverview,
  TrafficOverviewRequest,
  TrafficPort,
  TrafficPortFailure,
} from "../../features/traffic/trafficContract";
import { useTrafficOverview } from "../../features/traffic/useTrafficOverview";
import { useI18n } from "../../shared/i18n";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { Skeleton } from "../../shared/ui/primitives/skeleton";

export function ResourcesInfraMapTrafficView({
  port,
  request,
}: {
  port: TrafficPort;
  request: TrafficOverviewRequest;
}) {
  const { frame, refresh } = useTrafficOverview(port, request);
  if (frame.phase === "idle" || frame.phase === "loading") return <TrafficLoading />;
  if (frame.phase === "failed") {
    return <TrafficFailure failure={frame.failure} onRetry={refresh} />;
  }
  return (
    <TrafficOverviewContent
      overview={frame.data}
      onRefresh={refresh}
      refreshFailure={frame.refreshFailure}
      refreshing={frame.refreshing}
    />
  );
}

function TrafficOverviewContent({
  overview,
  onRefresh,
  refreshFailure,
  refreshing,
}: {
  overview: TrafficOverview;
  onRefresh: () => void;
  refreshFailure: TrafficPortFailure | null;
  refreshing: boolean;
}) {
  const { t } = useI18n();
  const reasonCodes = trafficReasonCodes(overview);
  return (
    <section
      aria-labelledby="resources-infra-map-traffic-title"
      className="mt-4 grid min-w-0 gap-3"
      data-slot="resources-infra-map-traffic-view"
    >
      <div className="grid min-w-0 gap-2 sm:grid-cols-3">
        <TrafficStat
          icon={<Route aria-hidden="true" className="size-4" />}
          label={t("resources.infraMap.traffic.totalFlows")}
          value={observedNumberLabel(overview.summary.totalFlowCount, t)}
        />
        <TrafficStat
          icon={<ShieldAlert aria-hidden="true" className="size-4" />}
          label={t("resources.infraMap.traffic.deniedFlows")}
          value={observedNumberLabel(overview.summary.deniedFlowCount, t)}
        />
        <TrafficStat
          icon={<Network aria-hidden="true" className="size-4" />}
          label={t("resources.infraMap.traffic.externalFlows")}
          value={observedNumberLabel(overview.summary.externalFlowCount, t)}
        />
      </div>

      <div className="grid min-h-48 place-items-center rounded-lg border border-dashed bg-background/50 px-4 py-8 text-center">
        <div className="grid max-w-xl justify-items-center gap-3">
          <Network aria-hidden="true" className="size-8 text-muted-foreground" />
          <div className="grid gap-1">
            <h3 className="text-sm font-semibold" id="resources-infra-map-traffic-title">
              {t("resources.infraMap.traffic.unavailableTitle")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("resources.infraMap.traffic.unavailableDescription")}
            </p>
          </div>
          <Button disabled={refreshing} onClick={onRefresh} size="sm" type="button" variant="outline">
            <RefreshCw aria-hidden="true" className={refreshing ? "animate-spin" : undefined} />
            {t("common.action.retry")}
          </Button>
        </div>
      </div>

      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.55fr)]">
        <TrafficScopeCard overview={overview} />
        <TrafficReasonsCard reasonCodes={reasonCodes} />
      </div>
      {refreshFailure ? (
        <p className="text-sm text-destructive" role="alert">
          {t("resources.infraMap.traffic.refreshFailed")}
        </p>
      ) : null}
    </section>
  );
}

function TrafficStat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border bg-background/65 px-3 py-2">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}

function TrafficScopeCard({ overview }: { overview: TrafficOverview }) {
  const { t } = useI18n();
  const observedAt = overview.scopeCoverage.observedAt;
  return (
    <section className="grid min-w-0 gap-2 rounded-lg border bg-background/55 p-3">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{t("resources.infraMap.traffic.scope")}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {observedAt ?? t("resources.infraMap.traffic.notObserved")}
          </p>
        </div>
        <Badge variant={overview.scopeCoverage.availability === "available" ? "secondary" : "outline"}>
          {overview.scopeCoverage.availability}
        </Badge>
      </div>
      {overview.scopeCoverage.scopes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("resources.infraMap.traffic.scopeEmpty")}</p>
      ) : (
        <ul className="grid min-w-0 gap-2" aria-label={t("resources.infraMap.traffic.scope")}>
          {overview.scopeCoverage.scopes.map((scope) => (
            <TrafficScopeRow key={scope.clusterId} scope={scope} />
          ))}
        </ul>
      )}
    </section>
  );
}

function TrafficScopeRow({ scope }: { scope: TrafficClusterScope }) {
  const { t } = useI18n();
  return (
    <li className="grid min-w-0 gap-1 rounded-md border bg-card/60 px-3 py-2">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="truncate text-sm font-medium" title={scope.clusterId}>
          {scope.clusterId}
        </p>
        <Badge variant={scope.freshness === "live" ? "secondary" : "outline"}>
          {scope.freshness}
        </Badge>
      </div>
      <p className="break-words text-xs text-muted-foreground">
        {scope.namespaces.length > 0
          ? scope.namespaces.join(", ")
          : t("resources.infraMap.traffic.allNamespaces")}
      </p>
    </li>
  );
}

function TrafficReasonsCard({ reasonCodes }: { reasonCodes: readonly string[] }) {
  const { t } = useI18n();
  return (
    <section className="grid min-w-0 gap-2 rounded-lg border bg-background/55 p-3">
      <div className="flex min-w-0 items-center gap-2">
        <Activity aria-hidden="true" className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{t("resources.infraMap.traffic.reasonCodes")}</h3>
      </div>
      {reasonCodes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("resources.infraMap.traffic.noReasons")}</p>
      ) : (
        <ul className="grid min-w-0 gap-1" aria-label={t("resources.infraMap.traffic.reasonCodes")}>
          {reasonCodes.map((reason) => (
            <li className="break-all rounded-md bg-muted/60 px-2 py-1 font-mono text-xs text-muted-foreground" key={reason}>
              {reason}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TrafficFailure({
  failure,
  onRetry,
}: {
  failure: TrafficPortFailure;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="mt-5 grid min-h-36 place-items-center rounded-lg border border-dashed bg-background/50 px-6 text-center">
      <div className="grid justify-items-center gap-3">
        <Network aria-hidden="true" className="size-6 text-muted-foreground" />
        <p className="text-sm font-medium">{t("resources.infraMap.traffic.failed")}</p>
        <p className="font-mono text-xs text-muted-foreground">{failure.code}</p>
        <Button onClick={onRetry} size="sm" type="button" variant="outline">
          <RefreshCw aria-hidden="true" />
          {t("common.action.retry")}
        </Button>
      </div>
    </div>
  );
}

function TrafficLoading() {
  return (
    <div className="mt-4 grid min-w-0 gap-3" data-slot="resources-infra-map-traffic-loading">
      <div className="grid min-w-0 gap-2 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div className="rounded-lg border bg-background/65 p-3" key={index}>
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="mt-3 h-5 w-2/3" />
          </div>
        ))}
      </div>
      <Skeleton className="h-48 rounded-lg" />
    </div>
  );
}

function trafficReasonCodes(overview: TrafficOverview): readonly string[] {
  return [...new Set([
    ...overview.scopeCoverage.reasonCodes,
    ...overview.observation.reasonCodes,
    ...overview.summary.reasonCodes,
    ...overview.relationships.reasonCodes,
  ])].sort();
}

function observedNumberLabel(
  value: number | null,
  t: ReturnType<typeof useI18n>["t"],
): string {
  return value === null
    ? t("resources.infraMap.traffic.notObserved")
    : new Intl.NumberFormat().format(value);
}

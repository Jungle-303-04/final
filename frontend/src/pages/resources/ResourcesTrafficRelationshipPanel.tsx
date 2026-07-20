import { X } from "lucide-react";
import { useMemo } from "react";

import type {
  TrafficAvailability,
  TrafficEndpoint,
  TrafficOverview,
} from "../../features/traffic/trafficContract";
import { useI18n, type TranslationFunction } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import { Surface } from "../../shared/ui/Surface";
import { Button } from "../../shared/ui/primitives/button";
import { Skeleton } from "../../shared/ui/primitives/skeleton";
import {
  hasTrafficIssue,
  projectTrafficServices,
  trafficServiceKey,
  type TrafficServiceProjection,
} from "./resourcesTrafficRelationshipModel";

export { projectTrafficServices, trafficServiceKey };
export type { TrafficServiceProjection };

export function ResourcesTrafficRelationshipPanel({
  focusedService,
  loading,
  onFocus,
  onOpen,
  overview,
}: {
  focusedService: string | null;
  loading: boolean;
  onFocus: (service: TrafficServiceProjection | null) => void;
  onOpen: (endpoint: TrafficEndpoint) => void;
  overview: TrafficOverview | null;
}) {
  const { formatNumber, t } = useI18n();
  const copy = trafficPanelCopy(t);
  const services = useMemo(() => projectTrafficServices(overview), [overview]);
  return (
    <Surface
      aria-labelledby="resources-traffic-relationship-title"
      className="flex min-h-0 min-w-0 flex-col overflow-hidden"
      data-slot="resources-traffic-relationship-panel"
    >
      <header className="flex min-w-0 items-center gap-2 px-3 pb-2 pt-3">
        <h2
          className="min-w-0 flex-1 truncate text-body-strong font-bold tracking-[-0.02em]"
          id="resources-traffic-relationship-title"
        >
          {copy.title}
        </h2>
        {focusedService ? (
          <Button
            aria-label={copy.clear}
            onClick={() => onFocus(null)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </header>
      <div className="min-h-48 min-w-0 flex-1 overflow-y-auto px-2 pb-2 [scrollbar-gutter:stable]">
        {loading ? (
          <div aria-label={copy.loading} className="grid gap-2 p-1" role="status">
            {[0, 1, 2, 3].map((index) => <Skeleton className="h-14 rounded-lg" key={index} />)}
          </div>
        ) : services.length === 0 ? (
          <p className="grid min-h-44 place-items-center px-3 text-center text-label leading-5 text-muted-foreground" role="status">
            {copy.empty}
          </p>
        ) : (
          <ul aria-label={copy.list} className="grid min-w-0 gap-1">
            {services.map((service) => (
              <li className="min-w-0" key={service.key}>
                <button
                  aria-pressed={focusedService === service.key}
                  className={cn(
                    "grid min-h-14 w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-[9px] border px-2.5 py-2 text-left outline-none transition-[background-color,border-color,transform] duration-(--motion-quick) ease-(--ease-soft) hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.99] motion-reduce:transform-none motion-reduce:transition-none",
                    focusedService === service.key
                      ? "border-primary/35 bg-primary/8"
                      : "border-transparent",
                  )}
                  onClick={() => onFocus(focusedService === service.key ? null : service)}
                  onDoubleClick={service.endpoint.namespace === null
                    ? undefined
                    : () => onOpen(service.endpoint)}
                  title={`${service.endpoint.name} · ${service.endpoint.namespace === null ? copy.focusHint : copy.openHint}`}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-2 shrink-0 rounded-[3px]",
                      trafficStateTone(service) === "critical"
                        ? "bg-status-critical"
                        : trafficStateTone(service) === "healthy"
                          ? "bg-status-healthy"
                          : "bg-muted-foreground/45",
                    )}
                  />
                  <span className="grid min-w-0 gap-0.5">
                    <span className="flex min-w-0 items-baseline gap-2">
                      <strong className="min-w-0 flex-1 truncate font-mono text-label-2 font-bold" title={service.endpoint.name}>
                        {service.endpoint.name}
                      </strong>
                      <span
                        className="shrink-0 font-mono text-caption font-bold tabular-nums text-foreground"
                        data-slot="traffic-service-rate"
                      >
                        {formatServiceRate(service, formatNumber, copy)}
                      </span>
                    </span>
                    <span className="flex min-w-0 items-baseline gap-2 text-caption text-caption-foreground">
                      <span className="min-w-0 flex-1 truncate">
                        {service.endpoint.namespace ?? copy.external} · {formatConnections(service, formatNumber, copy)}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 font-mono font-semibold tabular-nums",
                          service.errorRatePercent != null && service.errorRatePercent > 0 && "text-status-critical",
                        )}
                        data-slot="traffic-service-error-rate"
                        title={service.metricReasonCodes.join(", ") || undefined}
                      >
                        {formatServiceError(service, formatNumber, copy)}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="border-t px-3 py-2 text-caption leading-5 text-caption-foreground">
        {copy.openHint}
      </p>
    </Surface>
  );
}

function trafficStateTone(service: TrafficServiceProjection): "critical" | "healthy" | "unknown" {
  if (hasTrafficIssue(service)) return "critical";
  if (service.metricAvailability === "available" && service.errorRatePercent === 0) return "healthy";
  if ((service.connections ?? 0) > 0 && service.unhealthyEdges === 0) return "healthy";
  return "unknown";
}

function formatConnections(
  service: TrafficServiceProjection,
  formatNumber: (value: number) => string,
  copy: ReturnType<typeof trafficPanelCopy>,
): string {
  return service.connections === null
    ? copy.connectionsUnavailable
    : `${formatNumber(service.connections)} ${copy.connections}`;
}

function formatServiceRate(
  service: TrafficServiceProjection,
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string,
  copy: ReturnType<typeof trafficPanelCopy>,
): string {
  if (service.metricAvailability !== "available" || service.ratePerSecond === null || service.rateUnit === null) {
    return metricStateLabel(service.metricAvailability, copy);
  }
  const unit = service.rateUnit === "requests" ? copy.requestsPerSecond : copy.flowsPerSecond;
  return `${formatNumber(service.ratePerSecond, { maximumFractionDigits: 1 })} ${unit}`;
}

function formatServiceError(
  service: TrafficServiceProjection,
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string,
  copy: ReturnType<typeof trafficPanelCopy>,
): string {
  if (service.metricAvailability !== "available" || service.errorRatePercent === null) return copy.errorUnavailable;
  return `${copy.errorShort} ${formatNumber(service.errorRatePercent, { maximumFractionDigits: 1 })}%`;
}

function metricStateLabel(
  availability: TrafficAvailability | null,
  copy: ReturnType<typeof trafficPanelCopy>,
): string {
  if (availability === "partial") return copy.metricsPartial;
  if (availability === "unavailable") return copy.metricsUnavailable;
  return copy.metricsMissing;
}

function trafficPanelCopy(t: TranslationFunction) {
  return {
    clear: t("resources.trafficPanel.clear"),
    connections: t("resources.trafficPanel.connections"),
    connectionsUnavailable: t("resources.trafficPanel.connectionsUnavailable"),
    empty: t("resources.trafficPanel.empty"),
    errorShort: t("resources.trafficPanel.errorShort"),
    errorUnavailable: t("resources.trafficPanel.errorUnavailable"),
    external: t("resources.trafficPanel.external"),
    focusHint: t("resources.trafficPanel.focusHint"),
    flowsPerSecond: t("resources.trafficPanel.flowsPerSecond"),
    list: t("resources.trafficPanel.list"),
    loading: t("resources.trafficPanel.loading"),
    metricsMissing: t("resources.trafficPanel.metricsMissing"),
    metricsPartial: t("resources.trafficPanel.metricsPartial"),
    metricsUnavailable: t("resources.trafficPanel.metricsUnavailable"),
    openHint: t("resources.trafficPanel.openHint"),
    requestsPerSecond: t("resources.trafficPanel.requestsPerSecond"),
    title: t("resources.trafficPanel.title"),
  };
}

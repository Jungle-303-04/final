import { RefreshCw } from "lucide-react";

import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type {
  TrafficEndpoint,
  TrafficPort,
} from "../../features/traffic/trafficContract";
import { trafficCopy } from "../../features/traffic/trafficCopy";
import { useI18n } from "../../shared/i18n";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { Surface, SurfaceSection } from "../../shared/ui/Surface";
import { Button } from "../../shared/ui/primitives/button";
import {
  TrafficFlowSurface,
  type TrafficFlowUrlState,
} from "../traffic/TrafficFlowSurface";
import { useTrafficOverview } from "../traffic/useTrafficOverviewData";
import { ResourcesTrafficSourcesSection } from "./ResourcesTrafficSourcesSection";
import { ResourcesViewSwitcher } from "./ResourcesViewSwitcher";

export function ResourcesTrafficFlowSurface({
  onOpenService,
  port,
  setView,
}: {
  onOpenService: (
    clusterId: string,
    identity: {
      resourceType: "service";
      kind: "Service";
      namespace: string;
      name: string;
    },
  ) => void;
  port: TrafficPort;
  setView: (view: "map" | "list" | "flow") => void;
}) {
  const { t } = useI18n();
  const filter = useUnifiedFilter();
  const state: TrafficFlowUrlState = {
    since: filter.detail.trafficSince ?? "5m",
    protocols: filter.detail.trafficProtocols ?? [],
    verdicts: filter.detail.trafficVerdicts ?? [],
    sort: filter.detail.trafficSort ?? "connections",
    order: filter.detail.trafficOrder ?? "desc",
    selectedFlowId: filter.detail.trafficFlow ?? null,
  };
  const data = useTrafficOverview(port, {
    clusterIds: [],
    namespaces: [],
    since: state.since,
    protocols: state.protocols,
    verdicts: state.verdicts,
    sort: state.sort,
    order: state.order,
    cursor: filter.detail.trafficCursor ?? undefined,
  });
  const copy = trafficCopy(t);
  const openService = (endpoint: TrafficEndpoint) => {
    const name = serviceName(endpoint);
    if (name === null || endpoint.namespace === null) return;
    onOpenService(endpoint.clusterId, {
      resourceType: "service",
      kind: "Service",
      namespace: endpoint.namespace,
      name,
    });
  };

  return (
    <div className="grid min-w-0 gap-4" data-slot="resources-flow-surface">
      <ResourcesViewSwitcher onChange={setView} view="flow" />
      <Surface aria-labelledby="resources-flow-title" className="min-w-0">
        <SurfaceSection className="flex min-w-0 flex-wrap items-start justify-between gap-3 p-4">
          <div className="grid min-w-0 gap-1">
            <h2 className="text-lg font-semibold" id="resources-flow-title">{copy.flowMap}</h2>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {copy.description}
            </p>
          </div>
          <Button onClick={data.refresh} size="sm" type="button" variant="outline">
            <RefreshCw aria-hidden="true" />
            {copy.refresh}
          </Button>
        </SurfaceSection>
        <ResourcesTrafficSourcesSection
          frame={data.sourcesFrame}
          onRefresh={data.refresh}
          port={port}
        />
        {data.frame.phase === "idle" || data.frame.phase === "loading" ? (
          <ProductStateScreen kind="loading" placement="content" />
        ) : data.frame.phase === "failed" ? (
          <ProductStateScreen
            issue={{ code: "unknown", safeDetail: data.frame.failure.code }}
            kind="error"
            placement="content"
          />
        ) : (
          <TrafficFlowSurface
            isEndpointOpenable={(endpoint) => serviceName(endpoint) !== null}
            onChangeFilters={(update) => filter.updateDetail((current) => ({
              ...current,
              trafficSince: update.since ?? current.trafficSince,
              trafficProtocols: update.protocols ?? current.trafficProtocols,
              trafficVerdicts: update.verdicts ?? current.trafficVerdicts,
              trafficSort: update.sort ?? current.trafficSort,
              trafficOrder: update.order ?? current.trafficOrder,
              trafficCursor: null,
              trafficFlow: null,
            }), "traffic-filter")}
            onNextPage={(cursor) => filter.updateDetail((current) => ({
              ...current,
              trafficCursor: cursor,
              trafficFlow: null,
            }), "traffic-page")}
            onOpenEndpoint={openService}
            onSelectFlow={(flowId) => filter.updateDetail((current) => ({
              ...current,
              trafficFlow: flowId,
            }), "traffic-flow")}
            overview={data.frame.data}
            state={state}
          />
        )}
      </Surface>
    </div>
  );
}

function serviceName(endpoint: TrafficEndpoint): string | null {
  if (endpoint.namespace === null) return null;
  if (endpoint.service) return endpoint.service;
  return endpoint.kind.toLocaleLowerCase() === "service" ? endpoint.name : null;
}

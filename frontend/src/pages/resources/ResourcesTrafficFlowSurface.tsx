import { RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type {
  TrafficEndpoint,
  TrafficOverview,
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
import {
  ResourcesTrafficRelationshipPanel,
  trafficServiceKey,
  type TrafficServiceProjection,
} from "./ResourcesTrafficRelationshipPanel";
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
  const [focusedService, setFocusedService] = useState<string | null>(null);
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
  const overview = data.frame.phase === "ready" ? data.frame.data : null;
  const focusedOverview = useMemo(
    () => focusTrafficOverview(overview, focusedService),
    [focusedService, overview],
  );

  return (
    <div className="grid min-w-0 gap-4" data-slot="resources-flow-surface">
      <ResourcesViewSwitcher onChange={setView} view="flow" />
      <Surface as="div" aria-labelledby="resources-flow-title" className="min-w-0 overflow-hidden">
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
        <details className="group border-t" data-slot="resources-traffic-sources-disclosure">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-4 py-2 text-label font-semibold outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1 truncate">{t("traffic.sources.title")}</span>
            <span className="shrink-0 text-caption font-normal text-caption-foreground">
              {trafficSourcesSummary(data.sourcesFrame, t("common.state.loading"), t("common.state.unavailable"))}
            </span>
            <span aria-hidden="true" className="transition-transform duration-(--motion-quick) group-open:rotate-180 motion-reduce:transition-none">⌄</span>
          </summary>
          <ResourcesTrafficSourcesSection
            frame={data.sourcesFrame}
            onRefresh={data.refresh}
            port={port}
          />
        </details>
      </Surface>
      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_15.5rem]">
        <Surface aria-label={copy.flowMap} className="min-w-0 overflow-hidden">
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
              overview={focusedOverview ?? data.frame.data}
              state={state}
            />
          )}
        </Surface>
        <aside className="min-w-0 lg:sticky lg:top-4 lg:max-h-[calc(100svh-8.5rem)]" data-slot="resources-traffic-relationship-rail">
          <ResourcesTrafficRelationshipPanel
            focusedService={focusedService}
            loading={data.frame.phase === "idle" || data.frame.phase === "loading"}
            onFocus={(service: TrafficServiceProjection | null) => setFocusedService(service?.key ?? null)}
            onOpen={openService}
            overview={overview}
          />
        </aside>
      </div>
    </div>
  );
}

function focusTrafficOverview(
  overview: TrafficOverview | null,
  focusedService: string | null,
): TrafficOverview | null {
  if (overview === null || focusedService === null ||
    overview.relationships.availability === "unavailable") return overview;
  const edges = overview.relationships.edges.filter((edge) =>
    [edge.source, edge.target].some((endpoint) => {
      const service = serviceName(endpoint);
      return service !== null && trafficServiceKey({ ...endpoint, name: service, service }) === focusedService;
    }));
  return {
    ...overview,
    relationships: {
      ...overview.relationships,
      edges,
      totalCount: edges.length,
      hasMore: false,
      nextCursor: null,
    },
  };
}

function trafficSourcesSummary(
  frame: ReturnType<typeof useTrafficOverview>["sourcesFrame"],
  loading: string,
  unavailable: string,
): string {
  if (frame.phase === "idle" || frame.phase === "loading") return loading;
  if (frame.phase === "failed") return unavailable;
  const active = frame.data.clusters.filter((cluster) => cluster.activeSource !== null).length;
  return `${active}/${frame.data.clusters.length}`;
}

function serviceName(endpoint: TrafficEndpoint): string | null {
  if (endpoint.namespace === null) return null;
  if (endpoint.service) return endpoint.service;
  return endpoint.kind.toLocaleLowerCase() === "service" ? endpoint.name : null;
}

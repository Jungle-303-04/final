import { ArrowRight, Network } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";

import type {
  TrafficOverview,
  TrafficEndpoint,
  TrafficRelationship,
} from "../../features/traffic/trafficContract";
import { trafficCopy, type TrafficCopy } from "../../features/traffic/trafficCopy";
import { useI18n } from "../../shared/i18n";
import { SurfaceSection } from "../../shared/ui/Surface";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../../shared/ui/primitives/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../shared/ui/primitives/table";
import {
  TrafficFlowFilters,
  type TrafficFlowUrlState,
} from "./TrafficFlowFilters";
export type { TrafficFlowUrlState } from "./TrafficFlowFilters";

export function TrafficFlowSurface({
  overview,
  onChangeFilters,
  onNextPage,
  onOpenEndpoint,
  onSelectFlow,
  isEndpointOpenable,
  state,
}: {
  overview: TrafficOverview;
  onChangeFilters: (update: Partial<Omit<TrafficFlowUrlState, "selectedFlowId">>) => void;
  onNextPage: (cursor: string) => void;
  onOpenEndpoint?: (endpoint: TrafficEndpoint) => void;
  onSelectFlow: (flowId: string | null) => void;
  isEndpointOpenable?: (endpoint: TrafficEndpoint) => boolean;
  state: TrafficFlowUrlState;
}) {
  const { t } = useI18n();
  const copy = useTrafficCopy();
  const lastSelectedFlow = useRef<string | null>(state.selectedFlowId);
  if (overview.relationships.availability === "unavailable") {
    return (
      <SurfaceSection className="grid min-w-0 gap-2 p-4" role="region" aria-label={copy.relationships}>
        <h3 className="text-base font-semibold">{copy.relationships}</h3>
        <p className="text-sm text-muted-foreground">{copy.relationshipsUnavailable}</p>
      </SurfaceSection>
    );
  }
  const relationships = overview.relationships;
  const selectFlow = (flowId: string | null) => {
    if (flowId !== null) lastSelectedFlow.current = flowId;
    const restore = flowId === null ? lastSelectedFlow.current : null;
    onSelectFlow(flowId);
    if (restore) {
      requestAnimationFrame(() => {
        document.querySelector<HTMLButtonElement>(`[data-traffic-flow-row="${restore}"]`)?.focus();
      });
    }
  };
  const selected = relationships.edges.find((edge) => edge.flowId === state.selectedFlowId) ?? null;
  const selectedIndex = selected === null
    ? -1
    : relationships.edges.findIndex((edge) => edge.flowId === selected.flowId);
  return (
    <>
      <TrafficFlowFilters
        facets={relationships.facets}
        onChange={onChangeFilters}
        state={state}
      />
      <TrafficFlowMap
        edges={relationships.edges.slice(0, 8)}
        isEndpointOpenable={isEndpointOpenable}
        onOpenEndpoint={onOpenEndpoint}
        onSelect={selectFlow}
      />
      <SurfaceSection className="min-w-0" role="region" aria-labelledby="traffic-relationships-title">
        <header className="border-b p-4">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold" id="traffic-relationships-title">{copy.relationships}</h3>
            <Badge variant="outline">
              {t("traffic.flow.count", { count: relationships.totalCount })}
            </Badge>
          </div>
        </header>
        {relationships.edges.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{copy.observedEmpty}</p>
        ) : (
          <Table scrollAreaLabel={copy.flowTable}>
            <TableHeader>
              <TableRow>
                <TableHead>{copy.source}</TableHead>
                <TableHead>{copy.destination}</TableHead>
                <TableHead>{copy.protocol}</TableHead>
                <TableHead>{copy.verdict}</TableHead>
                <TableHead className="text-right">{copy.connections}</TableHead>
                <TableHead>{copy.observedAt}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {relationships.edges.map((edge) => (
                <TableRow data-state={edge.flowId === state.selectedFlowId ? "selected" : undefined} key={edge.flowId}>
                  <TableCell>
                    <EndpointAction
                      edge={edge}
                      endpoint="source"
                      isEndpointOpenable={isEndpointOpenable}
                      onOpenEndpoint={onOpenEndpoint}
                      onSelectFlow={selectFlow}
                    />
                  </TableCell>
                  <TableCell>
                    <EndpointAction
                      edge={edge}
                      endpoint="target"
                      isEndpointOpenable={isEndpointOpenable}
                      onOpenEndpoint={onOpenEndpoint}
                      onSelectFlow={selectFlow}
                    />
                  </TableCell>
                  <TableCell>{edge.protocol.toUpperCase()}{edge.port ? `:${edge.port}` : ""}</TableCell>
                  <TableCell><Badge variant={edge.verdict === "forwarded" ? "secondary" : "outline"}>{edge.verdict}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{edge.connections.toLocaleString()}</TableCell>
                  <TableCell><ObservedAt value={edge.observedAt} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {relationships.hasMore && relationships.nextCursor ? (
          <div className="flex justify-end border-t p-3">
            <Button onClick={() => onNextPage(relationships.nextCursor ?? "")} type="button" variant="outline">
              {copy.nextPage}
            </Button>
          </div>
        ) : null}
      </SurfaceSection>
      <TrafficFlowDetailSheet
        edge={selected}
        onClose={() => selectFlow(null)}
        onNavigate={(direction) => {
          const next = relationships.edges[selectedIndex + direction];
          if (next) selectFlow(next.flowId);
        }}
      />
    </>
  );
}

function TrafficFlowMap({
  edges,
  isEndpointOpenable,
  onOpenEndpoint,
  onSelect,
}: {
  edges: readonly TrafficRelationship[];
  isEndpointOpenable?: (endpoint: TrafficEndpoint) => boolean;
  onOpenEndpoint?: (endpoint: TrafficEndpoint) => void;
  onSelect: (flowId: string) => void;
}) {
  const copy = useTrafficCopy();
  if (edges.length === 0) return null;
  return (
    <SurfaceSection className="grid min-w-0 gap-3 p-4" role="region" aria-labelledby="traffic-flow-map-title">
      <h3 className="flex items-center gap-2 text-base font-semibold" id="traffic-flow-map-title">
        <Network aria-hidden="true" />{copy.flowMap}
      </h3>
      <ul className="grid min-w-0 lg:grid-cols-2" aria-label={copy.flowMap}>
        {edges.map((edge) => (
          <li
            className="border-t first:border-t-0 lg:odd:border-r lg:[&:nth-child(2)]:border-t-0"
            key={edge.flowId}
          >
            <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 py-3">
              <EndpointAction
                edge={edge}
                endpoint="source"
                isEndpointOpenable={isEndpointOpenable}
                onOpenEndpoint={onOpenEndpoint}
                onSelectFlow={onSelect}
              />
              <ArrowRight aria-hidden="true" className="text-muted-foreground" />
              <EndpointAction
                edge={edge}
                endpoint="target"
                isEndpointOpenable={isEndpointOpenable}
                onOpenEndpoint={onOpenEndpoint}
                onSelectFlow={onSelect}
              />
            </div>
          </li>
        ))}
      </ul>
    </SurfaceSection>
  );
}

function EndpointAction({
  edge,
  endpoint,
  isEndpointOpenable,
  onOpenEndpoint,
  onSelectFlow,
}: {
  edge: TrafficRelationship;
  endpoint: "source" | "target";
  isEndpointOpenable?: (endpoint: TrafficEndpoint) => boolean;
  onOpenEndpoint?: (endpoint: TrafficEndpoint) => void;
  onSelectFlow: (flowId: string) => void;
}) {
  const value = edge[endpoint];
  if (onOpenEndpoint && (isEndpointOpenable?.(value) ?? true)) {
    return (
      <button
        className="min-w-0 rounded text-left transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        data-traffic-flow-row={endpoint === "source" ? edge.flowId : undefined}
        onClick={() => onOpenEndpoint(value)}
        onKeyDown={moveFlowFocus}
        type="button"
      >
        <EndpointLabel edge={edge} endpoint={endpoint} />
      </button>
    );
  }
  return endpoint === "source" ? (
    <FlowButton edge={edge} endpoint={endpoint} onSelect={onSelectFlow} />
  ) : (
    <EndpointLabel edge={edge} endpoint={endpoint} />
  );
}

function FlowButton({
  edge,
  endpoint,
  onSelect,
}: {
  edge: TrafficRelationship;
  endpoint: "source" | "target";
  onSelect: (flowId: string) => void;
}) {
  return (
    <button
      className="rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-traffic-flow-row={edge.flowId}
      onClick={() => onSelect(edge.flowId)}
      onKeyDown={moveFlowFocus}
      type="button"
    >
      <EndpointLabel edge={edge} endpoint={endpoint} />
    </button>
  );
}

function moveFlowFocus(event: KeyboardEvent<HTMLButtonElement>) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const buttons = [...document.querySelectorAll<HTMLButtonElement>("[data-traffic-flow-row]")];
  const index = buttons.indexOf(event.currentTarget);
  const next = buttons[index + (event.key === "ArrowDown" ? 1 : -1)];
  if (!next) return;
  event.preventDefault();
  next.focus();
}

function EndpointLabel({ edge, endpoint }: { edge: TrafficRelationship; endpoint: "source" | "target" }) {
  const copy = useTrafficCopy();
  const value = edge[endpoint];
  return (
    <span className="grid min-w-0">
      <span className="truncate font-medium" title={value.name}>{value.name}</span>
      <span className="truncate text-xs text-muted-foreground" title={value.namespace ?? value.clusterId}>
        {value.clusterId} · {value.namespace ?? copy.external}
      </span>
    </span>
  );
}

function TrafficFlowDetailSheet({
  edge,
  onClose,
  onNavigate,
}: {
  edge: TrafficRelationship | null;
  onClose: () => void;
  onNavigate: (direction: -1 | 1) => void;
}) {
  const { formatDate, formatNumber } = useI18n();
  const copy = useTrafficCopy();
  const rows = edge === null ? [] : [
    [copy.source, endpointText(edge.source, copy.external)],
    [copy.destination, endpointText(edge.target, copy.external)],
    [copy.cluster, edge.source.clusterId],
    [copy.protocol, `${edge.protocol.toUpperCase()}${edge.port ? `:${edge.port}` : ""}`],
    [copy.verdict, edge.verdict],
    [copy.connections, formatNumber(edge.connections)],
    [copy.observedAt, formatObservedAt(edge.observedAt, formatDate)],
    [copy.sourceIntegration, edge.sourceKey],
    [copy.flowIdentifier, edge.flowId],
  ] as const;
  return (
    <Sheet onOpenChange={(open) => { if (!open) onClose(); }} open={edge !== null}>
      {edge === null ? null : (
        <SheetContent
          className="gap-0 overflow-hidden sm:max-w-lg"
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowRight") onNavigate(1);
            if (event.key === "ArrowUp" || event.key === "ArrowLeft") onNavigate(-1);
          }}
        >
          <SheetHeader className="border-b pr-12">
            <SheetTitle className="break-words">{edge.source.name} → {edge.target.name}</SheetTitle>
            <SheetDescription>{copy.flowDetail}</SheetDescription>
          </SheetHeader>
          <dl className="grid min-h-0 gap-x-4 gap-y-3 overflow-y-auto p-4 sm:grid-cols-[auto_minmax(0,1fr)]">
            {rows.map(([label, value]) => (
              <div className="contents" key={label}>
                <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                <dd className="min-w-0 break-all text-sm">{value}</dd>
              </div>
            ))}
          </dl>
        </SheetContent>
      )}
    </Sheet>
  );
}

function endpointText(endpoint: TrafficRelationship["source"], external: string): string {
  return `${endpoint.clusterId}/${endpoint.namespace ?? external}/${endpoint.name}`;
}

function formatObservedAt(value: string, formatDate: ReturnType<typeof useI18n>["formatDate"]): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : formatDate(parsed);
}

function ObservedAt({ value }: { value: string }) {
  const { formatDate } = useI18n();
  return formatObservedAt(value, formatDate);
}

function useTrafficCopy(): TrafficCopy {
  return trafficCopy(useI18n().t);
}

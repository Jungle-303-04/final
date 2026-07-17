import { ArrowRight, Network } from "lucide-react";
import { useMemo, useRef, type KeyboardEvent } from "react";

import type {
  TrafficOverview,
  TrafficProtocol,
  TrafficRelationship,
  TrafficSince,
  TrafficSort,
  TrafficSortOrder,
  TrafficVerdict,
} from "../../features/traffic/trafficContract";
import { TRAFFIC_COPY } from "../../features/traffic/trafficCopy";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../shared/ui/primitives/card";
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

export interface TrafficFlowUrlState {
  since: TrafficSince;
  protocols: readonly TrafficProtocol[];
  verdicts: readonly TrafficVerdict[];
  sort: TrafficSort;
  order: TrafficSortOrder;
  selectedFlowId: string | null;
}

export function TrafficFlowSurface({
  overview,
  onChangeFilters,
  onNextPage,
  onSelectFlow,
  state,
}: {
  overview: TrafficOverview;
  onChangeFilters: (update: Partial<Omit<TrafficFlowUrlState, "selectedFlowId">>) => void;
  onNextPage: (cursor: string) => void;
  onSelectFlow: (flowId: string | null) => void;
  state: TrafficFlowUrlState;
}) {
  const lastSelectedFlow = useRef<string | null>(state.selectedFlowId);
  if (overview.relationships.availability === "unavailable") {
    return (
      <Card>
        <CardHeader className="border-b"><CardTitle>{TRAFFIC_COPY.relationships}</CardTitle></CardHeader>
        <CardContent className="grid gap-2">
          <p className="text-sm text-muted-foreground">{TRAFFIC_COPY.relationshipsUnavailable}</p>
        </CardContent>
      </Card>
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
    <section aria-labelledby="traffic-relationships-title" className="grid min-w-0 gap-4">
      <TrafficFlowFilters
        facets={relationships.facets}
        onChange={onChangeFilters}
        state={state}
      />
      <TrafficFlowMap edges={relationships.edges.slice(0, 8)} onSelect={selectFlow} />
      <Card className="min-w-0">
        <CardHeader className="border-b">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <CardTitle id="traffic-relationships-title">{TRAFFIC_COPY.relationships}</CardTitle>
            <Badge variant="outline">
              {TRAFFIC_COPY.flowCount.replace("{count}", String(relationships.totalCount))}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="min-w-0 p-0">
          {relationships.edges.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{TRAFFIC_COPY.observedEmpty}</p>
          ) : (
            <Table scrollAreaLabel={TRAFFIC_COPY.flowTable}>
              <TableHeader>
                <TableRow>
                  <TableHead>{TRAFFIC_COPY.source}</TableHead>
                  <TableHead>{TRAFFIC_COPY.destination}</TableHead>
                  <TableHead>{TRAFFIC_COPY.protocol}</TableHead>
                  <TableHead>{TRAFFIC_COPY.verdict}</TableHead>
                  <TableHead className="text-right">{TRAFFIC_COPY.connections}</TableHead>
                  <TableHead>{TRAFFIC_COPY.observedAt}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {relationships.edges.map((edge) => (
                  <TableRow data-state={edge.flowId === state.selectedFlowId ? "selected" : undefined} key={edge.flowId}>
                    <TableCell>
                      <FlowButton edge={edge} endpoint="source" onSelect={selectFlow} />
                    </TableCell>
                    <TableCell><EndpointLabel edge={edge} endpoint="target" /></TableCell>
                    <TableCell>{edge.protocol.toUpperCase()}{edge.port ? `:${edge.port}` : ""}</TableCell>
                    <TableCell><Badge variant={edge.verdict === "forwarded" ? "secondary" : "outline"}>{edge.verdict}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{edge.connections.toLocaleString()}</TableCell>
                    <TableCell>{formatObservedAt(edge.observedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {relationships.hasMore && relationships.nextCursor ? (
            <div className="flex justify-end border-t p-3">
              <Button onClick={() => onNextPage(relationships.nextCursor ?? "")} type="button" variant="outline">
                {TRAFFIC_COPY.nextPage}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
      <TrafficFlowDetailSheet
        edge={selected}
        onClose={() => selectFlow(null)}
        onNavigate={(direction) => {
          const next = relationships.edges[selectedIndex + direction];
          if (next) selectFlow(next.flowId);
        }}
      />
    </section>
  );
}

function TrafficFlowFilters({
  facets,
  onChange,
  state,
}: {
  facets: {
    protocols: readonly { value: TrafficProtocol; count: number }[];
    verdicts: readonly { value: TrafficVerdict; count: number }[];
  };
  onChange: (update: Partial<Omit<TrafficFlowUrlState, "selectedFlowId">>) => void;
  state: TrafficFlowUrlState;
}) {
  const protocol = state.protocols.length === 1 ? state.protocols[0] : "";
  const verdict = state.verdicts.length === 1 ? state.verdicts[0] : "";
  return (
    <Card size="sm">
      <CardContent className="flex min-w-0 flex-wrap items-end gap-3">
        <FilterSelect
          label={TRAFFIC_COPY.timeRange}
          onChange={(value) => onChange({ since: value as TrafficSince })}
          options={[
            ["1m", TRAFFIC_COPY.oneMinute],
            ["5m", TRAFFIC_COPY.fiveMinutes],
            ["15m", TRAFFIC_COPY.fifteenMinutes],
            ["1h", TRAFFIC_COPY.oneHour],
          ]}
          value={state.since}
        />
        <FilterSelect
          label={TRAFFIC_COPY.protocol}
          onChange={(value) => onChange({ protocols: value ? [value as TrafficProtocol] : [] })}
          options={[["", TRAFFIC_COPY.allProtocols], ...facets.protocols.map((item) => [
            item.value,
            `${item.value.toUpperCase()} (${item.count})`,
          ] as const)]}
          value={protocol}
        />
        <FilterSelect
          label={TRAFFIC_COPY.verdict}
          onChange={(value) => onChange({ verdicts: value ? [value as TrafficVerdict] : [] })}
          options={[["", TRAFFIC_COPY.allVerdicts], ...facets.verdicts.map((item) => [
            item.value,
            `${item.value} (${item.count})`,
          ] as const)]}
          value={verdict}
        />
        <FilterSelect
          label={TRAFFIC_COPY.sort}
          onChange={(value) => onChange({ sort: value as TrafficSort })}
          options={[
            ["connections", TRAFFIC_COPY.connections],
            ["last_seen", TRAFFIC_COPY.observedAt],
            ["source", TRAFFIC_COPY.source],
            ["destination", TRAFFIC_COPY.destination],
          ]}
          value={state.sort}
        />
        <FilterSelect
          label={TRAFFIC_COPY.order}
          onChange={(value) => onChange({ order: value as TrafficSortOrder })}
          options={[["desc", TRAFFIC_COPY.descending], ["asc", TRAFFIC_COPY.ascending]]}
          value={state.order}
        />
      </CardContent>
    </Card>
  );
}

function FilterSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
  value: string;
}) {
  const id = `traffic-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <label className="grid min-w-36 gap-1 text-xs text-muted-foreground" htmlFor={id}>
      {label}
      <select
        className="h-8 rounded-md border bg-background px-2 text-sm text-foreground"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map(([option, copy]) => <option key={option || "all"} value={option}>{copy}</option>)}
      </select>
    </label>
  );
}

function TrafficFlowMap({
  edges,
  onSelect,
}: {
  edges: readonly TrafficRelationship[];
  onSelect: (flowId: string) => void;
}) {
  if (edges.length === 0) return null;
  return (
    <Card className="min-w-0">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2"><Network aria-hidden="true" />{TRAFFIC_COPY.flowMap}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid min-w-0 gap-2 lg:grid-cols-2" aria-label={TRAFFIC_COPY.flowMap}>
          {edges.map((edge) => (
            <li key={edge.flowId}>
              <button
                className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                onClick={() => onSelect(edge.flowId)}
                type="button"
              >
                <EndpointLabel edge={edge} endpoint="source" />
                <ArrowRight aria-hidden="true" className="text-muted-foreground" />
                <EndpointLabel edge={edge} endpoint="target" />
              </button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
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
  const value = edge[endpoint];
  return (
    <span className="grid min-w-0">
      <span className="truncate font-medium" title={value.name}>{value.name}</span>
      <span className="truncate text-xs text-muted-foreground" title={value.namespace ?? value.clusterId}>
        {value.clusterId} · {value.namespace ?? TRAFFIC_COPY.external}
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
  const rows = useMemo(() => edge === null ? [] : [
    [TRAFFIC_COPY.source, endpointText(edge.source)],
    [TRAFFIC_COPY.destination, endpointText(edge.target)],
    [TRAFFIC_COPY.cluster, edge.source.clusterId],
    [TRAFFIC_COPY.protocol, `${edge.protocol.toUpperCase()}${edge.port ? `:${edge.port}` : ""}`],
    [TRAFFIC_COPY.verdict, edge.verdict],
    [TRAFFIC_COPY.connections, edge.connections.toLocaleString()],
    [TRAFFIC_COPY.observedAt, formatObservedAt(edge.observedAt)],
    [TRAFFIC_COPY.sourceIntegration, edge.sourceKey],
    [TRAFFIC_COPY.flowIdentifier, edge.flowId],
  ] as const, [edge]);
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
            <SheetDescription>{TRAFFIC_COPY.flowDetail}</SheetDescription>
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

function endpointText(endpoint: TrafficRelationship["source"]): string {
  return `${endpoint.clusterId}/${endpoint.namespace ?? TRAFFIC_COPY.external}/${endpoint.name}`;
}

function formatObservedAt(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString();
}

import { ArrowRight, Network } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";

import type {
  TrafficOverview,
  TrafficProtocol,
  TrafficRelationship,
  TrafficSince,
  TrafficSort,
  TrafficSortOrder,
  TrafficVerdict,
} from "../../features/traffic/trafficContract";
import { trafficCopy, type TrafficCopy } from "../../features/traffic/trafficCopy";
import { useI18n } from "../../shared/i18n";
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
  const { t } = useI18n();
  const copy = useTrafficCopy();
  const lastSelectedFlow = useRef<string | null>(state.selectedFlowId);
  if (overview.relationships.availability === "unavailable") {
    return (
      <Card>
        <CardHeader className="border-b"><CardTitle>{copy.relationships}</CardTitle></CardHeader>
        <CardContent className="grid gap-2">
          <p className="text-sm text-muted-foreground">{copy.relationshipsUnavailable}</p>
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
            <CardTitle id="traffic-relationships-title">{copy.relationships}</CardTitle>
            <Badge variant="outline">
              {t("traffic.flow.count", { count: relationships.totalCount })}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="min-w-0 p-0">
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
                      <FlowButton edge={edge} endpoint="source" onSelect={selectFlow} />
                    </TableCell>
                    <TableCell><EndpointLabel edge={edge} endpoint="target" /></TableCell>
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
  const copy = useTrafficCopy();
  const protocol = state.protocols.length === 1 ? state.protocols[0] : "";
  const verdict = state.verdicts.length === 1 ? state.verdicts[0] : "";
  return (
    <Card size="sm">
      <CardContent className="flex min-w-0 flex-wrap items-end gap-3">
        <FilterSelect
          id="time-range"
          label={copy.timeRange}
          onChange={(value) => onChange({ since: value as TrafficSince })}
          options={[
            ["1m", copy.oneMinute],
            ["5m", copy.fiveMinutes],
            ["15m", copy.fifteenMinutes],
            ["1h", copy.oneHour],
          ]}
          value={state.since}
        />
        <FilterSelect
          id="protocol"
          label={copy.protocol}
          onChange={(value) => onChange({ protocols: value ? [value as TrafficProtocol] : [] })}
          options={[["", copy.allProtocols], ...facets.protocols.map((item) => [
            item.value,
            `${item.value.toUpperCase()} (${item.count})`,
          ] as const)]}
          value={protocol}
        />
        <FilterSelect
          id="verdict"
          label={copy.verdict}
          onChange={(value) => onChange({ verdicts: value ? [value as TrafficVerdict] : [] })}
          options={[["", copy.allVerdicts], ...facets.verdicts.map((item) => [
            item.value,
            `${item.value} (${item.count})`,
          ] as const)]}
          value={verdict}
        />
        <FilterSelect
          id="sort"
          label={copy.sort}
          onChange={(value) => onChange({ sort: value as TrafficSort })}
          options={[
            ["connections", copy.connections],
            ["last_seen", copy.observedAt],
            ["source", copy.source],
            ["destination", copy.destination],
          ]}
          value={state.sort}
        />
        <FilterSelect
          id="order"
          label={copy.order}
          onChange={(value) => onChange({ order: value as TrafficSortOrder })}
          options={[["desc", copy.descending], ["asc", copy.ascending]]}
          value={state.order}
        />
      </CardContent>
    </Card>
  );
}

function FilterSelect({
  id,
  label,
  onChange,
  options,
  value,
}: {
  id: string;
  label: string;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
  value: string;
}) {
  const inputId = `traffic-${id}`;
  return (
    <label className="grid min-w-36 gap-1 text-xs text-muted-foreground" htmlFor={inputId}>
      {label}
      <select
        className="h-8 rounded-md border bg-background px-2 text-sm text-foreground"
        id={inputId}
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
  const copy = useTrafficCopy();
  if (edges.length === 0) return null;
  return (
    <Card className="min-w-0">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2"><Network aria-hidden="true" />{copy.flowMap}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid min-w-0 gap-2 lg:grid-cols-2" aria-label={copy.flowMap}>
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

import type {
  TrafficProtocol,
  TrafficSince,
  TrafficSort,
  TrafficSortOrder,
  TrafficVerdict,
} from "../../features/traffic/trafficContract";
import { trafficCopy } from "../../features/traffic/trafficCopy";
import { useI18n } from "../../shared/i18n";
import { SurfaceSection } from "../../shared/ui/Surface";

export interface TrafficFlowUrlState {
  since: TrafficSince;
  protocols: readonly TrafficProtocol[];
  verdicts: readonly TrafficVerdict[];
  sort: TrafficSort;
  order: TrafficSortOrder;
  selectedFlowId: string | null;
}

export function TrafficFlowFilters({
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
  const copy = trafficCopy(useI18n().t);
  const protocol = state.protocols.length === 1 ? state.protocols[0] : "";
  const verdict = state.verdicts.length === 1 ? state.verdicts[0] : "";
  return (
    <SurfaceSection className="flex min-w-0 flex-wrap items-end gap-3 p-4">
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
    </SurfaceSection>
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

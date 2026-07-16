import type { CostTrendSeries } from "./costContract";

export const COST_TREND_SERIES_LIMIT = 8;
export const COST_TREND_POINT_LIMIT = 480;

export interface ProjectedCostTrendSeries {
  dataKey: `series${number}`;
  key: string;
  label: string;
}

export interface ProjectedCostTrendRow {
  timestamp: number;
  [dataKey: `series${number}`]: number | null;
}

export interface ProjectedCostTrend {
  rows: ProjectedCostTrendRow[];
  series: ProjectedCostTrendSeries[];
}

export function projectCostTrend(input: readonly CostTrendSeries[]): ProjectedCostTrend {
  const selected = input.slice(0, COST_TREND_SERIES_LIMIT).map((series, index) => ({
    dataKey: `series${index}` as const,
    key: series.key,
    label: series.label,
    points: [...series.points]
      .sort((left, right) => left.timestamp - right.timestamp)
      .slice(-COST_TREND_POINT_LIMIT),
  }));
  const timestamps = [...new Set(selected.flatMap((series) =>
    series.points.map((point) => point.timestamp),
  ))].sort((left, right) => left - right).slice(-COST_TREND_POINT_LIMIT);
  const lookup = selected.map((series) => new Map(
    series.points.map((point) => [point.timestamp, point.rateMicros / 1_000_000]),
  ));
  return {
    rows: timestamps.map((timestamp) => {
      const row: ProjectedCostTrendRow = { timestamp };
      selected.forEach((series, index) => {
        row[series.dataKey] = lookup[index]!.get(timestamp) ?? null;
      });
      return row;
    }),
    series: selected.map(({ dataKey, key, label }) => ({ dataKey, key, label })),
  };
}

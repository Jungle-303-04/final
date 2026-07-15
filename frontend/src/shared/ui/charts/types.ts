// Source-neutral time-series contracts for product chart surfaces.

export interface TimeSeriesPoint {
  timestamp: number
  value?: number | null
}

export interface TimeSeries {
  labels: Record<string, string>
  /** Sorted ascending by timestamp. Each point's `value` is either finite or
   *  null/absent (a gap). Consumers must skip gap points in arithmetic and
   *  break the line/area path across them rather than bridging or dropping to
   *  0. */
  dataPoints: TimeSeriesPoint[]
}

/**
 * Horizontal reference line overlaid on a chart. `kind` is semantic — it
 * drives which value `computeSaturation` treats as the operational ceiling.
 * The chart auto-extends its Y axis to fit reference lines, so they're
 * never clipped.
 */
export interface ReferenceLine {
  value: number
  label: string
  kind: 'request' | 'limit'
}

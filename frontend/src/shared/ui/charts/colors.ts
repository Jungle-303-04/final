// Multi-series colors are derived from product tokens. A theme switch changes
// the palette without leaving raw light/dark hex values inside a component.
const SERIES_MIXES: readonly string[] = [
  "var(--primary)",
  "color-mix(in oklch, var(--primary) 70%, var(--destructive))",
  "color-mix(in oklch, var(--primary) 65%, var(--foreground))",
  "color-mix(in oklch, var(--primary) 55%, var(--muted-foreground))",
  "var(--destructive)",
  "color-mix(in oklch, var(--destructive) 62%, var(--foreground))",
  "color-mix(in oklch, var(--accent-foreground) 70%, var(--primary))",
  "var(--muted-foreground)",
  "color-mix(in oklch, var(--foreground) 72%, var(--primary))",
  "var(--accent-foreground)",
];

export function seriesColor(index: number, fallback: string): string {
  return SERIES_MIXES[index % SERIES_MIXES.length] ?? fallback;
}

export function seriesFill(index: number, fallback: string): string {
  const color = SERIES_MIXES[index % SERIES_MIXES.length] ?? fallback;
  return `color-mix(in oklch, ${color} 14%, transparent)`;
}

/**
 * Strip the shared prefix from a set of labels so the differentiating suffix
 * is what's shown. Example:
 *   ["backend-podinfo-849bd668f9-4tzkg", "backend-podinfo-849bd668f9-5z79f"]
 *   → ["4tzkg", "5z79f"]
 *
 * If stripping would leave empty strings or duplicates, falls back to the
 * original labels — we'd rather show a long-but-correct label than a short
 * misleading one.
 */
export function computeShortLabels(labels: string[]): string[] {
  if (labels.length <= 1) return labels
  let prefix = labels[0]
  for (let i = 1; i < labels.length; i++) {
    while (!labels[i].startsWith(prefix)) {
      prefix = prefix.slice(0, -1)
    }
  }
  const lastSep = Math.max(prefix.lastIndexOf('-'), prefix.lastIndexOf('/'))
  if (lastSep > 0) prefix = prefix.slice(0, lastSep + 1)

  const suffixes = labels.map(l => l.slice(prefix.length))
  if (suffixes.some(s => s === '') || new Set(suffixes).size !== suffixes.length) return labels
  return suffixes
}

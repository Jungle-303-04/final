import type {
  TimelineCapabilities,
  TimelineMode,
} from "../../features/timeline/timelineContract";
import type { TimelineLens } from "../../features/filters/timelineUrlState";
import type { I18nController } from "../../shared/i18n";
import { TimelineCustomRange } from "./TimelineCustomRange";
import { TimelineStripAxis } from "./TimelineStripAxis";
import type { TimelineOverviewFrame } from "./useTimelineOverviewFrame";
import {
  resizeTimelineLens,
  resolveTimelineLens,
} from "./timelineStripModel";

export function TimelineStrip({
  capabilities,
  formatDate,
  frame,
  lens,
  lensZoomRung,
  mode,
  rangeId,
  onCustomRange,
  onGoLive,
  onLensChange,
  onLensZoomRungChange,
  onRangeChange,
  t,
}: {
  capabilities: TimelineCapabilities;
  formatDate: I18nController["formatDate"];
  frame: TimelineOverviewFrame;
  lens: TimelineLens;
  lensZoomRung: string;
  mode: TimelineMode;
  rangeId: string;
  onCustomRange: (rangeId: string, mode: Extract<TimelineMode, { kind: "frozen" }>) => void;
  onGoLive: (rangeId: string, mode: Extract<TimelineMode, { kind: "live" }>, lens: TimelineLens) => void;
  onLensChange: (lens: TimelineLens) => void;
  onLensZoomRungChange: (id: string, lens: TimelineLens) => void;
  onRangeChange: (rangeId: string, mode: Extract<TimelineMode, { kind: "live" }>) => void;
  t: I18nController["t"];
}) {
  const controls = capabilities.controlSurface;
  const selectedRung = requiredControl(controls.lensZoomRungs, lensZoomRung);
  const overview = frame.phase === "ready" ? frame.overview : null;
  const selection = overview?.window ?? (mode.kind === "frozen" ? mode : null);
  const visibleLens = selection === null ? null : resolveTimelineLens(selection, lens);
  const handleRange = (id: string, durationMs: number) => onRangeChange(id, { kind: "live", widthMs: durationMs });
  const goLive = () => {
    if (mode.kind !== "frozen" || visibleLens === null) return;
    const durationMs = mode.toMs - mode.fromMs;
    const matchingRange = controls.timeRanges.find((range) => range.durationMs === durationMs);
    onGoLive(
      matchingRange?.id ?? controls.customTimeRangeId,
      { kind: "live", widthMs: durationMs },
      { kind: "trailing", widthMs: visibleLens.toMs - visibleLens.fromMs },
    );
  };

  return (
    <section aria-label={t("timeline.strip.aria")} className="grid min-w-0 gap-2.5 rounded-card border bg-card p-3" data-slot="timeline-strip">
      <div className="flex min-w-0 flex-wrap items-end gap-2">
        <fieldset className="flex w-full min-w-0 flex-wrap gap-1 sm:w-auto sm:flex-1" aria-label={t("timeline.strip.range")}>
          <legend className="sr-only">{t("timeline.strip.range")}</legend>
          {controls.timeRanges.map((range) => (
            <button
              aria-pressed={mode.kind === "live" && rangeId === range.id}
              className="h-auto min-h-8 max-w-full shrink-0 whitespace-nowrap rounded-md border px-2 py-1 text-left text-xs font-medium leading-4 transition-colors aria-pressed:border-primary aria-pressed:bg-secondary motion-reduce:transition-none"
              key={range.id}
              onClick={() => handleRange(range.id, range.durationMs)}
              title={range.description ?? undefined}
              type="button"
            >
              {range.label}
            </button>
          ))}
          <TimelineCustomRange
            bounds={overview?.queryBounds ?? capabilities.queryBounds}
            onApply={(customMode) => onCustomRange(controls.customTimeRangeId, customMode)}
            selection={selection}
            t={t}
          />
          {mode.kind === "frozen" ? (
            <button className="h-auto min-h-8 max-w-full shrink-0 whitespace-nowrap rounded-md border px-2 py-1 text-xs font-medium leading-4" onClick={goLive} type="button">
              {t("timeline.strip.goLive")}
            </button>
          ) : null}
        </fieldset>

        <label className="grid w-[calc(100%-var(--product-floating-action-inline-clearance))] min-w-0 gap-1 text-xs font-medium sm:w-auto sm:flex-1 sm:max-w-48">
          <span>{t("timeline.strip.zoom")}</span>
          <select
            className="h-8 min-w-0 max-w-full rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => {
              const next = requiredControl(controls.lensZoomRungs, event.currentTarget.value);
              const nextLens = selection === null || visibleLens === null
                ? lens
                : { kind: "window" as const, ...resizeTimelineLens(selection, visibleLens, next.durationMs) };
              onLensZoomRungChange(next.id, nextLens);
            }}
            value={selectedRung.id}
          >
            {controls.lensZoomRungs.map((rung) => (
              <option key={rung.id} title={rung.description ?? undefined} value={rung.id}>{rung.label}</option>
            ))}
          </select>
        </label>
      </div>
      {overview === null || visibleLens === null || selection === null ? (
        <p aria-live="polite" className="text-sm text-muted-foreground" role="status">
          {frame.phase === "failed" ? t("timeline.strip.overviewUnavailable") : t("timeline.strip.overviewLoading")}
        </p>
      ) : (
        <TimelineStripAxis
          capabilities={capabilities}
          formatDate={formatDate}
          lens={visibleLens}
          mode={mode}
          onLensChange={onLensChange}
          overview={overview}
          selection={selection}
          t={t}
        />
      )}
    </section>
  );
}

function requiredControl<T extends { id: string }>(options: readonly T[], id?: string): T {
  const option = options.find((candidate) => candidate.id === id) ?? options[0];
  if (option === undefined) throw new Error("Timeline descriptor omitted a required strip control.");
  return option;
}

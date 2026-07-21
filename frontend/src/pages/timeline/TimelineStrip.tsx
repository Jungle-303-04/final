import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type {
  TimelineCapabilities,
  TimelineMode,
  TimelineOverview,
  TimelineQueryBounds,
  TimelineWindow,
} from "../../features/timeline/timelineContract";
import type { TimelineLens } from "../../features/filters/timelineUrlState";
import type { I18nController } from "../../shared/i18n";
import { TIMELINE_SOURCE_LABEL } from "./timelineLabels";
import type { TimelineOverviewFrame } from "./useTimelineOverviewFrame";
import {
  moveTimelineLens,
  resizeTimelineLens,
  resolveTimelineLens,
  timelineLensAtPosition,
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
    <section aria-label={t("timeline.strip.aria")} className="grid min-w-0 gap-3 rounded-xl border bg-card p-3 shadow-sm" data-slot="timeline-strip">
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

function TimelineStripAxis({
  capabilities,
  formatDate,
  lens,
  mode,
  onLensChange,
  overview,
  selection,
  t,
}: {
  capabilities: TimelineCapabilities;
  formatDate: I18nController["formatDate"];
  lens: TimelineWindow;
  mode: TimelineMode;
  onLensChange: (lens: TimelineLens) => void;
  overview: TimelineOverview;
  selection: TimelineWindow;
  t: I18nController["t"];
}) {
  const axisId = useId();
  const drag = useRef<{
    pointerId: number;
    startClientX: number;
    axisWidth: number;
    lens: TimelineWindow;
  } | null>(null);
  const maxCount = Math.max(...overview.buckets.map((bucket) => bucket.eventCount), 1);
  const width = Math.max(selection.toMs - selection.fromMs, 1);
  const lensWidth = lens.toMs - lens.fromMs;
  const formattedSelection = formatWindow(formatDate, selection);
  const formattedLens = formatWindow(formatDate, lens);
  const select = (next: TimelineWindow) => onLensChange({ kind: "window", ...next });
  const pointerPosition = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0) return null;
    return { bounds, position: (event.clientX - bounds.left) / bounds.width };
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const pointer = pointerPosition(event);
    if (pointer === null) return;
    const nextLens = timelineLensAtPosition(selection, lensWidth, pointer.position);
    drag.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      axisWidth: pointer.bounds.width,
      lens: nextLens,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    select(nextLens);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (current === null || current.pointerId !== event.pointerId || current.axisWidth <= 0) return;
    const deltaMs = ((event.clientX - current.startClientX) / current.axisWidth) * width;
    select(moveTimelineLens(selection, current.lens, deltaMs));
  };
  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta = event.key === "ArrowLeft" ? -overview.bucketWidthMs
      : event.key === "ArrowRight" ? overview.bucketWidthMs
        : event.key === "PageUp" ? -lensWidth
          : event.key === "PageDown" ? lensWidth : null;
    if (event.key === "Home") select({ fromMs: selection.fromMs, toMs: selection.fromMs + lensWidth });
    else if (event.key === "End") select({ fromMs: selection.toMs - lensWidth, toMs: selection.toMs });
    else if (delta !== null) select(moveTimelineLens(selection, lens, delta));
    else return;
    event.preventDefault();
  };
  const bucketCount = Math.max(overview.buckets.length, 1);

  return (
    <div className="grid min-w-0 gap-2">
      <div className="grid min-w-0 gap-1 text-xs text-muted-foreground" data-slot="timeline-strip-bounds" role="status">
        <span>{t("timeline.strip.selection", formattedSelection)}</span>
        <span>{t("timeline.strip.visible", formattedLens)}</span>
      </div>
      <div
        aria-describedby={`${axisId}-summary`}
        aria-label={t("timeline.strip.aria")}
        aria-orientation="horizontal"
        aria-valuemax={selection.toMs}
        aria-valuemin={selection.fromMs}
        aria-valuenow={lens.fromMs}
        aria-valuetext={t("timeline.strip.visible", formattedLens)}
        className="relative min-w-0 touch-manipulation rounded-md border bg-muted/20 p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-slot="timeline-strip-axis"
        onKeyDown={onKeyDown}
        onPointerCancel={onPointerEnd}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        role="slider"
        tabIndex={0}
      >
        <svg aria-hidden="true" className="h-20 w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
          {overview.buckets.map((bucket, index) => {
            const height = (bucket.eventCount / maxCount) * 100;
            const problemHeight = (bucket.problemCount / maxCount) * 100;
            return (
              <g key={`${bucket.fromMs}:${bucket.toMs}`}>
                <rect className="fill-primary/60" height={height} width={100 / bucketCount} x={(100 / bucketCount) * index} y={100 - height} />
                {problemHeight > 0 ? <rect className="fill-status-warning" height={problemHeight} width={100 / bucketCount} x={(100 / bucketCount) * index} y={100 - height} /> : null}
              </g>
            );
          })}
          {overview.coverage.map((coverage) => {
            const from = Math.max(coverage.fromMs, selection.fromMs);
            const to = Math.min(coverage.toMs, selection.toMs);
            if (from >= to) return null;
            return <rect className="fill-destructive/60" height="100" key={`${coverage.source}:${coverage.fromMs}:${coverage.toMs}`} width={((to - from) / width) * 100} x={((from - selection.fromMs) / width) * 100} y="0" />;
          })}
          <rect
            className="fill-primary/10 stroke-primary"
            height="100"
            strokeWidth="1"
            width={(lensWidth / width) * 100}
            x={((lens.fromMs - selection.fromMs) / width) * 100}
            y="0"
          />
        </svg>
      </div>
      <p className="sr-only" id={`${axisId}-summary`}>
        {t("timeline.strip.keyboardHelp")}
      </p>
      <aside aria-label={capabilities.controlSurface.legend.label} className="grid min-w-0 gap-1 text-xs text-muted-foreground" data-slot="timeline-strip-coverage">
        <p>{t("timeline.strip.coverageExplanation")}</p>
        <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-1">
          {overview.coverage.length > 0 ? <span>{t("timeline.strip.coverageGap")}</span> : null}
          {overview.coverage.some((coverage) => coverage.reason === "retention_boundary") ? <span>{t("timeline.strip.retentionBoundary")}</span> : null}
          {overview.coverageSources.filter((source) => source.availability === "unavailable").map((source) => (
            <span className="min-w-0 break-words" key={source.source}>{t("timeline.strip.coverageUnavailable", { source: t(TIMELINE_SOURCE_LABEL[source.source]) })}</span>
          ))}
          {mode.kind === "frozen" && overview.newEvidenceCount !== null ? <span>{t("timeline.strip.newEvidence", { count: overview.newEvidenceCount })}</span> : null}
        </div>
      </aside>
    </div>
  );
}

function TimelineCustomRange({
  bounds,
  onApply,
  selection,
  t,
}: {
  bounds: TimelineQueryBounds;
  onApply: (mode: Extract<TimelineMode, { kind: "frozen" }>) => void;
  selection: TimelineWindow | null;
  t: I18nController["t"];
}) {
  const [open, setOpen] = useState(false);
  const details = useRef<HTMLDetailsElement>(null);
  return (
    <details className="relative min-w-0" data-slot="timeline-custom-range" onToggle={(event) => setOpen(event.currentTarget.open)} open={open} ref={details}>
      <summary aria-expanded={open} className="flex min-h-8 max-w-full cursor-pointer list-none items-center rounded-md border px-2 py-1 text-xs font-medium leading-4 outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-ring">
        {t("timeline.strip.custom")}
      </summary>
      {selection === null ? null : (
        <TimelineCustomRangeForm
          key={`${selection.fromMs}:${selection.toMs}`}
          bounds={bounds}
          onApply={(mode) => {
            details.current?.removeAttribute("open");
            onApply(mode);
            setOpen(false);
          }}
          selection={selection}
          t={t}
        />
      )}
    </details>
  );
}

function TimelineCustomRangeForm({
  bounds,
  onApply,
  selection,
  t,
}: {
  bounds: TimelineQueryBounds;
  onApply: (mode: Extract<TimelineMode, { kind: "frozen" }>) => void;
  selection: TimelineWindow;
  t: I18nController["t"];
}) {
  const [from, setFrom] = useState(() => dateTimeInputValue(selection.fromMs));
  const [to, setTo] = useState(() => dateTimeInputValue(selection.toMs));
  const [error, setError] = useState<"invalid" | "future" | "outside" | null>(null);
  const apply = () => {
    const fromMs = Date.parse(from);
    const toMs = Date.parse(to);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
      setError("invalid");
      return;
    }
    if (fromMs > bounds.serverNowMs || toMs > bounds.serverNowMs) {
      setError("future");
      return;
    }
    if (fromMs < bounds.earliestQueryableMs || toMs - fromMs > bounds.maxWindowMs) {
      setError("outside");
      return;
    }
    setError(null);
    onApply({ kind: "frozen", fromMs, toMs });
  };
  const min = dateTimeInputValue(bounds.earliestQueryableMs);
  const max = dateTimeInputValue(bounds.serverNowMs);
  return (
    <div className="absolute left-0 z-20 mt-1 grid w-[min(22rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] gap-2 rounded-lg border bg-popover p-3 text-popover-foreground shadow-md">
      <label className="grid min-w-0 gap-1 text-xs font-medium"><span>{t("timeline.strip.from")}</span><input className="h-8 min-w-0 rounded-md border bg-background px-2" max={max} min={min} onChange={(event) => setFrom(event.currentTarget.value)} type="datetime-local" value={from} /></label>
      <label className="grid min-w-0 gap-1 text-xs font-medium"><span>{t("timeline.strip.to")}</span><input className="h-8 min-w-0 rounded-md border bg-background px-2" max={max} min={min} onChange={(event) => setTo(event.currentTarget.value)} type="datetime-local" value={to} /></label>
      {error === null ? null : <p className="text-xs text-destructive" role="alert">{t(errorKey(error))}</p>}
      <button className="h-8 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground" onClick={apply} type="button">{t("timeline.strip.apply")}</button>
    </div>
  );
}

function errorKey(error: "invalid" | "future" | "outside") {
  if (error === "invalid") return "timeline.strip.rangeInvalid" as const;
  if (error === "future") return "timeline.strip.rangeFuture" as const;
  return "timeline.strip.rangeOutside" as const;
}

function formatWindow(formatDate: I18nController["formatDate"], window: TimelineWindow) {
  return {
    from: formatDate(window.fromMs, { dateStyle: "medium", timeStyle: "short" }),
    to: formatDate(window.toMs, { dateStyle: "medium", timeStyle: "short" }),
  };
}

function requiredControl<T extends { id: string }>(options: readonly T[], id?: string): T {
  const option = options.find((candidate) => candidate.id === id) ?? options[0];
  if (option === undefined) throw new Error("Timeline descriptor omitted a required strip control.");
  return option;
}

function dateTimeInputValue(value: number): string {
  const date = new Date(value - new Date(value).getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}

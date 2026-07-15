import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import type {
  TimelineCapabilities,
  TimelineMode,
  TimelineOverview,
  TimelineWindow,
} from "../../features/timeline/timelineContract";
import type { I18nController } from "../../shared/i18n";
import { TIMELINE_SOURCE_LABEL } from "./timelineLabels";
import type { TimelineOverviewFrame } from "./useTimelineOverviewFrame";
import { moveTimelineLens, timelineLensAtPosition, timelineLensWindow } from "./timelineStripModel";

export function TimelineStrip({
  capabilities,
  frame,
  lensZoomRung,
  mode,
  onLensZoomRungChange,
  onModeChange,
  onRangeChange,
  t,
}: {
  capabilities: TimelineCapabilities;
  frame: TimelineOverviewFrame;
  lensZoomRung: string;
  mode: TimelineMode;
  onLensZoomRungChange: (id: string) => void;
  onModeChange: (mode: TimelineMode) => void;
  onRangeChange: (rangeId: string, mode: TimelineMode) => void;
  t: I18nController["t"];
}) {
  const controls = capabilities.controlSurface;
  const lens = requiredControl(controls.lensZoomRungs, lensZoomRung);
  const defaultRange = requiredControl(controls.timeRanges, controls.defaultTimeRangeId);
  const overview = frame.phase === "ready" ? frame.overview : null;
  const currentWindow = overview?.window ?? (mode.kind === "frozen" ? mode : null);
  const handlePreset = (rangeId: string, durationMs: number) => onRangeChange(rangeId, { kind: "live", widthMs: durationMs });
  const goLive = () => onRangeChange(defaultRange.id, { kind: "live", widthMs: defaultRange.durationMs });

  return (
    <section aria-label={t("timeline.strip.aria")} className="grid min-w-0 gap-3 rounded-xl border bg-card p-3 shadow-sm" data-slot="timeline-strip">
      <div className="flex min-w-0 flex-wrap items-end gap-2">
        <fieldset className="flex min-w-0 flex-wrap gap-1" aria-label={t("timeline.strip.range")}>
          <legend className="sr-only">{t("timeline.strip.range")}</legend>
          {controls.timeRanges.map((range) => (
            <button
              aria-pressed={mode.kind === "live" && mode.widthMs === range.durationMs}
              className="h-8 min-w-0 rounded-md border px-2 text-xs font-medium transition-colors aria-pressed:border-primary aria-pressed:bg-secondary motion-reduce:transition-none"
              key={range.id}
              onClick={() => handlePreset(range.id, range.durationMs)}
              title={range.description ?? undefined}
              type="button"
            >
              {range.label}
            </button>
          ))}
          <details className="relative min-w-0" data-slot="timeline-custom-range">
            <summary className="flex h-8 cursor-pointer list-none items-center rounded-md border px-2 text-xs font-medium outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-ring">
              {t("timeline.strip.custom")}
            </summary>
            {currentWindow === null ? null : (
              <TimelineCustomRange
                key={`${currentWindow.fromMs}:${currentWindow.toMs}`}
                maxRangeMs={capabilities.maxRetainedRangeMs}
                onApply={onModeChange}
                t={t}
                window={currentWindow}
              />
            )}
          </details>
          {mode.kind === "frozen" ? (
            <button className="h-8 rounded-md border px-2 text-xs font-medium" onClick={goLive} type="button">
              {t("timeline.strip.goLive")}
            </button>
          ) : null}
        </fieldset>

        <label className="grid min-w-28 gap-1 text-xs font-medium">
          <span>{t("timeline.strip.zoom")}</span>
          <select
            className="h-8 min-w-0 rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => onLensZoomRungChange(event.currentTarget.value)}
            value={lens.id}
          >
            {controls.lensZoomRungs.map((rung) => (
              <option key={rung.id} title={rung.description ?? undefined} value={rung.id}>{rung.label}</option>
            ))}
          </select>
        </label>
      </div>
      {overview === null ? (
        <p aria-live="polite" className="text-sm text-muted-foreground" role="status">
          {frame.phase === "failed" ? t("timeline.strip.overviewUnavailable") : t("timeline.strip.overviewLoading")}
        </p>
      ) : (
        <TimelineStripAxis lensDurationMs={lens.durationMs} onModeChange={onModeChange} overview={overview} t={t} />
      )}
    </section>
  );
}

function TimelineStripAxis({
  lensDurationMs,
  onModeChange,
  overview,
  t,
}: {
  lensDurationMs: number;
  onModeChange: (mode: TimelineMode) => void;
  overview: TimelineOverview;
  t: I18nController["t"];
}) {
  const axisId = useId();
  const lens = useMemo(() => timelineLensWindow(overview.window, lensDurationMs), [lensDurationMs, overview.window]);
  const maxCount = Math.max(...overview.buckets.map((bucket) => bucket.eventCount), 1);
  const width = overview.window.toMs - overview.window.fromMs;
  const select = (window: TimelineWindow) => onModeChange({ kind: "frozen", ...window });
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0) return;
    select(timelineLensAtPosition(overview.window, lensDurationMs, (event.clientX - bounds.left) / bounds.width));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta = event.key === "ArrowLeft" ? -overview.bucketWidthMs
      : event.key === "ArrowRight" ? overview.bucketWidthMs
        : event.key === "PageUp" ? -lensDurationMs
          : event.key === "PageDown" ? lensDurationMs : null;
    if (event.key === "Home") select({ fromMs: overview.window.fromMs, toMs: overview.window.fromMs + (lens.toMs - lens.fromMs) });
    else if (event.key === "End") select(lens);
    else if (delta !== null) select(moveTimelineLens(overview.window, lens, delta));
    else return;
    event.preventDefault();
  };
  return (
    <div className="grid min-w-0 gap-2">
      <div
        aria-describedby={`${axisId}-summary`}
        aria-label={t("timeline.strip.aria")}
        aria-valuemax={overview.window.toMs}
        aria-valuemin={overview.window.fromMs}
        aria-valuenow={lens.fromMs}
        className="relative min-w-0 touch-manipulation rounded-md border bg-muted/20 p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-slot="timeline-strip-axis"
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        role="slider"
        tabIndex={0}
      >
        <svg aria-hidden="true" className="h-20 w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
          {overview.buckets.map((bucket, index) => {
            const height = (bucket.eventCount / maxCount) * 100;
            const problemHeight = (bucket.problemCount / maxCount) * 100;
            return (
              <g key={`${bucket.fromMs}:${bucket.toMs}`}>
                <rect className="fill-primary/60" height={height} width={100 / overview.buckets.length} x={(100 / overview.buckets.length) * index} y={100 - height} />
                {problemHeight > 0 ? <rect className="fill-status-warning" height={problemHeight} width={100 / overview.buckets.length} x={(100 / overview.buckets.length) * index} y={100 - height} /> : null}
              </g>
            );
          })}
          {overview.coverage.map((coverage) => {
            const from = Math.max(coverage.fromMs, overview.window.fromMs);
            const to = Math.min(coverage.toMs, overview.window.toMs);
            if (from >= to) return null;
            return <rect className="fill-destructive/60" height="100" key={`${coverage.source}:${coverage.fromMs}:${coverage.toMs}`} width={((to - from) / width) * 100} x={((from - overview.window.fromMs) / width) * 100} y="0" />;
          })}
          <rect
            className="fill-primary/10 stroke-primary"
            height="100"
            strokeWidth="1"
            width={((lens.toMs - lens.fromMs) / width) * 100}
            x={((lens.fromMs - overview.window.fromMs) / width) * 100}
            y="0"
          />
        </svg>
      </div>
      <p className="sr-only" id={`${axisId}-summary`}>
        {t("timeline.strip.aria")}
      </p>
      <div className="flex min-w-0 flex-wrap gap-2 text-xs text-muted-foreground">
        {overview.coverage.length > 0 ? <span>{t("timeline.strip.coverageGap")}</span> : null}
        {overview.coverageSources.filter((source) => source.availability === "unavailable").map((source) => (
          <span key={source.source}>{t("timeline.strip.coverageUnavailable", { source: t(TIMELINE_SOURCE_LABEL[source.source]) })}</span>
        ))}
        {overview.newEvidenceCount === null ? null : <span>{t("timeline.strip.newEvidence", { count: overview.newEvidenceCount })}</span>}
      </div>
    </div>
  );
}

function TimelineCustomRange({
  maxRangeMs,
  onApply,
  t,
  window,
}: {
  maxRangeMs: number;
  onApply: (mode: TimelineMode) => void;
  t: I18nController["t"];
  window: TimelineWindow;
}) {
  const [from, setFrom] = useState(() => dateTimeInputValue(window.fromMs));
  const [to, setTo] = useState(() => dateTimeInputValue(window.toMs));
  const [error, setError] = useState<"invalid" | "tooLarge" | null>(null);
  const apply = () => {
    const fromMs = Date.parse(from);
    const toMs = Date.parse(to);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
      setError("invalid");
      return;
    }
    if (toMs - fromMs > maxRangeMs) {
      setError("tooLarge");
      return;
    }
    onApply({ kind: "frozen", fromMs, toMs });
  };
  return (
    <div className="absolute left-0 z-20 mt-1 grid w-[min(22rem,calc(100vw-2rem))] gap-2 rounded-lg border bg-popover p-3 text-popover-foreground shadow-md">
      <label className="grid gap-1 text-xs font-medium"><span>{t("timeline.strip.from")}</span><input className="h-8 rounded-md border bg-background px-2" onChange={(event) => setFrom(event.currentTarget.value)} type="datetime-local" value={from} /></label>
      <label className="grid gap-1 text-xs font-medium"><span>{t("timeline.strip.to")}</span><input className="h-8 rounded-md border bg-background px-2" onChange={(event) => setTo(event.currentTarget.value)} type="datetime-local" value={to} /></label>
      {error === null ? null : <p className="text-xs text-destructive" role="alert">{t(error === "invalid" ? "timeline.strip.rangeInvalid" : "timeline.strip.rangeTooLarge")}</p>}
      <button className="h-8 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground" onClick={apply} type="button">{t("timeline.strip.apply")}</button>
    </div>
  );
}

function requiredControl<T extends { id: string }>(options: readonly T[], id: string): T {
  const option = options.find((candidate) => candidate.id === id) ?? options[0];
  if (option === undefined) throw new Error("Timeline descriptor omitted a required strip control.");
  return option;
}

function dateTimeInputValue(value: number): string {
  const date = new Date(value - new Date(value).getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}

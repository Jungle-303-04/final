import { useId, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { Bar, BarChart } from "recharts";
import type {
  TimelineCapabilities,
  TimelineMode,
  TimelineOverview,
  TimelineWindow,
} from "../../features/timeline/timelineContract";
import type { TimelineLens } from "../../features/filters/timelineUrlState";
import type { I18nController } from "../../shared/i18n";
import { ChartContainer, type ChartConfig } from "../../shared/ui/primitives/chart";
import { TIMELINE_SOURCE_LABEL } from "./timelineLabels";
import {
  moveTimelineLens,
  timelineLensAtPosition,
} from "./timelineStripModel";

const TIMELINE_CHART_CONFIG = {
  events: { color: "var(--primary)" },
  problems: { color: "var(--status-warning)" },
} satisfies ChartConfig;

export function TimelineStripAxis({
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
  const selectionWidth = Math.max(selection.toMs - selection.fromMs, 1);
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
    const deltaMs = ((event.clientX - current.startClientX) / current.axisWidth) * selectionWidth;
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
        <TimelineHistogram lens={lens} overview={overview} selection={selection} />
      </div>
      <p className="sr-only" id={`${axisId}-summary`}>{t("timeline.strip.keyboardHelp")}</p>
      <TimelineCoverageLegend capabilities={capabilities} mode={mode} overview={overview} t={t} />
    </div>
  );
}

function TimelineHistogram({ lens, overview, selection }: {
  lens: TimelineWindow;
  overview: TimelineOverview;
  selection: TimelineWindow;
}) {
  const selectionWidth = Math.max(selection.toMs - selection.fromMs, 1);
  const chartRows = overview.buckets.map((bucket) => ({
    events: bucket.eventCount,
    problems: bucket.problemCount,
    timestamp: bucket.fromMs,
  }));
  const lensX = ((lens.fromMs - selection.fromMs) / selectionWidth) * 100;
  const lensWidth = ((lens.toMs - lens.fromMs) / selectionWidth) * 100;

  return (
    <div aria-hidden="true" className="relative h-16 w-full overflow-hidden rounded-sm border-b border-border-subtle">
      <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
        {overview.coverage.map((coverage) => {
          const from = Math.max(coverage.fromMs, selection.fromMs);
          const to = Math.min(coverage.toMs, selection.toMs);
          if (from >= to) return null;
          return (
            <rect
              className="fill-destructive/20"
              height="100"
              key={`${coverage.source}:${coverage.fromMs}:${coverage.toMs}`}
              width={((to - from) / selectionWidth) * 100}
              x={((from - selection.fromMs) / selectionWidth) * 100}
              y="0"
            />
          );
        })}
      </svg>
      <ChartContainer className="pointer-events-none relative z-10 h-16 w-full aspect-auto" config={TIMELINE_CHART_CONFIG}>
        <BarChart barCategoryGap="24%" data={chartRows} margin={{ bottom: 1, left: 0, right: 0, top: 3 }}>
          <Bar dataKey="events" fill="var(--color-events)" fillOpacity={0.25} isAnimationActive={false} radius={[2, 2, 0, 0]} />
          <Bar dataKey="problems" fill="var(--color-problems)" fillOpacity={0.7} isAnimationActive={false} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ChartContainer>
      <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
        <rect className="fill-primary/5 stroke-primary/60" height="100" vectorEffect="non-scaling-stroke" width={lensWidth} x={lensX} y="0" />
      </svg>
    </div>
  );
}

function TimelineCoverageLegend({ capabilities, mode, overview, t }: {
  capabilities: TimelineCapabilities;
  mode: TimelineMode;
  overview: TimelineOverview;
  t: I18nController["t"];
}) {
  return (
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
  );
}

function formatWindow(formatDate: I18nController["formatDate"], window: TimelineWindow) {
  return {
    from: formatDate(window.fromMs, { dateStyle: "medium", timeStyle: "short" }),
    to: formatDate(window.toMs, { dateStyle: "medium", timeStyle: "short" }),
  };
}

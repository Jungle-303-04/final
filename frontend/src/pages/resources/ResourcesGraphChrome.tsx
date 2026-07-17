import { ChevronDown, ChevronUp, Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";

import type { TimelineRange } from "../../features/filters/filterContract";
import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "../../shared/ui/primitives/select";
import type { ChangeTimelineFrame } from "./useChangeTimelineDataFrame";
import {
  browserReplayWindow,
  isTimelineGap,
  timelinePercent,
  timelinePlaybackEnd,
  timelinePlaybackStart,
  timelinePlaybackStep,
} from "./scrubberMath";

export interface PhysicalGraphBreadcrumbItem {
  id: string;
  label: string;
  onSelect: () => void;
}

export function PhysicalGraphBreadcrumb({
  items,
  onSelectAll,
}: {
  items: PhysicalGraphBreadcrumbItem[];
  onSelectAll: () => void;
}) {
  const { t } = useI18n();
  return (
    <nav aria-label={t("resources.graph.breadcrumb.aria")} className="flex min-w-0 items-center gap-1 overflow-hidden text-xs text-muted-foreground">
      <button
        className="rounded-sm px-1 py-0.5 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onSelectAll}
        type="button"
      >
        {t("resources.graph.breadcrumb.all")}
      </button>
      {items.map((item, index) => (
        <span className="flex min-w-0 items-center gap-1" key={item.id}>
          <span aria-hidden="true">›</span>
          {index === items.length - 1 ? (
            <span
              aria-current="location"
              className="max-w-36 truncate rounded-sm border bg-background/80 px-1.5 py-0.5 font-medium text-foreground backdrop-blur"
              title={item.label}
            >
              {item.label}
            </span>
          ) : (
            <button
              className="max-w-36 truncate rounded-sm px-1 py-0.5 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              onClick={item.onSelect}
              title={item.label}
              type="button"
            >
              {item.label}
            </button>
          )}
        </span>
      ))}
    </nav>
  );
}

export function UnavailableTimeline({ loading = false }: { loading?: boolean }) {
  const { t } = useI18n();
  return (
    <div
      aria-describedby="resources-timeline-unavailable"
      className="flex min-h-10 shrink-0 items-center border-t bg-background/30 px-3 py-1.5"
      data-expanded="false"
      data-slot="resources-time-scrubber"
      data-state={loading ? "loading" : "unavailable"}
    >
      <span className="text-xs text-muted-foreground" id="resources-timeline-unavailable" role="status">
        {t(loading ? "resources.timeline.loading" : "resources.timeline.unavailable")}
      </span>
    </div>
  );
}

export function TimelineStrip({
  atMs,
  frame,
  onAtChange,
  replayStatus = "live",
  replayWindow,
}: {
  atMs: number | undefined;
  frame: ChangeTimelineFrame;
  onAtChange: (atMs: number | undefined) => void;
  replayStatus?: "live" | "ready" | "gap";
  replayWindow?: { fromMs: number | null; toMs: number | null };
}) {
  const { formatDate, t } = useI18n();
  const [dragging, setDragging] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const timeline = frame.phase === "ready" ? frame.data : null;
  const availableWindow = timeline === null
    ? null
    : browserReplayWindow(timeline, replayWindow);
  const replayFromMs = availableWindow?.fromMs ?? 0;
  const replayToMs = availableWindow?.toMs ?? 0;
  const replayAvailable = availableWindow !== null;
  const playbackEnd = timeline === null ? 0 : timelinePlaybackEnd(timeline, replayWindow);
  const live = atMs === undefined || (replayAvailable && atMs >= replayToMs);
  const selectedMs = timeline
    ? replayAvailable
      ? Math.min(replayToMs, Math.max(replayFromMs, atMs ?? replayToMs))
      : timeline.toMs
    : 0;

  useEffect(() => {
    if (!playing || timeline === null) return undefined;
    const interval = window.setInterval(() => {
      const current = atMs ?? timelinePlaybackStart(timeline);
      const next = current + timelinePlaybackStep(timeline);
      if (next >= playbackEnd) {
        setPlaying(false);
        onAtChange(undefined);
      } else {
        onAtChange(next);
      }
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [atMs, onAtChange, playbackEnd, playing, timeline]);

  if (timeline === null) {
    return <UnavailableTimeline loading={frame.phase === "loading"} />;
  }

  const visibleBuckets = replayAvailable
    ? timeline.buckets.filter((bucket) =>
        bucket.endMs >= replayFromMs && bucket.startMs <= replayToMs)
    : [];
  const incidentEvents = replayAvailable
    ? timeline.events.filter((event) => event.kind === "incident" &&
        event.occurredMs >= replayFromMs && event.occurredMs <= replayToMs)
    : [];
  const maxTotal = Math.max(1, ...visibleBuckets.map((bucket) => bucket.total));
  const selectedInGap = isTimelineGap(selectedMs, timeline.gaps) ||
    (!live && replayStatus === "gap") || !replayAvailable;
  const formatTime = (value: number) => formatDate(value, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const selectedPosition = replayAvailable
    ? timelinePercent(selectedMs, replayFromMs, replayToMs)
    : 0;

  return (
    <div
      className="shrink-0 border-t bg-background/30"
      data-expanded={expanded ? "true" : "false"}
      data-replay-status={replayStatus}
      data-slot="resources-time-scrubber"
      data-state={playing ? "playing" : live ? "live" : "past"}
    >
      <div className="flex min-h-10 items-center gap-2 px-3 py-1.5">
        <span className="shrink-0 text-xs font-medium" role="status">
          {live
            ? t("resources.timeline.live")
            : t("resources.timeline.past", { time: formatTime(selectedMs) })}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {t("resources.timeline.recorded", {
            interval: timelineIntervalLabel(timeline.bucketMs, t),
          })}
        </span>
        <Button
          aria-expanded={expanded}
          aria-label={t(expanded ? "resources.timeline.collapse" : "resources.timeline.expand")}
          onClick={() => {
            setExpanded((current) => !current);
            if (expanded) setPlaying(false);
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          {expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
          {t(expanded ? "resources.timeline.collapse" : "resources.timeline.expand")}
        </Button>
      </div>
      {expanded ? (
        <div className="flex min-h-12 items-center gap-2 border-t bg-background/20 px-3 py-1.5">
          {selectedInGap ? (
            <span className="shrink-0 rounded-full border bg-muted px-2 py-1 text-xs text-muted-foreground" role="status">
              {t("resources.timeline.noSnapshot")}
            </span>
          ) : null}
          {!live && !selectedInGap ? (
            <Button
              aria-label={t(playing ? "resources.timeline.pause" : "resources.timeline.play")}
              onClick={() => {
                if (playing) {
                  setPlaying(false);
                  return;
                }
                setPlaying(true);
              }}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            </Button>
          ) : null}
        <div className="relative h-16 min-w-0 flex-1 pt-5">
          <output
            aria-live="polite"
            className="pointer-events-none absolute top-0 z-30 -translate-x-1/2 rounded-md border bg-popover px-2 py-0.5 text-[11px] font-medium tabular-nums shadow-sm transition-[border-color,box-shadow] data-[dragging=true]:border-primary data-[dragging=true]:shadow-md motion-reduce:transition-none"
            data-dragging={dragging ? "true" : "false"}
            style={{ left: `${Math.min(94, Math.max(6, selectedPosition))}%` }}
          >
            {live ? t("resources.timeline.now") : formatTime(selectedMs)}
          </output>
          <svg aria-hidden="true" className="absolute inset-x-0 top-5 h-8 w-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 32">
            {visibleBuckets.map((bucket) => {
              const x = timelinePercent(
                Math.max(bucket.startMs, replayFromMs),
                replayFromMs,
                replayToMs,
              );
              const width = Math.max(0.25, timelinePercent(
                Math.min(bucket.endMs, replayToMs),
                replayFromMs,
                replayToMs,
              ) - x);
              const height = Math.max(2, (bucket.total / maxTotal) * 20);
              const warningHeight = bucket.total === 0 ? 0 : (bucket.warnings / bucket.total) * height;
              return (
                <g key={`${bucket.startMs}:${bucket.endMs}`}>
                  <rect className="fill-primary/35" height={height} rx="0.5" width={width} x={x} y={28 - height} />
                  {warningHeight > 0 ? (
                    <rect className="fill-destructive/75" height={warningHeight} rx="0.5" width={width} x={x} y={28 - warningHeight} />
                  ) : null}
                </g>
              );
            })}
            {timeline.gaps.filter((gap) => replayAvailable &&
              gap.to >= replayFromMs && gap.from <= replayToMs).map((gap) => {
              const x = timelinePercent(Math.max(gap.from, replayFromMs), replayFromMs, replayToMs);
              const width = timelinePercent(
                Math.min(gap.to, replayToMs),
                replayFromMs,
                replayToMs,
              ) - x;
              return <rect className="fill-muted" height="28" key={`${gap.from}:${gap.to}`} width={width} x={x} y="0" />;
            })}
          </svg>
          <svg className="pointer-events-none absolute inset-x-0 top-5 z-20 h-8 w-full overflow-visible" viewBox="0 0 100 32">
            {incidentEvents.map((event) => {
              const markerX = timelinePercent(event.occurredMs, replayFromMs, replayToMs);
              const label = t("resources.timeline.incidentMarker", { time: formatTime(event.occurredMs) });
              return (
                <foreignObject height="28" key={`${event.id}:${event.occurredMs}`} width="2" x={markerX - 1} y="0">
                  <button
                    aria-label={label}
                    className="pointer-events-auto size-full rounded-sm border-x border-destructive bg-destructive/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      setPlaying(false);
                      onAtChange(Math.max(replayFromMs, event.occurredMs - timeline.bucketMs));
                    }}
                    title={label}
                    type="button"
                  />
                </foreignObject>
              );
            })}
          </svg>
          {replayAvailable ? <input
            aria-label={t("resources.timeline.aria")}
            className="absolute inset-x-0 top-5 z-10 h-8 w-full cursor-pointer appearance-none bg-transparent accent-primary [&::-moz-range-progress]:h-1 [&::-moz-range-progress]:rounded-full [&::-moz-range-progress]:bg-primary [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-background [&::-moz-range-thumb]:bg-primary [&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-muted-foreground/30 [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-muted-foreground/30 [&::-webkit-slider-thumb]:mt-[-6px] [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-sm"
            max={replayToMs}
            min={replayFromMs}
            onChange={(event) => {
              setPlaying(false);
              const next = Number(event.currentTarget.value);
              onAtChange(next >= replayToMs ? undefined : next);
            }}
            onPointerDown={() => setDragging(true)}
            onPointerUp={() => setDragging(false)}
            step={Math.min(1_000, timeline.bucketMs)}
            type="range"
            value={selectedMs}
          /> : null}
          {replayAvailable ? (
            <div
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 flex items-center justify-between text-[10px] tabular-nums text-muted-foreground"
            >
              <time dateTime={new Date(replayFromMs).toISOString()}>{formatTime(replayFromMs)}</time>
              <time dateTime={new Date(replayToMs).toISOString()}>{formatTime(replayToMs)}</time>
            </div>
          ) : null}
        </div>
        </div>
      ) : null}
    </div>
  );
}

function timelineIntervalLabel(
  bucketMs: number,
  t: ReturnType<typeof useI18n>["t"],
): string {
  const seconds = Math.max(1, Math.round(bucketMs / 1_000));
  if (seconds < 60) {
    return t("resources.timeline.interval.seconds", { count: seconds });
  }
  return t("resources.timeline.interval.minutes", {
    count: Math.max(1, Math.round(seconds / 60)),
  });
}

const TIMELINE_RANGES: readonly TimelineRange[] = ["15m", "1h", "6h", "24h"];

export function TimelineRangeSelect({
  onChange,
  value,
}: {
  onChange: (range: TimelineRange) => void;
  value: TimelineRange;
}) {
  const { t } = useI18n();
  const items = TIMELINE_RANGES.map((range) => ({
    label: t(`resources.timeline.range.${range}`),
    value: range,
  }));
  return (
    <Select
      items={items}
      onValueChange={(next) => {
        if (next && TIMELINE_RANGES.some((range) => range === next)) onChange(next as TimelineRange);
      }}
      value={value}
    >
      <SelectTrigger aria-label={t("resources.timeline.range")} size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          <SelectLabel>{t("resources.timeline.range")}</SelectLabel>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

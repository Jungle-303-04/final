import { Pause, Play } from "lucide-react";
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
  isTimelineGap,
  timelinePercent,
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
      {items.map((item) => (
        <span className="flex min-w-0 items-center gap-1" key={item.id}>
          <span aria-hidden="true">›</span>
          <button
            className="max-w-36 truncate rounded-sm px-1 py-0.5 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={item.onSelect}
            title={item.label}
            type="button"
          >
            {item.label}
          </button>
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
      className="flex min-h-14 shrink-0 items-center gap-3 border-t bg-background/40 px-3 py-2"
      data-slot="resources-time-scrubber"
      data-state={loading ? "loading" : "unavailable"}
    >
      <Button aria-label={t("resources.timeline.play")} disabled size="icon-sm" type="button" variant="ghost">
        <Play aria-hidden="true" />
        <Pause aria-hidden="true" className="hidden" />
      </Button>
      <input
        aria-label={t("resources.timeline.aria")}
        className="h-2 min-w-0 flex-1 cursor-not-allowed accent-primary opacity-45"
        disabled
        max={100}
        min={0}
        readOnly
        type="range"
        value={100}
      />
      <span className="sr-only" id="resources-timeline-unavailable">
        {t(loading ? "resources.timeline.loading" : "resources.timeline.unavailable")}
      </span>
    </div>
  );
}

export function TimelineStrip({
  atMs,
  frame,
  onAtChange,
}: {
  atMs: number | undefined;
  frame: ChangeTimelineFrame;
  onAtChange: (atMs: number | undefined) => void;
}) {
  const { formatDate, t } = useI18n();
  const [dragging, setDragging] = useState(false);
  const [playing, setPlaying] = useState(false);
  const timeline = frame.phase === "ready" ? frame.data : null;
  const live = atMs === undefined;
  const selectedMs = timeline
    ? Math.min(timeline.toMs, Math.max(timeline.fromMs, atMs ?? timeline.toMs))
    : 0;

  useEffect(() => {
    if (!playing || timeline === null) return undefined;
    const interval = window.setInterval(() => {
      const current = atMs ?? timelinePlaybackStart(timeline);
      const next = current + timelinePlaybackStep(timeline);
      if (next >= timeline.toMs) {
        setPlaying(false);
        onAtChange(undefined);
      } else {
        onAtChange(next);
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [atMs, onAtChange, playing, timeline]);

  if (timeline === null) {
    return <UnavailableTimeline loading={frame.phase === "loading"} />;
  }

  const incidentEvents = timeline.events.filter((event) => event.kind === "incident");
  const maxTotal = Math.max(1, ...timeline.buckets.map((bucket) => bucket.total));
  const selectedInGap = isTimelineGap(selectedMs, timeline.gaps);
  const formatTime = (value: number) => formatDate(value, {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className="flex min-h-14 shrink-0 items-center gap-3 border-t bg-background/40 px-3 py-2"
      data-slot="resources-time-scrubber"
      data-state={playing ? "playing" : live ? "live" : "past"}
    >
      {!live ? (
        <span className="shrink-0 rounded-full border bg-background/40 px-2.5 py-1 text-xs font-medium" role="status">
          {t("resources.timeline.past", { time: formatTime(selectedMs) })}
        </span>
      ) : null}
      {selectedInGap ? (
        <span className="shrink-0 rounded-full border bg-muted px-3 py-1 text-xs text-muted-foreground" role="status">
          {t("resources.timeline.noSnapshot")}
        </span>
      ) : null}
        <Button
          aria-label={t(playing ? "resources.timeline.pause" : "resources.timeline.play")}
          onClick={() => {
            if (playing) {
              setPlaying(false);
              return;
            }
            if (live) onAtChange(timelinePlaybackStart(timeline));
            setPlaying(true);
          }}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </Button>
        <div className="relative h-8 min-w-0 flex-1">
          <svg aria-hidden="true" className="absolute inset-0 size-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 32">
            {timeline.buckets.map((bucket) => {
              const x = timelinePercent(bucket.startMs, timeline.fromMs, timeline.toMs);
              const width = Math.max(0.25, timelinePercent(bucket.endMs, timeline.fromMs, timeline.toMs) - x);
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
            {timeline.gaps.map((gap) => {
              const x = timelinePercent(gap.from, timeline.fromMs, timeline.toMs);
              const width = timelinePercent(gap.to, timeline.fromMs, timeline.toMs) - x;
              return <rect className="fill-muted" height="28" key={`${gap.from}:${gap.to}`} width={width} x={x} y="0" />;
            })}
          </svg>
          <svg className="pointer-events-none absolute inset-0 z-20 size-full overflow-visible" viewBox="0 0 100 32">
            {incidentEvents.map((event) => {
              const markerX = timelinePercent(event.occurredMs, timeline.fromMs, timeline.toMs);
              const label = t("resources.timeline.incidentMarker", { time: formatTime(event.occurredMs) });
              return (
                <foreignObject height="28" key={`${event.id}:${event.occurredMs}`} width="2" x={markerX - 1} y="0">
                  <button
                    aria-label={label}
                    className="pointer-events-auto size-full rounded-sm border-x border-destructive bg-destructive/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      setPlaying(false);
                      onAtChange(Math.max(timeline.fromMs, event.occurredMs - timeline.bucketMs));
                    }}
                    title={label}
                    type="button"
                  />
                </foreignObject>
              );
            })}
            {dragging ? (
              <foreignObject
                height="24"
                width="20"
                x={Math.min(80, Math.max(0, timelinePercent(selectedMs, timeline.fromMs, timeline.toMs) - 10))}
                y="-26"
              >
                <output className="block size-full rounded-md border bg-popover px-1 py-1 text-center text-xs shadow-sm">
                  {live ? t("resources.timeline.now") : formatTime(selectedMs)}
                </output>
              </foreignObject>
            ) : null}
          </svg>
          <input
            aria-label={t("resources.timeline.aria")}
            className="absolute inset-x-0 bottom-0 z-10 h-3 w-full cursor-pointer accent-primary"
            max={timeline.toMs}
            min={timeline.fromMs}
            onChange={(event) => {
              setPlaying(false);
              const next = Number(event.currentTarget.value);
              onAtChange(next >= timeline.toMs ? undefined : next);
            }}
            onPointerDown={() => setDragging(true)}
            onPointerUp={() => setDragging(false)}
            step={timeline.bucketMs}
            type="range"
            value={selectedMs}
          />
        </div>
    </div>
  );
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

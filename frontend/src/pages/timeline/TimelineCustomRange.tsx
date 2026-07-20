import { useRef, useState } from "react";
import type {
  TimelineMode,
  TimelineQueryBounds,
  TimelineWindow,
} from "../../features/timeline/timelineContract";
import type { I18nController } from "../../shared/i18n";

export function TimelineCustomRange({
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
    <details
      className="relative min-w-0"
      data-slot="timeline-custom-range"
      onToggle={(event) => setOpen(event.currentTarget.open)}
      open={open}
      ref={details}
    >
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
      <label className="grid min-w-0 gap-1 text-xs font-medium">
        <span>{t("timeline.strip.from")}</span>
        <input className="h-8 min-w-0 rounded-md border bg-background px-2" max={max} min={min} onChange={(event) => setFrom(event.currentTarget.value)} type="datetime-local" value={from} />
      </label>
      <label className="grid min-w-0 gap-1 text-xs font-medium">
        <span>{t("timeline.strip.to")}</span>
        <input className="h-8 min-w-0 rounded-md border bg-background px-2" max={max} min={min} onChange={(event) => setTo(event.currentTarget.value)} type="datetime-local" value={to} />
      </label>
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

function dateTimeInputValue(value: number): string {
  const date = new Date(value - new Date(value).getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}

import { timelinePinLabel } from "../../features/timeline/timelinePinTargets";
import type { I18nController } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import type { TimelinePinsController } from "./useTimelinePins";

export function TimelinePinsControl({
  label,
  onPinnedOnlyChange,
  pinnedOnly,
  pins,
  t,
}: {
  label: string;
  onPinnedOnlyChange: (pinnedOnly: boolean) => void;
  pinnedOnly: boolean;
  pins: TimelinePinsController;
  t: I18nController["t"];
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2" data-slot="timeline-pins-control">
      {pins.phase === "ready" ? (
        <label className="flex h-9 min-w-0 items-center gap-2 rounded-md border px-2 text-sm font-medium">
          <input
            checked={pinnedOnly}
            className="size-4 accent-primary"
            onChange={(event) => onPinnedOnlyChange(event.currentTarget.checked)}
            type="checkbox"
          />
          <span className="min-w-0 break-words">{t("timeline.pins.filter")}</span>
        </label>
      ) : null}
      <details className="relative min-w-0 max-w-full" data-slot="timeline-pins-manager">
        <summary className="flex h-9 max-w-full cursor-pointer list-none items-center rounded-md border px-2 text-sm font-medium outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-ring">
          <span className="truncate">{label}</span>
        </summary>
        <div className="absolute right-0 z-20 mt-1 grid w-[min(24rem,calc(100vw-2rem))] min-w-0 max-w-[calc(100vw-2rem)] gap-2 rounded-lg border bg-popover p-3 text-popover-foreground shadow-md">
          <TimelinePinsManagerContent pins={pins} t={t} />
        </div>
      </details>
    </div>
  );
}

function TimelinePinsManagerContent({
  pins,
  t,
}: {
  pins: TimelinePinsController;
  t: I18nController["t"];
}) {
  if (pins.phase === "loading") {
    return <p aria-live="polite" className="text-sm text-muted-foreground" role="status">{t("timeline.pins.loading")}</p>;
  }
  if (pins.phase === "forbidden") {
    return <p className="text-sm text-destructive" role="alert">{t("timeline.pins.forbidden")}</p>;
  }
  if (pins.phase === "unavailable") {
    return <TimelinePinsFailure message={t("timeline.pins.unavailable")} onRetry={pins.retry} t={t} />;
  }
  if (pins.phase === "failed") {
    return <TimelinePinsFailure message={t("timeline.pins.failed")} onRetry={pins.retry} t={t} />;
  }
  if (pins.phase === "disabled" || pins.pinSet === null) return null;

  return (
    <>
      <TimelinePinsNotice notice={pins.notice} t={t} />
      {pins.pinSet.pins.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("timeline.pins.empty")}</p>
      ) : (
        <ul aria-label={t("timeline.pins.filter")} className="grid max-h-56 gap-1 overflow-y-auto">
          {pins.pinSet.pins.map((pin) => {
            const pending = pins.pendingPinId === pin.pinId;
            return (
              <li className="flex min-w-0 items-center justify-between gap-2 rounded-md border p-2" key={pin.pinId}>
                <span className="min-w-0 break-words text-sm" title={timelinePinLabel(pin)}>{timelinePinLabel(pin)}</span>
                <Button
                  aria-label={`${t("timeline.pins.remove")}: ${timelinePinLabel(pin)}`}
                  disabled={pins.pendingPinId !== null || pins.pendingTargetKey !== null}
                  onClick={() => { void pins.remove(pin); }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {pending ? t("timeline.pins.pendingRemove") : t("timeline.pins.remove")}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function TimelinePinsFailure({
  message,
  onRetry,
  t,
}: {
  message: string;
  onRetry: () => void;
  t: I18nController["t"];
}) {
  return (
    <div className="grid gap-2" role="alert">
      <p className="text-sm text-destructive">{message}</p>
      <div><Button onClick={onRetry} size="sm" type="button" variant="outline">{t("timeline.pins.retry")}</Button></div>
    </div>
  );
}

function TimelinePinsNotice({
  notice,
  t,
}: {
  notice: TimelinePinsController["notice"];
  t: I18nController["t"];
}) {
  if (notice === null) return null;
  const key = notice === "added"
    ? "timeline.pins.added"
    : notice === "removed"
      ? "timeline.pins.removed"
      : notice === "conflict"
        ? "timeline.pins.conflict"
        : "timeline.pins.failed";
  return <p aria-live="polite" className="text-sm text-muted-foreground" role="status">{t(key)}</p>;
}

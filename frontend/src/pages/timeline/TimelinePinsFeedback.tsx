import type { I18nController } from "../../shared/i18n";
import type { TimelinePinsController } from "./useTimelinePins";

export function TimelinePinsFeedback({
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

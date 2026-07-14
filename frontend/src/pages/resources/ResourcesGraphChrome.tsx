import { Pause, Play } from "lucide-react";

import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";

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

export function UnavailableTimeline() {
  const { t } = useI18n();
  return (
    <div
      aria-describedby="resources-timeline-unavailable"
      className="absolute inset-x-3 bottom-3 z-20 flex translate-y-1.5 items-center gap-3 rounded-xl border bg-background/95 px-3 py-2 opacity-100 shadow-lg backdrop-blur transition-[opacity,transform] duration-200 motion-reduce:translate-y-0 motion-reduce:transition-opacity sm:opacity-0 sm:group-focus-within/resources-graph:translate-y-0 sm:group-focus-within/resources-graph:opacity-100 sm:group-hover/resources-graph:translate-y-0 sm:group-hover/resources-graph:opacity-100"
      data-slot="resources-time-scrubber"
      data-state="unavailable"
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
        {t("resources.timeline.unavailable")}
      </span>
    </div>
  );
}

import { Pause, Play, Server, Waypoints } from "lucide-react";
import { useI18n } from "../../shared/i18n";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";

export function ResourcesGraphShell() {
  const { t } = useI18n();
  return (
    <div
      aria-live="polite"
      className="group/resources-graph relative isolate grid min-h-80 overflow-hidden bg-linear-to-b from-muted/20 via-card to-muted/40 p-6 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300"
      data-slot="resources-graph-shell"
    >
      <div className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center justify-between gap-2 p-4">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            <Server aria-hidden="true" />
            {t("resources.graph.physical.title")}
          </Badge>
          <Badge variant="outline">{t("common.state.unavailable")}</Badge>
        </div>
      </div>

      <div className="grid max-w-lg place-self-center justify-items-center gap-3 pb-10 pt-12 text-center">
        <div className="grid size-16 place-items-center rounded-2xl border border-dashed bg-background/70 shadow-sm">
          <Waypoints aria-hidden="true" className="size-7 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold" id="resources-graph-unavailable-title">
          {t("resources.graph.unavailable.title")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("resources.graph.unavailable.description")}
        </p>
      </div>

      <div
        aria-describedby="resources-timeline-unavailable"
        className="absolute inset-x-3 bottom-3 z-20 flex translate-y-1.5 items-center gap-3 rounded-xl border bg-background/95 px-3 py-2 opacity-100 shadow-lg backdrop-blur transition-[opacity,transform] duration-200 motion-reduce:translate-y-0 motion-reduce:transition-opacity sm:opacity-0 sm:group-focus-within/resources-graph:translate-y-0 sm:group-focus-within/resources-graph:opacity-100 sm:group-hover/resources-graph:translate-y-0 sm:group-hover/resources-graph:opacity-100"
        data-slot="resources-time-scrubber"
        data-state="unavailable"
      >
        <Button
          aria-label={t("resources.timeline.play")}
          disabled
          size="icon-sm"
          type="button"
          variant="ghost"
        >
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
    </div>
  );
}

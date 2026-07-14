import { Waypoints } from "lucide-react";
import { useI18n } from "../../shared/i18n";

export function ResourcesGraphShell() {
  const { t } = useI18n();
  return (
    <div
      aria-live="polite"
      className="grid min-h-72 place-items-center p-6 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300"
      data-slot="resources-graph-shell"
    >
      <div className="grid max-w-md justify-items-center gap-3 text-center">
        <Waypoints aria-hidden="true" className="size-8 text-muted-foreground" />
        <h2 className="text-lg font-semibold" id="resources-graph-unavailable-title">
          {t("resources.graph.unavailable.title")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("resources.graph.unavailable.description")}
        </p>
      </div>
    </div>
  );
}

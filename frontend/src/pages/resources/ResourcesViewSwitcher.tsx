import type { ResourceSurfaceView } from "../../features/filters/filterContract";
import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import { ButtonGroup } from "../../shared/ui/primitives/button-group";

export function ResourcesViewSwitcher({
  onChange,
  view,
}: {
  onChange: (view: ResourceSurfaceView) => void;
  view: ResourceSurfaceView;
}) {
  const { t } = useI18n();
  return (
    <div data-slot="resources-view-switcher">
      <ButtonGroup
        aria-label={t("resources.surface.view.aria")}
        className="rounded-lg bg-muted p-0.5"
      >
        <Button
          aria-pressed={view === "map"}
          onClick={() => onChange("map")}
          size="compact-segment"
          type="button"
          variant={view === "map" ? "outline" : "ghost"}
        >
          {t("resources.surface.view.map")}
        </Button>
        <Button
          aria-pressed={view === "list"}
          onClick={() => onChange("list")}
          size="compact-segment"
          type="button"
          variant={view === "list" ? "outline" : "ghost"}
        >
          {t("resources.surface.view.list")}
        </Button>
        <Button
          aria-pressed={view === "flow"}
          onClick={() => onChange("flow")}
          size="compact-segment"
          type="button"
          variant={view === "flow" ? "outline" : "ghost"}
        >
          {t("resources.surface.view.flow")}
        </Button>
      </ButtonGroup>
    </div>
  );
}

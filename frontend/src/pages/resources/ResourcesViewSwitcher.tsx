import { List, Map as MapIcon, Network } from "lucide-react";

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
      <ButtonGroup aria-label={t("resources.surface.view.aria")}>
        <Button
          aria-pressed={view === "map"}
          onClick={() => onChange("map")}
          size="sm"
          type="button"
          variant={view === "map" ? "secondary" : "outline"}
        >
          <MapIcon aria-hidden="true" />
          {t("resources.surface.view.map")}
        </Button>
        <Button
          aria-pressed={view === "list"}
          onClick={() => onChange("list")}
          size="sm"
          type="button"
          variant={view === "list" ? "secondary" : "outline"}
        >
          <List aria-hidden="true" />
          {t("resources.surface.view.list")}
        </Button>
        <Button
          aria-pressed={view === "flow"}
          onClick={() => onChange("flow")}
          size="sm"
          type="button"
          variant={view === "flow" ? "secondary" : "outline"}
        >
          <Network aria-hidden="true" />
          {t("resources.surface.view.flow")}
        </Button>
      </ButtonGroup>
    </div>
  );
}

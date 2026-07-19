import { List, Map as MapIcon } from "lucide-react";

import type { ResourceView } from "../../features/filters/filterContract";
import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import { ButtonGroup } from "../../shared/ui/primitives/button-group";

export function ResourcesViewSwitcher({
  onChange,
  view,
}: {
  onChange: (view: ResourceView) => void;
  view: ResourceView;
}) {
  const { t } = useI18n();
  return (
    <div data-slot="resources-view-switcher">
      <ButtonGroup aria-label={t("resources.surface.view.aria")}>
        <Button
          aria-pressed={view === "graph"}
          onClick={() => onChange("graph")}
          size="sm"
          type="button"
          variant={view === "graph" ? "secondary" : "outline"}
        >
          <MapIcon aria-hidden="true" />
          {t("resources.surface.view.map")}
        </Button>
        <Button
          aria-pressed={view === "table"}
          onClick={() => onChange("table")}
          size="sm"
          type="button"
          variant={view === "table" ? "secondary" : "outline"}
        >
          <List aria-hidden="true" />
          {t("resources.surface.view.list")}
        </Button>
      </ButtonGroup>
    </div>
  );
}

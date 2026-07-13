import { Table2, Waypoints } from "lucide-react";
import type { ResourceView } from "../../features/filters/filterContract";
import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import { ButtonGroup } from "../../shared/ui/primitives/button-group";

export function ResourcesViewToggle({
  onViewChange,
  view,
}: {
  onViewChange: (value: ResourceView) => void;
  view: ResourceView;
}) {
  const { t } = useI18n();
  return (
    <ButtonGroup
      aria-label={t("resources.view.aria")}
      className="shrink-0"
      id="resources-view-toggle"
    >
      <Button
        aria-pressed={view === "table"}
        className="min-w-24 forced-colors:aria-pressed:border-[Highlight] forced-colors:aria-pressed:bg-[Highlight] forced-colors:aria-pressed:text-[HighlightText]"
        onClick={() => onViewChange("table")}
        size="sm"
        type="button"
        variant={view === "table" ? "secondary" : "outline"}
      >
        <Table2 aria-hidden="true" />
        {t("resources.view.table")}
      </Button>
      <Button
        aria-pressed={view === "graph"}
        className="min-w-24 forced-colors:aria-pressed:border-[Highlight] forced-colors:aria-pressed:bg-[Highlight] forced-colors:aria-pressed:text-[HighlightText]"
        onClick={() => onViewChange("graph")}
        size="sm"
        type="button"
        variant={view === "graph" ? "secondary" : "outline"}
      >
        <Waypoints aria-hidden="true" />
        {t("resources.view.graph")}
      </Button>
    </ButtonGroup>
  );
}

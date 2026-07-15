import { SlidersHorizontal } from "lucide-react";
import { useI18n } from "../../shared/i18n";
import { Toggle } from "../../shared/ui/primitives/toggle";

export function ResourcesToolbar({
  includeDeleted,
  onIncludeDeletedChange,
}: {
  includeDeleted: boolean;
  onIncludeDeletedChange: (value: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <Toggle
      aria-label={t("resources.filter.includeInactive")}
      className="shrink-0"
      onPressedChange={(pressed) => onIncludeDeletedChange(pressed)}
      pressed={includeDeleted}
      size="sm"
      variant="outline"
    >
      <SlidersHorizontal aria-hidden="true" data-icon="inline-start" />
      {t("resources.filter.includeInactive.short")}
    </Toggle>
  );
}

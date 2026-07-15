import type { ResourcesFilterResourcePage } from "../../features/resources/resourcesFilterContract";
import { useI18n } from "../../shared/i18n";

export function ResourcesListScopeStatus({ page }: { page: ResourcesFilterResourcePage }) {
  const { formatNumber, t } = useI18n();
  const total = page.counts.filteredCount;
  const shown = page.items.length;
  const filteredText = total === null
    ? ` · ${t("resources.list.unknownTotal")}`
    : ` · ${t("resources.list.scope.filtered", { count: formatNumber(total) })}`;
  const excludedText = page.excludedCount > 0
    ? ` · ${t("resources.list.scope.excluded", {
      count: formatNumber(page.excludedCount),
    })}`
    : "";
  return (
    <div
      aria-label={t("resources.list.scope.aria")}
      className="border-b bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      role="status"
    >
      {t("resources.list.scope.shown", { count: formatNumber(shown) })}
      {filteredText}
      {excludedText}
      {page.counts.filteredCountCompleteness === "partial"
        ? ` · ${t("common.state.partial")}`
        : ""}
    </div>
  );
}

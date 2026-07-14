import { useState } from "react";
import { useI18n } from "../../shared/i18n";
import { Badge } from "../../shared/ui/primitives/badge";

export function CatalogFreshness({
  observedAt,
}: {
  observedAt: string | null;
}) {
  const { formatNumber, t } = useI18n();
  const [renderedAt] = useState(() => Date.now());

  if (observedAt === null) {
    return <Badge variant="outline">{t("resources.freshness.missing")}</Badge>;
  }
  const ageMilliseconds = Math.max(0, renderedAt - Date.parse(observedAt));
  const ageMinutes = Math.floor(ageMilliseconds / 60_000);
  const stale = ageMilliseconds > 90_000;
  if (!stale) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
      role="status"
    >
      <Badge variant="destructive">{t("resources.freshness.stale")}</Badge>
      <span>
        {t("resources.freshness.ageMinutes", {
          minutes: formatNumber(ageMinutes),
        })}
      </span>
    </div>
  );
}

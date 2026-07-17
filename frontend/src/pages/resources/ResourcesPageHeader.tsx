import { Boxes, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "../../shared/i18n";
import { ProductPageHeader } from "../../shared/ui/ProductPageHeader";
import { Badge } from "../../shared/ui/primitives/badge";
import { resourceTypePresentation } from "./resourcePresentation";

interface ResourcesPageHeaderProps {
  children: ReactNode;
  clusterName: string | null;
  environment: string | null;
  resourceType: string | null;
  visibleCount: number | null;
}

export function ResourcesPageHeader({
  children,
  clusterName,
  environment,
  resourceType,
  visibleCount,
}: ResourcesPageHeaderProps) {
  const { formatNumber, t } = useI18n();
  const presentation = resourceType ? resourceTypePresentation(resourceType) : null;
  const ResourceIcon: LucideIcon = presentation?.icon ?? Boxes;
  const clusterLabel = clusterName ?? t("resources.page.allClusters");
  const resourceLabel = presentation
    ? presentation.labelKey
      ? t(presentation.labelKey)
      : presentation.fallbackLabel
    : t("resources.page.allTypes");

  return (
    <ProductPageHeader
      actions={(
        <>
          {visibleCount === null ? null : (
            <Badge className="font-mono tabular-nums" variant="secondary">
              {t("resources.page.visibleCount", { count: formatNumber(visibleCount) })}
            </Badge>
          )}
          {children}
        </>
      )}
      description={t("resources.page.description", {
        cluster: clusterLabel,
        resourceType: resourceLabel,
      })}
      icon={ResourceIcon}
      meta={(
        <>
          <span className="truncate font-medium text-foreground">{clusterLabel}</span>
          {environment ? <Badge variant="outline">{environment}</Badge> : null}
        </>
      )}
      title={t("resources.page.title", { resourceType: resourceLabel })}
    />
  );
}

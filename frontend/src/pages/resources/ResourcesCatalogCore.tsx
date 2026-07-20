import { GitBranch, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type {
  ResourceApiDiscovery,
  ResourceCatalogItem,
} from "../../features/resources/resourcesContract";
import { useI18n } from "../../shared/i18n";
import { Surface } from "../../shared/ui/Surface";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { ButtonGroup } from "../../shared/ui/primitives/button-group";
import { resourceTypePresentation } from "./resourcePresentation";

type CatalogTab = "types" | "services" | "configuration" | "repositories";

const SERVICE_TYPES = new Set(["service", "endpoint", "endpoints", "ingress", "networkpolicy"]);
const CONFIGURATION_TYPES = new Set(["configmap", "secret"]);
const CATALOG_TABS: readonly CatalogTab[] = [
  "types",
  "services",
  "configuration",
  "repositories",
];

export function ResourcesCatalog({
  discovery,
  items,
  onSelect,
  selectedResourceType,
}: {
  discovery?: ResourceApiDiscovery;
  items: ResourceCatalogItem[];
  onSelect: (resourceType: string) => void;
  selectedResourceType: string | null;
}) {
  const { formatNumber, t } = useI18n();
  const filter = useUnifiedFilter();
  const [tab, setTab] = useState<CatalogTab>(() => tabForType(selectedResourceType));
  const entries = useMemo(() => items.map((item) => ({
    item,
    presentation: resourceTypePresentation(item.resourceType),
  })).sort((left, right) => (
    left.presentation.category.order - right.presentation.category.order ||
    left.presentation.order - right.presentation.order ||
    left.item.resourceType.localeCompare(right.item.resourceType)
  )), [items]);
  const visibleEntries = tab === "types"
    ? entries
    : tab === "services"
      ? entries.filter(({ item }) => SERVICE_TYPES.has(item.resourceType.toLocaleLowerCase()))
      : tab === "configuration"
        ? entries.filter(({ item }) => CONFIGURATION_TYPES.has(item.resourceType.toLocaleLowerCase()))
        : [];
  const discovered = discovery?.resources.length ?? null;
  const selectTab = (next: CatalogTab) => setTab(next);
  const repositoriesDetail = {
    ...filter.detail,
    surfaceTab: "repositories" as const,
  };

  return (
    <Surface
      aria-labelledby="resource-catalog-title"
      className="flex min-h-0 min-w-0 flex-col overflow-hidden"
      data-slot="resources-catalog-core"
    >
      <header className="flex min-w-0 items-center justify-between gap-2 border-b px-3 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold" id="resource-catalog-title">
            {t("resources.catalog.title")}
          </h3>
          <p className="truncate text-xs text-muted-foreground">
            {t("resources.catalog.description")}
          </p>
        </div>
        <span className="flex shrink-0 gap-1.5">
          {discovered === null ? null : (
            <Badge
              className="h-7 px-3 text-xs tabular-nums"
              variant={discovery?.completeness === "partial" ? "outline" : "secondary"}
            >
              {t("resources.catalog.discoveryCountShort", { count: formatNumber(discovered) })}
            </Badge>
          )}
          <Badge className="h-7 px-3 text-xs tabular-nums" variant="secondary">
            {formatNumber(items.reduce((sum, item) => sum + item.count, 0))}
          </Badge>
        </span>
      </header>
      <nav aria-label={t("resources.catalog.tabs.aria")} className="overflow-x-auto border-b p-2">
        <ButtonGroup aria-label={t("resources.catalog.tabs.aria")}>
          {CATALOG_TABS.map((candidate) => (
            <Button
              aria-pressed={tab === candidate}
              key={candidate}
              onClick={() => selectTab(candidate)}
              size="sm"
              type="button"
              variant={tab === candidate ? "secondary" : "outline"}
            >
              {t(`resources.catalog.tab.${candidate}`)}
            </Button>
          ))}
        </ButtonGroup>
      </nav>
      <div className="min-h-0 min-w-0 flex-1 overflow-x-auto p-2 lg:overflow-y-auto">
        {tab === "repositories" ? (
          <div className="grid min-w-56 gap-3 rounded-lg border border-dashed p-3">
            <GitBranch aria-hidden="true" className="size-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{t("connections.launcher.repository.title")}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t("connections.launcher.repository.description")}
              </p>
            </div>
            <Button render={<Link to={filter.navigationHref("/deploy", repositoriesDetail)} />} size="sm">
              <Plus aria-hidden="true" />
              {t("resources.catalog.repository.connect")}
            </Button>
          </div>
        ) : visibleEntries.length === 0 ? (
          <p className="min-w-56 px-2 py-6 text-center text-xs text-muted-foreground">
            {t("resources.catalog.noMatch")}
          </p>
        ) : (
          <ul className="flex min-w-max gap-1 lg:min-w-0 lg:flex-col" aria-label={t("resources.catalog.aria")}>
            {visibleEntries.map(({ item, presentation }) => {
              const Icon = presentation.icon;
              const label = presentation.labelKey
                ? t(presentation.labelKey)
                : presentation.fallbackLabel;
              return (
                <li key={item.resourceType}>
                  <button
                    aria-current={item.resourceType === selectedResourceType ? "page" : undefined}
                    aria-label={t("resources.catalog.itemAria", {
                      count: formatNumber(item.count),
                      label,
                    })}
                    className="flex h-9 w-full min-w-40 items-center gap-2 rounded-lg px-2 text-left text-xs outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-secondary motion-reduce:transition-none"
                    onClick={() => onSelect(item.resourceType)}
                    type="button"
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
                    <span className="tabular-nums text-muted-foreground">{formatNumber(item.count)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Surface>
  );
}

function tabForType(resourceType: string | null): CatalogTab {
  const normalized = resourceType?.toLocaleLowerCase() ?? "";
  if (SERVICE_TYPES.has(normalized)) return "services";
  if (CONFIGURATION_TYPES.has(normalized)) return "configuration";
  return "types";
}

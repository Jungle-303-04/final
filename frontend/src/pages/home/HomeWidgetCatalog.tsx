import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type { UnifiedFilterController, UnifiedFilterState } from "../../features/filters/filterContract";
import { serializeProductFilterUrl } from "../../features/filters/filterUrl";
import type { ResourcesFilterResourceItem } from "../../features/resources/resourcesFilterContract";
import { useI18n, type TranslationFunction } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import { Surface } from "../../shared/ui/Surface";
import {
  HOME_WIDGET_IDS,
  type HomeBoardPreferences,
  type HomeWidgetId,
} from "./homeBoardPreferences";

export function WidgetCatalog({
  onToggle,
  preferences,
}: {
  onToggle: (id: HomeWidgetId) => void;
  preferences: HomeBoardPreferences;
}) {
  const filter = useUnifiedFilter();
  const { t } = useI18n();
  return (
    <Surface aria-labelledby="home-widget-catalog" className="grid gap-3 p-4">
      <h2 className="text-body-strong" id="home-widget-catalog">
        {t("resources.catalog.title")}
      </h2>
      <div className="flex flex-wrap gap-2">
        {HOME_WIDGET_IDS.map((id) => {
          const definition = widgetDefinition(id, t, filter);
          const selected = preferences.visible.includes(id);
          return (
            <Button
              aria-pressed={selected}
              key={id}
              onClick={() => onToggle(id)}
              size="sm"
              type="button"
              variant={selected ? "default" : "outline"}
            >
              {definition.title}
            </Button>
          );
        })}
      </div>
    </Surface>
  );
}

export function widgetDefinition(
  id: HomeWidgetId,
  t: TranslationFunction,
  filter: ReturnType<typeof useUnifiedFilter>,
) {
  const issues = filter.navigationHref("/issues");
  const deploy = filter.navigationHref("/deploy", {
    ...filter.detail,
    surfaceTab: "repositories",
  });
  const timeline = filter.navigationHref("/timeline");
  const resources = filter.navigationHref("/resources");
  const criticalResources = `/resources${serializeProductFilterUrl(
    criticalResourceState(filter.state),
  )}`;
  const cost = filter.navigationHref("/cost");
  const definitions = {
    W2: {
      description: t("issues.surface.visibility.label"),
      href: issues,
      span: "col-span-6 min-[1024px]:col-span-4",
      title: t("issues.surface.list"),
    },
    W3: {
      description: t("workflows.sync.description"),
      href: deploy,
      span: "col-span-6 min-[1024px]:col-span-4",
      title: t("workflows.sync.table.status"),
    },
    W4: {
      description: t("timeline.description"),
      href: timeline,
      span: "col-span-6 min-[1024px]:col-span-4",
      title: t("timeline.toolbar.activity"),
    },
    W5: {
      description: t("metrics.preset.namespacePodCount.description"),
      href: resources,
      span: "col-span-6 min-[1024px]:col-span-4",
      title: t("metrics.preset.namespacePodCount.name"),
    },
    W6: {
      description: t("resources.catalog.description"),
      href: criticalResources,
      span: "col-span-6 min-[1024px]:col-span-4",
      title: `${t("status.tone.critical")} · ${t("resources.catalog.title")}`,
    },
    W7: {
      description: t("cost.description"),
      href: cost,
      span: "col-span-6 min-[1024px]:col-span-4",
      title: t("cost.summary.title"),
    },
    W8: {
      description: t("timeline.description"),
      href: timeline,
      span: "col-span-6 min-[1024px]:col-span-8",
      title: t("issues.recentChanges.title"),
    },
  } as const;
  return definitions[id];
}

export function criticalResourceDetailHref(
  filter: UnifiedFilterController,
  item: ResourcesFilterResourceItem,
): string {
  const state = criticalResourceState({
    ...filter.state,
    common: { ...filter.state.common, clusters: [item.cluster.clusterId] },
  });
  return `/resources${serializeProductFilterUrl(state, {
    ...filter.detail,
    detail: [
      item.resource.kind,
      item.resource.namespace ?? "~",
      item.resource.name,
    ].join("/"),
  })}`;
}

export function timelineEventHref(baseHref: string, sourceKey: string): string {
  const separator = baseHref.includes("?") ? "&" : "?";
  return `${baseHref}${separator}event=${encodeURIComponent(sourceKey)}`;
}

function criticalResourceState(state: UnifiedFilterState): UnifiedFilterState {
  return {
    ...state,
    resources: {
      ...state.resources,
      health: ["critical"],
      includeDeleted: false,
      query: "",
    },
  };
}

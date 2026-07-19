import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type { UnifiedFilterController, UnifiedFilterState } from "../../features/filters/filterContract";
import { serializeProductFilterUrl } from "../../features/filters/filterUrl";
import type { ResourcesFilterResourceItem } from "../../features/resources/resourcesFilterContract";
import type { TranslationFunction } from "../../shared/i18n";
import type { HomeWidgetId } from "./homeBoardPreferences";

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
  const criticalResources = homeCriticalResourcesHref(filter);
  const cost = filter.navigationHref("/cost");
  const definitions = {
    W2: {
      description: t("shell.home.widget.issues.description"),
      href: issues,
      span: "col-span-6 min-[1024px]:col-span-3",
      title: t("shell.home.widget.issues"),
    },
    W3: {
      description: t("shell.home.widget.repositorySync.description"),
      href: deploy,
      span: "col-span-6 min-[1024px]:col-span-3",
      title: t("shell.home.widget.repositorySync"),
    },
    W4: {
      description: t("shell.home.widget.activityTrend.description"),
      href: timeline,
      span: "col-span-6 min-[1024px]:col-span-6",
      title: t("shell.home.widget.activityTrend"),
    },
    W5: {
      description: t("shell.home.widget.namespacePods.description"),
      href: resources,
      span: "col-span-6 min-[1024px]:col-span-3",
      title: t("shell.home.widget.namespacePods"),
    },
    W6: {
      description: t("shell.home.widget.attentionResources.description"),
      href: criticalResources,
      span: "col-span-6 min-[1024px]:col-span-6",
      title: t("shell.home.widget.attentionResources"),
    },
    W7: {
      description: t("shell.home.widget.cost.description"),
      href: cost,
      span: "col-span-6 min-[1024px]:col-span-3",
      title: t("shell.home.widget.cost"),
    },
    W8: {
      description: t("shell.home.widget.recentChanges.description"),
      href: timeline,
      span: "col-span-6 min-[1024px]:col-span-12",
      title: t("shell.home.widget.recentChanges"),
    },
  } as const;
  return definitions[id];
}

export function homeCriticalResourcesHref(
  filter: Pick<UnifiedFilterController, "state">,
): string {
  return `/resources${serializeProductFilterUrl(
    criticalResourceState(filter.state),
  )}`;
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
      health: ["critical", "warning"],
      includeDeleted: false,
      query: "",
    },
  };
}

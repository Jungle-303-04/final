import { useEffect, useMemo } from "react";

import {
  isProductContextShortcutId,
  PRODUCT_SHORTCUT_EVENT,
  type ProductShortcutEventDetail,
} from "../../app/shortcutRegistry";
import { useAiAssistantLayout } from "../../features/ai-assistant/AiAssistantLayoutContext";
import { useAuthSessionGate } from "../../features/auth/AuthSessionGate";
import { useOptionalProductSession } from "../../features/auth/ProductSessionContext";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type { ResourceIssuesPort } from "../../features/issues/resourceIssuesContract";
import { selectResourceMetricIds } from "./resourceMetricSelection";
import type { ResourcesPageProps } from "./ResourcesPageContract";
import { useChangeTimelineDataFrame } from "./useChangeTimelineDataFrame";
import { usePhysicalTopologyDataFrame } from "./usePhysicalTopologyDataFrame";
import { usePhysicalTopologyRealtime } from "./usePhysicalTopologyRealtime";
import { useRelationTopologyDataFrame } from "./useRelationTopologyDataFrame";
import { useResourceCapabilitiesDataFrame } from "./useResourceCapabilitiesDataFrame";
import { useResourceDetailNavigation } from "./useResourceDetailNavigation";
import { useResourceIssuesDataFrame } from "./useResourceIssuesDataFrame";
import { useResourceMetricsHistoryDataFrame } from "./useResourceMetricsHistoryDataFrame";
import { useResourcesFilterDataFrame } from "./useResourcesFilterDataFrame";
import { useResourcesPageState } from "./useResourcesPageState";
import { useResourceTopologyViewController } from "./useResourceTopologyViewController";

const CONNECTION_PANEL_RESOURCE_TYPES = [
  "service",
  "endpoint",
  "endpoints",
  "endpointslice",
  "ingress",
  "configmap",
  "secret",
  "application",
  "applicationset",
  "appproject",
] as const;

export function useResourcesPageModel(props: ResourcesPageProps, manifestEditing: boolean) {
  const {
    changeTimelinePort,
    filterPort,
    physicalTopologyPort,
    physicalTopologyRealtimePort,
    port,
    refreshPolicies,
    relationTopologyPort,
    resourceCapabilitiesPort,
    resourceIssuesPort,
    resourceMetricsHistoryPort,
    timelinePort,
  } = props;
  const { reportUnauthorized } = useAuthSessionGate();
  const session = useOptionalProductSession();
  const filter = useUnifiedFilter();
  const aiLayout = useAiAssistantLayout();
  const state = useResourcesPageState(port, refreshPolicies, manifestEditing);
  const topology = useResourceTopologyViewController();
  const authorityKey = session
    ? `${session.workspaceId}:${session.userId}`
    : "anonymous";
  const physicalTopologyFrame = usePhysicalTopologyDataFrame({
    active: state.selectedClusterExists && filter.state.common.clusters.length === 1,
    filterState: filter.state,
    port: physicalTopologyPort,
    refreshPolicies,
    reportUnauthorized,
    revision: state.podRevision,
  });
  const relationTopology = useRelationTopologyDataFrame({
    active:
      state.selectedClusterExists &&
      filter.state.common.clusters.length === 1 &&
      topology.view === "relations" &&
      (filter.state.resources.types.length > 0 ||
        filter.state.resources.health.length > 0 ||
        filter.state.resources.query.trim().length > 0),
    filterState: filter.state,
    port: relationTopologyPort,
    reportUnauthorized,
    revision: state.revision,
  });
  const connectionTopologyFilterState = useMemo(() => ({
    ...filter.state,
    resources: {
      ...filter.state.resources,
      health: [],
      query: "",
      types: filter.state.common.applications.length > 0
        ? []
        : [...CONNECTION_PANEL_RESOURCE_TYPES],
    },
  }), [filter.state]);
  const connectionTopology = useRelationTopologyDataFrame({
    active:
      state.selectedClusterExists &&
      filter.state.common.clusters.length === 1 &&
      state.view === "map",
    filterState: connectionTopologyFilterState,
    port: relationTopologyPort,
    reportUnauthorized,
    revision: state.revision,
  });
  const timelineReadBounded = filter.state.resources.types.length > 0 ||
    filter.state.common.namespaces.length > 0 ||
    filter.state.common.applications.length > 0 ||
    filter.state.common.labels.length > 0 ||
    filter.state.resources.health.length > 0 ||
    filter.state.resources.query.trim().length > 0;
  const filtered = useResourcesFilterDataFrame({
    active: state.selectedClusterExists && !state.resourceTypeInvalid,
    authorityKey,
    facetAxis: null,
    facetQuery: "",
    filterState: filter.state,
    onListFailure: state.recordListFailure,
    onListSuccess: state.recordListSuccess,
    port: filterPort,
    reportUnauthorized,
    revision: state.revision,
  });
  const filteredPage = filtered.list.phase === "ready" ? filtered.list.data : null;
  const currentResourceRows = useMemo(
    () => (filteredPage?.items ?? []).map((item) => item.resource),
    [filteredPage],
  );
  const physicalRealtime = usePhysicalTopologyRealtime({
    active: state.selectedClusterExists && filter.state.common.clusters.length === 1,
    clusterId: state.selectedClusterId,
    frame: physicalTopologyFrame,
    port: physicalTopologyRealtimePort,
    replayAtMs: filter.detail.timeAt,
    rows: currentResourceRows,
    workspaceId: session?.workspaceId ?? null,
    onResourceDelta: state.requestResourceEventInvalidation,
  });
  const changeTimeline = useChangeTimelineDataFrame({
    active:
      state.selectedClusterExists &&
      filter.state.common.clusters.length === 1 &&
      timelineReadBounded,
    authorityKey,
    filterState: filter.state,
    onResourceInvalidation: state.requestResourceEventInvalidation,
    port: changeTimelinePort,
    range: filter.detail.timeRange ?? "1h",
    reportUnauthorized,
    revision: state.revision,
    timelinePort,
    workspaceId: session?.workspaceId ?? null,
  });
  const detailResource = state.detail.phase === "ready" ? state.detail.data.resource : null;
  const metricResourceIds = useMemo(
    () => selectResourceMetricIds(detailResource, currentResourceRows),
    [currentResourceRows, detailResource],
  );
  const metricHistory = useResourceMetricsHistoryDataFrame({
    active: metricResourceIds.length > 0 || detailResource !== null,
    authorityKey,
    filterState: filter.state,
    port: resourceMetricsHistoryPort,
    range: filter.detail.timeRange ?? "1h",
    refreshPolicies,
    reportUnauthorized,
    resourceIds: metricResourceIds,
    snapshotRevision: filteredPage?.snapshot.snapshotRevision ?? null,
    liveSeries: physicalRealtime.metricSeries,
    observedResource: detailResource,
    scopeSnapshot: filteredPage?.snapshot ?? null,
  });
  const detailResourceId = detailResource?.inventoryKey ?? null;
  const resourceCapabilities = useResourceCapabilitiesDataFrame({
    active: state.detailRequested && detailResourceId !== null,
    authorityKey,
    port: resourceCapabilitiesPort,
    reportUnauthorized,
    resourceId: detailResourceId,
  });
  const resourceIssues = useResourceIssuesDataFrame({
    active: resourceIssuesPort !== undefined && state.detailRequested && state.detailIdentity !== null,
    authorityKey,
    clusterId: state.detail.phase === "ready" ? state.detail.data.clusterId : state.selectedClusterId,
    identity: state.detailIdentity,
    port: resourceIssuesPort ?? INACTIVE_RESOURCE_ISSUES_PORT,
    reportUnauthorized,
    revision: state.revision,
  });
  const detailNavigationItems = useMemo(
    () => (filteredPage?.items ?? []).map((item) => item.resource),
    [filteredPage],
  );
  useResourceDetailNavigation({
    active: state.detailRequested,
    current: state.detailIdentity,
    items: detailNavigationItems,
    onNavigate: state.navigateDetail,
  });
  useResourcePageShortcuts(state);

  return {
    aiLayout,
    changeTimeline,
    connectionTopology,
    filter,
    filtered,
    metricHistory,
    physicalRealtime,
    physicalTopology: physicalRealtime.frame,
    relationTopology,
    reportUnauthorized,
    resourceCapabilities,
    resourceIssues,
    state,
    topology,
  };
}

function useResourcePageShortcuts(state: ReturnType<typeof useResourcesPageState>) {
  useEffect(() => {
    const handleShortcut = (event: Event) => {
      const detail = (event as CustomEvent<ProductShortcutEventDetail>).detail;
      if (!detail || !isProductContextShortcutId(detail.id)) return;
      if (detail.id === "resources:previous-kind") state.cycleResourceType(-1);
      if (detail.id === "resources:next-kind") state.cycleResourceType(1);
    };
    window.addEventListener(PRODUCT_SHORTCUT_EVENT, handleShortcut);
    return () => window.removeEventListener(PRODUCT_SHORTCUT_EVENT, handleShortcut);
  }, [state]);
}

const INACTIVE_RESOURCE_ISSUES_PORT: ResourceIssuesPort = {
  loadResourceIssues: () => Promise.reject(new Error("resource issue port is inactive")),
};

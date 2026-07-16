import { RefreshCw, Server, Waypoints } from "lucide-react";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

import { useAuthSessionGate } from "../../features/auth/AuthSessionGate";
import { useOptionalProductSession } from "../../features/auth/ProductSessionContext";
import { useClusterScope } from "../../features/cluster-scope/ClusterScopeProvider";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type { HomePort } from "../../features/home/homeContract";
import type { PhysicalTopologyPort } from "../../features/resources/physicalTopologyContract";
import {
  EMPTY_PHYSICAL_TOPOLOGY_REALTIME_PORT,
  type PhysicalTopologyRealtimePort,
} from "../../features/resources/physicalTopologyRealtimeContract";
import type { RelationTopologyPort } from "../../features/resources/relationTopologyContract";
import { useVisibleRefreshClock } from "../../shared/data/useVisibleRefreshClock";
import { useI18n } from "../../shared/i18n";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { Surface } from "../../shared/ui/Surface";
import { Button } from "../../shared/ui/primitives/button";
import { ButtonGroup } from "../../shared/ui/primitives/button-group";
import { ResourcesLiveStatus } from "../resources/ResourcesLiveStatus";
import { RelationTopologyCanvas } from "../resources/RelationTopologyCanvas";
import { ResourcesPhysicalTopologyScene } from "../resources/ResourcesPhysicalTopologyScene";
import type { PhysicalPodOpenTarget } from "../resources/physicalTopologyGraphTypes";
import { encodeResourceTarget } from "../resources/resourcesUrlState";
import { usePhysicalTopologyDataFrame } from "../resources/usePhysicalTopologyDataFrame";
import { usePhysicalTopologyRealtime } from "../resources/usePhysicalTopologyRealtime";
import { useRelationTopologyDataFrame } from "../resources/useRelationTopologyDataFrame";
import { useResourceTopologyViewController } from "../resources/useResourceTopologyViewController";

const PHYSICAL_TOPOLOGY_REFRESH_INTERVAL_MS = 5_000;

export function TopologyPage({
  nodePodsPort,
  physicalTopologyPort,
  physicalTopologyRealtimePort = EMPTY_PHYSICAL_TOPOLOGY_REALTIME_PORT,
  relationTopologyPort,
}: {
  nodePodsPort: Pick<HomePort, "loadNodePods">;
  physicalTopologyPort: PhysicalTopologyPort;
  physicalTopologyRealtimePort?: PhysicalTopologyRealtimePort;
  relationTopologyPort: RelationTopologyPort;
}) {
  const { t } = useI18n();
  const { reportUnauthorized } = useAuthSessionGate();
  const session = useOptionalProductSession();
  const clusterScope = useClusterScope();
  const filter = useUnifiedFilter();
  const navigate = useNavigate();
  const topology = useResourceTopologyViewController();
  const selected = clusterScope.selection.kind === "selected"
    ? clusterScope.selection
    : null;
  const {
    refresh: refreshPhysicalTopology,
    revision,
  } = useVisibleRefreshClock(
    selected !== null,
    PHYSICAL_TOPOLOGY_REFRESH_INTERVAL_MS,
  );
  const physicalFrame = usePhysicalTopologyDataFrame({
    active: selected !== null,
    filterState: filter.state,
    port: physicalTopologyPort,
    reportUnauthorized,
    revision,
  });
  const relationFrame = useRelationTopologyDataFrame({
    active: selected !== null && topology.view === "relations",
    filterState: filter.state,
    port: relationTopologyPort,
    reportUnauthorized,
    revision,
  });
  const physicalRealtime = usePhysicalTopologyRealtime({
    active: selected !== null,
    clusterId: selected?.cluster.id ?? null,
    frame: physicalFrame,
    port: physicalTopologyRealtimePort,
    replayAtMs: filter.detail.timeAt,
    workspaceId: session?.workspaceId ?? null,
  });
  const refresh = useCallback(() => {
    clusterScope.refresh();
    refreshPhysicalTopology();
  }, [clusterScope, refreshPhysicalTopology]);
  const openPod = useCallback((pod: PhysicalPodOpenTarget) => {
    if (selected === null) return;
    const target = encodeResourceTarget(selected.cluster.id, {
      kind: "Pod",
      name: pod.name,
      namespace: pod.namespace,
      resourceType: "pod",
    });
    navigate(filter.navigationHref("/resources", {
      ...filter.detail,
      detail: null,
      full: false,
      resource: target.resource,
      resourceKind: target.kind,
      tab: null,
    }));
  }, [filter, navigate, selected]);
  const revealServer = useCallback((serverId: string) => {
    navigate(filter.navigationHref("/resources", {
      ...filter.detail,
      detail: null,
      full: false,
      node: serverId,
      resource: null,
      resourceKind: null,
      tab: null,
    }));
  }, [filter, navigate]);
  const openRelationResource = useCallback((resourceId: string) => {
    if (selected === null || relationFrame.phase !== "ready") return false;
    const node = relationFrame.data.nodes.find((candidate) => candidate.id === resourceId);
    if (!node) return false;
    const target = encodeResourceTarget(selected.cluster.id, node.identity);
    navigate(filter.navigationHref("/resources", {
      ...filter.detail,
      detail: null,
      full: false,
      resource: target.resource,
      resourceKind: target.kind,
      tab: null,
    }));
    return true;
  }, [filter, navigate, relationFrame, selected]);

  if (clusterScope.selection.kind === "resolving") {
    return <ProductStateScreen kind="loading" placement="content" />;
  }
  if (clusterScope.selection.kind === "unavailable") {
    return <ProductStateScreen kind="error" issue={{ code: "unknown" }} placement="content" />;
  }
  if (selected === null) {
    return <ProductStateScreen kind="empty" placement="content" />;
  }

  return (
    <ProductPageFrame className="h-[calc(100svh-3.5rem)] grid-rows-[auto_minmax(0,1fr)]">
      <header className="flex min-w-0 flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight">
            <TopologyViewIcon view={topology.view} />
            <span className="ml-2">{t("shell.nav.topology")}</span>
          </h2>
        </div>
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
          <ResourcesLiveStatus state={physicalRealtime.live} />
          <ButtonGroup aria-label={t("shell.nav.topology")}>
            <Button
              aria-pressed={topology.view === "physical"}
              onClick={() => topology.pin("physical")}
              size="sm"
              type="button"
              variant={topology.view === "physical" ? "secondary" : "outline"}
            >
              <Server aria-hidden="true" />
              {t("resources.graph.view.physical")}
            </Button>
            <Button
              aria-pressed={topology.view === "relations"}
              onClick={() => topology.pin("relations")}
              size="sm"
              type="button"
              variant={topology.view === "relations" ? "secondary" : "outline"}
            >
              <Waypoints aria-hidden="true" />
              {t("resources.graph.view.relations")}
            </Button>
          </ButtonGroup>
          <Button onClick={refresh} size="sm" type="button" variant="outline">
            <RefreshCw aria-hidden="true" />
            {t("common.action.refresh")}
          </Button>
        </div>
      </header>

      <Surface
        aria-labelledby="topology-surface-title"
        className="min-h-0 min-w-0 overflow-hidden"
        data-product-surface="topology"
      >
        <h3 className="sr-only" id="topology-surface-title">{t("shell.nav.topology")}</h3>
        <div className="h-full min-h-[28rem]">
          {topology.view === "relations" ? (
            <RelationTopologyCanvas
              frame={relationFrame}
              onSelectResource={openRelationResource}
              selectedResourceId={null}
            />
          ) : (
            <ResourcesPhysicalTopologyScene
              clusterId={selected.cluster.id}
              frame={physicalRealtime.frame}
              nodePodsPort={nodePodsPort}
              onNodePodsUnauthorized={reportUnauthorized}
              onOpenPod={openPod}
              onRevealServer={revealServer}
              skeletonServerCount={selected.cluster.serverCount ?? selected.cluster.nodeCount ?? null}
            />
          )}
        </div>
      </Surface>
    </ProductPageFrame>
  );
}

function TopologyViewIcon({ view }: { view: "physical" | "relations" }) {
  return view === "physical"
    ? <Server aria-hidden="true" className="inline size-5" />
    : <Waypoints aria-hidden="true" className="inline size-5" />;
}

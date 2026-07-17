import { Waypoints } from "lucide-react";
import { useMemo } from "react";

import type { HomePort } from "../../features/home/homeContract";
import { FirstAppearanceMotionBoundary } from "../../motion/useFirstAppearanceMotion";
import { useI18n } from "../../shared/i18n";
import { Skeleton } from "../../shared/ui/primitives/skeleton";
import { PodPlacementLegend } from "./PodPlacementLegend";
import { PhysicalTopologyServerCard } from "./PhysicalTopologyServerNode";
import { physicalServerPlacements } from "./physicalTopologyViewModel";
import type { PhysicalTopologyFrame } from "./usePhysicalTopologyDataFrame";
import { UsageSmoothingBoundary } from "./useSmoothedUsageColor";
import type { PhysicalPodOpenTarget } from "./physicalTopologyGraphTypes";

export function ResourcesPhysicalTopologyScene({
  clusterId,
  frame,
  nodePodsPort,
  onOpenPod,
  onNodePodsUnauthorized,
  onRevealServer,
  skeletonServerCount,
}: {
  clusterId: string;
  frame: PhysicalTopologyFrame;
  nodePodsPort: Pick<HomePort, "loadNodePods">;
  onOpenPod: (pod: PhysicalPodOpenTarget) => void;
  onNodePodsUnauthorized: () => void;
  onRevealServer: (serverId: string) => void;
  skeletonServerCount: number | null;
}) {
  const topology = frame.phase === "ready" ? frame.data : null;
  const placements = useMemo(
    () => topology === null ? [] : physicalServerPlacements(topology),
    [topology],
  );
  const usageMarkCount = useMemo(
    () => placements.reduce((count, placement) => count + placement.pods.length + 2, 0),
    [placements],
  );
  return (
    <FirstAppearanceMotionBoundary scope={clusterId}>
      {frame.phase === "loading" ? (
        <ServerSkeletons clusterId={clusterId} count={skeletonServerCount} />
      ) : frame.phase === "ready" && placements.length > 0 ? (
        <UsageSmoothingBoundary markCount={usageMarkCount}>
          <div className="grid max-h-[min(65vh,65rem)] min-h-0 grid-rows-[auto_1fr] overflow-hidden">
            <PhysicalTopologyLegend />
            <div
              className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] content-start gap-4 overflow-y-auto overflow-x-hidden p-4 pt-3 sm:p-5 sm:pt-3"
              data-slot="physical-topology-grid"
            >
              {placements.map((placement, index) => (
                <PhysicalTopologyServerCard
                  data={{
                    clusterId,
                    index,
                    nodePodsPort,
                    onNodePodsUnauthorized,
                    placement,
                    onOpenPod,
                    onRevealServer,
                  }}
                  key={placement.server.id}
                />
              ))}
            </div>
          </div>
        </UsageSmoothingBoundary>
      ) : (
        <GraphUnavailable failed={frame.phase === "failed"} />
      )}
    </FirstAppearanceMotionBoundary>
  );
}

function PhysicalTopologyLegend() {
  return (
    <PodPlacementLegend
      className="border-b bg-muted/20 px-4 py-2 sm:px-5"
      dataSlot="physical-topology-legend"
    />
  );
}

function ServerSkeletons({ clusterId, count }: { clusterId: string; count: number | null }) {
  const { t } = useI18n();
  const visible = Math.max(1, Math.min(count ?? 3, 8));
  return (
    <div
      aria-label={t("resources.graph.loading")}
      className="grid max-h-[min(65vh,65rem)] grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] content-start gap-4 overflow-hidden p-4 sm:p-5"
      role="status"
    >
      {Array.from({ length: visible }, (_, index) => (
        <div
          aria-hidden="true"
          className="h-52 w-full rounded-xl border bg-card/85 p-3"
          data-morph-id={`server:${clusterId}:${index}`}
          data-slot="physical-server-skeleton"
          key={index}
        >
          <Skeleton className="h-8" />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Skeleton className="h-7" />
            <Skeleton className="h-7" />
          </div>
          <div className="mt-3 grid grid-cols-6 gap-1.5">
            {Array.from({ length: 12 }, (_, podIndex) => (
              <Skeleton className="size-9" key={podIndex} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function GraphUnavailable({ failed }: { failed: boolean }) {
  const { t } = useI18n();
  return (
    <div className="grid min-h-60 place-items-center px-6 py-10 text-center">
      <div className="grid max-w-lg justify-items-center gap-2">
        <div className="grid size-12 place-items-center rounded-xl border border-dashed bg-background/70 shadow-sm">
          <Waypoints aria-hidden="true" className="size-6 text-muted-foreground" />
        </div>
        <p className="font-medium">
          {t(failed ? "resources.graph.failed.title" : "resources.graph.empty.title")}
        </p>
        <p className="text-xs text-muted-foreground">
          {t(failed
            ? "resources.graph.failed.description"
            : "resources.graph.empty.description")}
        </p>
      </div>
    </div>
  );
}

import { Waypoints } from "lucide-react";
import { useMemo } from "react";

import type { PhysicalTopologyPod } from "../../features/resources/physicalTopologyContract";
import { FirstAppearanceMotionBoundary } from "../../motion/useFirstAppearanceMotion";
import { useI18n } from "../../shared/i18n";
import { PhysicalTopologyServerCard } from "./PhysicalTopologyServerNode";
import { physicalServerPlacements } from "./physicalTopologyViewModel";
import type { PhysicalTopologyFrame } from "./usePhysicalTopologyDataFrame";
import { UsageSmoothingBoundary } from "./useSmoothedUsageColor";

export function ResourcesPhysicalTopologyScene({
  clusterId,
  frame,
  onOpenPod,
  onRevealServer,
  skeletonServerCount,
}: {
  clusterId: string;
  frame: PhysicalTopologyFrame;
  onOpenPod: (pod: PhysicalTopologyPod) => void;
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
          <div
            className="grid max-h-[min(65vh,65rem)] grid-cols-[repeat(auto-fit,minmax(320px,1fr))] content-start gap-4 overflow-auto p-4 sm:p-5"
            data-slot="physical-topology-grid"
          >
            {placements.map((placement, index) => (
              <PhysicalTopologyServerCard
                data={{ clusterId, index, placement, onOpenPod, onRevealServer }}
                key={placement.server.id}
              />
            ))}
          </div>
        </UsageSmoothingBoundary>
      ) : (
        <GraphUnavailable failed={frame.phase === "failed"} />
      )}
    </FirstAppearanceMotionBoundary>
  );
}

function ServerSkeletons({ clusterId, count }: { clusterId: string; count: number | null }) {
  const { t } = useI18n();
  const visible = Math.max(1, Math.min(count ?? 3, 8));
  return (
    <div
      aria-label={t("resources.graph.loading")}
      className="grid max-h-[min(65vh,65rem)] grid-cols-[repeat(auto-fit,minmax(320px,1fr))] content-start gap-4 overflow-hidden p-4 sm:p-5"
      role="status"
    >
      {Array.from({ length: visible }, (_, index) => (
        <div
          aria-hidden="true"
          className="h-52 w-full animate-pulse rounded-xl border bg-card/85 p-3 motion-reduce:animate-none"
          data-morph-id={`server:${clusterId}:${index}`}
          data-slot="physical-server-skeleton"
          key={index}
        >
          <div className="h-8 rounded-md bg-muted" />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="h-7 rounded bg-muted" />
            <div className="h-7 rounded bg-muted" />
          </div>
          <div className="mt-3 grid grid-cols-6 gap-1.5">
            {Array.from({ length: 12 }, (_, podIndex) => (
              <div className="size-9 rounded bg-muted" key={podIndex} />
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

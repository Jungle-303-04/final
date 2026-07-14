import { Background, ReactFlow, type NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Waypoints } from "lucide-react";
import { useMemo } from "react";

import type { PhysicalTopologyPod } from "../../features/resources/physicalTopologyContract";
import { useI18n } from "../../shared/i18n";
import {
  PhysicalTopologyServerCard,
  PhysicalTopologyServerNode,
} from "./PhysicalTopologyServerNode";
import type { PhysicalServerNode } from "./physicalTopologyGraphTypes";
import {
  PHYSICAL_SERVER_HEIGHT,
  PHYSICAL_SERVER_WIDTH,
  physicalServerPlacements,
} from "./physicalTopologyViewModel";
import type { PhysicalTopologyFrame } from "./usePhysicalTopologyDataFrame";
import { usePhysicalTopologyLayout } from "./usePhysicalTopologyLayout";

const nodeTypes: NodeTypes = { "physical-server": PhysicalTopologyServerNode };

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
  const inputNodes = useMemo<PhysicalServerNode[]>(() => placements.map(
    (placement, index) => ({
      id: placement.server.id,
      type: "physical-server",
      position: { x: index * (PHYSICAL_SERVER_WIDTH + 24), y: 0 },
      width: PHYSICAL_SERVER_WIDTH,
      height: PHYSICAL_SERVER_HEIGHT,
      data: { clusterId, index, placement, onOpenPod, onRevealServer },
    }),
  ), [clusterId, onOpenPod, onRevealServer, placements]);
  const nodes = usePhysicalTopologyLayout(inputNodes);

  if (frame.phase === "loading") {
    return <ServerSkeletons clusterId={clusterId} count={skeletonServerCount} />;
  }
  if (frame.phase === "ready" && nodes.length > 0 &&
      typeof ResizeObserver !== "undefined") {
    return (
      <ReactFlow
        colorMode="system"
        fitView
        fitViewOptions={{ padding: 0.1, maxZoom: 1 }}
        maxZoom={1.25}
        minZoom={0.35}
        nodeTypes={nodeTypes}
        nodes={nodes}
        nodesConnectable={false}
        nodesDraggable={false}
        panOnScroll={false}
        proOptions={{ hideAttribution: true }}
        zoomOnDoubleClick={false}
        zoomOnScroll
      >
        <Background color="var(--border)" gap={22} size={1} />
      </ReactFlow>
    );
  }
  if (frame.phase === "ready" && nodes.length > 0) {
    return (
      <div className="flex h-full items-center gap-4 overflow-x-auto px-5 pb-12 pt-3">
        {nodes.map((node) => (
          <PhysicalTopologyServerCard data={node.data} key={node.id} />
        ))}
      </div>
    );
  }
  return <GraphUnavailable failed={frame.phase === "failed"} />;
}

function ServerSkeletons({ clusterId, count }: { clusterId: string; count: number | null }) {
  const { t } = useI18n();
  const visible = Math.max(1, Math.min(count ?? 3, 8));
  return (
    <div aria-label={t("resources.graph.loading")} className="flex h-full items-center gap-4 overflow-hidden px-5 pb-12 pt-3" role="status">
      {Array.from({ length: visible }, (_, index) => (
        <div
          aria-hidden="true"
          className="motion-node-land h-48 w-64 shrink-0 animate-pulse rounded-xl border bg-card/85 p-3 motion-reduce:animate-none"
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
              <div className="size-8 rounded bg-muted" key={podIndex} />
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
    <div className="grid h-full place-items-center px-6 pb-10 text-center">
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

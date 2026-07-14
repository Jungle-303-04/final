import {
  Background,
  ReactFlow,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Pause, Play, Server, Waypoints } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import type { PhysicalTopologyPod } from "../../features/resources/physicalTopologyContract";
import { useCameraMorph } from "../../motion/useCameraMorph";
import { useI18n } from "../../shared/i18n";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
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

export interface PhysicalGraphBreadcrumb {
  id: string;
  label: string;
  onSelect: () => void;
}

export function ResourcesGraphShell({
  breadcrumbs,
  clusterId,
  frame,
  onOpenPod,
  onSelectAll,
  onRevealServer,
  skeletonServerCount,
}: {
  breadcrumbs: PhysicalGraphBreadcrumb[];
  clusterId: string;
  frame: PhysicalTopologyFrame;
  onOpenPod: (pod: PhysicalTopologyPod) => void;
  onSelectAll: () => void;
  onRevealServer: (serverId: string) => void;
  skeletonServerCount: number | null;
}) {
  const { formatNumber, t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const { capture, play } = useCameraMorph(rootRef);
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
      data: {
        clusterId,
        index,
        placement,
        onOpenPod,
        onRevealServer,
      },
    }),
  ), [clusterId, onOpenPod, onRevealServer, placements]);
  const nodes = usePhysicalTopologyLayout(inputNodes);

  useEffect(() => {
    if (frame.phase === "loading") {
      const animationFrame = requestAnimationFrame(() => {
        play();
        capture();
      });
      return () => cancelAnimationFrame(animationFrame);
    }
    if (frame.phase !== "ready") return undefined;
    const animationFrame = requestAnimationFrame(() => play());
    return () => cancelAnimationFrame(animationFrame);
  }, [capture, frame.phase, play]);

  return (
    <div
      aria-busy={frame.phase === "loading"}
      aria-live="polite"
      className="group/resources-graph relative isolate h-80 overflow-hidden bg-linear-to-b from-muted/20 via-card to-muted/40"
      data-phase={frame.phase}
      data-slot="resources-graph-shell"
      ref={rootRef}
    >
      <div className="absolute inset-x-0 top-0 z-20 flex min-w-0 flex-wrap items-center justify-between gap-2 border-b bg-background/80 px-3 py-2 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant="secondary">
            <Server aria-hidden="true" />
            <span id="resources-graph-title">{t("resources.graph.physical.title")}</span>
          </Badge>
          {frame.phase === "ready" ? (
            <Badge variant="outline">
              {t("resources.graph.server.total", {
                count: formatNumber(frame.data.servers.length),
              })}
            </Badge>
          ) : null}
        </div>
        <PhysicalBreadcrumb items={breadcrumbs} onSelectAll={onSelectAll} />
      </div>

      <div className="absolute inset-x-0 bottom-0 top-11" data-slot="topology-canvas">
        {frame.phase === "loading" ? (
          <ServerSkeletons clusterId={clusterId} count={skeletonServerCount} />
        ) : frame.phase === "ready" && nodes.length > 0 &&
          typeof ResizeObserver !== "undefined" ? (
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
        ) : frame.phase === "ready" && nodes.length > 0 ? (
          <div className="flex h-full items-center gap-4 overflow-x-auto px-5 pb-12 pt-3">
            {nodes.map((node) => (
              <PhysicalTopologyServerCard data={node.data} key={node.id} />
            ))}
          </div>
        ) : (
          <GraphUnavailable failed={frame.phase === "failed"} />
        )}
      </div>

      <UnavailableTimeline />
    </div>
  );
}

function PhysicalBreadcrumb({
  items,
  onSelectAll,
}: {
  items: PhysicalGraphBreadcrumb[];
  onSelectAll: () => void;
}) {
  const { t } = useI18n();
  return (
    <nav aria-label={t("resources.graph.breadcrumb.aria")} className="flex min-w-0 items-center gap-1 overflow-hidden text-xs text-muted-foreground">
      <button
        className="rounded-sm px-1 py-0.5 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onSelectAll}
        type="button"
      >
        {t("resources.graph.breadcrumb.all")}
      </button>
      {items.map((item) => (
        <span className="flex min-w-0 items-center gap-1" key={item.id}>
          <span aria-hidden="true">›</span>
          <button
            className="max-w-36 truncate rounded-sm px-1 py-0.5 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={item.onSelect}
            title={item.label}
            type="button"
          >
            {item.label}
          </button>
        </span>
      ))}
    </nav>
  );
}

function ServerSkeletons({ clusterId, count }: { clusterId: string; count: number | null }) {
  const { t } = useI18n();
  const visible = Math.max(1, Math.min(count ?? 3, 8));
  return (
    <div
      aria-label={t("resources.graph.loading")}
      className="flex h-full items-center gap-4 overflow-hidden px-5 pb-12 pt-3"
      role="status"
    >
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
          {failed
            ? t("resources.graph.failed.title")
            : t("resources.graph.empty.title")}
        </p>
        <p className="text-xs text-muted-foreground">
          {failed
            ? t("resources.graph.failed.description")
            : t("resources.graph.empty.description")}
        </p>
      </div>
    </div>
  );
}

function UnavailableTimeline() {
  const { t } = useI18n();
  return (
    <div
      aria-describedby="resources-timeline-unavailable"
      className="absolute inset-x-3 bottom-3 z-20 flex translate-y-1.5 items-center gap-3 rounded-xl border bg-background/95 px-3 py-2 opacity-100 shadow-lg backdrop-blur transition-[opacity,transform] duration-200 motion-reduce:translate-y-0 motion-reduce:transition-opacity sm:opacity-0 sm:group-focus-within/resources-graph:translate-y-0 sm:group-focus-within/resources-graph:opacity-100 sm:group-hover/resources-graph:translate-y-0 sm:group-hover/resources-graph:opacity-100"
      data-slot="resources-time-scrubber"
      data-state="unavailable"
    >
      <Button aria-label={t("resources.timeline.play")} disabled size="icon-sm" type="button" variant="ghost">
        <Play aria-hidden="true" />
        <Pause aria-hidden="true" className="hidden" />
      </Button>
      <input
        aria-label={t("resources.timeline.aria")}
        className="h-2 min-w-0 flex-1 cursor-not-allowed accent-primary opacity-45"
        disabled
        max={100}
        min={0}
        readOnly
        type="range"
        value={100}
      />
      <span className="sr-only" id="resources-timeline-unavailable">
        {t("resources.timeline.unavailable")}
      </span>
    </div>
  );
}

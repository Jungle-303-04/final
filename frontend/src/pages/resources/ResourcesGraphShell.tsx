import { useEffect, useRef, useState } from "react";

import type { ResourceTopologyView } from "../../features/filters/resourceTopologyView";
import type { HomePort } from "../../features/home/homeContract";
import type { TimelineRange } from "../../features/filters/filterContract";
import { useCameraMorph } from "../../motion/useCameraMorph";
import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import { TopologyOverlayBar } from "../../shared/ui/TopologyOverlayBar";
import { cn } from "../../shared/lib/cn";
import type { PhysicalTopologyFrame } from "./usePhysicalTopologyDataFrame";
import type { RelationTopologyFrame } from "./useRelationTopologyDataFrame";
import { RelationTopologyCanvas } from "./RelationTopologyCanvas";
import { TimelineStrip, type PhysicalGraphBreadcrumbItem } from "./ResourcesGraphChrome";
import { ResourcesGraphHeader, ResourcesGraphResizeHandle } from "./ResourcesGraphControls";
import { ResourcesPhysicalTopologyScene } from "./ResourcesPhysicalTopologyScene";
import type { ChangeTimelineFrame } from "./useChangeTimelineDataFrame";
import { useResizableGraphHeight } from "./useResizableGraphHeight";
import type { PhysicalPodOpenTarget } from "./physicalTopologyGraphTypes";

export type PhysicalGraphBreadcrumb = PhysicalGraphBreadcrumbItem;

export function ResourcesGraphShell({
  breadcrumbs,
  clusterId,
  frame,
  includeDeleted,
  relationFrame,
  onSelectRelationResource,
  selectedRelationResourceId,
  onOpenPod,
  nodePodsPort,
  onNodePodsUnauthorized,
  onSelectAll,
  onRevealServer,
  skeletonServerCount,
  topologyPinned,
  topologyView,
  onTopologyViewChange,
  timelineAtMs,
  timelineFrame,
  timelineRange,
  timelineReplayStatus,
  timelineReplayWindow,
  onTimelineAtChange,
  onTimelineRangeChange,
  collapsed,
  onCollapsedChange,
  onIncludeDeletedChange,
}: {
  breadcrumbs: PhysicalGraphBreadcrumb[];
  clusterId: string;
  frame: PhysicalTopologyFrame;
  includeDeleted: boolean;
  relationFrame: RelationTopologyFrame;
  onSelectRelationResource: (resourceId: string) => boolean;
  selectedRelationResourceId: string | null;
  onOpenPod: (pod: PhysicalPodOpenTarget) => void;
  nodePodsPort: Pick<HomePort, "loadNodePods">;
  onNodePodsUnauthorized: () => void;
  onSelectAll: () => void;
  onRevealServer: (serverId: string) => void;
  skeletonServerCount: number | null;
  topologyPinned: boolean;
  topologyView: ResourceTopologyView;
  onTopologyViewChange: (view: ResourceTopologyView) => void;
  timelineAtMs: number | undefined;
  timelineFrame: ChangeTimelineFrame;
  timelineRange: TimelineRange;
  timelineReplayStatus: "live" | "ready" | "gap";
  timelineReplayWindow: { fromMs: number | null; toMs: number | null };
  onTimelineAtChange: (value: number | undefined) => void;
  onTimelineRangeChange: (value: TimelineRange) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onIncludeDeletedChange: (value: boolean) => void;
}) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const { capture, play } = useCameraMorph(rootRef);
  const displayedView = topologyView;
  const [autoHintVisible, setAutoHintVisible] = useState(false);
  const hintedRelationRevision = useRef<string | null>(null);
  const { beginResize, height, reset, resizeBy } = useResizableGraphHeight();
  useEffect(() => {
    if (
      topologyView !== "relations" ||
      topologyPinned ||
      relationFrame.phase !== "ready" ||
      hintedRelationRevision.current === relationFrame.data.graphRevision
    ) return;
    hintedRelationRevision.current = relationFrame.data.graphRevision;
    setAutoHintVisible(true);
  }, [relationFrame, topologyPinned, topologyView]);
  useEffect(() => {
    if (!autoHintVisible) return undefined;
    const timeout = window.setTimeout(() => setAutoHintVisible(false), 6_000);
    return () => window.clearTimeout(timeout);
  }, [autoHintVisible]);

  useEffect(() => {
    const animationFrame = requestAnimationFrame(() => play());
    return () => cancelAnimationFrame(animationFrame);
  }, [displayedView, play]);

  useEffect(() => {
    rootRef.current?.style.setProperty("--product-graph-user-height", `${height}px`);
  }, [height]);

  useEffect(() => {
    if (displayedView === "physical" && frame.phase === "loading") {
      const animationFrame = requestAnimationFrame(() => {
        play();
        capture();
      });
      return () => cancelAnimationFrame(animationFrame);
    }
    if (frame.phase !== "ready") return undefined;
    const animationFrame = requestAnimationFrame(() => play());
    return () => cancelAnimationFrame(animationFrame);
  }, [capture, displayedView, frame.phase, play]);

  const displayedFrame = displayedView === "relations"
    ? relationFrame
    : frame;
  const changeTopologyView = (view: ResourceTopologyView) => {
    capture();
    setAutoHintVisible(false);
    onTopologyViewChange(view);
  };
  return (
    <div
      aria-busy={displayedFrame.phase === "loading"}
      aria-live="polite"
      className={cn(
        "group/resources-graph relative isolate flex overflow-hidden bg-linear-to-b from-muted/20 via-card to-muted/40",
        collapsed
          ? "h-auto flex-row"
          : displayedView === "relations"
            ? "h-(--product-graph-height-mobile) flex-col sm:h-(--product-graph-user-height)"
            : "h-auto flex-col",
      )}
      data-collapsed={collapsed ? "true" : "false"}
      data-height={!collapsed && displayedView === "relations" ? height : undefined}
      data-phase={displayedFrame.phase}
      data-slot="resources-graph-shell"
      data-view={displayedView}
      ref={rootRef}
    >
      <ResourcesGraphHeader
        breadcrumbs={breadcrumbs}
        collapsed={collapsed}
        displayedView={displayedView}
        includeDeleted={includeDeleted}
        onCollapsedChange={onCollapsedChange}
        onIncludeDeletedChange={onIncludeDeletedChange}
        onSelectAll={onSelectAll}
        onTimelineRangeChange={onTimelineRangeChange}
        onTopologyViewChange={changeTopologyView}
        physicalFrame={frame}
        relationFrame={relationFrame}
        timelineRange={timelineRange}
        topologyView={topologyView}
      />

      {!collapsed ? (
        <>
          <div
            className={cn(
              "relative min-h-0",
              displayedView === "relations" ? "flex-1" : "shrink-0",
            )}
            data-slot="topology-canvas"
          >
            {displayedView === "relations" ? (
              <RelationTopologyCanvas
                frame={relationFrame}
                onSelectResource={onSelectRelationResource}
                selectedResourceId={selectedRelationResourceId}
              />
            ) : (
              <ResourcesPhysicalTopologyScene
                clusterId={clusterId}
                frame={frame}
                nodePodsPort={nodePodsPort}
                onOpenPod={onOpenPod}
                onNodePodsUnauthorized={onNodePodsUnauthorized}
                onRevealServer={onRevealServer}
                skeletonServerCount={skeletonServerCount}
              />
            )}
            {autoHintVisible ? (
              <TopologyOverlayBar className="items-end">
                <div
                  className="motion-topology-overlay flex max-w-sm items-center gap-2 rounded-lg border bg-background/90 px-3 py-2 text-xs shadow-sm backdrop-blur"
                  data-slot="resources-graph-auto-hint"
                  role="status"
                >
                  <span>{t("resources.graph.autoHint")}</span>
                  <Button
                    className="pointer-events-auto"
                    onClick={() => {
                      setAutoHintVisible(false);
                      changeTopologyView("physical");
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {t("resources.graph.autoHint.revert")}
                  </Button>
                </div>
              </TopologyOverlayBar>
            ) : null}
          </div>

          <TimelineStrip
            atMs={timelineAtMs}
            frame={timelineFrame}
            onAtChange={onTimelineAtChange}
            replayStatus={timelineReplayStatus}
            replayWindow={timelineReplayWindow}
          />
          {displayedView === "relations" ? (
            <ResourcesGraphResizeHandle
              height={height}
              onReset={reset}
              onResizeBy={resizeBy}
              onResizeStart={beginResize}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";

import type { ResourceTopologyView } from "../../features/filters/resourceTopologyView";
import type { TimelineRange } from "../../features/filters/filterContract";
import type { PhysicalTopologyPod } from "../../features/resources/physicalTopologyContract";
import { useCameraMorph } from "../../motion/useCameraMorph";
import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import { cn } from "../../shared/lib/cn";
import type { PhysicalTopologyFrame } from "./usePhysicalTopologyDataFrame";
import type { RelationTopologyFrame } from "./useRelationTopologyDataFrame";
import { RelationTopologyCanvas } from "./RelationTopologyCanvas";
import { TimelineStrip, type PhysicalGraphBreadcrumbItem } from "./ResourcesGraphChrome";
import { ResourcesGraphHeader, ResourcesGraphResizeHandle } from "./ResourcesGraphControls";
import { ResourcesPhysicalTopologyScene } from "./ResourcesPhysicalTopologyScene";
import type { ChangeTimelineFrame } from "./useChangeTimelineDataFrame";
import { useResizableGraphHeight } from "./useResizableGraphHeight";

export type PhysicalGraphBreadcrumb = PhysicalGraphBreadcrumbItem;

export function ResourcesGraphShell({
  breadcrumbs,
  clusterId,
  frame,
  relationFrame,
  onOpenPod,
  onSelectAll,
  onRevealServer,
  skeletonServerCount,
  topologyPinned,
  topologyView,
  onTopologyViewChange,
  timelineAtMs,
  timelineFrame,
  timelineRange,
  onTimelineAtChange,
  onTimelineRangeChange,
  collapsed,
  onCollapsedChange,
}: {
  breadcrumbs: PhysicalGraphBreadcrumb[];
  clusterId: string;
  frame: PhysicalTopologyFrame;
  relationFrame: RelationTopologyFrame;
  onOpenPod: (pod: PhysicalTopologyPod) => void;
  onSelectAll: () => void;
  onRevealServer: (serverId: string) => void;
  skeletonServerCount: number | null;
  topologyPinned: boolean;
  topologyView: ResourceTopologyView;
  onTopologyViewChange: (view: ResourceTopologyView) => void;
  timelineAtMs: number | undefined;
  timelineFrame: ChangeTimelineFrame;
  timelineRange: TimelineRange;
  onTimelineAtChange: (value: number | undefined) => void;
  onTimelineRangeChange: (value: TimelineRange) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const { capture, play } = useCameraMorph(rootRef);
  const [displayedView, setDisplayedView] = useState<ResourceTopologyView>("physical");
  const [autoHintVisible, setAutoHintVisible] = useState(false);
  const { beginResize, height, reset, resizeBy } = useResizableGraphHeight();
  const [retainedPhysical, setRetainedPhysical] = useState<
    Extract<PhysicalTopologyFrame, { phase: "ready" }> | null
  >(
    frame.phase === "ready" ? frame : null,
  );
  const [retainedRelation, setRetainedRelation] = useState<{
    clusterId: string;
    frame: Extract<RelationTopologyFrame, { phase: "ready" }>;
  } | null>(relationFrame.phase === "ready" ? { clusterId, frame: relationFrame } : null);

  useEffect(() => {
    if (frame.phase !== "ready" && relationFrame.phase !== "ready") return undefined;
    const animationFrame = requestAnimationFrame(() => {
      if (frame.phase === "ready") setRetainedPhysical(frame);
      if (relationFrame.phase === "ready") {
        setRetainedRelation({ clusterId, frame: relationFrame });
      }
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [clusterId, frame, relationFrame]);

  const physicalSceneFrame = displayedView === "physical" &&
      topologyView !== displayedView &&
      frame.phase !== "ready" &&
      retainedPhysical?.data.clusterId === clusterId
    ? retainedPhysical
    : frame;
  const relationSceneFrame = displayedView === "relations" &&
      topologyView !== displayedView &&
      relationFrame.phase !== "ready" &&
      retainedRelation?.clusterId === clusterId
    ? retainedRelation.frame
    : relationFrame;
  useEffect(() => {
    if (topologyView === displayedView) return;
    const targetPhase = topologyView === "relations" ? relationFrame.phase : frame.phase;
    if (targetPhase !== "ready" && targetPhase !== "failed") return;
    capture();
    const animationFrame = requestAnimationFrame(() => {
      setDisplayedView(topologyView);
      setAutoHintVisible(
        targetPhase === "ready" && topologyView === "relations" && !topologyPinned,
      );
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [capture, displayedView, frame.phase, relationFrame.phase, topologyPinned, topologyView]);

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
    ? relationSceneFrame
    : physicalSceneFrame;
  const changeTopologyView = (view: ResourceTopologyView) => {
    setAutoHintVisible(false);
    onTopologyViewChange(view);
  };
  return (
    <div
      aria-busy={topologyView !== displayedView || displayedFrame.phase === "loading"}
      aria-live="polite"
      className={cn(
        "group/resources-graph relative isolate flex overflow-hidden bg-linear-to-b from-muted/20 via-card to-muted/40",
        collapsed
          ? "h-auto flex-row"
          : "h-(--product-graph-height-mobile) flex-col sm:h-(--product-graph-user-height)",
      )}
      data-collapsed={collapsed ? "true" : "false"}
      data-height={collapsed ? undefined : height}
      data-phase={displayedFrame.phase}
      data-slot="resources-graph-shell"
      data-view={displayedView}
      ref={rootRef}
    >
      <ResourcesGraphHeader
        breadcrumbs={breadcrumbs}
        collapsed={collapsed}
        displayedView={displayedView}
        onCollapsedChange={onCollapsedChange}
        onSelectAll={onSelectAll}
        onTimelineRangeChange={onTimelineRangeChange}
        onTopologyViewChange={changeTopologyView}
        physicalFrame={physicalSceneFrame}
        relationFrame={relationSceneFrame}
        timelineRange={timelineRange}
        topologyView={topologyView}
      />

      {!collapsed ? (
        <>
          <div className="relative min-h-0 flex-1" data-slot="topology-canvas">
            {displayedView === "relations" ? (
              <RelationTopologyCanvas frame={relationSceneFrame} />
            ) : (
              <ResourcesPhysicalTopologyScene
                clusterId={clusterId}
                frame={physicalSceneFrame}
                onOpenPod={onOpenPod}
                onRevealServer={onRevealServer}
                skeletonServerCount={skeletonServerCount}
              />
            )}
            {autoHintVisible ? (
              <div
                className="pointer-events-none absolute right-3 top-3 z-30 flex max-w-sm items-center gap-2 rounded-lg border bg-background/40 px-3 py-2 text-xs shadow-sm backdrop-blur"
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
            ) : null}
          </div>

          <TimelineStrip atMs={timelineAtMs} frame={timelineFrame} onAtChange={onTimelineAtChange} />
          <ResourcesGraphResizeHandle
            height={height}
            onReset={reset}
            onResizeBy={resizeBy}
            onResizeStart={beginResize}
          />
        </>
      ) : null}
    </div>
  );
}

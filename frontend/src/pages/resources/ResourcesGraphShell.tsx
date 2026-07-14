import { Server, Waypoints } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { ResourceTopologyView } from "../../features/filters/resourceTopologyView";
import type { PhysicalTopologyPod } from "../../features/resources/physicalTopologyContract";
import { useCameraMorph } from "../../motion/useCameraMorph";
import { useI18n } from "../../shared/i18n";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { ButtonGroup } from "../../shared/ui/primitives/button-group";
import type { PhysicalTopologyFrame } from "./usePhysicalTopologyDataFrame";
import type { RelationTopologyFrame } from "./useRelationTopologyDataFrame";
import { RelationTopologyCanvas } from "./RelationTopologyCanvas";
import {
  PhysicalGraphBreadcrumb,
  type PhysicalGraphBreadcrumbItem,
  UnavailableTimeline,
} from "./ResourcesGraphChrome";
import { ResourcesPhysicalTopologyScene } from "./ResourcesPhysicalTopologyScene";

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
}) {
  const { formatNumber, t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const { capture, play } = useCameraMorph(rootRef);
  const [displayedView, setDisplayedView] = useState<ResourceTopologyView>("physical");
  const [autoHintVisible, setAutoHintVisible] = useState(false);
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
      className="group/resources-graph relative isolate h-96 overflow-hidden bg-linear-to-b from-muted/20 via-card to-muted/40 sm:h-80"
      data-phase={displayedFrame.phase}
      data-slot="resources-graph-shell"
      data-view={displayedView}
      ref={rootRef}
    >
      <div className="absolute inset-x-0 top-0 z-20 flex min-w-0 flex-wrap items-center justify-between gap-2 border-b bg-background/80 px-3 py-2 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant="secondary">
            {displayedView === "physical" ? <Server aria-hidden="true" /> : <Waypoints aria-hidden="true" />}
            <span id="resources-graph-title">
              {t(displayedView === "physical"
                ? "resources.graph.physical.title"
                : "resources.graph.relations.title")}
            </span>
          </Badge>
          {displayedView === "physical" && physicalSceneFrame.phase === "ready" ? (
            <Badge variant="outline">
              {t("resources.graph.server.total", {
                count: formatNumber(physicalSceneFrame.data.servers.length),
              })}
            </Badge>
          ) : displayedView === "relations" && relationSceneFrame.phase === "ready" ? (
            <Badge variant="outline">
              {t("resources.graph.relations.total", {
                count: formatNumber(relationSceneFrame.data.nodes.length),
              })}
            </Badge>
          ) : null}
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <ButtonGroup aria-label={t("resources.graph.view.aria")}>
            <Button
              aria-pressed={topologyView === "physical"}
              onClick={() => changeTopologyView("physical")}
              size="sm"
              type="button"
              variant={topologyView === "physical" ? "secondary" : "outline"}
            >
              {t("resources.graph.view.physical")}
            </Button>
            <Button
              aria-pressed={topologyView === "relations"}
              onClick={() => changeTopologyView("relations")}
              size="sm"
              type="button"
              variant={topologyView === "relations" ? "secondary" : "outline"}
            >
              {t("resources.graph.view.relations")}
            </Button>
          </ButtonGroup>
          <PhysicalGraphBreadcrumb items={breadcrumbs} onSelectAll={onSelectAll} />
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 top-20 sm:top-11" data-slot="topology-canvas">
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
      </div>

      {autoHintVisible ? (
        <div
          className="absolute right-3 top-24 z-30 flex max-w-sm items-center gap-2 rounded-lg border bg-background/95 px-3 py-2 text-xs shadow-lg backdrop-blur sm:top-14"
          data-slot="resources-graph-auto-hint"
          role="status"
        >
          <span>{t("resources.graph.autoHint")}</span>
          <Button
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

      <UnavailableTimeline />
    </div>
  );
}

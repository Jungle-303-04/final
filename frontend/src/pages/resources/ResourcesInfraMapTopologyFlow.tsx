import {
  Background,
  ReactFlow,
  type Edge,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { useI18n } from "../../shared/i18n";
import { useProductColorMode } from "../../shared/ui/useProductTheme";
import type { InfraMapMetricMode } from "./ResourcesInfraMapMetrics";
import {
  infraMapHoverFrameFromEvent,
  shouldReuseInfraMapHoverFrame,
} from "./InfraMapHoverCard";
import {
  ResourcesInfraMapTopologyHoverCard,
  type HoveredTopologyNode,
} from "./ResourcesInfraMapTopologyHoverCard";
import { ResourcesInfraMapTopologyMiniMap } from "./ResourcesInfraMapTopologyMiniMap";
import {
  infraMapTopologyNodeTypes,
  ResourcesInfraMapTopologyStaticFallback,
} from "./ResourcesInfraMapTopologyNodes";
import { ResourcesInfraMapTopologyZoomControls } from "./ResourcesInfraMapTopologyZoomControls";
import type { InfraMapPod } from "./resourcesInfraMapModel";
import {
  buildInfraTopologyFlowGraph,
  type InfraTopologyNode,
} from "./resourcesInfraMapTopologyFlowGraph";
import type { TopologySize } from "./resourcesInfraMapTopologyLayout";
import type { InfraMapTopologyCluster } from "./resourcesInfraMapTopologyModel";
import {
  INFRA_MAP_TOPOLOGY_ZOOM,
  topologyZoomPercent,
} from "./resourcesInfraMapTopologyZoom";
import {
  DEFAULT_TOPOLOGY_VIEWPORT,
  INFRA_MAP_TOPOLOGY_FIT_VIEW_OPTIONS,
  isValidTopologyViewport,
  type TopologyViewport,
} from "./resourcesInfraMapTopologyViewport";
import { useGraphRefit } from "./useGraphRefit";

const TOPOLOGY_BACKGROUND_DOT = "color-mix(in oklch, var(--muted-foreground) 22%, transparent)";
const TOPOLOGY_FLOW_CLASS_NAME = [
  "[&_.react-flow__edge-path]:transition-[stroke,stroke-width,opacity]",
  "[&_.react-flow__edge-path]:duration-200",
  "[&_.react-flow__edge-path]:ease-out",
  "[&_.react-flow__node]:transition-transform",
  "[&_.react-flow__node]:duration-300",
  "[&_.react-flow__node]:ease-out",
  "motion-reduce:[&_.react-flow__edge-path]:transition-none",
  "motion-reduce:[&_.react-flow__node]:transition-none",
].join(" ");

export function ResourcesInfraMapTopologyFlow({
  cluster,
  metricMode,
  onOpenPod,
}: {
  cluster: InfraMapTopologyCluster;
  metricMode: InfraMapMetricMode;
  onOpenPod: (pod: InfraMapPod) => void;
}) {
  const { t } = useI18n();
  const colorMode = useProductColorMode();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [flowInstance, setFlowInstance] =
    useState<ReactFlowInstance<InfraTopologyNode, Edge>>();
  const [viewport, setViewport] = useState<TopologyViewport>(DEFAULT_TOPOLOGY_VIEWPORT);
  const [viewportSize, setViewportSize] = useState<TopologySize | null>(null);
  const [zoomPercent, setZoomPercent] = useState<number>(
    INFRA_MAP_TOPOLOGY_ZOOM.defaultPercent,
  );
  const [hoveredNode, setHoveredNode] = useState<HoveredTopologyNode | null>(null);
  const graph = useMemo(
    () => buildInfraTopologyFlowGraph(cluster, metricMode, onOpenPod),
    [cluster, metricMode, onOpenPod],
  );
  const updateZoomPercent = useCallback((zoom: number) => {
    setZoomPercent(topologyZoomPercent(zoom));
  }, []);
  const updateViewport = useCallback((
    nextViewport: TopologyViewport,
    recoveryInstance?: ReactFlowInstance<InfraTopologyNode, Edge>,
  ) => {
    if (!isValidTopologyViewport(nextViewport)) {
      setViewport(DEFAULT_TOPOLOGY_VIEWPORT);
      setZoomPercent(INFRA_MAP_TOPOLOGY_ZOOM.defaultPercent);
      const instance = recoveryInstance ?? flowInstance;
      if (instance) {
        void instance.fitView({
          ...INFRA_MAP_TOPOLOGY_FIT_VIEW_OPTIONS,
          duration: INFRA_MAP_TOPOLOGY_ZOOM.animationMs,
        });
      }
      return;
    }
    setViewport(nextViewport);
    updateZoomPercent(nextViewport.zoom);
  }, [flowInstance, updateZoomPercent]);
  const handleInit = useCallback((instance: ReactFlowInstance<InfraTopologyNode, Edge>) => {
    setFlowInstance(instance);
    updateViewport(instance.getViewport(), instance);
  }, [updateViewport]);
  const handleMove = useCallback((_event: unknown, nextViewport: TopologyViewport) => {
    updateViewport(nextViewport);
  }, [updateViewport]);
  const updateHoveredNode = useCallback((
    event: ReactMouseEvent,
    node: InfraTopologyNode,
  ) => {
    const nextHover = {
      ...infraMapHoverFrameFromEvent(event, viewportRef.current),
      node,
    };
    setHoveredNode((current) => {
      const sameSubject =
        current?.node.id === nextHover.node.id &&
        current.node.type === nextHover.node.type;
      if (shouldReuseInfraMapHoverFrame({ current, next: nextHover, sameSubject })) {
        return current;
      }
      return nextHover;
    });
  }, []);
  const handleNodeMouseEnter = useCallback((
    event: ReactMouseEvent,
    node: InfraTopologyNode,
  ) => {
    updateHoveredNode(event, node);
  }, [updateHoveredNode]);
  const handleNodeMouseMove = useCallback((
    event: ReactMouseEvent,
    node: InfraTopologyNode,
  ) => {
    updateHoveredNode(event, node);
  }, [updateHoveredNode]);
  const handleNodeMouseLeave = useCallback(() => {
    setHoveredNode(null);
  }, []);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return undefined;
    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setViewportSize((current) => {
        const next = { height: rect.height, width: rect.width };
        return current?.height === next.height && current.width === next.width
          ? current
          : next;
      });
    };
    updateSize();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useGraphRefit({
    fitViewOptions: INFRA_MAP_TOPOLOGY_FIT_VIEW_OPTIONS,
    fitKey: graph.layoutSignature,
    instance: flowInstance,
    nodeCount: graph.nodes.length,
    viewportRef,
  });

  if (graph.nodes.length === 0) {
    return (
      <div className="grid h-full min-h-0 place-items-center rounded-lg border bg-background/50 px-4 text-center text-sm text-muted-foreground">
        {t("resources.infraMap.empty")}
      </div>
    );
  }

  return (
    <div
      aria-label={t("resources.infraMap.topology.detail.aria", { name: cluster.name })}
      className="relative h-full min-h-0 overflow-hidden rounded-lg border border-dashed bg-background/45"
      data-slot="infra-map-topology-flow"
      ref={viewportRef}
    >
      {typeof ResizeObserver !== "undefined" ? (
        <>
          <ReactFlow
            className={TOPOLOGY_FLOW_CLASS_NAME}
            colorMode={colorMode}
            edges={graph.edges}
            maxZoom={INFRA_MAP_TOPOLOGY_ZOOM.max}
            minZoom={INFRA_MAP_TOPOLOGY_ZOOM.min}
            nodes={graph.nodes}
            nodeTypes={infraMapTopologyNodeTypes}
            nodesConnectable={false}
            nodesDraggable={false}
            onInit={handleInit}
            onMove={handleMove}
            onNodeMouseEnter={handleNodeMouseEnter}
            onNodeMouseLeave={handleNodeMouseLeave}
            onNodeMouseMove={handleNodeMouseMove}
            panOnScroll
            proOptions={{ hideAttribution: true }}
            zoomOnDoubleClick={false}
            zoomOnScroll
          >
            <Background color={TOPOLOGY_BACKGROUND_DOT} gap={22} size={1} />
            <ResourcesInfraMapTopologyMiniMap
              bounds={graph.bounds}
              edges={graph.edges}
              nodes={graph.nodes}
              viewport={viewport}
              viewportSize={viewportSize}
            />
            <ResourcesInfraMapTopologyZoomControls
              instance={flowInstance}
              zoomPercent={zoomPercent}
            />
          </ReactFlow>
          {hoveredNode ? (
            <ResourcesInfraMapTopologyHoverCard hover={hoveredNode} />
          ) : null}
        </>
      ) : (
        <ResourcesInfraMapTopologyStaticFallback
          cluster={cluster}
          metricMode={metricMode}
          onOpenPod={onOpenPod}
        />
      )}
    </div>
  );
}

import {
  Background,
  Handle,
  ReactFlow,
  type Edge,
  type NodeProps,
  type NodeTypes,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Server, ShipWheel } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { useI18n } from "../../shared/i18n";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../shared/ui/primitives/tooltip";
import { useProductColorMode } from "../../shared/ui/useProductTheme";
import {
  ratioSplitText,
  type InfraMapMetricMode,
} from "./ResourcesInfraMapMetrics";
import { PodEvidenceTooltipPanel } from "./PodEvidenceTooltipContent";
import { TopologyPodHex } from "./ResourcesInfraMapTopologyPodHex";
import type { InfraMapPod } from "./resourcesInfraMapModel";
import { infraMapPodMetricRatio } from "./resourcesInfraMapPodOrdering";
import {
  HANDLE_POSITIONS,
  buildInfraTopologyFlowGraph,
  handleId,
  hexagonPoints,
  topologyNodeCenter,
  topologyNodeSize,
  type InfraTopologyNode,
  type TopologyBounds,
} from "./resourcesInfraMapTopologyFlowGraph";
import type { TopologySize } from "./resourcesInfraMapTopologyLayout";
import {
  type InfraMapTopologyCluster,
  type InfraMapTopologyNode,
  type InfraMapTopologyPodGroup,
} from "./resourcesInfraMapTopologyModel";
import {
  INFRA_MAP_TOPOLOGY_ZOOM,
  nextTopologyZoomPercent,
  topologyZoomLevelFromPercent,
  topologyZoomPercent,
} from "./resourcesInfraMapTopologyZoom";
import {
  podHealthTone,
  podResourcePressureTone,
} from "./podVisualState";
import { useGraphRefit } from "./useGraphRefit";

const nodeTypes: NodeTypes = {
  "infra-map-cluster": ClusterGraphNode,
  "infra-map-node": ServerGraphNode,
  "infra-map-pod": PodGraphNode,
};

const TOPOLOGY_FIT_VIEW_OPTIONS = {
  maxZoom: 1,
  minZoom: INFRA_MAP_TOPOLOGY_ZOOM.min,
  padding: 0.18,
} as const;
const TOPOLOGY_BACKGROUND_DOT = "color-mix(in oklch, var(--muted-foreground) 22%, transparent)";
const TOPOLOGY_MINIMAP_BACKGROUND = "var(--background)";
const TOPOLOGY_MINIMAP_EDGE_STROKE = "var(--foreground)";
const TOPOLOGY_MINIMAP_EDGE_OPACITY = 0.42;
const TOPOLOGY_MINIMAP_VIEWPORT_STROKE = "var(--ring)";
const TOPOLOGY_MINIMAP_NODE_STROKE = "var(--foreground)";
const TOPOLOGY_MINIMAP_CLUSTER = "var(--primary)";
const TOPOLOGY_MINIMAP_SERVER = "var(--foreground)";
const TOPOLOGY_MINIMAP_UNKNOWN = "var(--muted-foreground)";
const TOPOLOGY_MINIMAP_HEIGHT = 120;
const TOPOLOGY_MINIMAP_WIDTH = 168;
const TOPOLOGY_MINIMAP_PADDING = 28;
const TOPOLOGY_HOVER_MOVE_THRESHOLD_PX = 4;

interface TopologyViewport {
  x: number;
  y: number;
  zoom: number;
}

interface HoveredTopologyNode {
  height: number;
  node: InfraTopologyNode;
  width: number;
  x: number;
  y: number;
}

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
  const [viewport, setViewport] = useState<TopologyViewport>({ x: 0, y: 0, zoom: 1 });
  const [viewportSize, setViewportSize] = useState<TopologySize | null>(null);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [hoveredNode, setHoveredNode] = useState<HoveredTopologyNode | null>(null);
  const graph = useMemo(
    () => buildInfraTopologyFlowGraph(cluster, metricMode, onOpenPod),
    [cluster, metricMode, onOpenPod],
  );
  const updateZoomPercent = useCallback((zoom: number) => {
    setZoomPercent(topologyZoomPercent(zoom));
  }, []);
  const handleInit = useCallback((instance: ReactFlowInstance<InfraTopologyNode, Edge>) => {
    setFlowInstance(instance);
    const nextViewport = instance.getViewport();
    setViewport(nextViewport);
    updateZoomPercent(nextViewport.zoom);
  }, [updateZoomPercent]);
  const handleMove = useCallback((_event: unknown, nextViewport: TopologyViewport) => {
    setViewport(nextViewport);
    updateZoomPercent(nextViewport.zoom);
  }, [updateZoomPercent]);
  const updateHoveredNode = useCallback((
    event: ReactMouseEvent,
    node: InfraTopologyNode,
  ) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    const nextHover = {
      height: rect?.height ?? 0,
      node,
      width: rect?.width ?? 0,
      x: rect ? event.clientX - rect.left : event.clientX,
      y: rect ? event.clientY - rect.top : event.clientY,
    };
    setHoveredNode((current) => {
      if (
        current?.node.id === nextHover.node.id &&
        current.node.type === nextHover.node.type &&
        current.height === nextHover.height &&
        current.width === nextHover.width &&
        Math.abs(current.x - nextHover.x) < TOPOLOGY_HOVER_MOVE_THRESHOLD_PX &&
        Math.abs(current.y - nextHover.y) < TOPOLOGY_HOVER_MOVE_THRESHOLD_PX
      ) {
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
    fitViewOptions: TOPOLOGY_FIT_VIEW_OPTIONS,
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
            colorMode={colorMode}
            edges={graph.edges}
            fitView
            fitViewOptions={TOPOLOGY_FIT_VIEW_OPTIONS}
            maxZoom={INFRA_MAP_TOPOLOGY_ZOOM.max}
            minZoom={INFRA_MAP_TOPOLOGY_ZOOM.min}
            nodes={graph.nodes}
            nodeTypes={nodeTypes}
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
            <TopologyMiniMap
              bounds={graph.bounds}
              edges={graph.edges}
              nodes={graph.nodes}
              viewport={viewport}
              viewportSize={viewportSize}
            />
            <TopologyZoomControls
              instance={flowInstance}
              zoomPercent={zoomPercent}
            />
          </ReactFlow>
          {hoveredNode ? <TopologyHoverCard hover={hoveredNode} /> : null}
        </>
      ) : (
        <TopologyStaticFallback
          cluster={cluster}
          metricMode={metricMode}
          onOpenPod={onOpenPod}
        />
      )}
    </div>
  );
}

function TopologyMiniMap({
  bounds,
  edges,
  nodes,
  viewport,
  viewportSize,
}: {
  bounds: TopologyBounds;
  edges: readonly Edge[];
  nodes: readonly InfraTopologyNode[];
  viewport: TopologyViewport;
  viewportSize: TopologySize | null;
}) {
  const { t } = useI18n();
  const paddedBounds = padBounds(bounds, TOPOLOGY_MINIMAP_PADDING);
  const visibleBounds = viewportBounds(viewport, viewportSize);
  const clampedVisibleBounds = visibleBounds
    ? intersectBounds(visibleBounds, paddedBounds)
    : null;

  return (
    <div
      aria-label={t("resources.infraMap.topology.minimap")}
      className="absolute left-3 top-3 z-20 overflow-hidden rounded-lg border border-border/80 bg-background/85 shadow-sm backdrop-blur"
      data-slot="infra-map-topology-minimap"
      role="img"
      style={{
        height: TOPOLOGY_MINIMAP_HEIGHT,
        width: TOPOLOGY_MINIMAP_WIDTH,
      }}
    >
      <svg
        aria-hidden="true"
        className="block size-full"
        preserveAspectRatio="xMidYMid meet"
        viewBox={`${paddedBounds.x} ${paddedBounds.y} ${paddedBounds.width} ${paddedBounds.height}`}
      >
        <rect
          fill={TOPOLOGY_MINIMAP_BACKGROUND}
          height={paddedBounds.height}
          width={paddedBounds.width}
          x={paddedBounds.x}
          y={paddedBounds.y}
        />
        {edges.map((edge) => {
          const source = nodes.find((node) => node.id === edge.source);
          const target = nodes.find((node) => node.id === edge.target);
          if (!source || !target) return null;
          const sourceCenter = topologyNodeCenter(source);
          const targetCenter = topologyNodeCenter(target);
          return (
            <line
              key={edge.id}
              stroke={TOPOLOGY_MINIMAP_EDGE_STROKE}
              strokeLinecap="round"
              strokeOpacity={TOPOLOGY_MINIMAP_EDGE_OPACITY}
              strokeWidth={12}
              x1={sourceCenter.x}
              x2={targetCenter.x}
              y1={sourceCenter.y}
              y2={targetCenter.y}
            />
          );
        })}
        {nodes.map((node) => (
          <TopologyMiniMapNode key={node.id} node={node} />
        ))}
        {clampedVisibleBounds ? (
          <rect
            fill="none"
            height={clampedVisibleBounds.height}
            rx={18}
            stroke={TOPOLOGY_MINIMAP_VIEWPORT_STROKE}
            strokeWidth={4}
            vectorEffect="non-scaling-stroke"
            width={clampedVisibleBounds.width}
            x={clampedVisibleBounds.x}
            y={clampedVisibleBounds.y}
          />
        ) : null}
      </svg>
    </div>
  );
}

function TopologyMiniMapNode({ node }: { node: InfraTopologyNode }) {
  const center = topologyNodeCenter(node);
  const fill = topologyMiniMapNodeColor(node);
  const stroke = topologyMiniMapNodeStrokeColor(node);
  if (node.type === "infra-map-cluster") {
    return (
      <circle
        cx={center.x}
        cy={center.y}
        fill={fill}
        r={30}
        stroke={stroke}
        strokeOpacity={0.72}
        strokeWidth={8}
      />
    );
  }
  if (node.type === "infra-map-node") {
    return (
      <rect
        fill={fill}
        height={52}
        rx={10}
        stroke={stroke}
        strokeOpacity={0.72}
        strokeWidth={8}
        width={52}
        x={center.x - 26}
        y={center.y - 26}
      />
    );
  }
  return (
    <polygon
      fill={fill}
      points={hexagonPoints(center, topologyNodeSize(node).width / 2)}
      stroke={stroke}
      strokeOpacity={0.78}
      strokeWidth={8}
    />
  );
}

function TopologyStaticFallback({
  cluster,
  metricMode,
  onOpenPod,
}: {
  cluster: InfraMapTopologyCluster;
  metricMode: InfraMapMetricMode;
  onOpenPod: (pod: InfraMapPod) => void;
}) {
  return (
    <div className="grid h-full overflow-auto p-4" data-slot="infra-map-topology-static-fallback">
      <div className="grid min-w-[36rem] justify-items-center gap-6">
        <ClusterStaticCard cluster={cluster} />
        <div className="grid gap-4 sm:grid-cols-[repeat(auto-fit,minmax(16rem,1fr))]">
          {cluster.nodes.map((node) => (
            <div className="grid justify-items-center gap-3" key={node.id}>
              <ServerStaticCard node={node} />
              {node.groups.map((group) => (
                <PodGroupStaticFallback
                  group={group}
                  key={group.key}
                  metricMode={metricMode}
                  onOpenPod={onOpenPod}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TopologyZoomControls({
  instance,
  zoomPercent,
}: {
  instance: ReactFlowInstance<InfraTopologyNode, Edge> | undefined;
  zoomPercent: number;
}) {
  const { t } = useI18n();
  const disabled = instance === undefined;
  const zoomIn = () => {
    if (!instance) return;
    zoomTopologyByStep(instance, 1);
  };
  const zoomOut = () => {
    if (!instance) return;
    zoomTopologyByStep(instance, -1);
  };
  const fitView = () => {
    if (!instance) return;
    void instance.fitView({ ...TOPOLOGY_FIT_VIEW_OPTIONS, duration: 180 });
  };

  return (
    <div
      aria-label={t("resources.infraMap.topology.zoomControls")}
      className="absolute right-2 top-2 z-20 flex h-8 items-center overflow-hidden rounded-lg border bg-background/90 text-xs shadow-sm backdrop-blur"
      data-slot="infra-map-topology-zoom-controls"
      role="group"
    >
      <button
        aria-label={t("resources.infraMap.topology.zoomOut")}
        className="grid h-full w-8 place-items-center border-r text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-45"
        disabled={disabled}
        onClick={zoomOut}
        type="button"
      >
        -
      </button>
      <span
        aria-label={t("resources.infraMap.topology.zoomScale", { percent: zoomPercent })}
        className="grid h-full min-w-14 place-items-center border-r px-2 font-medium tabular-nums text-muted-foreground"
      >
        {zoomPercent}%
      </span>
      <button
        aria-label={t("resources.infraMap.topology.zoomIn")}
        className="grid h-full w-8 place-items-center border-r text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-45"
        disabled={disabled}
        onClick={zoomIn}
        type="button"
      >
        +
      </button>
      <button
        className="h-full px-2 font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-45"
        disabled={disabled}
        onClick={fitView}
        type="button"
      >
        {t("resources.infraMap.topology.fit")}
      </button>
    </div>
  );
}

function zoomTopologyByStep(
  instance: ReactFlowInstance<InfraTopologyNode, Edge>,
  direction: 1 | -1,
): void {
  const nextPercent = nextTopologyZoomPercent(instance.getZoom(), direction);
  void instance.zoomTo(topologyZoomLevelFromPercent(nextPercent), {
    duration: INFRA_MAP_TOPOLOGY_ZOOM.animationMs,
  });
}

function TopologyHoverCard({ hover }: { hover: HoveredTopologyNode }) {
  const edgePadding = 8;
  const gap = 14;
  const cardWidth = Math.min(288, Math.max(0, hover.width - edgePadding * 2));
  const maxLeft = Math.max(edgePadding, hover.width - cardWidth - edgePadding);
  const left = Math.min(Math.max(edgePadding, hover.x + gap), maxLeft);
  const placeAbove = hover.height > 0 && hover.y > hover.height / 2;
  const verticalOffset = placeAbove
    ? Math.max(edgePadding, hover.height - hover.y + gap)
    : Math.max(edgePadding, hover.y + gap);
  return (
    <div
      className="pointer-events-none absolute z-50 w-72 max-w-[calc(100%-1rem)] overflow-hidden rounded-md bg-foreground text-background shadow-lg"
      data-slot="infra-map-topology-hover-card"
      role="tooltip"
      style={{
        bottom: placeAbove ? verticalOffset : undefined,
        left,
        maxHeight: "calc(100% - 1rem)",
        top: placeAbove ? undefined : verticalOffset,
        width: cardWidth || undefined,
      }}
    >
      {hover.node.type === "infra-map-cluster" ? (
        <ClusterHoverContent cluster={hover.node.data.cluster} />
      ) : hover.node.type === "infra-map-node" ? (
        <ServerHoverContent node={hover.node.data.node} />
      ) : (
        <PodHoverContent node={hover.node} />
      )}
    </div>
  );
}

function ClusterHoverContent({ cluster }: { cluster: InfraMapTopologyCluster }) {
  const { formatNumber, t } = useI18n();
  return (
    <>
      <TopologyTooltipHeader
        eyebrow={t("resources.infraMap.topology.cluster")}
        title={cluster.name}
      />
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-3 py-2.5 text-[0.6875rem]">
        <TopologyTooltipRow
          label={t("resources.infraMap.nodeKind")}
          value={formatNumber(cluster.nodeCount)}
        />
        <TopologyTooltipRow
          label={t("resources.infraMap.metric.pods")}
          value={formatNumber(cluster.podCount)}
        />
        <TopologyTooltipRow
          label={t("status.tone.warning")}
          value={formatNumber(cluster.warningCount)}
        />
        <TopologyTooltipRow
          label={t("status.tone.critical")}
          value={formatNumber(cluster.criticalCount)}
        />
      </dl>
    </>
  );
}

function ServerHoverContent({ node }: { node: InfraMapTopologyNode }) {
  const { formatNumber, t } = useI18n();
  const nodeName = node.unassigned ? t("resources.infraMap.nodeUnassigned") : node.name;
  const cpuText = node.cpuRatio === null
    ? t("common.value.unavailable")
    : ratioSplitText(node.cpuRatio, formatNumber);
  const memoryText = node.memoryRatio === null
    ? t("common.value.unavailable")
    : ratioSplitText(node.memoryRatio, formatNumber);
  const podText = node.podCapacity === null
    ? formatNumber(node.podCount)
    : t("resources.infraMap.podCapacityValue", {
        capacity: formatNumber(node.podCapacity),
        count: formatNumber(node.podCount),
      });
  return (
    <>
      <TopologyTooltipHeader eyebrow={t("resources.infraMap.nodeKind")} title={nodeName} />
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-3 py-2.5 text-[0.6875rem]">
        <TopologyTooltipRow
          label={t("resources.table.status")}
          value={node.ready === null
            ? t("common.state.unknown")
            : node.ready
              ? t("resources.infraMap.nodeReady")
              : t("resources.infraMap.nodeNotReady")}
        />
        <TopologyTooltipRow label={t("resources.infraMap.metric.pods")} value={podText} />
        <TopologyTooltipRow label={t("resources.infraMap.metric.cpu")} value={cpuText} />
        <TopologyTooltipRow label={t("resources.infraMap.metric.memory")} value={memoryText} />
      </dl>
    </>
  );
}

function PodHoverContent({
  node,
}: {
  node: Extract<InfraTopologyNode, { type: "infra-map-pod" }>;
}) {
  const { formatNumber } = useI18n();
  const ratio = infraMapPodMetricRatio(node.data.pod, node.data.metricMode);
  return (
    <PodEvidenceTooltipPanel
      pod={{
        cpuMillicores: node.data.pod.cpu.value,
        cpuRequestMillicores: node.data.pod.cpu.request,
        memoryMebibytes: node.data.pod.memory.value,
        memoryRequestMebibytes: node.data.pod.memory.request,
        name: node.data.pod.name,
        namespace: node.data.pod.namespace,
        phase: node.data.pod.phase,
        restartCount: node.data.pod.restartCount,
        usagePercent: node.data.pod.usagePercent,
      }}
      usageText={ratio === null
        ? null
        : formatNumber(ratio, { maximumFractionDigits: 1, style: "percent" })}
    />
  );
}

function topologyMiniMapNodeColor(node: InfraTopologyNode): string {
  if (node.type === "infra-map-cluster") return TOPOLOGY_MINIMAP_CLUSTER;
  if (node.type === "infra-map-node") return TOPOLOGY_MINIMAP_SERVER;
  const healthTone = podHealthTone(node.data.pod);
  if (healthTone === "critical") return "var(--destructive)";
  const pressureTone = podResourcePressureTone(
    infraMapPodMetricRatio(node.data.pod, node.data.metricMode),
  );
  if (pressureTone === "danger") return "var(--color-orange-500)";
  if (pressureTone === "warning") return "var(--status-warning)";
  if (pressureTone === "healthy") return "var(--color-emerald-500)";
  return TOPOLOGY_MINIMAP_UNKNOWN;
}

function topologyMiniMapNodeStrokeColor(node: InfraTopologyNode): string {
  if (node.type === "infra-map-pod" && podHealthTone(node.data.pod) === "critical") {
    return "var(--destructive)";
  }
  return TOPOLOGY_MINIMAP_NODE_STROKE;
}

function padBounds(bounds: TopologyBounds, padding: number): TopologyBounds {
  return {
    height: bounds.height + padding * 2,
    width: bounds.width + padding * 2,
    x: bounds.x - padding,
    y: bounds.y - padding,
  };
}

function viewportBounds(
  viewport: TopologyViewport,
  viewportSize: TopologySize | null,
): TopologyBounds | null {
  if (!viewportSize || viewport.zoom <= 0) return null;
  return {
    height: viewportSize.height / viewport.zoom,
    width: viewportSize.width / viewport.zoom,
    x: -viewport.x / viewport.zoom,
    y: -viewport.y / viewport.zoom,
  };
}

function intersectBounds(left: TopologyBounds, right: TopologyBounds): TopologyBounds | null {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const maxX = Math.min(left.x + left.width, right.x + right.width);
  const maxY = Math.min(left.y + left.height, right.y + right.height);
  if (maxX <= x || maxY <= y) return null;
  return {
    height: maxY - y,
    width: maxX - x,
    x,
    y,
  };
}

function InvisibleHandles({
  source,
  target,
}: {
  source?: boolean;
  target?: boolean;
}) {
  return (
    <>
      {source
        ? HANDLE_POSITIONS.map((position) => (
            <Handle
              className="opacity-0"
              id={handleId("source", position)}
              isConnectable={false}
              key={`source-${position}`}
              position={position}
              type="source"
            />
          ))
        : null}
      {target
        ? HANDLE_POSITIONS.map((position) => (
            <Handle
              className="opacity-0"
              id={handleId("target", position)}
              isConnectable={false}
              key={`target-${position}`}
              position={position}
              type="target"
            />
          ))
        : null}
    </>
  );
}

function ClusterGraphNode({ data }: NodeProps<Extract<InfraTopologyNode, { type: "infra-map-cluster" }>>) {
  return (
    <>
      <InvisibleHandles source />
      <ClusterStaticCard cluster={data.cluster} showTooltip={false} />
    </>
  );
}

function ClusterStaticCard({
  cluster,
  showTooltip = true,
}: {
  cluster: InfraMapTopologyCluster;
  showTooltip?: boolean;
}) {
  const { formatNumber, t } = useI18n();
  const trigger = (
    <article
      aria-label={cluster.name}
      className="grid size-16 place-items-center rounded-full border border-primary/25 bg-primary/8 text-primary shadow-sm transition-[border-color,transform] hover:-translate-y-0.5 hover:border-primary/50 motion-reduce:transform-none motion-reduce:transition-none"
      data-slot="infra-map-topology-cluster-node"
    >
      <ShipWheel aria-hidden="true" className="size-8" />
    </article>
  );
  if (!showTooltip) {
    return trigger;
  }
  return (
    <Tooltip>
      <TooltipTrigger render={trigger} />
      <TooltipContent
        className="w-64 max-w-[calc(100vw-1rem)] p-0"
        role="tooltip"
        side="top"
      >
        <TopologyTooltipHeader
          eyebrow={t("resources.infraMap.topology.cluster")}
          title={cluster.name}
        />
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-3 py-2.5 text-[0.6875rem]">
          <TopologyTooltipRow
            label={t("resources.infraMap.nodeKind")}
            value={formatNumber(cluster.nodeCount)}
          />
          <TopologyTooltipRow
            label={t("resources.infraMap.metric.pods")}
            value={formatNumber(cluster.podCount)}
          />
          <TopologyTooltipRow
            label={t("status.tone.warning")}
            value={formatNumber(cluster.warningCount)}
          />
          <TopologyTooltipRow
            label={t("status.tone.critical")}
            value={formatNumber(cluster.criticalCount)}
          />
        </dl>
      </TooltipContent>
    </Tooltip>
  );
}

function ServerGraphNode({ data }: NodeProps<Extract<InfraTopologyNode, { type: "infra-map-node" }>>) {
  return (
    <>
      <InvisibleHandles source target />
      <ServerStaticCard node={data.node} showTooltip={false} />
    </>
  );
}

function ServerStaticCard({
  node,
  showTooltip = true,
}: {
  node: InfraMapTopologyNode;
  showTooltip?: boolean;
}) {
  const { formatNumber, t } = useI18n();
  const nodeName = node.unassigned ? t("resources.infraMap.nodeUnassigned") : node.name;
  const cpuText = node.cpuRatio === null
    ? t("common.value.unavailable")
    : ratioSplitText(node.cpuRatio, formatNumber);
  const memoryText = node.memoryRatio === null
    ? t("common.value.unavailable")
    : ratioSplitText(node.memoryRatio, formatNumber);
  const podText = node.podCapacity === null
    ? formatNumber(node.podCount)
    : t("resources.infraMap.podCapacityValue", {
        capacity: formatNumber(node.podCapacity),
        count: formatNumber(node.podCount),
      });
  const trigger = (
    <article
      aria-label={nodeName}
      className="grid size-14 place-items-center rounded-xl border border-foreground/20 bg-card/95 text-foreground shadow-sm transition-[border-color,transform] hover:-translate-y-0.5 hover:border-foreground/45 motion-reduce:transform-none motion-reduce:transition-none"
      data-slot="infra-map-topology-server-node"
    >
      <Server aria-hidden="true" className="size-7" />
    </article>
  );
  if (!showTooltip) {
    return trigger;
  }
  return (
    <Tooltip>
      <TooltipTrigger render={trigger} />
      <TooltipContent
        className="w-64 max-w-[calc(100vw-1rem)] p-0"
        role="tooltip"
        side="top"
      >
        <TopologyTooltipHeader
          eyebrow={t("resources.infraMap.nodeKind")}
          title={nodeName}
        />
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-3 py-2.5 text-[0.6875rem]">
          <TopologyTooltipRow
            label={t("resources.table.status")}
            value={node.ready === null
              ? t("common.state.unknown")
              : node.ready
                ? t("resources.infraMap.nodeReady")
                : t("resources.infraMap.nodeNotReady")}
          />
          <TopologyTooltipRow
            label={t("resources.infraMap.metric.pods")}
            value={podText}
          />
          <TopologyTooltipRow
            label={t("resources.infraMap.metric.cpu")}
            value={cpuText}
          />
          <TopologyTooltipRow
            label={t("resources.infraMap.metric.memory")}
            value={memoryText}
          />
        </dl>
      </TooltipContent>
    </Tooltip>
  );
}

function PodGraphNode({ data }: NodeProps<Extract<InfraTopologyNode, { type: "infra-map-pod" }>>) {
  return (
    <>
      <InvisibleHandles target />
      <div
        data-group-evidence={data.group.evidence}
        data-group-kind={data.group.kind ?? undefined}
        data-pod-group-key={data.group.key}
        data-slot="infra-map-topology-pod-node"
      >
        <TopologyPodHex
          metricMode={data.metricMode}
          onOpenPod={data.onOpenPod}
          pod={data.pod}
          showTooltip={false}
          size={data.size}
        />
      </div>
    </>
  );
}

function PodGroupStaticFallback({
  group,
  metricMode,
  onOpenPod,
}: {
  group: InfraMapTopologyPodGroup;
  metricMode: InfraMapMetricMode;
  onOpenPod: (pod: InfraMapPod) => void;
}) {
  return (
    <div
      aria-label={group.label}
      className="flex flex-wrap justify-center gap-0.5"
      data-group-evidence={group.evidence}
      data-group-kind={group.kind ?? undefined}
      data-pod-group-key={group.key}
      data-slot="infra-map-topology-pod-static-group"
    >
      {group.pods.map((pod) => (
        <TopologyPodHex
          key={pod.id}
          metricMode={metricMode}
          onOpenPod={onOpenPod}
          pod={pod}
        />
      ))}
    </div>
  );
}

function TopologyTooltipHeader({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="border-b border-background/15 px-3 py-2.5">
      <p className="text-[0.625rem] font-medium uppercase tracking-[0.14em] text-background/65">
        {eyebrow}
      </p>
      <p className="mt-0.5 break-all text-xs font-semibold leading-snug">{title}</p>
    </div>
  );
}

function TopologyTooltipRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <>
      <dt className="text-background/65">{label}</dt>
      <dd className="min-w-0 text-right font-medium tabular-nums">{value}</dd>
    </>
  );
}

import type { Edge } from "@xyflow/react";

import { useI18n } from "../../shared/i18n";
import {
  hexagonPoints,
  topologyNodeCenter,
  topologyNodeSize,
  type InfraTopologyNode,
  type TopologyBounds,
} from "./resourcesInfraMapTopologyFlowGraph";
import type { TopologySize } from "./resourcesInfraMapTopologyLayout";
import {
  intersectTopologyBounds,
  padTopologyBounds,
  topologyViewportBounds,
  type TopologyViewport,
} from "./resourcesInfraMapTopologyViewport";
import { infraMapPodSvgVisual } from "./resourcesInfraMapPodVisual";

const TOPOLOGY_MINIMAP_BACKGROUND = "var(--background)";
const TOPOLOGY_MINIMAP_EDGE_STROKE = "var(--foreground)";
const TOPOLOGY_MINIMAP_EDGE_OPACITY = 0.42;
const TOPOLOGY_MINIMAP_VIEWPORT_STROKE = "var(--ring)";
const TOPOLOGY_MINIMAP_NODE_STROKE = "var(--foreground)";
const TOPOLOGY_MINIMAP_CLUSTER = "var(--color-blue-500, #3b82f6)";
const TOPOLOGY_MINIMAP_SERVER = "var(--foreground)";
const TOPOLOGY_MINIMAP_HEIGHT = 120;
const TOPOLOGY_MINIMAP_WIDTH = 168;
const TOPOLOGY_MINIMAP_PADDING = 28;

export function ResourcesInfraMapTopologyMiniMap({
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
  const paddedBounds = padTopologyBounds(bounds, TOPOLOGY_MINIMAP_PADDING);
  const visibleBounds = topologyViewportBounds(viewport, viewportSize);
  const clampedVisibleBounds = visibleBounds
    ? intersectTopologyBounds(visibleBounds, paddedBounds)
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
  const size = topologyNodeSize(node);
  const visual = topologyMiniMapNodeVisual(node);
  if (node.type === "infra-map-cluster") {
    return (
      <circle
        cx={center.x}
        cy={center.y}
        fill={visual.fill}
        r={size.width / 2}
        stroke={visual.stroke}
        strokeOpacity={0.72}
        strokeWidth={8}
      />
    );
  }
  if (node.type === "infra-map-node") {
    return (
      <rect
        fill={visual.fill}
        height={size.height}
        rx={10}
        stroke={visual.stroke}
        strokeOpacity={0.72}
        strokeWidth={8}
        width={size.width}
        x={center.x - size.width / 2}
        y={center.y - size.height / 2}
      />
    );
  }
  return (
    <polygon
      fill={visual.fill}
      points={hexagonPoints(center, size.width / 2)}
      stroke={visual.stroke}
      strokeOpacity={0.78}
      strokeWidth={8}
    />
  );
}

function topologyMiniMapNodeVisual(node: InfraTopologyNode): {
  fill: string;
  stroke: string;
} {
  if (node.type === "infra-map-cluster") {
    return { fill: TOPOLOGY_MINIMAP_CLUSTER, stroke: TOPOLOGY_MINIMAP_NODE_STROKE };
  }
  if (node.type === "infra-map-node") {
    return { fill: TOPOLOGY_MINIMAP_SERVER, stroke: TOPOLOGY_MINIMAP_NODE_STROKE };
  }
  const podVisual = infraMapPodSvgVisual(node.data.pod, node.data.metricMode);
  return { fill: podVisual.fill, stroke: podVisual.stroke };
}

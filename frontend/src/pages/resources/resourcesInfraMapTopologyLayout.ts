export interface TopologyPoint {
  x: number;
  y: number;
}

export interface TopologySize {
  height: number;
  width: number;
}

export const INFRA_MAP_TOPOLOGY_NODE_SIZE = {
  cluster: { height: 64, width: 64 },
  pod: { height: 32, width: 32 },
  server: { height: 56, width: 56 },
} as const satisfies Record<string, TopologySize>;

export const INFRA_MAP_TOPOLOGY_POD_SIZE = {
  base: 32,
  max: 44,
  min: 26,
} as const;

export const INFRA_MAP_TOPOLOGY_RADIAL_LAYOUT = {
  nodeBaseCount: 4,
  nodeClusterClearance: 96,
  nodeRadius: 300,
  nodeRadiusStep: 28,
  nodeSeparationGap: 120,
  podDistanceCritical: 340,
  podDistanceDanger: 300,
  podDistanceHealthy: 220,
  podDistanceUnknown: 250,
  podDistanceWarning: 270,
  podGroupRadius: 250,
  podGroupRadiusGap: 150,
  podGroupsPerRing: 8,
} as const;

export const INFRA_MAP_TOPOLOGY_HONEYCOMB_COLUMNS = 6;
export const INFRA_MAP_TOPOLOGY_HONEYCOMB_LAYOUT = {
  columnGap: 27,
  rowGap: 23,
  rowOffset: 14,
} as const;
const TAU = Math.PI * 2;

export interface TopologyRadialGroupPlacement {
  angle: number;
  center: TopologyPoint;
}

export interface HoneycombOffsetOptions {
  columnGap: number;
  columns?: number;
  rowGap: number;
  rowOffset: number;
}

export function honeycombRows<T>(
  items: readonly T[],
  columns: number = INFRA_MAP_TOPOLOGY_HONEYCOMB_COLUMNS,
): T[][] {
  if (columns < 1) return [Array.from(items)];
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += columns) {
    rows.push(items.slice(index, index + columns));
  }
  return rows;
}

export function honeycombOffsets(
  count: number,
  {
    columnGap,
    columns = INFRA_MAP_TOPOLOGY_HONEYCOMB_COLUMNS,
    rowGap,
    rowOffset,
  }: HoneycombOffsetOptions,
): TopologyPoint[] {
  if (count <= 0) return [];
  const rawOffsets = Array.from({ length: count }, (_, podIndex) => {
    const rowIndex = Math.floor(podIndex / columns);
    const columnIndex = podIndex % columns;
    return {
      x: columnIndex * columnGap + (rowIndex % 2 === 1 ? rowOffset : 0),
      y: rowIndex * rowGap,
    };
  });
  const bounds = rawOffsets.reduce(
    (current, offset) => ({
      maxX: Math.max(current.maxX, offset.x),
      maxY: Math.max(current.maxY, offset.y),
      minX: Math.min(current.minX, offset.x),
      minY: Math.min(current.minY, offset.y),
    }),
    {
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
    },
  );
  const center = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
  return rawOffsets.map((offset) => ({
    x: offset.x - center.x,
    y: offset.y - center.y,
  }));
}

export function radialAngles(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0];
  return Array.from({ length: count }, (_, index) => -Math.PI / 2 + (TAU * index) / count);
}

export function topologyNodeAngles(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0];
  if (count === 2) return [0, Math.PI];
  return Array.from({ length: count }, (_, index) => -Math.PI / 2 + (TAU * index) / count);
}

export function topologyNodeRingRadius(
  nodeCount: number,
  nodeLocalRadii: readonly number[],
): number {
  const maxLocalRadius = Math.max(0, ...nodeLocalRadii);
  const clusterClearance = maxLocalRadius +
    INFRA_MAP_TOPOLOGY_NODE_SIZE.cluster.width / 2 +
    INFRA_MAP_TOPOLOGY_RADIAL_LAYOUT.nodeClusterClearance;
  const baseRadius = INFRA_MAP_TOPOLOGY_RADIAL_LAYOUT.nodeRadius +
    Math.max(0, nodeCount - INFRA_MAP_TOPOLOGY_RADIAL_LAYOUT.nodeBaseCount) *
      INFRA_MAP_TOPOLOGY_RADIAL_LAYOUT.nodeRadiusStep;
  if (nodeCount <= 1) {
    return Math.max(baseRadius, clusterClearance);
  }
  const desiredNodeSpacing = maxLocalRadius * 2 +
    INFRA_MAP_TOPOLOGY_RADIAL_LAYOUT.nodeSeparationGap;
  const polygonSpacingFactor = nodeCount === 2
    ? 2
    : 2 * Math.sin(Math.PI / nodeCount);
  const polygonRadius = desiredNodeSpacing / Math.max(Number.EPSILON, polygonSpacingFactor);
  return Math.max(baseRadius, clusterClearance, polygonRadius);
}

export function radialGroupPlacements(
  nodeCenter: TopologyPoint,
  nodeAngle: number,
  groupCount: number,
): TopologyRadialGroupPlacement[] {
  if (groupCount <= 0) return [];
  const placements: TopologyRadialGroupPlacement[] = [];
  let placedCount = 0;
  for (
    let ringIndex = 0;
    placedCount < groupCount;
    ringIndex += 1
  ) {
    const countInRing = Math.min(
      INFRA_MAP_TOPOLOGY_RADIAL_LAYOUT.podGroupsPerRing + ringIndex * 2,
      groupCount - placedCount,
    );
    const radius = INFRA_MAP_TOPOLOGY_RADIAL_LAYOUT.podGroupRadius +
      ringIndex * INFRA_MAP_TOPOLOGY_RADIAL_LAYOUT.podGroupRadiusGap;
    const angleOffset = countInRing === 1
      ? nodeAngle
      : nodeAngle + Math.PI / countInRing;
    for (let indexInRing = 0; indexInRing < countInRing; indexInRing += 1) {
      const angle = angleOffset + (TAU * indexInRing) / countInRing;
      placements.push({
        angle,
        center: polarPoint(nodeCenter, angle, radius),
      });
    }
    placedCount += countInRing;
  }
  return placements;
}

export function polarPoint(
  origin: TopologyPoint,
  angle: number,
  radius: number,
): TopologyPoint {
  return {
    x: origin.x + Math.cos(angle) * radius,
    y: origin.y + Math.sin(angle) * radius,
  };
}

export function positionFromCenter(
  center: TopologyPoint,
  { height, width }: TopologySize,
): TopologyPoint {
  return {
    x: center.x - width / 2,
    y: center.y - height / 2,
  };
}

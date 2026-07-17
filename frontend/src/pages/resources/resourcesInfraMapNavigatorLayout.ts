import type {
  InfraMapNavigatorCluster,
  InfraMapNavigatorModel,
  InfraMapNavigatorNode,
  InfraMapNavigatorPod,
} from "./resourcesInfraMapNavigatorModel";

export const NAVIGATOR_CANVAS_WIDTH = 980;
export const NAVIGATOR_CLUSTER_HEADER_HEIGHT = 42;
export const NAVIGATOR_CLUSTER_GAP = 28;
export const NAVIGATOR_NODE_ROW_MIN_HEIGHT = 158;
export const NAVIGATOR_NODE_ROW_GAP = 14;
export const NAVIGATOR_PADDING = 28;
export const NAVIGATOR_NODE_RAIL_X = 36;
export const NAVIGATOR_NODE_RAIL_WIDTH = 166;
export const NAVIGATOR_NODE_RAIL_PADDING = 12;
export const NAVIGATOR_HEX_START_X = 252;
export const NAVIGATOR_HEX_TOP_PADDING = 34;
export const NAVIGATOR_HEX_COLUMN_STEP = 24;
export const NAVIGATOR_HEX_ROW_STEP = 21;
export const NAVIGATOR_HEX_ROW_OFFSET = NAVIGATOR_HEX_COLUMN_STEP / 2;
export const NAVIGATOR_HEX_CLUSTER_ASPECT = 1.25;
export const NAVIGATOR_HEX_RADIUS_SCALE = 1.55;
export const NAVIGATOR_HEX_RADIUS_MIN = 8;
export const NAVIGATOR_HEX_RADIUS_MAX = 15;
export const NAVIGATOR_RACK_FIELD_PADDING = 14;
export const NAVIGATOR_RACK_GUIDE_COLUMN_WIDTH = 120;
export const NAVIGATOR_MIN_CANVAS_HEIGHT = 420;

export interface NavigatorHexLayoutPod {
  center: { x: number; y: number };
  pod: InfraMapNavigatorPod;
  radius: number;
}

export interface NavigatorHexLayoutNode {
  hexes: NavigatorHexLayoutPod[];
  node: InfraMapNavigatorNode;
  rowHeight: number;
  y: number;
}

export interface NavigatorHexLayoutCluster {
  cluster: InfraMapNavigatorCluster;
  headerY: number;
  nodes: NavigatorHexLayoutNode[];
  y: number;
}

export interface NavigatorHexLayout {
  clusters: NavigatorHexLayoutCluster[];
  height: number;
  width: number;
}

export function buildNavigatorHexLayout(
  navigator: InfraMapNavigatorModel,
): NavigatorHexLayout {
  let cursorY = NAVIGATOR_PADDING;
  const clusters = navigator.clusters.map((cluster) => {
    const clusterY = cursorY;
    const headerY = cursorY + 14;
    cursorY += NAVIGATOR_CLUSTER_HEADER_HEIGHT;
    const nodePlans = cluster.nodes.map((node) => {
      const columns = navigatorHexColumnCount(node.pods.length);
      const rows = Math.max(1, Math.ceil(node.pods.length / columns));
      return {
        columns,
        node,
        rowHeight: navigatorNodeRowHeight(rows),
        rows,
      };
    });
    const clusterRowHeight = Math.max(
      NAVIGATOR_NODE_ROW_MIN_HEIGHT,
      ...nodePlans.map((plan) => plan.rowHeight),
    );
    const nodes = nodePlans.map(({ columns, node, rows }) => {
      const rowHeight = clusterRowHeight;
      const rowY = cursorY;
      cursorY += rowHeight + NAVIGATOR_NODE_ROW_GAP;
      const hexGroupY = navigatorHexGroupStartY(rowY, rowHeight, rows);
      return {
        hexes: node.pods.map((pod, podIndex) => {
          const row = Math.floor(podIndex / columns);
          const column = podIndex % columns;
          return {
            center: {
              x: NAVIGATOR_HEX_START_X +
                column * NAVIGATOR_HEX_COLUMN_STEP +
                (row % 2 === 1 ? NAVIGATOR_HEX_ROW_OFFSET : 0),
              y: hexGroupY + row * NAVIGATOR_HEX_ROW_STEP,
            },
            pod,
            radius: navigatorHexRadius(pod),
          };
        }),
        node,
        rowHeight,
        y: rowY,
      } satisfies NavigatorHexLayoutNode;
    });
    cursorY += NAVIGATOR_CLUSTER_GAP;
    return {
      cluster,
      headerY,
      nodes,
      y: clusterY,
    } satisfies NavigatorHexLayoutCluster;
  });
  return {
    clusters,
    height: Math.max(NAVIGATOR_MIN_CANVAS_HEIGHT, cursorY + NAVIGATOR_PADDING),
    width: NAVIGATOR_CANVAS_WIDTH,
  };
}

function navigatorNodeRowHeight(rows: number): number {
  return Math.max(
    NAVIGATOR_NODE_ROW_MIN_HEIGHT,
    NAVIGATOR_HEX_TOP_PADDING * 2 + rows * NAVIGATOR_HEX_ROW_STEP,
  );
}

function navigatorHexGroupStartY(
  rowY: number,
  rowHeight: number,
  rows: number,
): number {
  const contentHeight = Math.max(0, (rows - 1) * NAVIGATOR_HEX_ROW_STEP);
  return rowY + rowHeight / 2 - contentHeight / 2;
}

export function navigatorHexagonPoints(
  center: { x: number; y: number },
  radius: number,
): string {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = -Math.PI / 2 + index * (Math.PI / 3);
    return `${center.x + Math.cos(angle) * radius},${center.y + Math.sin(angle) * radius}`;
  }).join(" ");
}

function navigatorHexColumnCount(podCount: number): number {
  const maxColumns = Math.max(
    1,
    Math.floor(
      (NAVIGATOR_CANVAS_WIDTH - NAVIGATOR_HEX_START_X - NAVIGATOR_PADDING) /
        NAVIGATOR_HEX_COLUMN_STEP,
    ),
  );
  if (podCount <= 1) return 1;
  return Math.min(
    maxColumns,
    Math.max(1, Math.ceil(Math.sqrt(podCount * NAVIGATOR_HEX_CLUSTER_ASPECT))),
  );
}

function navigatorHexRadius(pod: InfraMapNavigatorPod): number {
  return Math.max(
    NAVIGATOR_HEX_RADIUS_MIN,
    Math.min(NAVIGATOR_HEX_RADIUS_MAX, pod.radius * NAVIGATOR_HEX_RADIUS_SCALE),
  );
}

import { INFRA_MAP_TOPOLOGY_ZOOM } from "./resourcesInfraMapTopologyZoom";
import type { TopologySize } from "./resourcesInfraMapTopologyLayout";
import type { TopologyBounds } from "./resourcesInfraMapTopologyFlowGraph";

export interface TopologyViewport {
  x: number;
  y: number;
  zoom: number;
}

export const DEFAULT_TOPOLOGY_VIEWPORT: TopologyViewport = { x: 0, y: 0, zoom: 1 };

export const INFRA_MAP_TOPOLOGY_FIT_VIEW_OPTIONS = {
  duration: INFRA_MAP_TOPOLOGY_ZOOM.animationMs,
  maxZoom: 1,
  minZoom: INFRA_MAP_TOPOLOGY_ZOOM.min,
  padding: 0.18,
} as const;

export function padTopologyBounds(bounds: TopologyBounds, padding: number): TopologyBounds {
  const safeBounds = isValidTopologyBounds(bounds)
    ? bounds
    : { height: 1, width: 1, x: 0, y: 0 };
  const safePadding = Number.isFinite(padding) && padding > 0 ? padding : 0;
  return {
    height: safeBounds.height + safePadding * 2,
    width: safeBounds.width + safePadding * 2,
    x: safeBounds.x - safePadding,
    y: safeBounds.y - safePadding,
  };
}

export function topologyViewportBounds(
  viewport: TopologyViewport,
  viewportSize: TopologySize | null,
): TopologyBounds | null {
  if (!isValidTopologyViewport(viewport) || !isValidTopologySize(viewportSize)) {
    return null;
  }
  const bounds = {
    height: viewportSize.height / viewport.zoom,
    width: viewportSize.width / viewport.zoom,
    x: -viewport.x / viewport.zoom,
    y: -viewport.y / viewport.zoom,
  };
  return isValidTopologyBounds(bounds) ? bounds : null;
}

export function intersectTopologyBounds(
  left: TopologyBounds,
  right: TopologyBounds,
): TopologyBounds | null {
  if (!isValidTopologyBounds(left) || !isValidTopologyBounds(right)) return null;
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

export function isValidTopologyBounds(bounds: TopologyBounds): boolean {
  return (
    Number.isFinite(bounds.height) &&
    Number.isFinite(bounds.width) &&
    Number.isFinite(bounds.x) &&
    Number.isFinite(bounds.y) &&
    bounds.height > 0 &&
    bounds.width > 0
  );
}

export function isValidTopologySize(size: TopologySize | null): size is TopologySize {
  return (
    size !== null &&
    Number.isFinite(size.height) &&
    Number.isFinite(size.width) &&
    size.height > 0 &&
    size.width > 0
  );
}

export function isValidTopologyViewport(viewport: TopologyViewport): boolean {
  return (
    Number.isFinite(viewport.x) &&
    Number.isFinite(viewport.y) &&
    Number.isFinite(viewport.zoom) &&
    viewport.zoom > 0
  );
}

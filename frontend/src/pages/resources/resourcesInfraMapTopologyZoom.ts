export const INFRA_MAP_TOPOLOGY_ZOOM = {
  animationMs: 160,
  max: 1.6,
  min: 0.05,
  percentScale: 100,
  stepPercent: 10,
} as const;

export type TopologyZoomDirection = -1 | 1;

export function topologyZoomPercent(zoom: number): number {
  return Math.round(zoom * INFRA_MAP_TOPOLOGY_ZOOM.percentScale);
}

export function topologyZoomLevelFromPercent(percent: number): number {
  return percent / INFRA_MAP_TOPOLOGY_ZOOM.percentScale;
}

export function nextTopologyZoomPercent(
  currentZoom: number,
  direction: TopologyZoomDirection,
): number {
  const currentPercent = topologyZoomPercent(currentZoom);
  const snappedPercent = direction > 0
    ? Math.floor(currentPercent / INFRA_MAP_TOPOLOGY_ZOOM.stepPercent) *
      INFRA_MAP_TOPOLOGY_ZOOM.stepPercent
    : Math.ceil(currentPercent / INFRA_MAP_TOPOLOGY_ZOOM.stepPercent) *
      INFRA_MAP_TOPOLOGY_ZOOM.stepPercent;
  const steppedPercent = snappedPercent + (direction * INFRA_MAP_TOPOLOGY_ZOOM.stepPercent);
  return clampTopologyZoomPercent(steppedPercent);
}

function clampTopologyZoomPercent(percent: number): number {
  const minPercent = topologyZoomPercent(INFRA_MAP_TOPOLOGY_ZOOM.min);
  const maxPercent = topologyZoomPercent(INFRA_MAP_TOPOLOGY_ZOOM.max);
  return Math.max(minPercent, Math.min(maxPercent, percent));
}

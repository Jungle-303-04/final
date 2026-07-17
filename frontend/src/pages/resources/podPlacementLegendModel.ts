import type { InfraMapMetricMode } from "./ResourcesInfraMapMetrics";

export type PodPlacementLegendVariant =
  | "infra-card"
  | "infra-navigator"
  | "infra-topology"
  | "infra-traffic"
  | "physical";

export type LegendMarkKind =
  | "abnormal-card"
  | "capacity-gauge"
  | "dashed-card"
  | "dashed-line"
  | "healthy-dot"
  | "healthy-card"
  | "node-bar"
  | "pod-hex"
  | "pod-hex-size"
  | "pressure-dot"
  | "pressure-card"
  | "solid-line"
  | "traffic-flow"
  | "traffic-node";

export interface LegendItem {
  labelKey:
    | "resources.graph.physical.legend.abnormal"
    | "resources.graph.physical.legend.healthy"
    | "resources.graph.physical.legend.pressure"
    | "resources.graph.physical.legend.unknown"
    | "resources.infraMap.legend.card.nodeCapacity.cpu"
    | "resources.infraMap.legend.card.nodeCapacity.memory"
    | "resources.infraMap.legend.card.unknown"
    | "resources.infraMap.legend.card.usage.cpu"
    | "resources.infraMap.legend.card.usage.memory"
    | "resources.infraMap.legend.status.critical"
    | "resources.infraMap.legend.status.healthy"
    | "resources.infraMap.legend.status.pressure"
    | "resources.infraMap.legend.navigator.edge"
    | "resources.infraMap.legend.navigator.node"
    | "resources.infraMap.legend.navigator.podSize"
    | "resources.infraMap.legend.navigator.podTone.cpu"
    | "resources.infraMap.legend.navigator.podTone.memory"
    | "resources.infraMap.legend.topology.edge"
    | "resources.infraMap.legend.topology.metricUnknown"
    | "resources.infraMap.legend.traffic.flow"
    | "resources.infraMap.legend.traffic.node"
    | "resources.infraMap.legend.traffic.unavailable";
  mark: LegendMarkKind;
}

export function podPlacementLegendItems(
  variant: PodPlacementLegendVariant,
  metricMode: InfraMapMetricMode,
): LegendItem[] {
  if (variant === "infra-topology") {
    return [
      { labelKey: "resources.infraMap.legend.topology.edge", mark: "solid-line" },
      { labelKey: "resources.infraMap.legend.topology.metricUnknown", mark: "dashed-line" },
      { labelKey: "resources.infraMap.legend.navigator.podSize", mark: "pod-hex-size" },
      { labelKey: "resources.infraMap.legend.status.healthy", mark: "healthy-dot" },
      { labelKey: "resources.infraMap.legend.status.pressure", mark: "pressure-dot" },
      { labelKey: "resources.infraMap.legend.status.critical", mark: "abnormal-card" },
    ];
  }
  if (variant === "infra-navigator") {
    return [
      { labelKey: "resources.infraMap.legend.navigator.node", mark: "node-bar" },
      {
        labelKey: metricMode === "cpu"
          ? "resources.infraMap.legend.navigator.podTone.cpu"
          : "resources.infraMap.legend.navigator.podTone.memory",
        mark: "pod-hex",
      },
      { labelKey: "resources.infraMap.legend.navigator.podSize", mark: "pod-hex-size" },
    ];
  }
  if (variant === "infra-traffic") {
    return [
      { labelKey: "resources.infraMap.legend.traffic.flow", mark: "traffic-flow" },
      { labelKey: "resources.infraMap.legend.traffic.node", mark: "traffic-node" },
      { labelKey: "resources.infraMap.legend.traffic.unavailable", mark: "dashed-line" },
    ];
  }
  if (variant === "infra-card") {
    return [
      { labelKey: "resources.infraMap.legend.status.healthy", mark: "healthy-card" },
      {
        labelKey: metricMode === "cpu"
          ? "resources.infraMap.legend.card.usage.cpu"
          : "resources.infraMap.legend.card.usage.memory",
        mark: "pressure-card",
      },
      {
        labelKey: metricMode === "cpu"
          ? "resources.infraMap.legend.card.nodeCapacity.cpu"
          : "resources.infraMap.legend.card.nodeCapacity.memory",
        mark: "capacity-gauge",
      },
      { labelKey: "resources.infraMap.legend.status.critical", mark: "abnormal-card" },
      { labelKey: "resources.infraMap.legend.card.unknown", mark: "dashed-card" },
    ];
  }
  return [
    { labelKey: "resources.graph.physical.legend.healthy", mark: "healthy-card" },
    { labelKey: "resources.graph.physical.legend.pressure", mark: "pressure-card" },
    { labelKey: "resources.graph.physical.legend.abnormal", mark: "abnormal-card" },
    { labelKey: "resources.graph.physical.legend.unknown", mark: "dashed-card" },
  ];
}

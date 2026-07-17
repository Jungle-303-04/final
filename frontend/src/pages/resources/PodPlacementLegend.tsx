import { useI18n } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import type { InfraMapMetricMode } from "./ResourcesInfraMapMetrics";

type PodPlacementLegendVariant = "infra-card" | "infra-navigator" | "infra-topology" | "physical";

export function PodPlacementLegend({
  ariaLabel,
  className,
  dataSlot = "pod-placement-legend",
  metricMode = "cpu",
  variant = "physical",
}: {
  ariaLabel?: string;
  className?: string;
  dataSlot?: string;
  metricMode?: InfraMapMetricMode;
  variant?: PodPlacementLegendVariant;
}) {
  const { t } = useI18n();
  const items = legendItems(variant, metricMode);
  return (
    <aside
      aria-label={ariaLabel ?? t("resources.graph.physical.legend")}
      className={cn(
        "flex min-w-0 flex-nowrap items-center gap-4 overflow-x-auto text-[0.6875rem] text-muted-foreground",
        className,
      )}
      data-slot={dataSlot}
    >
      {items.map((item) => (
        <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap" key={item.labelKey}>
          <LegendMark kind={item.mark} />
          {t(item.labelKey)}
        </span>
      ))}
    </aside>
  );
}

type LegendMarkKind =
  | "abnormal-card"
  | "dashed-card"
  | "dashed-line"
  | "healthy-card"
  | "node-bar"
  | "pod-dot"
  | "pod-size"
  | "pressure-card"
  | "solid-line";

interface LegendItem {
  labelKey:
    | "resources.graph.physical.legend.abnormal"
    | "resources.graph.physical.legend.healthy"
    | "resources.graph.physical.legend.pressure"
    | "resources.graph.physical.legend.unknown"
    | "resources.infraMap.legend.card.unknown"
    | "resources.infraMap.legend.card.usage.cpu"
    | "resources.infraMap.legend.card.usage.memory"
    | "resources.infraMap.legend.navigator.edge"
    | "resources.infraMap.legend.navigator.node"
    | "resources.infraMap.legend.navigator.podSize"
    | "resources.infraMap.legend.navigator.podTone.cpu"
    | "resources.infraMap.legend.navigator.podTone.memory"
    | "resources.infraMap.legend.topology.edge"
    | "resources.infraMap.legend.topology.health"
    | "resources.infraMap.legend.topology.issue"
    | "resources.infraMap.legend.topology.metricUnknown";
  mark: LegendMarkKind;
}

function legendItems(
  variant: PodPlacementLegendVariant,
  metricMode: InfraMapMetricMode,
): LegendItem[] {
  if (variant === "infra-topology") {
    return [
      { labelKey: "resources.infraMap.legend.topology.edge", mark: "solid-line" },
      { labelKey: "resources.infraMap.legend.topology.health", mark: "pod-dot" },
      { labelKey: "resources.infraMap.legend.topology.issue", mark: "abnormal-card" },
      { labelKey: "resources.infraMap.legend.topology.metricUnknown", mark: "dashed-line" },
    ];
  }
  if (variant === "infra-navigator") {
    return [
      { labelKey: "resources.infraMap.legend.navigator.edge", mark: "solid-line" },
      { labelKey: "resources.infraMap.legend.navigator.node", mark: "node-bar" },
      {
        labelKey: metricMode === "cpu"
          ? "resources.infraMap.legend.navigator.podTone.cpu"
          : "resources.infraMap.legend.navigator.podTone.memory",
        mark: "pod-dot",
      },
      { labelKey: "resources.infraMap.legend.navigator.podSize", mark: "pod-size" },
    ];
  }
  if (variant === "infra-card") {
    return [
      { labelKey: "resources.graph.physical.legend.healthy", mark: "healthy-card" },
      {
        labelKey: metricMode === "cpu"
          ? "resources.infraMap.legend.card.usage.cpu"
          : "resources.infraMap.legend.card.usage.memory",
        mark: "pressure-card",
      },
      { labelKey: "resources.graph.physical.legend.abnormal", mark: "abnormal-card" },
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

function LegendMark({ kind }: { kind: LegendMarkKind }) {
  switch (kind) {
    case "solid-line":
      return (
        <svg aria-hidden="true" className="h-3.5 w-6 text-muted-foreground" viewBox="0 0 24 14">
          <line stroke="currentColor" strokeLinecap="round" strokeWidth="2" x1="2" x2="22" y1="7" y2="7" />
        </svg>
      );
    case "dashed-line":
      return (
        <svg aria-hidden="true" className="h-3.5 w-6 text-muted-foreground" viewBox="0 0 24 14">
          <line stroke="currentColor" strokeDasharray="3 3" strokeLinecap="round" strokeWidth="2" x1="2" x2="22" y1="7" y2="7" />
        </svg>
      );
    case "node-bar":
      return (
        <span
          aria-hidden="true"
          className="grid h-3.5 w-5 place-items-center rounded border border-muted-foreground/60 bg-background"
        >
          <span className="h-0.5 w-3 rounded-full bg-muted-foreground/70" />
        </span>
      );
    case "pod-dot":
      return (
        <span aria-hidden="true" className="size-3.5 rounded-full border border-emerald-500/70 bg-emerald-500/60" />
      );
    case "pod-size":
      return (
        <span aria-hidden="true" className="flex h-3.5 w-7 items-center gap-1">
          <span className="size-2 rounded-full border border-emerald-500/70 bg-emerald-500/50" />
          <span className="size-3.5 rounded-full border border-orange-500/70 bg-orange-500/35" />
        </span>
      );
    case "abnormal-card":
      return (
        <span
          aria-hidden="true"
          className="relative size-3.5 rounded border border-destructive/70 bg-destructive/15"
        >
          <span className="absolute -right-1 -top-1 size-2 rounded-full bg-destructive ring-1 ring-background" />
        </span>
      );
    case "dashed-card":
      return (
        <span
          aria-hidden="true"
          className="size-3.5 rounded border border-dashed border-muted-foreground/60 bg-background"
        />
      );
    case "pressure-card":
      return (
        <span
          aria-hidden="true"
          className="size-3.5 rounded border border-orange-500/70 bg-[color-mix(in_oklch,var(--status-warning)_32%,var(--card))]"
        />
      );
    case "healthy-card":
    default:
      return (
        <span
          aria-hidden="true"
          className="size-3.5 rounded border border-emerald-500/70 bg-emerald-500/20"
        />
      );
  }
}

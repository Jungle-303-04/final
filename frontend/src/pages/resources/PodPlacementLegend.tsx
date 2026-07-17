import { useI18n } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import type { InfraMapMetricMode } from "./ResourcesInfraMapMetrics";

type PodPlacementLegendVariant =
  | "infra-card"
  | "infra-navigator"
  | "infra-topology"
  | "infra-traffic"
  | "physical";

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
  | "healthy-dot"
  | "healthy-card"
  | "node-bar"
  | "pod-dot"
  | "pod-hex"
  | "pod-hex-size"
  | "pod-size"
  | "pressure-dot"
  | "pressure-card"
  | "solid-line"
  | "traffic-flow"
  | "traffic-node";

interface LegendItem {
  labelKey:
    | "resources.graph.physical.legend.abnormal"
    | "resources.graph.physical.legend.healthy"
    | "resources.graph.physical.legend.pressure"
    | "resources.graph.physical.legend.unknown"
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

function legendItems(
  variant: PodPlacementLegendVariant,
  metricMode: InfraMapMetricMode,
): LegendItem[] {
  if (variant === "infra-topology") {
    return [
      { labelKey: "resources.infraMap.legend.topology.edge", mark: "solid-line" },
      { labelKey: "resources.infraMap.legend.topology.metricUnknown", mark: "dashed-line" },
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
    case "traffic-flow":
      return (
        <svg aria-hidden="true" className="h-3.5 w-7 text-sky-500" viewBox="0 0 28 14">
          <path
            d="M2 10 C8 2 18 2 26 8"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="3"
          />
        </svg>
      );
    case "traffic-node":
      return (
        <span
          aria-hidden="true"
          className="grid size-3.5 place-items-center rounded border border-sky-500/70 bg-sky-500/20"
        >
          <span className="size-1.5 rounded-full bg-sky-500" />
        </span>
      );
    case "pod-dot":
      return (
        <span aria-hidden="true" className="size-3.5 rounded-full border border-emerald-500/70 bg-emerald-500/60" />
      );
    case "healthy-dot":
      return (
        <span aria-hidden="true" className="size-3.5 rounded-full border border-emerald-500/75 bg-emerald-500/80" />
      );
    case "pressure-dot":
      return (
        <span aria-hidden="true" className="size-3.5 rounded-full border border-orange-500/75 bg-orange-500/80" />
      );
    case "pod-hex":
      return (
        <svg aria-hidden="true" className="size-4 text-emerald-500" viewBox="0 0 16 16">
          <polygon
            fill="currentColor"
            fillOpacity="0.38"
            points="8,1.5 13.6,4.75 13.6,11.25 8,14.5 2.4,11.25 2.4,4.75"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.4"
          />
        </svg>
      );
    case "pod-hex-size":
      return (
        <span aria-hidden="true" className="flex h-4 w-8 items-center gap-1">
          <svg className="size-3 text-emerald-500" viewBox="0 0 16 16">
            <polygon
              fill="currentColor"
              fillOpacity="0.32"
              points="8,1.5 13.6,4.75 13.6,11.25 8,14.5 2.4,11.25 2.4,4.75"
              stroke="currentColor"
              strokeLinejoin="round"
              strokeWidth="1.4"
            />
          </svg>
          <svg className="size-4 text-orange-500" viewBox="0 0 16 16">
            <polygon
              fill="currentColor"
              fillOpacity="0.28"
              points="8,1.5 13.6,4.75 13.6,11.25 8,14.5 2.4,11.25 2.4,4.75"
              stroke="currentColor"
              strokeLinejoin="round"
              strokeWidth="1.4"
            />
          </svg>
        </span>
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

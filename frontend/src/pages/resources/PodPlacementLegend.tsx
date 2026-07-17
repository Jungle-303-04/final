import { useI18n } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import type { InfraMapMetricMode } from "./ResourcesInfraMapMetrics";
import {
  podPlacementLegendItems,
  type LegendMarkKind,
  type PodPlacementLegendVariant,
} from "./podPlacementLegendModel";

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
  const items = podPlacementLegendItems(variant, metricMode);
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
    case "capacity-gauge":
      return (
        <svg aria-hidden="true" className="h-4 w-5" viewBox="0 0 20 16">
          <path d="M3 12 A7 7 0 0 1 17 12 L13.8 12 A3.8 3.8 0 0 0 6.2 12 Z" fill="var(--color-emerald-500)" opacity="0.75" />
          <path d="M10 12 L15 6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
          <circle cx="10" cy="12" fill="currentColor" r="1.4" />
        </svg>
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

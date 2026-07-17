import { type CSSProperties } from "react";

import { useI18n } from "../../shared/i18n";
import type { InfraMapMetricMode } from "./ResourcesInfraMapMetrics";
import type { InfraMapNode } from "./resourcesInfraMapModel";
import {
  infraMapNodePodRatio,
  infraMapNodeSummaryText,
} from "./resourcesInfraMapNodeSummary";
import { infraMapHealthDotClass } from "./resourcesInfraMapPodVisual";
import {
  PERCENT_SCALE,
  POD_RESOURCE_PRESSURE_WARNING_RATIO,
  podUsageColorFromRatio,
} from "./podVisualState";

const GAUGE_CENTER_X = 110;
const GAUGE_CENTER_Y = 102;
const GAUGE_INNER_RADIUS = 46;
const GAUGE_OUTER_RADIUS = 78;
const GAUGE_VIEWBOX_HEIGHT = 136;
const GAUGE_VIEWBOX_WIDTH = 220;
const GAUGE_NEEDLE_INSET = 10;
const GAUGE_BAND_STEP_DEGREES = 4;

const CAPACITY_GAUGE_BANDS = [
  {
    key: "stable",
    color: "var(--color-emerald-500)",
    from: 0,
    to: 0.2,
  },
  {
    key: "comfortable",
    color: "var(--color-teal-300)",
    from: 0.2,
    to: 0.4,
  },
  {
    key: "moderate",
    color: "var(--color-yellow-300)",
    from: 0.4,
    to: 0.6,
  },
  {
    key: "busy",
    color: "var(--color-orange-300)",
    from: 0.6,
    to: POD_RESOURCE_PRESSURE_WARNING_RATIO,
  },
  {
    key: "warning",
    color: "var(--color-orange-500)",
    from: POD_RESOURCE_PRESSURE_WARNING_RATIO,
    to: 1,
  },
] as const;

const CAPACITY_GAUGE_TICKS = [
  0,
  0.2,
  0.4,
  0.6,
  0.8,
  1,
] as const;

interface NodeCapacityMetric {
  label: string;
  ratio: number | null;
  value: string;
}

export function InfraMapNodeCapacityOverview({
  metricMode,
  node,
}: {
  metricMode: InfraMapMetricMode;
  node: InfraMapNode;
}) {
  const { formatNumber, t } = useI18n();
  const summary = infraMapNodeSummaryText(node, { formatNumber, t });
  const cpuMetric = {
    label: t("resources.infraMap.metric.cpu"),
    ratio: node.cpuRatio,
    value: summary.cpu,
  };
  const memoryMetric = {
    label: t("resources.infraMap.metric.memory"),
    ratio: node.memoryRatio,
    value: summary.memory,
  };
  const podMetric = {
    label: t("resources.infraMap.metric.pods"),
    ratio: infraMapNodePodRatio(node),
    value: summary.pods,
  };
  const selectedMetric = metricMode === "cpu" ? cpuMetric : memoryMetric;
  const supportingMetric = metricMode === "cpu" ? memoryMetric : cpuMetric;

  return (
    <div
      className="grid min-w-0 gap-3 rounded-md border bg-background/55 p-3"
      data-slot="infra-map-node-capacity-overview"
    >
      <NodeCapacityGauge metric={selectedMetric} />
      <div
        className="grid min-w-0 grid-cols-3 gap-2"
        data-slot="infra-map-node-capacity-signals"
      >
        <NodeCapacitySignal metric={supportingMetric} />
        <NodePodCapacitySignal metric={podMetric} />
        <NodeStatusSignal node={node} />
      </div>
    </div>
  );
}

function NodeCapacityGauge({ metric }: { metric: NodeCapacityMetric }) {
  const { formatNumber, t } = useI18n();
  const needle = metric.ratio === null
    ? null
    : polarPoint(ratioToDegrees(clampUnitRatio(metric.ratio)), GAUGE_OUTER_RADIUS - GAUGE_NEEDLE_INSET);
  const valueText = metric.ratio === null
    ? t("common.value.unavailable")
    : formatNumber(metric.ratio, { maximumFractionDigits: 0, style: "percent" });
  return (
    <div className="grid min-w-0 justify-items-center gap-1" data-slot="infra-map-node-capacity-gauge">
      <div className="text-[0.625rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {metric.label}
      </div>
      <div className="relative w-full max-w-60">
        <svg
          aria-label={`${metric.label} ${valueText}`}
          className="h-36 w-full overflow-visible"
          role="img"
          viewBox={`0 0 ${GAUGE_VIEWBOX_WIDTH} ${GAUGE_VIEWBOX_HEIGHT}`}
        >
          {CAPACITY_GAUGE_BANDS.map((band) => (
            <path
              key={band.key}
              d={gaugeBandPath(band.from, band.to)}
              fill={band.color}
              opacity="0.82"
            />
          ))}
          {metric.ratio === null ? (
            <path
              className="stroke-muted-foreground/60"
              d={gaugeOuterArcPath(0, 1)}
              fill="none"
              strokeDasharray="4 7"
              strokeLinecap="round"
              strokeWidth={GAUGE_OUTER_RADIUS - GAUGE_INNER_RADIUS}
            />
          ) : null}
          {CAPACITY_GAUGE_TICKS.map((ratio) => (
            <GaugeTick
              key={ratio}
              label={formatNumber(ratio * PERCENT_SCALE, { maximumFractionDigits: 0 })}
              ratio={ratio}
            />
          ))}
          {needle === null ? null : (
            <g>
              <line
                className="stroke-foreground"
                strokeLinecap="round"
                strokeWidth="4"
                x1={GAUGE_CENTER_X}
                x2={needle.x}
                y1={GAUGE_CENTER_Y}
                y2={needle.y}
              />
              <circle
                className="fill-foreground stroke-background"
                cx={GAUGE_CENTER_X}
                cy={GAUGE_CENTER_Y}
                r="5.5"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>
        <div className="absolute inset-x-0 bottom-0 grid justify-items-center">
          <span className="rounded-md bg-background/85 px-2 text-2xl font-semibold tabular-nums text-foreground shadow-xs">
            {valueText}
          </span>
          <span className="mt-0.5 max-w-full truncate text-[0.625rem] text-muted-foreground" title={metric.value}>
            {metric.value}
          </span>
        </div>
      </div>
    </div>
  );
}

function GaugeTick({
  label,
  ratio,
}: {
  label: string;
  ratio: number;
}) {
  const text = polarPoint(ratioToDegrees(ratio), GAUGE_OUTER_RADIUS + 13);
  return (
    <text
      className="fill-muted-foreground text-[0.55rem] tabular-nums"
      dominantBaseline="middle"
      textAnchor="middle"
      x={text.x}
      y={text.y}
    >
      {label}
    </text>
  );
}

function NodeCapacitySignal({ metric }: { metric: NodeCapacityMetric }) {
  const percent = metric.ratio === null ? null : clampUnitRatio(metric.ratio) * PERCENT_SCALE;
  return (
    <div className="grid min-w-0 gap-1 rounded-md border bg-background/45 p-2" data-slot="infra-map-node-capacity-signal">
      <div className="grid min-w-0 gap-0.5 text-[0.625rem]">
        <span className="truncate text-muted-foreground">{metric.label}</span>
        <span className="truncate tabular-nums text-foreground" title={metric.value}>{metric.value}</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        data-metric-available={percent === null ? "false" : "true"}
      >
        {percent === null ? (
          <span className="block h-full rounded-full border border-dashed border-muted-foreground/45" />
        ) : (
          <span
            className="block h-full rounded-full bg-[var(--infra-map-node-signal-color)]"
            style={{
              "--infra-map-node-signal-color": podUsageColorFromRatio(metric.ratio),
              width: `${percent}%`,
            } as CSSProperties}
          />
        )}
      </div>
    </div>
  );
}

function NodePodCapacitySignal({ metric }: { metric: NodeCapacityMetric }) {
  return (
    <div className="grid min-w-0 content-center gap-0.5 rounded-md border bg-background/45 p-2" data-slot="infra-map-node-pod-capacity-signal">
      <div className="grid min-w-0 gap-0.5 text-[0.625rem]">
        <span className="truncate text-muted-foreground">{metric.label}</span>
        <span className="truncate text-sm font-semibold tabular-nums text-foreground" title={metric.value}>
          {metric.value}
        </span>
      </div>
    </div>
  );
}

function NodeStatusSignal({ node }: { node: InfraMapNode }) {
  const { t } = useI18n();
  const statusText = nodeStatusText(node.ready, t);
  return (
    <div className="grid min-w-0 gap-1 rounded-md border bg-background/45 p-2 text-[0.625rem]">
      <span className="truncate text-muted-foreground">{t("resources.table.status")}</span>
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <span aria-hidden="true" className={`size-2 rounded-full ${infraMapHealthDotClass(node.health)}`} />
        <span className="truncate font-medium text-foreground">{statusText}</span>
      </span>
    </div>
  );
}

function nodeStatusText(
  ready: boolean | null,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (ready === true) return t("resources.infraMap.nodeReady");
  if (ready === false) return t("resources.infraMap.nodeNotReady");
  return t("common.state.unknown");
}

function gaugeBandPath(fromRatio: number, toRatio: number): string {
  const startDegrees = ratioToDegrees(fromRatio);
  const endDegrees = ratioToDegrees(toRatio);
  const outerPoints = sampleArcPoints(startDegrees, endDegrees, GAUGE_OUTER_RADIUS);
  const innerPoints = sampleArcPoints(endDegrees, startDegrees, GAUGE_INNER_RADIUS);
  const [firstPoint, ...nextPoints] = [...outerPoints, ...innerPoints];
  if (firstPoint === undefined) return "";
  return [
    "M",
    firstPoint.x,
    firstPoint.y,
    ...nextPoints.flatMap((point) => ["L", point.x, point.y]),
    "Z",
  ].join(" ");
}

function gaugeOuterArcPath(fromRatio: number, toRatio: number): string {
  const points = sampleArcPoints(ratioToDegrees(fromRatio), ratioToDegrees(toRatio), (GAUGE_INNER_RADIUS + GAUGE_OUTER_RADIUS) / 2);
  const [firstPoint, ...nextPoints] = points;
  if (firstPoint === undefined) return "";
  return [
    "M",
    firstPoint.x,
    firstPoint.y,
    ...nextPoints.flatMap((point) => ["L", point.x, point.y]),
  ].join(" ");
}

function sampleArcPoints(
  startDegrees: number,
  endDegrees: number,
  radius: number,
): Array<{ x: number; y: number }> {
  const distance = Math.abs(endDegrees - startDegrees);
  const steps = Math.max(2, Math.ceil(distance / GAUGE_BAND_STEP_DEGREES));
  return Array.from({ length: steps + 1 }, (_, index) => {
    const progress = index / steps;
    const degrees = startDegrees + (endDegrees - startDegrees) * progress;
    return polarPoint(degrees, radius);
  });
}

function polarPoint(degrees: number, radius: number): { x: number; y: number } {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: GAUGE_CENTER_X + radius * Math.cos(radians),
    y: GAUGE_CENTER_Y - radius * Math.sin(radians),
  };
}

function ratioToDegrees(ratio: number): number {
  return 180 - clampUnitRatio(ratio) * 180;
}

function clampUnitRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

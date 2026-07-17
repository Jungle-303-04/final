import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { useI18n } from "../../shared/i18n";
import {
  InfraMapHoverCard,
  InfraMapTooltipHeader,
  InfraMapTooltipRow,
  infraMapHoverFrameFromEvent,
  shouldReuseInfraMapHoverFrame,
  type InfraMapHoverFrame,
} from "./InfraMapHoverCard";
import type { InfraMapMetricMode } from "./ResourcesInfraMapMetrics";
import { PodEvidenceTooltipPanel } from "./PodEvidenceTooltipContent";
import type { InfraMapModel, InfraMapPod } from "./resourcesInfraMapModel";
import {
  infraMapNodePodRatio,
  infraMapNodeSummaryText,
} from "./resourcesInfraMapNodeSummary";
import {
  buildInfraMapNavigatorModel,
  infraMapNavigatorPodVisual,
  type InfraMapNavigatorCluster,
  type InfraMapNavigatorNode,
  type InfraMapNavigatorPod,
} from "./resourcesInfraMapNavigatorModel";
import {
  buildNavigatorHexLayout,
  NAVIGATOR_CANVAS_WIDTH,
  NAVIGATOR_HEX_START_X,
  NAVIGATOR_NODE_RAIL_PADDING,
  NAVIGATOR_NODE_RAIL_WIDTH,
  NAVIGATOR_NODE_RAIL_X,
  NAVIGATOR_PADDING,
  NAVIGATOR_RACK_FIELD_PADDING,
  NAVIGATOR_RACK_GUIDE_COLUMN_WIDTH,
  navigatorHexagonPoints,
  type NavigatorHexLayoutCluster,
  type NavigatorHexLayoutNode,
  type NavigatorHexLayoutPod,
} from "./resourcesInfraMapNavigatorLayout";
import type { PodHealthTone } from "./podVisualState";

const NAVIGATOR_NODE_SUMMARY_START_Y = 74;
const NAVIGATOR_NODE_SUMMARY_X_OFFSET = 22;
const NAVIGATOR_NODE_SUMMARY_BOTTOM_PADDING = 10;
const NAVIGATOR_NODE_SUMMARY_MIN_HEIGHT = 44;
const NAVIGATOR_PERCENT_SCALE = 100;

type NavigatorHoverSubject =
  | { cluster: InfraMapNavigatorCluster; kind: "cluster" }
  | { kind: "node"; node: InfraMapNavigatorNode }
  | { kind: "pod"; pod: InfraMapNavigatorPod };

type HoveredNavigatorSubject = NavigatorHoverSubject & InfraMapHoverFrame;

export function ResourcesInfraMapNavigatorView({
  metricMode,
  model,
  onOpenPod,
}: {
  metricMode: InfraMapMetricMode;
  model: InfraMapModel;
  onOpenPod: (pod: InfraMapPod) => void;
}) {
  const { formatNumber, t } = useI18n();
  const containerRef = useRef<HTMLElement>(null);
  const [hoveredSubject, setHoveredSubject] =
    useState<HoveredNavigatorSubject | null>(null);
  const navigator = useMemo(
    () => buildInfraMapNavigatorModel(model, metricMode),
    [model, metricMode],
  );
  const layout = useMemo(() => buildNavigatorHexLayout(navigator), [navigator]);
  const nodeCount = navigator.clusters.reduce(
    (total, cluster) => total + cluster.nodes.length,
    0,
  );
  const handleHover = (
    event: ReactMouseEvent<SVGGElement>,
    subject: NavigatorHoverSubject,
  ) => {
    const nextHover = {
      ...subject,
      ...infraMapHoverFrameFromEvent(event, containerRef.current),
    };
    setHoveredSubject((current) => {
      if (
        shouldReuseInfraMapHoverFrame({
          current,
          next: nextHover,
          sameSubject: sameNavigatorSubject(current, nextHover),
        })
      ) {
        return current;
      }
      return nextHover;
    });
  };

  return (
    <section
      aria-label={t("resources.infraMap.navigator.aria")}
      className="relative mt-5 min-h-[28rem] overflow-hidden rounded-lg border border-dashed bg-[linear-gradient(to_bottom,color-mix(in_oklch,var(--muted)_28%,transparent),transparent)]"
      data-slot="resources-infra-map-navigator"
      ref={containerRef}
    >
      <div className="absolute right-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2 rounded-lg border bg-background/86 px-3 py-2 text-[0.6875rem] text-muted-foreground shadow-sm backdrop-blur">
        <NavigatorGuideRow
          label={t("resources.infraMap.topology.cluster")}
          value={formatNumber(navigator.clusters.length)}
        />
        <NavigatorGuideRow
          label={t("resources.infraMap.nodeKind")}
          value={formatNumber(nodeCount)}
        />
        <NavigatorGuideRow
          label={t("resources.infraMap.metric.pods")}
          value={formatNumber(navigator.podCount)}
        />
      </div>

      <div className="h-[28rem] overflow-auto">
        <svg
          aria-label={t("resources.infraMap.navigator.aria")}
          className="block min-h-full min-w-full"
          data-slot="resources-infra-map-navigator-canvas"
          role="img"
          style={{ height: layout.height, width: layout.width }}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
        >
          <defs>
            <pattern
              height="18"
              id="infra-map-navigator-grid"
              patternUnits="userSpaceOnUse"
              width="18"
            >
              <path
                className="stroke-muted-foreground"
                d="M 18 0 L 0 0 0 18"
                fill="none"
                opacity="0.08"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect
            fill="url(#infra-map-navigator-grid)"
            height={layout.height}
            width={layout.width}
            x="0"
            y="0"
          />
          {layout.clusters.map((cluster) => (
            <NavigatorClusterBand
              cluster={cluster}
              formatNumber={formatNumber}
              key={cluster.cluster.cluster.id}
              metricMode={metricMode}
              onHover={handleHover}
              onLeave={() => setHoveredSubject(null)}
              onOpenPod={onOpenPod}
              t={t}
            />
          ))}
        </svg>
      </div>
      {hoveredSubject ? (
        <NavigatorHoverCard hover={hoveredSubject} />
      ) : null}
    </section>
  );
}

function NavigatorClusterBand({
  cluster,
  formatNumber,
  metricMode,
  onHover,
  onLeave,
  onOpenPod,
  t,
}: {
  cluster: NavigatorHexLayoutCluster;
  formatNumber: ReturnType<typeof useI18n>["formatNumber"];
  metricMode: InfraMapMetricMode;
  onHover: (event: ReactMouseEvent<SVGGElement>, subject: NavigatorHoverSubject) => void;
  onLeave: () => void;
  onOpenPod: (pod: InfraMapPod) => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  return (
    <g data-cluster-id={cluster.cluster.cluster.id} data-slot="infra-map-navigator-cluster">
      <g
        className="cursor-help"
        data-slot="infra-map-navigator-cluster-hub"
        onMouseEnter={(event) => onHover(event, { cluster: cluster.cluster, kind: "cluster" })}
        onMouseLeave={onLeave}
        onMouseMove={(event) => onHover(event, { cluster: cluster.cluster, kind: "cluster" })}
      >
        <title>{clusterTitle(cluster.cluster, formatNumber, t)}</title>
        <text
          className="fill-muted-foreground text-[10px] font-medium uppercase tracking-[0.18em]"
          x={NAVIGATOR_NODE_RAIL_X}
          y={cluster.headerY}
        >
          {t("resources.infraMap.topology.cluster")}
        </text>
        <text
          className="fill-foreground text-sm font-semibold"
          x={NAVIGATOR_NODE_RAIL_X}
          y={cluster.headerY + 19}
        >
          {cluster.cluster.cluster.name}
        </text>
        <text
          className="fill-muted-foreground text-[11px]"
          x={NAVIGATOR_HEX_START_X}
          y={cluster.headerY + 19}
        >
          {t("resources.infraMap.topology.clusterSummary", {
            errors: formatNumber(cluster.cluster.cluster.criticalCount),
            nodes: formatNumber(cluster.cluster.cluster.nodeCount),
            pods: formatNumber(cluster.cluster.cluster.podCount),
            warnings: formatNumber(cluster.cluster.cluster.warningCount),
          })}
        </text>
      </g>
      {cluster.nodes.map((node) => (
        <NavigatorNodeRow
          formatNumber={formatNumber}
          key={node.node.node.id}
          metricMode={metricMode}
          node={node}
          onHover={onHover}
          onLeave={onLeave}
          onOpenPod={onOpenPod}
          t={t}
        />
      ))}
    </g>
  );
}

function NavigatorNodeRow({
  formatNumber,
  metricMode,
  node,
  onHover,
  onLeave,
  onOpenPod,
  t,
}: {
  formatNumber: ReturnType<typeof useI18n>["formatNumber"];
  metricMode: InfraMapMetricMode;
  node: NavigatorHexLayoutNode;
  onHover: (event: ReactMouseEvent<SVGGElement>, subject: NavigatorHoverSubject) => void;
  onLeave: () => void;
  onOpenPod: (pod: InfraMapPod) => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const railHeight = Math.max(0, node.rowHeight - NAVIGATOR_NODE_RAIL_PADDING * 2);
  const railY = node.y + NAVIGATOR_NODE_RAIL_PADDING;
  const nodeColor = healthColor(node.node.node.health);
  const laneX = NAVIGATOR_NODE_RAIL_X + NAVIGATOR_NODE_RAIL_WIDTH + 18;
  const laneY = node.y + NAVIGATOR_NODE_RAIL_PADDING;
  const laneWidth = NAVIGATOR_CANVAS_WIDTH - laneX - NAVIGATOR_PADDING;
  const laneHeight = railHeight;
  const summaryY = railY + NAVIGATOR_NODE_SUMMARY_START_Y;
  const summaryHeight = Math.max(
    NAVIGATOR_NODE_SUMMARY_MIN_HEIGHT,
    railY + railHeight - summaryY - NAVIGATOR_NODE_SUMMARY_BOTTOM_PADDING,
  );
  return (
    <g data-node-id={node.node.node.id} data-slot="infra-map-navigator-node">
      <rect
        className="fill-background/45 stroke-border"
        height={node.rowHeight}
        rx="14"
        strokeWidth="1"
        width={NAVIGATOR_CANVAS_WIDTH - NAVIGATOR_PADDING * 2}
        x={NAVIGATOR_PADDING}
        y={node.y}
      />
      <rect
        className="fill-muted/10 stroke-border"
        height={laneHeight}
        opacity="0.9"
        rx="10"
        strokeDasharray="4 5"
        strokeWidth="1"
        width={laneWidth}
        x={laneX}
        y={laneY}
      />
      <NavigatorRackGuideLines
        height={laneHeight}
        width={laneWidth}
        x={laneX}
        y={laneY}
      />
      <line
        className="stroke-muted-foreground"
        opacity="0.24"
        strokeLinecap="round"
        x1={NAVIGATOR_NODE_RAIL_X + NAVIGATOR_NODE_RAIL_WIDTH}
        x2={laneX}
        y1={railY + railHeight / 2}
        y2={railY + railHeight / 2}
      />
      <g
        className="cursor-help outline-none"
        data-slot="infra-map-navigator-node-rack"
        onMouseEnter={(event) => onHover(event, { kind: "node", node: node.node })}
        onMouseLeave={onLeave}
        onMouseMove={(event) => onHover(event, { kind: "node", node: node.node })}
      >
        <title>{nodeTitle(node.node, formatNumber, t)}</title>
        <rect
          className="fill-background"
          height={railHeight}
          rx="10"
          stroke={nodeColor}
          strokeOpacity="0.68"
          strokeWidth="1.3"
          width={NAVIGATOR_NODE_RAIL_WIDTH}
          x={NAVIGATOR_NODE_RAIL_X}
          y={railY}
        />
        <rect
          fill={nodeColor}
          height={railHeight - 18}
          opacity="0.86"
          rx="3"
          width="5"
          x={NAVIGATOR_NODE_RAIL_X + 10}
          y={railY + 9}
        />
        <g
          className="stroke-muted-foreground"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          transform={`translate(${NAVIGATOR_NODE_RAIL_X + 25} ${railY + 16})`}
        >
          <rect height="8" rx="2" width="18" x="0" y="0" />
          <rect height="8" rx="2" width="18" x="0" y="13" />
          <path d="M4 4h.01M4 17h.01" />
        </g>
        <foreignObject
          height="56"
          width={NAVIGATOR_NODE_RAIL_WIDTH - 54}
          x={NAVIGATOR_NODE_RAIL_X + 52}
          y={railY + 9}
        >
          <div
            className="grid min-w-0 gap-0.5 text-left leading-tight"
          >
            <p className="truncate text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {t("resources.infraMap.nodeKind")}
            </p>
            <p className="truncate text-xs font-semibold text-foreground">
              {node.node.node.name}
            </p>
            <p className="truncate text-[10px] text-muted-foreground">
              {node.node.node.ready === null
                ? t("common.state.unknown")
                : node.node.node.ready
                ? t("resources.infraMap.nodeReady")
                : t("resources.infraMap.nodeNotReady")}
            </p>
          </div>
        </foreignObject>
        <foreignObject
          height={summaryHeight}
          width={NAVIGATOR_NODE_RAIL_WIDTH - NAVIGATOR_NODE_SUMMARY_X_OFFSET * 2}
          x={NAVIGATOR_NODE_RAIL_X + NAVIGATOR_NODE_SUMMARY_X_OFFSET}
          y={summaryY}
        >
          <NavigatorNodeSummary
            formatNumber={formatNumber}
            node={node.node.node}
            t={t}
          />
        </foreignObject>
      </g>
      <text
        className="fill-muted-foreground text-[10px] tabular-nums"
        textAnchor="end"
        x={NAVIGATOR_CANVAS_WIDTH - NAVIGATOR_PADDING - 4}
        y={laneY + 15}
      >
        {t("resources.infraMap.metric.pods")} {formatNumber(node.node.pods.length)}
      </text>
      {node.hexes.map((hex) => (
        <NavigatorPodHex
          formatNumber={formatNumber}
          hex={hex}
          key={hex.pod.pod.id}
          metricMode={metricMode}
          onHover={onHover}
          onLeave={onLeave}
          onOpenPod={onOpenPod}
          t={t}
        />
      ))}
    </g>
  );
}

function NavigatorRackGuideLines({
  height,
  width,
  x,
  y,
}: {
  height: number;
  width: number;
  x: number;
  y: number;
}) {
  const guideCount = Math.max(1, Math.floor(width / NAVIGATOR_RACK_GUIDE_COLUMN_WIDTH));
  return (
    <g aria-hidden="true" className="stroke-muted-foreground" opacity="0.11">
      {Array.from({ length: guideCount }, (_, index) => {
        const guideX =
          x +
          NAVIGATOR_RACK_FIELD_PADDING +
          ((width - NAVIGATOR_RACK_FIELD_PADDING * 2) * (index + 1)) /
            (guideCount + 1);
        return (
          <line
            key={guideX}
            strokeDasharray="2 8"
            strokeLinecap="round"
            x1={guideX}
            x2={guideX}
            y1={y + 12}
            y2={y + height - 12}
          />
        );
      })}
    </g>
  );
}

function NavigatorNodeSummary({
  formatNumber,
  node,
  t,
}: {
  formatNumber: ReturnType<typeof useI18n>["formatNumber"];
  node: InfraMapNavigatorNode["node"];
  t: ReturnType<typeof useI18n>["t"];
}) {
  const summary = infraMapNodeSummaryText(node, { formatNumber, t });
  return (
    <div
      className="grid h-full min-w-0 content-center gap-1 overflow-hidden"
      data-slot="infra-map-navigator-node-summary"
    >
      <NavigatorNodeSummaryMetric
        label={t("resources.infraMap.metric.cpu")}
        ratio={node.cpuRatio}
        valueText={summary.cpu}
      />
      <NavigatorNodeSummaryMetric
        label={t("resources.infraMap.metric.memory")}
        ratio={node.memoryRatio}
        valueText={summary.memory}
      />
      <NavigatorNodeSummaryMetric
        label={t("resources.infraMap.metric.pods")}
        ratio={infraMapNodePodRatio(node)}
        valueText={summary.pods}
      />
    </div>
  );
}

function NavigatorNodeSummaryMetric({
  label,
  ratio,
  valueText,
}: {
  label: string;
  ratio: number | null;
  valueText: string;
}) {
  const fillPercent = ratio === null
    ? null
    : clampNavigatorPercent(ratio * NAVIGATOR_PERCENT_SCALE);
  return (
    <div className="grid min-w-0 grid-cols-[2.45rem_minmax(0,1fr)_3.3rem] items-center gap-1.5 text-[8px] leading-none">
      <span className="truncate text-muted-foreground">{label}</span>
      <span
        aria-label={`${label} ${valueText}`}
        className="h-1.5 overflow-hidden rounded-full bg-muted/50"
        role="img"
      >
        {fillPercent === null ? (
          <span className="block h-full rounded-full border border-dashed border-muted-foreground/45" />
        ) : (
          <span
            className="block h-full rounded-full bg-primary/80"
            style={{ width: `${fillPercent}%` }}
          />
        )}
      </span>
      <span className="truncate text-right tabular-nums text-muted-foreground" title={valueText}>
        {valueText}
      </span>
    </div>
  );
}

function NavigatorPodHex({
  formatNumber,
  hex,
  metricMode,
  onHover,
  onLeave,
  onOpenPod,
  t,
}: {
  formatNumber: ReturnType<typeof useI18n>["formatNumber"];
  hex: NavigatorHexLayoutPod;
  metricMode: InfraMapMetricMode;
  onHover: (event: ReactMouseEvent<SVGGElement>, subject: NavigatorHoverSubject) => void;
  onLeave: () => void;
  onOpenPod: (pod: InfraMapPod) => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const visual = infraMapNavigatorPodVisual(hex.pod.pod, metricMode);
  return (
    <g
      aria-label={podTitle(hex.pod, metricMode, formatNumber, t)}
      className="cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-health-tone={hex.pod.healthTone}
      data-pod-id={hex.pod.pod.id}
      data-slot="infra-map-navigator-pod"
      data-usage-tone={hex.pod.pressureTone}
      onClick={() => onOpenPod(hex.pod.pod)}
      onKeyDown={(event) => handlePodKeyDown(event, () => onOpenPod(hex.pod.pod))}
      onMouseEnter={(event) => onHover(event, { kind: "pod", pod: hex.pod })}
      onMouseLeave={onLeave}
      onMouseMove={(event) => onHover(event, { kind: "pod", pod: hex.pod })}
      role="button"
      tabIndex={0}
    >
      <title>{podTitle(hex.pod, metricMode, formatNumber, t)}</title>
      <polygon
        fill={visual.fill}
        fillOpacity={hex.pod.pressureTone === "unknown" ? 0.18 : 0.48}
        points={navigatorHexagonPoints(hex.center, hex.radius)}
        stroke={visual.stroke}
        strokeDasharray={visual.strokeDasharray}
        strokeLinejoin="round"
        strokeWidth={hex.pod.healthTone === "critical" ? 2.4 : 1.35}
      />
      {hex.radius >= 12 && hex.pod.ratio !== null ? (
        <text
          className="pointer-events-none fill-foreground text-[8px] font-semibold tabular-nums"
          textAnchor="middle"
          x={hex.center.x}
          y={hex.center.y + 2.5}
        >
          {formatNumber(hex.pod.ratio, { maximumFractionDigits: 0, style: "percent" })}
        </text>
      ) : null}
    </g>
  );
}

function NavigatorHoverCard({
  hover,
}: {
  hover: HoveredNavigatorSubject;
}) {
  return (
    <InfraMapHoverCard
      dataSlot="infra-map-navigator-hover-card"
      frame={hover}
    >
      {hover.kind === "cluster" ? (
        <NavigatorClusterHoverContent cluster={hover.cluster} />
      ) : hover.kind === "node" ? (
        <NavigatorNodeHoverContent node={hover.node} />
      ) : (
        <NavigatorPodHoverContent pod={hover.pod} />
      )}
    </InfraMapHoverCard>
  );
}

function NavigatorClusterHoverContent({
  cluster,
}: {
  cluster: InfraMapNavigatorCluster;
}) {
  const { formatNumber, t } = useI18n();
  return (
    <>
      <InfraMapTooltipHeader
        eyebrow={t("resources.infraMap.topology.cluster")}
        title={cluster.cluster.name}
      />
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-3 py-2.5 text-[0.6875rem]">
        <InfraMapTooltipRow
          label={t("resources.infraMap.nodeKind")}
          value={formatNumber(cluster.cluster.nodeCount)}
        />
        <InfraMapTooltipRow
          label={t("resources.infraMap.metric.pods")}
          value={formatNumber(cluster.cluster.podCount)}
        />
        <InfraMapTooltipRow label={t("status.tone.warning")} value={formatNumber(cluster.cluster.warningCount)} />
        <InfraMapTooltipRow label={t("clusterScope.stage.error")} value={formatNumber(cluster.cluster.criticalCount)} />
      </dl>
    </>
  );
}

function NavigatorNodeHoverContent({
  node,
}: {
  node: InfraMapNavigatorNode;
}) {
  const { formatNumber, t } = useI18n();
  const summary = infraMapNodeSummaryText(node.node, { formatNumber, t });
  return (
    <>
      <InfraMapTooltipHeader
        eyebrow={t("resources.infraMap.nodeKind")}
        title={node.node.name}
      />
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-3 py-2.5 text-[0.6875rem]">
        <InfraMapTooltipRow
          label={t("resources.table.status")}
          value={node.node.ready === null
            ? t("common.state.unknown")
            : node.node.ready
            ? t("resources.infraMap.nodeReady")
            : t("resources.infraMap.nodeNotReady")}
        />
        <InfraMapTooltipRow label={t("resources.infraMap.metric.pods")} value={summary.pods} />
        <InfraMapTooltipRow label={t("resources.infraMap.metric.cpu")} value={summary.cpu} />
        <InfraMapTooltipRow label={t("resources.infraMap.metric.memory")} value={summary.memory} />
      </dl>
    </>
  );
}

function NavigatorPodHoverContent({
  pod,
}: {
  pod: InfraMapNavigatorPod;
}) {
  const { formatNumber } = useI18n();
  return (
    <PodEvidenceTooltipPanel
      pod={{
        cpuMillicores: pod.pod.cpu.value,
        cpuRequestMillicores: pod.pod.cpu.request,
        memoryMebibytes: pod.pod.memory.value,
        memoryRequestMebibytes: pod.pod.memory.request,
        name: pod.pod.name,
        namespace: pod.pod.namespace,
        phase: pod.pod.phase,
        restartCount: pod.pod.restartCount,
        usagePercent: pod.pod.usagePercent,
      }}
      usageText={pod.ratio === null
        ? null
        : formatNumber(pod.ratio, { maximumFractionDigits: 1, style: "percent" })}
    />
  );
}

function NavigatorGuideRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate">{label}</span>
      <span className="font-medium tabular-nums text-foreground">{value}</span>
    </span>
  );
}

function sameNavigatorSubject(
  current: HoveredNavigatorSubject | null,
  next: HoveredNavigatorSubject,
): boolean {
  if (current === null || current.kind !== next.kind) return false;
  if (next.kind === "cluster") {
    return current.kind === "cluster" && current.cluster.cluster.id === next.cluster.cluster.id;
  }
  if (next.kind === "node") {
    return current.kind === "node" && current.node.node.id === next.node.node.id;
  }
  return current.kind === "pod" && current.pod.pod.id === next.pod.pod.id;
}

function handlePodKeyDown(event: KeyboardEvent<SVGGElement>, callback: () => void) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  callback();
}

function clampNavigatorPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(NAVIGATOR_PERCENT_SCALE, value));
}

function healthColor(tone: string): string {
  const normalized = normalizeNodeHealthTone(tone);
  const color: Record<PodHealthTone, string> = {
    critical: "var(--destructive)",
    healthy: "var(--color-emerald-500)",
    unknown: "var(--muted-foreground)",
    warning: "var(--status-warning)",
  };
  return color[normalized];
}

function normalizeNodeHealthTone(tone: string): PodHealthTone {
  if (tone === "critical" || tone === "healthy" || tone === "warning") {
    return tone;
  }
  return "unknown";
}

function clusterTitle(
  cluster: InfraMapNavigatorCluster,
  formatNumber: ReturnType<typeof useI18n>["formatNumber"],
  t: ReturnType<typeof useI18n>["t"],
): string {
  return [
    `${t("resources.infraMap.topology.cluster")}: ${cluster.cluster.name}`,
    `${t("resources.infraMap.nodeKind")}: ${formatNumber(cluster.cluster.nodeCount)}`,
    `${t("resources.infraMap.metric.pods")}: ${formatNumber(cluster.cluster.podCount)}`,
  ].join("\n");
}

function nodeTitle(
  node: InfraMapNavigatorNode,
  formatNumber: ReturnType<typeof useI18n>["formatNumber"],
  t: ReturnType<typeof useI18n>["t"],
): string {
  const summary = infraMapNodeSummaryText(node.node, { formatNumber, t });
  return [
    `${t("resources.infraMap.nodeKind")}: ${node.node.name}`,
    `${t("resources.infraMap.metric.pods")}: ${summary.pods}`,
    `${t("resources.infraMap.metric.cpu")}: ${summary.cpu}`,
    `${t("resources.infraMap.metric.memory")}: ${summary.memory}`,
    node.node.ready === null
      ? t("common.state.unknown")
      : node.node.ready
      ? t("resources.infraMap.nodeReady")
      : t("resources.infraMap.nodeNotReady"),
  ].join("\n");
}

function podTitle(
  pod: InfraMapNavigatorPod,
  metricMode: InfraMapMetricMode,
  formatNumber: ReturnType<typeof useI18n>["formatNumber"],
  t: ReturnType<typeof useI18n>["t"],
): string {
  const metricLabel = metricMode === "cpu"
    ? t("resources.infraMap.metric.cpu")
    : t("resources.infraMap.metric.memory");
  const usageText = pod.ratio === null
    ? t("common.value.unavailable")
    : formatNumber(pod.ratio, { maximumFractionDigits: 1, style: "percent" });
  return [
    pod.pod.name,
    pod.pod.namespace ? `${pod.pod.namespace} / ${pod.pod.phase}` : pod.pod.phase,
    `${metricLabel}: ${usageText}`,
  ].join("\n");
}

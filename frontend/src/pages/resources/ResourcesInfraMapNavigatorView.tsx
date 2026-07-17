import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { useI18n } from "../../shared/i18n";
import type { InfraMapMetricMode } from "./ResourcesInfraMapMetrics";
import { ratioSplitText } from "./ResourcesInfraMapMetrics";
import { PodEvidenceTooltipPanel } from "./PodEvidenceTooltipContent";
import type { InfraMapModel, InfraMapPod } from "./resourcesInfraMapModel";
import {
  buildInfraMapNavigatorModel,
  infraMapNavigatorPodVisual,
  type InfraMapNavigatorCluster,
  type InfraMapNavigatorNode,
  type InfraMapNavigatorPod,
} from "./resourcesInfraMapNavigatorModel";

const NAVIGATOR_CANVAS_WIDTH = 980;
const NAVIGATOR_CLUSTER_HEADER_HEIGHT = 42;
const NAVIGATOR_CLUSTER_GAP = 28;
const NAVIGATOR_NODE_ROW_MIN_HEIGHT = 126;
const NAVIGATOR_NODE_ROW_GAP = 18;
const NAVIGATOR_PADDING = 28;
const NAVIGATOR_NODE_RAIL_X = 42;
const NAVIGATOR_NODE_RAIL_WIDTH = 44;
const NAVIGATOR_NODE_RAIL_PADDING = 12;
const NAVIGATOR_HEX_START_X = 134;
const NAVIGATOR_HEX_TOP_PADDING = 30;
const NAVIGATOR_HEX_COLUMN_STEP = 26;
const NAVIGATOR_HEX_ROW_STEP = 23;
const NAVIGATOR_HEX_ROW_OFFSET = NAVIGATOR_HEX_COLUMN_STEP / 2;
const NAVIGATOR_HEX_RADIUS_SCALE = 1.55;
const NAVIGATOR_HEX_RADIUS_MIN = 8;
const NAVIGATOR_HEX_RADIUS_MAX = 15;
const NAVIGATOR_HOVER_CARD_WIDTH = 288;
const NAVIGATOR_HOVER_EDGE_PADDING = 8;
const NAVIGATOR_HOVER_GAP = 14;

type NavigatorHoverSubject =
  | { cluster: InfraMapNavigatorCluster; kind: "cluster" }
  | { kind: "node"; node: InfraMapNavigatorNode }
  | { kind: "pod"; pod: InfraMapNavigatorPod };

type HoveredNavigatorSubject = NavigatorHoverSubject & {
  height: number;
  width: number;
  x: number;
  y: number;
};

interface NavigatorHexLayoutPod {
  center: { x: number; y: number };
  pod: InfraMapNavigatorPod;
  radius: number;
}

interface NavigatorHexLayoutNode {
  hexes: NavigatorHexLayoutPod[];
  node: InfraMapNavigatorNode;
  rowHeight: number;
  y: number;
}

interface NavigatorHexLayoutCluster {
  cluster: InfraMapNavigatorCluster;
  headerY: number;
  nodes: NavigatorHexLayoutNode[];
  y: number;
}

interface NavigatorHexLayout {
  clusters: NavigatorHexLayoutCluster[];
  height: number;
  width: number;
}

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
  const layout = useMemo(() => navigatorHexLayout(navigator), [navigator]);
  const nodeCount = navigator.clusters.reduce(
    (total, cluster) => total + cluster.nodes.length,
    0,
  );
  const handleHover = (
    event: ReactMouseEvent<SVGGElement>,
    subject: NavigatorHoverSubject,
  ) => {
    const rect = containerRef.current?.getBoundingClientRect();
    setHoveredSubject({
      ...subject,
      height: rect?.height ?? 0,
      width: rect?.width ?? 0,
      x: rect ? event.clientX - rect.left : event.clientX,
      y: rect ? event.clientY - rect.top : event.clientY,
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
  return (
    <g data-node-id={node.node.node.id} data-slot="infra-map-navigator-node">
      <rect
        className="fill-muted/20"
        height={node.rowHeight}
        rx="12"
        width={NAVIGATOR_CANVAS_WIDTH - NAVIGATOR_PADDING * 2}
        x={NAVIGATOR_PADDING}
        y={node.y}
      />
      <line
        className="stroke-border"
        opacity="0.72"
        x1={NAVIGATOR_HEX_START_X - 24}
        x2={NAVIGATOR_CANVAS_WIDTH - NAVIGATOR_PADDING}
        y1={node.y}
        y2={node.y}
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
          fill={nodeColor}
          fillOpacity="0.28"
          height={railHeight}
          rx="5"
          stroke={nodeColor}
          strokeWidth="1.4"
          width={NAVIGATOR_NODE_RAIL_WIDTH}
          x={NAVIGATOR_NODE_RAIL_X}
          y={railY}
        />
        <text
          className="pointer-events-none fill-foreground text-[11px] font-medium"
          textAnchor="middle"
          transform={`translate(${NAVIGATOR_NODE_RAIL_X + NAVIGATOR_NODE_RAIL_WIDTH / 2} ${railY + railHeight / 2}) rotate(-90)`}
        >
          {node.node.node.name}
        </text>
      </g>
      <text
        className="fill-muted-foreground text-[10px] tabular-nums"
        textAnchor="end"
        x={NAVIGATOR_CANVAS_WIDTH - NAVIGATOR_PADDING - 4}
        y={node.y + 18}
      >
        {formatNumber(node.node.pods.length)}
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
        points={hexagonPoints(hex.center, hex.radius)}
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
  const cardWidth = Math.min(
    NAVIGATOR_HOVER_CARD_WIDTH,
    Math.max(0, hover.width - NAVIGATOR_HOVER_EDGE_PADDING * 2),
  );
  const maxLeft = Math.max(
    NAVIGATOR_HOVER_EDGE_PADDING,
    hover.width - cardWidth - NAVIGATOR_HOVER_EDGE_PADDING,
  );
  const left = Math.min(
    Math.max(NAVIGATOR_HOVER_EDGE_PADDING, hover.x + NAVIGATOR_HOVER_GAP),
    maxLeft,
  );
  const placeAbove = hover.height > 0 && hover.y > hover.height / 2;
  const verticalOffset = placeAbove
    ? Math.max(NAVIGATOR_HOVER_EDGE_PADDING, hover.height - hover.y + NAVIGATOR_HOVER_GAP)
    : Math.max(NAVIGATOR_HOVER_EDGE_PADDING, hover.y + NAVIGATOR_HOVER_GAP);

  return (
    <div
      className="pointer-events-none absolute z-50 w-72 max-w-[calc(100%-1rem)] overflow-hidden rounded-md bg-foreground text-background shadow-lg"
      data-slot="infra-map-navigator-hover-card"
      role="tooltip"
      style={{
        bottom: placeAbove ? verticalOffset : undefined,
        left,
        maxHeight: "calc(100% - 1rem)",
        top: placeAbove ? undefined : verticalOffset,
        width: cardWidth || undefined,
      }}
    >
      {hover.kind === "cluster" ? (
        <NavigatorClusterHoverContent cluster={hover.cluster} />
      ) : hover.kind === "node" ? (
        <NavigatorNodeHoverContent node={hover.node} />
      ) : (
        <NavigatorPodHoverContent pod={hover.pod} />
      )}
    </div>
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
      <NavigatorTooltipHeader
        eyebrow={t("resources.infraMap.topology.cluster")}
        title={cluster.cluster.name}
      />
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-3 py-2.5 text-[0.6875rem]">
        <NavigatorTooltipRow
          label={t("resources.infraMap.nodeKind")}
          value={formatNumber(cluster.cluster.nodeCount)}
        />
        <NavigatorTooltipRow
          label={t("resources.infraMap.metric.pods")}
          value={formatNumber(cluster.cluster.podCount)}
        />
        <NavigatorTooltipRow label={t("status.tone.warning")} value={formatNumber(cluster.cluster.warningCount)} />
        <NavigatorTooltipRow label={t("clusterScope.stage.error")} value={formatNumber(cluster.cluster.criticalCount)} />
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
  const cpuText = node.node.cpuRatio === null
    ? t("common.value.unavailable")
    : ratioSplitText(node.node.cpuRatio, formatNumber);
  const memoryText = node.node.memoryRatio === null
    ? t("common.value.unavailable")
    : ratioSplitText(node.node.memoryRatio, formatNumber);
  return (
    <>
      <NavigatorTooltipHeader
        eyebrow={t("resources.infraMap.nodeKind")}
        title={node.node.name}
      />
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-3 py-2.5 text-[0.6875rem]">
        <NavigatorTooltipRow
          label={t("resources.table.status")}
          value={node.node.ready === null
            ? t("common.state.unknown")
            : node.node.ready
            ? t("resources.infraMap.nodeReady")
            : t("resources.infraMap.nodeNotReady")}
        />
        <NavigatorTooltipRow
          label={t("resources.infraMap.metric.pods")}
          value={formatNumber(node.node.assignedPodCount)}
        />
        <NavigatorTooltipRow label={t("resources.infraMap.metric.cpu")} value={cpuText} />
        <NavigatorTooltipRow label={t("resources.infraMap.metric.memory")} value={memoryText} />
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

function NavigatorTooltipHeader({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="border-b border-background/15 px-3 py-2.5">
      <p className="text-[0.625rem] font-medium uppercase tracking-[0.14em] text-background/65">
        {eyebrow}
      </p>
      <p className="mt-0.5 break-all text-xs font-semibold leading-snug">{title}</p>
    </div>
  );
}

function NavigatorTooltipRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <>
      <dt className="text-background/65">{label}</dt>
      <dd className="min-w-0 text-right font-medium tabular-nums">{value}</dd>
    </>
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

function navigatorHexLayout(navigator: ReturnType<typeof buildInfraMapNavigatorModel>): NavigatorHexLayout {
  const maxColumns = navigatorHexColumnCount();
  let cursorY = NAVIGATOR_PADDING;
  const clusters = navigator.clusters.map((cluster) => {
    const clusterY = cursorY;
    const headerY = cursorY + 14;
    cursorY += NAVIGATOR_CLUSTER_HEADER_HEIGHT;
    const nodes = cluster.nodes.map((node) => {
      const rows = Math.max(1, Math.ceil(node.pods.length / maxColumns));
      const rowHeight = Math.max(
        NAVIGATOR_NODE_ROW_MIN_HEIGHT,
        NAVIGATOR_HEX_TOP_PADDING * 2 + rows * NAVIGATOR_HEX_ROW_STEP,
      );
      const rowY = cursorY;
      cursorY += rowHeight + NAVIGATOR_NODE_ROW_GAP;
      return {
        hexes: node.pods.map((pod, podIndex) => {
          const row = Math.floor(podIndex / maxColumns);
          const column = podIndex % maxColumns;
          return {
            center: {
              x: NAVIGATOR_HEX_START_X +
                column * NAVIGATOR_HEX_COLUMN_STEP +
                (row % 2 === 1 ? NAVIGATOR_HEX_ROW_OFFSET : 0),
              y: rowY + NAVIGATOR_HEX_TOP_PADDING + row * NAVIGATOR_HEX_ROW_STEP,
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
    height: Math.max(420, cursorY + NAVIGATOR_PADDING),
    width: NAVIGATOR_CANVAS_WIDTH,
  };
}

function navigatorHexColumnCount(): number {
  return Math.max(
    1,
    Math.floor(
      (NAVIGATOR_CANVAS_WIDTH - NAVIGATOR_HEX_START_X - NAVIGATOR_PADDING) /
        NAVIGATOR_HEX_COLUMN_STEP,
    ),
  );
}

function navigatorHexRadius(pod: InfraMapNavigatorPod): number {
  return Math.max(
    NAVIGATOR_HEX_RADIUS_MIN,
    Math.min(NAVIGATOR_HEX_RADIUS_MAX, pod.radius * NAVIGATOR_HEX_RADIUS_SCALE),
  );
}

function hexagonPoints(center: { x: number; y: number }, radius: number): string {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = -Math.PI / 2 + index * (Math.PI / 3);
    return `${center.x + Math.cos(angle) * radius},${center.y + Math.sin(angle) * radius}`;
  }).join(" ");
}

function handlePodKeyDown(event: KeyboardEvent<SVGGElement>, callback: () => void) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  callback();
}

function healthColor(tone: string): string {
  const color: Record<string, string> = {
    critical: "var(--destructive)",
    danger: "var(--color-orange-500)",
    healthy: "var(--color-emerald-500)",
    stale: "var(--muted-foreground)",
    unknown: "var(--muted-foreground)",
    warning: "var(--status-warning)",
  };
  return color[tone] ?? color.unknown;
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
  return [
    `${t("resources.infraMap.nodeKind")}: ${node.node.name}`,
    `${t("resources.infraMap.metric.pods")}: ${formatNumber(node.node.assignedPodCount)}`,
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

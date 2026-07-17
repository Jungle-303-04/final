import { useMemo, type KeyboardEvent } from "react";

import { useI18n } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import type { InfraMapMetricMode } from "./ResourcesInfraMapMetrics";
import type { InfraMapModel, InfraMapPod } from "./resourcesInfraMapModel";
import {
  buildInfraMapNavigatorModel,
  infraMapNavigatorPodVisual,
  type InfraMapNavigatorCluster,
  type InfraMapNavigatorNode,
  type InfraMapNavigatorPod,
} from "./resourcesInfraMapNavigatorModel";

const NAVIGATOR_RING_FRACTIONS = [0.22, 0.4, 0.58, 0.76] as const;
const NAVIGATOR_NODE_RACK = {
  height: 22,
  width: 58,
} as const;
const NAVIGATOR_CLUSTER_RADIUS = 24;
const NAVIGATOR_NODE_CORNER_RADIUS = 5;
const NAVIGATOR_DOT_OPACITY = 0.9;
const NAVIGATOR_EDGE_OPACITY = 0.42;
const NAVIGATOR_RING_OPACITY = 0.2;

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
  const navigator = useMemo(
    () => buildInfraMapNavigatorModel(model, metricMode),
    [model, metricMode],
  );
  const clusterCount = navigator.clusters.length;
  const nodeCount = navigator.clusters.reduce(
    (total, cluster) => total + cluster.nodes.length,
    0,
  );

  return (
    <section
      aria-label={t("resources.infraMap.navigator.aria")}
      className="relative mt-5 min-h-[28rem] overflow-hidden rounded-lg border border-dashed bg-[radial-gradient(circle_at_center,color-mix(in_oklch,var(--primary)_10%,transparent),transparent_38%),linear-gradient(to_bottom,color-mix(in_oklch,var(--muted)_35%,transparent),transparent)]"
      data-slot="resources-infra-map-navigator"
    >
      <div className="absolute left-3 top-3 z-10 grid max-w-52 gap-1 rounded-md border bg-background/82 p-2 text-[0.6875rem] text-muted-foreground shadow-sm backdrop-blur">
        <NavigatorGuideRow
          label={t("resources.infraMap.topology.cluster")}
          value={formatNumber(clusterCount)}
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

      <svg
        aria-label={t("resources.infraMap.navigator.aria")}
        className="h-[28rem] w-full"
        data-slot="resources-infra-map-navigator-canvas"
        role="img"
        viewBox={`0 0 ${navigator.width} ${navigator.height}`}
      >
        <defs>
          <pattern
            height="18"
            id="infra-map-navigator-grid"
            patternUnits="userSpaceOnUse"
            width="18"
          >
            <circle
              cx="1"
              cy="1"
              fill="currentColor"
              opacity="0.16"
              r="1"
            />
          </pattern>
        </defs>
        <rect
          className="text-muted-foreground"
          fill="url(#infra-map-navigator-grid)"
          height={navigator.height}
          width={navigator.width}
          x="0"
          y="0"
        />
        {navigator.clusters.map((cluster) => (
          <NavigatorClusterGraph
            cluster={cluster}
            formatNumber={formatNumber}
            key={cluster.cluster.id}
            metricMode={metricMode}
            onOpenPod={onOpenPod}
            t={t}
          />
        ))}
      </svg>
    </section>
  );
}

function NavigatorClusterGraph({
  cluster,
  formatNumber,
  metricMode,
  onOpenPod,
  t,
}: {
  cluster: InfraMapNavigatorCluster;
  formatNumber: ReturnType<typeof useI18n>["formatNumber"];
  metricMode: InfraMapMetricMode;
  onOpenPod: (pod: InfraMapPod) => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const maxRing = Math.max(
    ...cluster.nodes.map((node) => distance(cluster.position, node.position)),
    NAVIGATOR_CLUSTER_RADIUS,
  );
  const clusterColor = healthColor(cluster.cluster.health);

  return (
    <g data-cluster-id={cluster.cluster.id} data-slot="infra-map-navigator-cluster">
      {NAVIGATOR_RING_FRACTIONS.map((fraction) => (
        <circle
          className="stroke-muted-foreground"
          cx={cluster.position.x}
          cy={cluster.position.y}
          fill="none"
          key={fraction}
          opacity={NAVIGATOR_RING_OPACITY}
          r={maxRing * fraction}
          strokeWidth="1"
        />
      ))}
      {cluster.nodes.map((node) => (
        <line
          className="stroke-muted-foreground"
          key={`cluster-edge:${cluster.cluster.id}:${node.node.id}`}
          opacity={NAVIGATOR_EDGE_OPACITY}
          strokeWidth="1.2"
          x1={cluster.position.x}
          x2={node.position.x}
          y1={cluster.position.y}
          y2={node.position.y}
        />
      ))}
      <g data-slot="infra-map-navigator-cluster-hub">
        <title>{clusterTitle(cluster, formatNumber, t)}</title>
        <circle
          cx={cluster.position.x}
          cy={cluster.position.y}
          fill="var(--background)"
          r={NAVIGATOR_CLUSTER_RADIUS}
          stroke={clusterColor}
          strokeWidth="2"
        />
        {clusterWheelSpokes(cluster.position).map((spoke) => (
          <line
            key={`${spoke.x1}:${spoke.y1}:${spoke.x2}:${spoke.y2}`}
            stroke={clusterColor}
            strokeLinecap="round"
            strokeWidth="1.6"
            x1={spoke.x1}
            x2={spoke.x2}
            y1={spoke.y1}
            y2={spoke.y2}
          />
        ))}
        <circle
          cx={cluster.position.x}
          cy={cluster.position.y}
          fill={clusterColor}
          r="3.5"
        />
      </g>
      {cluster.nodes.map((node) => (
        <NavigatorNodeGraph
          formatNumber={formatNumber}
          key={node.node.id}
          metricMode={metricMode}
          node={node}
          onOpenPod={onOpenPod}
          t={t}
        />
      ))}
    </g>
  );
}

function NavigatorNodeGraph({
  formatNumber,
  metricMode,
  node,
  onOpenPod,
  t,
}: {
  formatNumber: ReturnType<typeof useI18n>["formatNumber"];
  metricMode: InfraMapMetricMode;
  node: InfraMapNavigatorNode;
  onOpenPod: (pod: InfraMapPod) => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const angle = (node.angle * 180) / Math.PI;
  const nodeColor = healthColor(node.node.health);

  return (
    <g data-node-id={node.node.id} data-slot="infra-map-navigator-node">
      {node.pods.map((pod) => (
        <line
          className="stroke-muted-foreground"
          key={`node-edge:${node.node.id}:${pod.pod.id}`}
          opacity={pod.ratio === null ? 0.24 : 0.32}
          strokeDasharray={pod.ratio === null ? "4 5" : undefined}
          strokeLinecap="round"
          strokeWidth="0.9"
          x1={node.position.x}
          x2={pod.position.x}
          y1={node.position.y}
          y2={pod.position.y}
        />
      ))}
      {node.pods.map((pod) => (
        <NavigatorPodDot
          formatNumber={formatNumber}
          key={pod.pod.id}
          metricMode={metricMode}
          onOpenPod={onOpenPod}
          pod={pod}
          t={t}
        />
      ))}
      <g
        transform={`translate(${node.position.x} ${node.position.y}) rotate(${angle})`}
      >
        <title>{nodeTitle(node, formatNumber, t)}</title>
        <rect
          fill="var(--background)"
          height={NAVIGATOR_NODE_RACK.height}
          rx={NAVIGATOR_NODE_CORNER_RADIUS}
          stroke={nodeColor}
          strokeWidth="1.5"
          width={NAVIGATOR_NODE_RACK.width}
          x={-NAVIGATOR_NODE_RACK.width / 2}
          y={-NAVIGATOR_NODE_RACK.height / 2}
        />
        <line
          opacity="0.55"
          stroke={nodeColor}
          strokeLinecap="round"
          strokeWidth="1.2"
          x1={-NAVIGATOR_NODE_RACK.width / 2 + 9}
          x2={NAVIGATOR_NODE_RACK.width / 2 - 9}
          y1="-3.5"
          y2="-3.5"
        />
        <line
          opacity="0.55"
          stroke={nodeColor}
          strokeLinecap="round"
          strokeWidth="1.2"
          x1={-NAVIGATOR_NODE_RACK.width / 2 + 9}
          x2={NAVIGATOR_NODE_RACK.width / 2 - 9}
          y1="4.5"
          y2="4.5"
        />
      </g>
    </g>
  );
}

function NavigatorPodDot({
  formatNumber,
  metricMode,
  onOpenPod,
  pod,
  t,
}: {
  formatNumber: ReturnType<typeof useI18n>["formatNumber"];
  metricMode: InfraMapMetricMode;
  onOpenPod: (pod: InfraMapPod) => void;
  pod: InfraMapNavigatorPod;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const visual = infraMapNavigatorPodVisual(pod.pod, metricMode);
  return (
    <g
      aria-label={podTitle(pod, metricMode, formatNumber, t)}
      className={cn("cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring")}
      data-health-tone={pod.healthTone}
      data-pod-id={pod.pod.id}
      data-slot="infra-map-navigator-pod"
      data-usage-tone={pod.pressureTone}
      onClick={() => onOpenPod(pod.pod)}
      onKeyDown={(event) => handlePodKeyDown(event, () => onOpenPod(pod.pod))}
      role="button"
      tabIndex={0}
    >
      <title>{podTitle(pod, metricMode, formatNumber, t)}</title>
      <circle
        cx={pod.position.x}
        cy={pod.position.y}
        fill={visual.fill}
        opacity={NAVIGATOR_DOT_OPACITY}
        r={pod.radius}
        stroke={visual.stroke}
        strokeDasharray={visual.strokeDasharray}
        strokeWidth={pod.healthTone === "critical" ? 2.4 : 1.4}
      />
    </g>
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
    <div className="flex min-w-0 items-center justify-between gap-4">
      <span className="truncate">{label}</span>
      <span className="font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
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

function clusterWheelSpokes(center: { x: number; y: number }) {
  const radius = NAVIGATOR_CLUSTER_RADIUS - 9;
  return Array.from({ length: 8 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 8;
    return {
      x1: center.x + Math.cos(angle) * 5,
      x2: center.x + Math.cos(angle) * radius,
      y1: center.y + Math.sin(angle) * 5,
      y2: center.y + Math.sin(angle) * radius,
    };
  });
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

function distance(left: { x: number; y: number }, right: { x: number; y: number }): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

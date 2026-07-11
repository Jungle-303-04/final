import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Box, Boxes, Server } from "lucide-react";

import type {
  AreaMetricDescriptor,
  ClusterTopologyEntity,
  MetricValue,
  NodeTopologyEntity,
  PodTopologyEntity,
  TopologyHierarchySnapshot,
} from "../contracts";
import type { TopologyCoreState } from "../../topology-engine/core";
import {
  insetRect,
  metricMagnitude,
  rectStyle,
  treemapWithResidual,
  type LayoutRect,
} from "./layout";

export type HierarchyScope =
  | { readonly level: "fleet" }
  | { readonly level: "cluster"; readonly clusterKey: string }
  | { readonly level: "node"; readonly clusterKey: string; readonly nodeKey: string };

type HierarchyTreemapProps = {
  readonly snapshot: TopologyHierarchySnapshot;
  readonly metric: AreaMetricDescriptor;
  readonly scope: HierarchyScope;
  readonly engineState: TopologyCoreState;
  readonly onEnterCluster: (clusterKey: string) => void;
  readonly onEnterNode: (clusterKey: string, nodeKey: string) => void;
  readonly onInspectPod: (pod: PodTopologyEntity) => void;
};

const fullRect: LayoutRect = { x: 0, y: 0, width: 100, height: 100 };

function readableMetric(value: MetricValue | undefined): string {
  if (value === undefined || value.valueDecimal === null) return "측정 없음";
  const amount = Number(value.valueDecimal);
  if (!Number.isFinite(amount)) return "측정 오류";
  if (value.unitId === "By") {
    const units = ["B", "KiB", "MiB", "GiB", "TiB"];
    let scaled = amount;
    let unitIndex = 0;
    while (scaled >= 1024 && unitIndex < units.length - 1) {
      scaled /= 1024;
      unitIndex += 1;
    }
    return `${scaled.toFixed(scaled >= 10 ? 1 : 2)} ${units[unitIndex]}`;
  }
  if (value.unitId === "USD") return `$${amount.toFixed(2)}`;
  return `${amount.toFixed(amount >= 10 ? 1 : 2)} ${value.unitId}`;
}

function sumChildrenMetric(
  children: readonly { readonly metrics: Readonly<Record<string, MetricValue>> }[],
  metricId: string,
): number {
  return children.reduce((sum, child) => sum + (metricMagnitude(child.metrics[metricId]) ?? 0), 0);
}

function tileClass(health: string, extra = "") {
  return `hierarchy-tile hierarchy-tile--${health} ${extra}`.trim();
}

function PodTile({
  pod,
  metric,
  rect,
  layoutRole,
  dense = false,
  onInspect,
}: {
  readonly pod: PodTopologyEntity;
  readonly metric: AreaMetricDescriptor;
  readonly rect: LayoutRect;
  readonly layoutRole: "weighted" | "residual";
  readonly dense?: boolean;
  readonly onInspect: (pod: PodTopologyEntity) => void;
}) {
  const labelVisible = rect.width >= 18 && rect.height >= 14;
  const contents = labelVisible ? (
    <span className="tile-copy">
      <strong>{pod.displayName}</strong>
      {!dense && <small>{readableMetric(pod.metrics[metric.metricId])}</small>}
    </span>
  ) : (
    <span className="visually-hidden">{pod.displayName}</span>
  );

  if (dense) {
    return (
      <motion.div
        layoutId={pod.entityKey}
        className={tileClass(
          pod.health,
          `pod-tile pod-tile--dense hierarchy-tile--${layoutRole}`,
        )}
        style={rectStyle(rect)}
        title={`${pod.namespace}/${pod.displayName}`}
      >
        {contents}
      </motion.div>
    );
  }

  return (
    <motion.button
      layoutId={pod.entityKey}
      className={tileClass(
        pod.health,
        `pod-tile${dense ? " pod-tile--dense" : ""} hierarchy-tile--${layoutRole}`,
      )}
      style={rectStyle(rect)}
      onClick={() => onInspect(pod)}
      type="button"
      aria-label={`${pod.displayName}, ${pod.namespace}, ${pod.healthReason}`}
      title={`${pod.namespace}/${pod.displayName}`}
    >
      {contents}
    </motion.button>
  );
}

function NodeTile({
  node,
  clusterKey,
  metric,
  rect,
  layoutRole,
  onEnter,
  onInspectPod,
  compact,
}: {
  readonly node: NodeTopologyEntity;
  readonly clusterKey: string;
  readonly metric: AreaMetricDescriptor;
  readonly rect: LayoutRect;
  readonly layoutRole: "weighted" | "residual";
  readonly onEnter: (clusterKey: string, nodeKey: string) => void;
  readonly onInspectPod: (pod: PodTopologyEntity) => void;
  readonly compact: boolean;
}) {
  const headerHeight = compact ? 0 : 12;
  const content = insetRect(
    { x: 0, y: headerHeight, width: 100, height: 100 - headerHeight },
    compact ? 0.8 : 1.1,
  );
  const pods = treemapWithResidual(
    node.pods.map((pod) => ({
      key: pod.entityKey,
      value: pod,
      weight: metricMagnitude(pod.metrics[metric.metricId]) ?? 0,
    })),
    content,
  );

  return (
    <motion.section
      layoutId={node.entityKey}
      className={tileClass(
        node.health,
        `node-tile${compact ? " node-tile--micro" : ""} hierarchy-tile--${layoutRole}`,
      )}
      style={rectStyle(rect)}
      aria-label={`${node.displayName}, Pod ${node.pods.length}개`}
    >
      {!compact && (
        <header className="hierarchy-tile__header">
          <span><Server aria-hidden="true" /> <strong>{node.displayName}</strong></span>
          <button type="button" onClick={() => onEnter(clusterKey, node.entityKey)}>
            노드 열기 <ArrowUpRight aria-hidden="true" />
          </button>
        </header>
      )}
      <div className="tile-layer" aria-label={`${node.displayName}의 Pod`}>
        {pods.map((item) => (
          <PodTile
            key={item.key}
            pod={item.value}
            metric={metric}
            rect={item.rect}
            layoutRole={item.layoutRole}
            dense={compact}
            onInspect={onInspectPod}
          />
        ))}
      </div>
    </motion.section>
  );
}

function ClusterTile({
  cluster,
  metric,
  rect,
  layoutRole,
  onEnter,
}: {
  readonly cluster: ClusterTopologyEntity;
  readonly metric: AreaMetricDescriptor;
  readonly rect: LayoutRect;
  readonly layoutRole: "weighted" | "residual";
  readonly onEnter: (clusterKey: string) => void;
}) {
  const headerHeight = 13;
  const content = insetRect(
    { x: 0, y: headerHeight, width: 100, height: 100 - headerHeight },
    1,
  );
  const nodes = treemapWithResidual(
    cluster.nodes.map((node) => ({
      key: node.entityKey,
      value: node,
      weight: sumChildrenMetric(node.pods, metric.metricId),
    })),
    content,
  );

  return (
    <motion.section
      layoutId={cluster.entityKey}
      className={tileClass(
        cluster.health,
        `cluster-tile hierarchy-tile--${layoutRole}`,
      )}
      style={rectStyle(rect)}
      aria-label={`${cluster.displayName}, Node ${cluster.nodes.length}개`}
    >
      <header className="hierarchy-tile__header hierarchy-tile__header--cluster">
        <span>
          <Boxes aria-hidden="true" />
          <span><strong>{cluster.displayName}</strong><small>{cluster.environmentLabel}</small></span>
        </span>
        <button type="button" onClick={() => onEnter(cluster.entityKey)}>
          클러스터 열기 <ArrowUpRight aria-hidden="true" />
        </button>
      </header>
      <div className="tile-layer" aria-label={`${cluster.displayName}의 Node`}>
        {nodes.map((item) => (
          <NodeTile
            key={item.key}
            node={item.value}
            clusterKey={cluster.entityKey}
            metric={metric}
            rect={item.rect}
            layoutRole={item.layoutRole}
            onEnter={() => undefined}
            onInspectPod={() => undefined}
            compact
          />
        ))}
      </div>
    </motion.section>
  );
}

export function HierarchyTreemap({
  snapshot,
  metric,
  scope,
  engineState,
  onEnterCluster,
  onEnterNode,
  onInspectPod,
}: HierarchyTreemapProps) {
  const cluster =
    scope.level === "fleet"
      ? null
      : snapshot.clusters.find((item) => item.entityKey === scope.clusterKey) ?? null;
  const node =
    scope.level === "node"
      ? cluster?.nodes.find((item) => item.entityKey === scope.nodeKey) ?? null
      : null;

  const visibleEntityKeys = new Set(
    engineState.canonical.mapUniverseEntityKeys.map(String),
  );

  const clusterLayout = treemapWithResidual(
    snapshot.clusters.filter((item) => visibleEntityKeys.has(item.entityKey)).map((item) => ({
      key: item.entityKey,
      value: item,
      weight: item.nodes.reduce(
        (sum, child) => sum + sumChildrenMetric(child.pods, metric.metricId),
        0,
      ),
    })),
    fullRect,
  );

  const nodeLayout = treemapWithResidual(
    (cluster?.nodes ?? []).filter((item) => visibleEntityKeys.has(item.entityKey)).map((item) => ({
      key: item.entityKey,
      value: item,
      weight: sumChildrenMetric(item.pods, metric.metricId),
    })),
    fullRect,
  );

  const podLayout = treemapWithResidual(
    (node?.pods ?? []).filter((item) => visibleEntityKeys.has(item.entityKey)).map((item) => ({
      key: item.entityKey,
      value: item,
      weight: metricMagnitude(item.metrics[metric.metricId]) ?? 0,
    })),
    fullRect,
  );

  const visibleLayoutCount =
    scope.level === "fleet"
      ? clusterLayout.length
      : scope.level === "cluster"
        ? nodeLayout.length
        : podLayout.length;
  const selectionMissing =
    (scope.level !== "fleet" && cluster === null) ||
    (scope.level === "node" && node === null);

  return (
    <div
      className="hierarchy-canvas"
      data-scope={scope.level}
      data-engine-presentation={engineState.presentation.target.mode}
      data-engine-frame={String(engineState.canonical.frameId)}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {scope.level === "fleet" &&
          clusterLayout.map((item) => (
            <ClusterTile
              key={item.key}
              cluster={item.value}
              metric={metric}
              rect={item.rect}
              layoutRole={item.layoutRole}
              onEnter={onEnterCluster}
            />
          ))}

        {scope.level === "cluster" &&
          cluster !== null &&
          nodeLayout.map((item) => (
            <NodeTile
              key={item.key}
              node={item.value}
              clusterKey={cluster.entityKey}
              metric={metric}
              rect={item.rect}
              layoutRole={item.layoutRole}
              onEnter={onEnterNode}
              onInspectPod={onInspectPod}
              compact={false}
            />
          ))}

        {scope.level === "node" &&
          node !== null &&
          podLayout.map((item) => (
            <PodTile
              key={item.key}
              pod={item.value}
              metric={metric}
              rect={item.rect}
              layoutRole={item.layoutRole}
              onInspect={onInspectPod}
            />
          ))}
      </AnimatePresence>

      {(selectionMissing || visibleLayoutCount === 0) && (
        <div className="hierarchy-empty">
          <Box aria-hidden="true" />
          <strong>
            {selectionMissing
              ? "선택한 리소스를 찾을 수 없습니다"
              : "이 범위에 표시할 리소스가 없습니다"}
          </strong>
          <span>
            {selectionMissing
              ? "최신 스냅샷으로 범위를 다시 선택하세요."
              : "현재 필터와 접근 권한을 확인하세요."}
          </span>
        </div>
      )}
    </div>
  );
}

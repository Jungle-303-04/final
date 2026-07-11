import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import { Box, Boxes, Server } from "lucide-react";

import {
  MOTION_DURATION_MS,
  MOTION_RECIPE,
} from "../../../design-system";
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
  type PositionedItem,
} from "./layout";
import {
  classifyHierarchyZoom,
  nestLayoutRects,
  projectLayoutRects,
  scopeIdentity,
  type HierarchyZoom,
  type ZoomScope,
} from "./zoomTransition";

export type HierarchyScope = ZoomScope;

type HierarchyTreemapProps = {
  readonly snapshot: TopologyHierarchySnapshot;
  readonly metric: AreaMetricDescriptor;
  readonly scope: HierarchyScope;
  readonly engineState: TopologyCoreState;
  readonly onEnterCluster: (clusterKey: string) => void;
  readonly onEnterNode: (clusterKey: string, nodeKey: string) => void;
  readonly onInspectPod: (pod: PodTopologyEntity) => void;
};

type ClusterLayoutItem = PositionedItem<ClusterTopologyEntity>;
type NodeLayoutItem = PositionedItem<NodeTopologyEntity>;
type PodLayoutItem = PositionedItem<PodTopologyEntity>;

type ScopeLayout = {
  readonly scope: HierarchyScope;
  readonly cluster: ClusterTopologyEntity | null;
  readonly node: NodeTopologyEntity | null;
  readonly clusters: readonly ClusterLayoutItem[];
  readonly nodes: readonly NodeLayoutItem[];
  readonly pods: readonly PodLayoutItem[];
  readonly keyedRects: readonly {
    readonly key: string;
    readonly rect: LayoutRect;
  }[];
  readonly selectionMissing: boolean;
};

type ActiveZoom = {
  readonly id: number;
  readonly from: HierarchyScope;
  readonly to: HierarchyScope;
  readonly zoom: HierarchyZoom;
};

type VisualScopeState = {
  readonly scope: HierarchyScope;
  readonly sequence: number;
  readonly activeZoom: ActiveZoom | null;
};

type RectMap = ReadonlyMap<string, LayoutRect>;

type ZoomGeometry = {
  readonly fromInitial: RectMap;
  readonly fromTarget: RectMap;
  readonly toInitial: RectMap;
  readonly toTarget: RectMap;
};

type LayerMotion = {
  readonly initialRects?: RectMap;
  readonly targetRects?: RectMap;
  readonly opacityFrom?: number;
  readonly opacityTo?: number;
  readonly zIndex: number;
};

const fullRect: LayoutRect = { x: 0, y: 0, width: 100, height: 100 };
const clusterHeaderHeight = 13;
const nodeHeaderHeight = 12;

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
  children: readonly {
    readonly metrics: Readonly<Record<string, MetricValue>>;
  }[],
  metricId: string,
): number {
  return children.reduce(
    (sum, child) =>
      sum + (metricMagnitude(child.metrics[metricId]) ?? 0),
    0,
  );
}

function tileClass(health: string, extra = "") {
  return `hierarchy-tile hierarchy-tile--${health} ${extra}`.trim();
}

function clusterChildrenRect(): LayoutRect {
  return insetRect(
    {
      x: 0,
      y: clusterHeaderHeight,
      width: 100,
      height: 100 - clusterHeaderHeight,
    },
    1,
  );
}

function nodeChildrenRect(compact: boolean): LayoutRect {
  const headerHeight = compact ? 0 : nodeHeaderHeight;
  return insetRect(
    {
      x: 0,
      y: headerHeight,
      width: 100,
      height: 100 - headerHeight,
    },
    compact ? 0.8 : 1.1,
  );
}

function nodePreviewLayout(
  cluster: ClusterTopologyEntity,
  metric: AreaMetricDescriptor,
  visibleEntityKeys: ReadonlySet<string>,
): readonly NodeLayoutItem[] {
  return treemapWithResidual(
    cluster.nodes
      .filter((node) => visibleEntityKeys.has(node.entityKey))
      .map((node) => ({
        key: node.entityKey,
        value: node,
        weight: sumChildrenMetric(node.pods, metric.metricId),
      })),
    clusterChildrenRect(),
  );
}

function podPreviewLayout(
  node: NodeTopologyEntity,
  metric: AreaMetricDescriptor,
  visibleEntityKeys: ReadonlySet<string>,
  compact: boolean,
): readonly PodLayoutItem[] {
  return treemapWithResidual(
    node.pods
      .filter((pod) => visibleEntityKeys.has(pod.entityKey))
      .map((pod) => ({
        key: pod.entityKey,
        value: pod,
        weight: metricMagnitude(pod.metrics[metric.metricId]) ?? 0,
      })),
    nodeChildrenRect(compact),
  );
}

function rectMap(items: ScopeLayout["keyedRects"]): RectMap {
  return new Map(items.map((item) => [item.key, item.rect] as const));
}

function resolveCluster(
  snapshot: TopologyHierarchySnapshot,
  scope: HierarchyScope,
): ClusterTopologyEntity | null {
  if (scope.level === "fleet") return null;
  return (
    snapshot.clusters.find((item) => item.entityKey === scope.clusterKey) ??
    null
  );
}

function buildScopeLayout(
  snapshot: TopologyHierarchySnapshot,
  metric: AreaMetricDescriptor,
  scope: HierarchyScope,
  visibleEntityKeys: ReadonlySet<string>,
): ScopeLayout {
  const cluster = resolveCluster(snapshot, scope);
  const node =
    scope.level === "node"
      ? cluster?.nodes.find((item) => item.entityKey === scope.nodeKey) ?? null
      : null;

  const clusters =
    scope.level === "fleet"
      ? treemapWithResidual(
          snapshot.clusters
            .filter((item) => visibleEntityKeys.has(item.entityKey))
            .map((item) => ({
              key: item.entityKey,
              value: item,
              weight: item.nodes.reduce(
                (sum, child) =>
                  sum + sumChildrenMetric(child.pods, metric.metricId),
                0,
              ),
            })),
          fullRect,
        )
      : [];

  const nodes =
    scope.level === "cluster" && cluster !== null
      ? treemapWithResidual(
          cluster.nodes
            .filter((item) => visibleEntityKeys.has(item.entityKey))
            .map((item) => ({
              key: item.entityKey,
              value: item,
              weight: sumChildrenMetric(item.pods, metric.metricId),
            })),
          fullRect,
        )
      : [];

  const pods =
    scope.level === "node" && node !== null
      ? treemapWithResidual(
          node.pods
            .filter((item) => visibleEntityKeys.has(item.entityKey))
            .map((item) => ({
              key: item.entityKey,
              value: item,
              weight: metricMagnitude(item.metrics[metric.metricId]) ?? 0,
            })),
          fullRect,
        )
      : [];

  const keyedRects =
    scope.level === "fleet"
      ? clusters
      : scope.level === "cluster"
        ? nodes
        : pods;

  return {
    scope,
    cluster,
    node,
    clusters,
    nodes,
    pods,
    keyedRects,
    selectionMissing:
      (scope.level !== "fleet" && cluster === null) ||
      (scope.level === "node" && node === null),
  };
}

function inferredScopeUniverse(
  snapshot: TopologyHierarchySnapshot,
  scope: HierarchyScope,
  canonicalEntityKeys: ReadonlySet<string>,
): ReadonlySet<string> {
  if (scope.level === "fleet") {
    return new Set(
      snapshot.clusters
        .map((cluster) => cluster.entityKey)
        .filter((entityKey) => canonicalEntityKeys.has(entityKey)),
    );
  }

  const cluster = snapshot.clusters.find(
    (item) => item.entityKey === scope.clusterKey,
  );
  if (cluster === undefined) return new Set();

  if (scope.level === "cluster") {
    return new Set(
      cluster.nodes
        .map((node) => node.entityKey)
        .filter((entityKey) => canonicalEntityKeys.has(entityKey)),
    );
  }

  const node = cluster.nodes.find((item) => item.entityKey === scope.nodeKey);
  return new Set(
    (node?.pods ?? [])
      .map((pod) => pod.entityKey)
      .filter((entityKey) => canonicalEntityKeys.has(entityKey)),
  );
}

function previewChildrenForZoom(
  snapshot: TopologyHierarchySnapshot,
  metric: AreaMetricDescriptor,
  from: HierarchyScope,
  to: HierarchyScope,
  focusEntityKey: string,
  visibleEntityKeys: ReadonlySet<string>,
): readonly { readonly key: string; readonly rect: LayoutRect }[] | null {
  const crossesClusterBoundary =
    (from.level === "fleet" && to.level === "cluster") ||
    (from.level === "cluster" && to.level === "fleet");

  if (crossesClusterBoundary) {
    const cluster = snapshot.clusters.find(
      (item) => item.entityKey === focusEntityKey,
    );
    return cluster === undefined
      ? null
      : nodePreviewLayout(cluster, metric, visibleEntityKeys);
  }

  const clusterKey =
    from.level !== "fleet"
      ? from.clusterKey
      : to.level !== "fleet"
        ? to.clusterKey
        : null;
  if (clusterKey === null) return null;
  const cluster = snapshot.clusters.find(
    (item) => item.entityKey === clusterKey,
  );
  const node = cluster?.nodes.find(
    (item) => item.entityKey === focusEntityKey,
  );
  return node === undefined
    ? null
    : podPreviewLayout(node, metric, visibleEntityKeys, false);
}

function buildZoomGeometry(
  snapshot: TopologyHierarchySnapshot,
  metric: AreaMetricDescriptor,
  activeZoom: ActiveZoom,
  fromLayout: ScopeLayout,
  toLayout: ScopeLayout,
  childVisibleEntityKeys: ReadonlySet<string>,
): ZoomGeometry | null {
  const preview = previewChildrenForZoom(
    snapshot,
    metric,
    activeZoom.from,
    activeZoom.to,
    activeZoom.zoom.focusEntityKey,
    childVisibleEntityKeys,
  );
  if (preview === null) return null;

  const fromNatural = rectMap(fromLayout.keyedRects);
  const toNatural = rectMap(toLayout.keyedRects);

  if (activeZoom.zoom.direction === "in") {
    const projectedFrom = projectLayoutRects(
      fromLayout.keyedRects,
      activeZoom.zoom.focusEntityKey,
    );
    const focusRect = fromNatural.get(activeZoom.zoom.focusEntityKey);
    if (projectedFrom === null || focusRect === undefined) return null;

    return {
      fromInitial: fromNatural,
      fromTarget: projectedFrom,
      toInitial: nestLayoutRects(focusRect, preview),
      toTarget: toNatural,
    };
  }

  const projectedTo = projectLayoutRects(
    toLayout.keyedRects,
    activeZoom.zoom.focusEntityKey,
  );
  const focusRect = toNatural.get(activeZoom.zoom.focusEntityKey);
  if (projectedTo === null || focusRect === undefined) return null;

  return {
    fromInitial: fromNatural,
    fromTarget: nestLayoutRects(focusRect, preview),
    toInitial: projectedTo,
    toTarget: toNatural,
  };
}

function handleTileKey(
  event: ReactKeyboardEvent<HTMLElement>,
  activate: () => void,
) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  activate();
}

function PodTile({
  pod,
  metric,
  rect,
  initialRect,
  layoutRole,
  dense = false,
  interactive,
  layoutNamespace,
  onInspect,
}: {
  readonly pod: PodTopologyEntity;
  readonly metric: AreaMetricDescriptor;
  readonly rect: LayoutRect;
  readonly initialRect?: LayoutRect | undefined;
  readonly layoutRole: "weighted" | "residual";
  readonly dense?: boolean;
  readonly interactive: boolean;
  readonly layoutNamespace: string;
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
  const className = tileClass(
    pod.health,
    `pod-tile${dense ? " pod-tile--dense" : ""} hierarchy-tile--${layoutRole}`,
  );
  const positionProps =
    initialRect === undefined
      ? { initial: false as const, style: rectStyle(rect) }
      : {
          style: {},
          initial: rectStyle(initialRect),
          animate: rectStyle(rect),
          transition: MOTION_RECIPE.zoomableHierarchy,
        };

  if (!interactive) {
    return (
      <motion.div
        {...positionProps}
        layoutId={`${layoutNamespace}:${pod.entityKey}`}
        className={className}
        style={{ ...positionProps.style, cursor: "default" }}
        title={`${pod.namespace}/${pod.displayName}`}
      >
        {contents}
      </motion.div>
    );
  }

  return (
    <motion.button
      {...positionProps}
      layoutId={`${layoutNamespace}:${pod.entityKey}`}
      className={className}
      style={positionProps.style}
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
  initialRect,
  layoutRole,
  onEnter,
  previewEntityKeys,
  compact,
  interactive,
  layoutNamespace,
}: {
  readonly node: NodeTopologyEntity;
  readonly clusterKey: string;
  readonly metric: AreaMetricDescriptor;
  readonly rect: LayoutRect;
  readonly initialRect?: LayoutRect | undefined;
  readonly layoutRole: "weighted" | "residual";
  readonly onEnter: (clusterKey: string, nodeKey: string) => void;
  readonly previewEntityKeys: ReadonlySet<string>;
  readonly compact: boolean;
  readonly interactive: boolean;
  readonly layoutNamespace: string;
}) {
  const pods = podPreviewLayout(
    node,
    metric,
    previewEntityKeys,
    compact,
  );
  const activate = () => onEnter(clusterKey, node.entityKey);
  const positionProps =
    initialRect === undefined
      ? { initial: false as const, style: rectStyle(rect) }
      : {
          style: {},
          initial: rectStyle(initialRect),
          animate: rectStyle(rect),
          transition: MOTION_RECIPE.zoomableHierarchy,
        };

  return (
    <motion.section
      {...positionProps}
      layoutId={`${layoutNamespace}:${node.entityKey}`}
      className={tileClass(
        node.health,
        `node-tile${compact ? " node-tile--micro" : ""} hierarchy-tile--${layoutRole}`,
      )}
      style={{
        ...positionProps.style,
        cursor: interactive ? "pointer" : "default",
      }}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? activate : undefined}
      onKeyDown={
        interactive ? (event) => handleTileKey(event, activate) : undefined
      }
      aria-label={`${node.displayName}, Pod ${node.pods.length}개`}
    >
      {!compact && (
        <header className="hierarchy-tile__header">
          <span>
            <Server aria-hidden="true" /> <strong>{node.displayName}</strong>
          </span>
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
            interactive={false}
            layoutNamespace={`${layoutNamespace}/node:${node.entityKey}`}
            onInspect={() => undefined}
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
  initialRect,
  layoutRole,
  onEnter,
  previewEntityKeys,
  interactive,
  layoutNamespace,
}: {
  readonly cluster: ClusterTopologyEntity;
  readonly metric: AreaMetricDescriptor;
  readonly rect: LayoutRect;
  readonly initialRect?: LayoutRect | undefined;
  readonly layoutRole: "weighted" | "residual";
  readonly onEnter: (clusterKey: string) => void;
  readonly previewEntityKeys: ReadonlySet<string>;
  readonly interactive: boolean;
  readonly layoutNamespace: string;
}) {
  const nodes = nodePreviewLayout(cluster, metric, previewEntityKeys);
  const activate = () => onEnter(cluster.entityKey);
  const positionProps =
    initialRect === undefined
      ? { initial: false as const, style: rectStyle(rect) }
      : {
          style: {},
          initial: rectStyle(initialRect),
          animate: rectStyle(rect),
          transition: MOTION_RECIPE.zoomableHierarchy,
        };

  return (
    <motion.section
      {...positionProps}
      layoutId={`${layoutNamespace}:${cluster.entityKey}`}
      className={tileClass(
        cluster.health,
        `cluster-tile hierarchy-tile--${layoutRole}`,
      )}
      style={{
        ...positionProps.style,
        cursor: interactive ? "pointer" : "default",
      }}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? activate : undefined}
      onKeyDown={
        interactive ? (event) => handleTileKey(event, activate) : undefined
      }
      aria-label={`${cluster.displayName}, Node ${cluster.nodes.length}개`}
    >
      <header className="hierarchy-tile__header hierarchy-tile__header--cluster">
        <span>
          <Boxes aria-hidden="true" />
          <span>
            <strong>{cluster.displayName}</strong>
            <small>{cluster.environmentLabel}</small>
          </span>
        </span>
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
            previewEntityKeys={previewEntityKeys}
            compact
            interactive={false}
            layoutNamespace={`${layoutNamespace}/cluster:${cluster.entityKey}`}
          />
        ))}
      </div>
    </motion.section>
  );
}

function ScopeLayerView({
  layout,
  metric,
  previewEntityKeys,
  motionState,
  interactive,
  hiddenFromAccessibility,
  onEnterCluster,
  onEnterNode,
  onInspectPod,
}: {
  readonly layout: ScopeLayout;
  readonly metric: AreaMetricDescriptor;
  readonly previewEntityKeys: ReadonlySet<string>;
  readonly motionState: LayerMotion;
  readonly interactive: boolean;
  readonly hiddenFromAccessibility: boolean;
  readonly onEnterCluster: (clusterKey: string) => void;
  readonly onEnterNode: (clusterKey: string, nodeKey: string) => void;
  readonly onInspectPod: (pod: PodTopologyEntity) => void;
}) {
  const layoutNamespace = scopeIdentity(layout.scope);
  const clusterKey =
    layout.scope.level === "cluster" ? layout.scope.clusterKey : null;
  const opacityMotion =
    motionState.opacityFrom === undefined || motionState.opacityTo === undefined
      ? { initial: false as const }
      : {
          initial: { opacity: motionState.opacityFrom },
          animate: { opacity: motionState.opacityTo },
          transition: MOTION_RECIPE.zoomableHierarchy,
        };

  return (
    <motion.div
      {...opacityMotion}
      className="tile-layer"
      data-zoom-layer={layoutNamespace}
      aria-hidden={hiddenFromAccessibility || undefined}
      style={{
        zIndex: motionState.zIndex,
        pointerEvents: interactive ? "auto" : "none",
      }}
    >
      {layout.scope.level === "fleet" &&
        layout.clusters.map((item) => (
          <ClusterTile
            key={item.key}
            cluster={item.value}
            metric={metric}
            rect={motionState.targetRects?.get(item.key) ?? item.rect}
            initialRect={motionState.initialRects?.get(item.key)}
            layoutRole={item.layoutRole}
            onEnter={onEnterCluster}
            previewEntityKeys={previewEntityKeys}
            interactive={interactive}
            layoutNamespace={layoutNamespace}
          />
        ))}

      {layout.scope.level === "cluster" &&
        layout.cluster !== null &&
        clusterKey !== null &&
        layout.nodes.map((item) => (
          <NodeTile
            key={item.key}
            node={item.value}
            clusterKey={clusterKey}
            metric={metric}
            rect={motionState.targetRects?.get(item.key) ?? item.rect}
            initialRect={motionState.initialRects?.get(item.key)}
            layoutRole={item.layoutRole}
            onEnter={onEnterNode}
            previewEntityKeys={previewEntityKeys}
            compact={false}
            interactive={interactive}
            layoutNamespace={layoutNamespace}
          />
        ))}

      {layout.scope.level === "node" &&
        layout.node !== null &&
        layout.pods.map((item) => (
          <PodTile
            key={item.key}
            pod={item.value}
            metric={metric}
            rect={motionState.targetRects?.get(item.key) ?? item.rect}
            initialRect={motionState.initialRects?.get(item.key)}
            layoutRole={item.layoutRole}
            interactive={interactive}
            layoutNamespace={layoutNamespace}
            onInspect={onInspectPod}
          />
        ))}
    </motion.div>
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
  const reducedMotion = useReducedMotion() === true;
  const requestedScopeIdentity = scopeIdentity(scope);
  const [visualState, setVisualState] = useState<VisualScopeState>(() => ({
    scope,
    sequence: 0,
    activeZoom: null,
  }));

  useLayoutEffect(() => {
    setVisualState((current) => {
      if (scopeIdentity(current.scope) === requestedScopeIdentity) {
        return reducedMotion && current.activeZoom !== null
          ? { ...current, activeZoom: null }
          : current;
      }

      const zoom = classifyHierarchyZoom(current.scope, scope);
      const sequence = current.sequence + 1;
      return {
        scope,
        sequence,
        activeZoom:
          reducedMotion || zoom === null
            ? null
            : {
                id: sequence,
                from: current.scope,
                to: scope,
                zoom,
              },
      };
    });
  }, [reducedMotion, requestedScopeIdentity, scope]);

  useEffect(() => {
    const activeZoom = visualState.activeZoom;
    if (activeZoom === null) return;

    const timeoutId = window.setTimeout(() => {
      setVisualState((current) =>
        current.activeZoom?.id === activeZoom.id
          ? { ...current, activeZoom: null }
          : current,
      );
    }, MOTION_DURATION_MS.zoomableHierarchy);

    return () => window.clearTimeout(timeoutId);
  }, [visualState.activeZoom]);

  const canonicalEntityKeys = useMemo(
    () =>
      new Set(
        engineState.canonical.entities.map((entity) =>
          String(entity.ref.entityKey),
        ),
      ),
    [engineState.canonical.entities],
  );
  const engineVisibleEntityKeys = useMemo(
    () => new Set(engineState.canonical.mapUniverseEntityKeys.map(String)),
    [engineState.canonical.mapUniverseEntityKeys],
  );
  const visibilityByScopeRef = useRef<
    Map<string, ReadonlySet<string>>
  >(new Map());
  const visibilityRevisionRef = useRef(snapshot.snapshotRevision);
  if (visibilityRevisionRef.current !== snapshot.snapshotRevision) {
    visibilityRevisionRef.current = snapshot.snapshotRevision;
    visibilityByScopeRef.current.clear();
  }
  visibilityByScopeRef.current.set(
    `${snapshot.snapshotRevision}:${requestedScopeIdentity}`,
    engineVisibleEntityKeys,
  );

  const currentVisibleEntityKeys = useMemo(() => {
    const cacheKey = `${snapshot.snapshotRevision}:${scopeIdentity(visualState.scope)}`;
    return (
      visibilityByScopeRef.current.get(cacheKey) ??
      inferredScopeUniverse(snapshot, visualState.scope, canonicalEntityKeys)
    );
  }, [
    canonicalEntityKeys,
    engineVisibleEntityKeys,
    snapshot,
    visualState.scope,
  ]);
  const fromVisibleEntityKeys = useMemo(() => {
    const fromScope = visualState.activeZoom?.from;
    if (fromScope === undefined) return null;
    const cacheKey = `${snapshot.snapshotRevision}:${scopeIdentity(fromScope)}`;
    return (
      visibilityByScopeRef.current.get(cacheKey) ??
      inferredScopeUniverse(snapshot, fromScope, canonicalEntityKeys)
    );
  }, [
    canonicalEntityKeys,
    engineVisibleEntityKeys,
    snapshot,
    visualState.activeZoom,
  ]);

  const currentLayout = useMemo(
    () =>
      buildScopeLayout(
        snapshot,
        metric,
        visualState.scope,
        currentVisibleEntityKeys,
      ),
    [currentVisibleEntityKeys, metric, snapshot, visualState.scope],
  );
  const fromLayout = useMemo(
    () =>
      visualState.activeZoom === null || fromVisibleEntityKeys === null
        ? null
        : buildScopeLayout(
            snapshot,
            metric,
            visualState.activeZoom.from,
            fromVisibleEntityKeys,
          ),
    [fromVisibleEntityKeys, metric, snapshot, visualState.activeZoom],
  );
  const zoomGeometry = useMemo(
    () => {
      const activeZoom = visualState.activeZoom;
      if (
        activeZoom === null ||
        fromLayout === null ||
        fromVisibleEntityKeys === null
      ) {
        return null;
      }

      const childVisibleEntityKeys =
        activeZoom.zoom.direction === "in"
          ? currentVisibleEntityKeys
          : fromVisibleEntityKeys;
      return buildZoomGeometry(
        snapshot,
        metric,
        activeZoom,
        fromLayout,
        currentLayout,
        childVisibleEntityKeys,
      );
    },
    [
      currentLayout,
      currentVisibleEntityKeys,
      fromLayout,
      fromVisibleEntityKeys,
      metric,
      snapshot,
      visualState.activeZoom,
    ],
  );

  const transitionActive =
    visualState.activeZoom !== null &&
    fromLayout !== null &&
    zoomGeometry !== null;
  const visibleLayoutCount = currentLayout.keyedRects.length;

  return (
    <div
      className="hierarchy-canvas"
      data-scope={currentLayout.scope.level}
      data-engine-presentation={engineState.presentation.target.mode}
      data-engine-frame={String(engineState.canonical.frameId)}
      data-zoom-transition={
        transitionActive ? visualState.activeZoom?.zoom.direction : "idle"
      }
      aria-busy={transitionActive || undefined}
    >
      {transitionActive && fromLayout !== null && zoomGeometry !== null && (
        <ScopeLayerView
          key={scopeIdentity(fromLayout.scope)}
          layout={fromLayout}
          metric={metric}
          previewEntityKeys={canonicalEntityKeys}
          motionState={{
            initialRects: zoomGeometry.fromInitial,
            targetRects: zoomGeometry.fromTarget,
            opacityFrom: 1,
            opacityTo: 0,
            zIndex:
              visualState.activeZoom?.zoom.direction === "out" ? 2 : 1,
          }}
          interactive={false}
          hiddenFromAccessibility
          onEnterCluster={onEnterCluster}
          onEnterNode={onEnterNode}
          onInspectPod={onInspectPod}
        />
      )}

      <ScopeLayerView
        key={scopeIdentity(currentLayout.scope)}
        layout={currentLayout}
        metric={metric}
        previewEntityKeys={canonicalEntityKeys}
        motionState={
          transitionActive && zoomGeometry !== null
            ? {
                initialRects: zoomGeometry.toInitial,
                targetRects: zoomGeometry.toTarget,
                opacityFrom: 0,
                opacityTo: 1,
                zIndex:
                  visualState.activeZoom?.zoom.direction === "out" ? 1 : 2,
              }
            : { zIndex: 1 }
        }
        interactive={!transitionActive}
        hiddenFromAccessibility={false}
        onEnterCluster={onEnterCluster}
        onEnterNode={onEnterNode}
        onInspectPod={onInspectPod}
      />

      {(currentLayout.selectionMissing || visibleLayoutCount === 0) && (
        <div className="hierarchy-empty">
          <Box aria-hidden="true" />
          <strong>
            {currentLayout.selectionMissing
              ? "선택한 리소스를 찾을 수 없습니다"
              : "이 범위에 표시할 리소스가 없습니다"}
          </strong>
          <span>
            {currentLayout.selectionMissing
              ? "최신 스냅샷으로 범위를 다시 선택하세요."
              : "현재 필터와 접근 권한을 확인하세요."}
          </span>
        </div>
      )}
    </div>
  );
}

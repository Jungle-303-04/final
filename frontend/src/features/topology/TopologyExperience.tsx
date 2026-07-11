import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Box,
  ChevronRight,
  CircleDot,
  Database,
  RefreshCw,
  X,
} from "lucide-react";

import type {
  AreaMetricDescriptor,
  PodTopologyEntity,
  TopologyHierarchyGateway,
} from "./contracts";
import { createHierarchyEngineProjection } from "./engineProjection";
import { HierarchyTreemap, type HierarchyScope } from "./hierarchy/HierarchyTreemap";
import { useTopologyHierarchy } from "./hierarchy/useTopologyHierarchy";

type TopologyExperienceProps = {
  readonly gateway: TopologyHierarchyGateway;
};

function scopeLabel(scope: HierarchyScope) {
  if (scope.level === "fleet") return "전체 클러스터";
  if (scope.level === "cluster") return "클러스터";
  return "노드";
}

function MetricSelector({
  metrics,
  selectedMetricId,
  onChange,
}: {
  readonly metrics: readonly AreaMetricDescriptor[];
  readonly selectedMetricId: string;
  readonly onChange: (metricId: string) => void;
}) {
  return (
    <label className="metric-selector">
      <span>면적 기준</span>
      <select value={selectedMetricId} onChange={(event) => onChange(event.target.value)}>
        {metrics
          .slice()
          .sort((left, right) => left.order - right.order)
          .map((metric) => (
            <option key={metric.metricId} value={metric.metricId}>
              {metric.label}
            </option>
          ))}
      </select>
    </label>
  );
}

export function TopologyExperience({ gateway }: TopologyExperienceProps) {
  const { state, refresh } = useTopologyHierarchy(gateway);
  const [scope, setScope] = useState<HierarchyScope>({ level: "fleet" });
  const [selectedMetricId, setSelectedMetricId] = useState<string | null>(null);
  const [inspectedPod, setInspectedPod] = useState<PodTopologyEntity | null>(null);
  const scopeHeadingRef = useRef<HTMLDivElement>(null);
  const initialScopeRef = useRef(true);

  useEffect(() => {
    if (initialScopeRef.current) {
      initialScopeRef.current = false;
      return;
    }
    scopeHeadingRef.current?.focus({ preventScroll: true });
  }, [scope]);

  useEffect(() => {
    if (state.status !== "ready") return;
    const selectedExists = state.snapshot.areaMetrics.some(
      (metric) => metric.metricId === selectedMetricId,
    );
    if (!selectedExists) setSelectedMetricId(state.snapshot.defaultAreaMetricId);
  }, [selectedMetricId, state]);

  const selectedMetric = useMemo(() => {
    if (state.status !== "ready") return null;
    return (
      state.snapshot.areaMetrics.find((metric) => metric.metricId === selectedMetricId) ??
      state.snapshot.areaMetrics.find(
        (metric) => metric.metricId === state.snapshot.defaultAreaMetricId,
      ) ??
      state.snapshot.areaMetrics[0] ??
      null
    );
  }, [selectedMetricId, state]);

  const engineProjection = useMemo(() => {
    if (state.status !== "ready") return null;
    return createHierarchyEngineProjection(state.snapshot, scope);
  }, [scope, state]);

  if (state.status === "loading") {
    return (
      <section className="topology-state" aria-busy="true" aria-live="polite">
        <div className="topology-state__pulse" />
        <strong>Topology 스냅샷을 불러오는 중입니다</strong>
        <span>가짜 리소스나 수치를 대신 표시하지 않습니다.</span>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="topology-state topology-state--error" role="alert">
        <AlertTriangle aria-hidden="true" />
        <strong>Topology 데이터에 연결할 수 없습니다</strong>
        <span>{state.error.message}</span>
        <button type="button" onClick={refresh}>
          <RefreshCw aria-hidden="true" /> 다시 시도
        </button>
      </section>
    );
  }

  if (selectedMetric === null) {
    return (
      <section className="topology-state" role="status">
        <Database aria-hidden="true" />
        <strong>면적에 사용할 지표가 없습니다</strong>
        <span>백엔드 metric catalog에서 합산 가능한 절대값 지표를 제공해야 합니다.</span>
      </section>
    );
  }

  if (engineProjection === null || !engineProjection.ok) {
    return (
      <section className="topology-state topology-state--error" role="alert">
        <AlertTriangle aria-hidden="true" />
        <strong>Topology 계약을 검증할 수 없습니다</strong>
        <span>
          {engineProjection?.ok === false
            ? engineProjection.error.message
            : "Topology engine projection is unavailable."}
        </span>
        <button type="button" onClick={refresh}>
          <RefreshCw aria-hidden="true" /> 다시 시도
        </button>
      </section>
    );
  }

  const cluster =
    scope.level === "fleet"
      ? null
      : state.snapshot.clusters.find((item) => item.entityKey === scope.clusterKey) ?? null;
  const node =
    scope.level === "node"
      ? cluster?.nodes.find((item) => item.entityKey === scope.nodeKey) ?? null
      : null;

  return (
    <section className="topology-experience" aria-label="Kubernetes 실행 계층 Topology">
      {state.snapshot.dataOrigin.kind === "synthetic" && (
        <div className="demo-data-banner" role="status">
          DEMO DATA · {state.snapshot.dataOrigin.datasetId}
        </div>
      )}

      <header className="topology-context-bar">
        <nav aria-label="Topology 범위" className="topology-breadcrumbs">
          <button type="button" onClick={() => setScope({ level: "fleet" })}>
            클러스터
          </button>
          {cluster !== null && (
            <>
              <ChevronRight aria-hidden="true" />
              <button
                type="button"
                onClick={() =>
                  setScope({ level: "cluster", clusterKey: cluster.entityKey })
                }
              >
                {cluster.displayName}
              </button>
            </>
          )}
          {node !== null && (
            <>
              <ChevronRight aria-hidden="true" />
              <span aria-current="page">{node.displayName}</span>
            </>
          )}
        </nav>

        <div className="topology-context-bar__actions">
          <span className="snapshot-status">
            <CircleDot aria-hidden="true" />
            {state.snapshot.completeness.state === "complete" ? "완전한 스냅샷" : "부분 스냅샷"}
          </span>
          <MetricSelector
            metrics={state.snapshot.areaMetrics}
            selectedMetricId={selectedMetric.metricId}
            onChange={setSelectedMetricId}
          />
          <button
            type="button"
            className="icon-action"
            aria-label="Topology 새로고침"
            onClick={refresh}
            disabled={state.refreshing}
          >
            <RefreshCw aria-hidden="true" className={state.refreshing ? "is-spinning" : ""} />
          </button>
        </div>
      </header>

      {state.refreshError !== null && (
        <div className="refresh-warning" role="status">
          최신 갱신에 실패했습니다. 마지막 성공 스냅샷을 유지합니다.
        </div>
      )}

      <div className="topology-canvas-frame">
        <div
          ref={scopeHeadingRef}
          className="canvas-heading"
          tabIndex={-1}
          aria-live="polite"
        >
          <span>{scopeLabel(scope)}</span>
          <strong>{selectedMetric.label}</strong>
        </div>
        <HierarchyTreemap
          snapshot={state.snapshot}
          metric={selectedMetric}
          scope={scope}
          engineState={engineProjection.projection.state}
          onEnterCluster={(clusterKey) => {
            setInspectedPod(null);
            setScope({ level: "cluster", clusterKey });
          }}
          onEnterNode={(clusterKey, nodeKey) => {
            setInspectedPod(null);
            setScope({ level: "node", clusterKey, nodeKey });
          }}
          onInspectPod={setInspectedPod}
        />
        <footer className="health-legend" aria-label="상태 범례">
          {(["healthy", "neutral", "degraded", "unhealthy", "unknown"] as const).map(
            (health) => (
              <span key={health} data-health={health}>
                <i /> {health}
              </span>
            ),
          )}
        </footer>
      </div>

      {inspectedPod !== null && (
        <aside className="pod-inspector" aria-label={`${inspectedPod.displayName} 상세`}>
          <header>
            <span><Box aria-hidden="true" /> Pod</span>
            <button
              type="button"
              className="icon-action"
              aria-label="Pod 상세 닫기"
              onClick={() => setInspectedPod(null)}
            >
              <X aria-hidden="true" />
            </button>
          </header>
          <strong>{inspectedPod.displayName}</strong>
          <dl>
            <div><dt>Namespace</dt><dd>{inspectedPod.namespace}</dd></div>
            <div><dt>Phase</dt><dd>{inspectedPod.phase}</dd></div>
            <div><dt>상태</dt><dd>{inspectedPod.health}</dd></div>
            <div><dt>근거</dt><dd>{inspectedPod.healthReason}</dd></div>
          </dl>
        </aside>
      )}
    </section>
  );
}

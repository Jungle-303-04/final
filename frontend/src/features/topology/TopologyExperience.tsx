import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Box,
  CircleDot,
  Clock3,
  Database,
  RefreshCw,
  X,
} from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  NativeSelect,
  NativeSelectOption,
  Spinner,
} from "../../design-system";

import type {
  AreaMetricDescriptor,
  Freshness,
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

function durationLabel(durationMs: number): string {
  if (durationMs < 1_000) return `${durationMs}ms`;
  const seconds = durationMs / 1_000;
  if (seconds < 60) return `${seconds.toLocaleString("ko-KR")}초`;
  const minutes = seconds / 60;
  return `${minutes.toLocaleString("ko-KR")}분`;
}

function freshnessLabel(freshness: Freshness): string {
  if (freshness.state === "fresh") return "최신";
  if (freshness.state === "stale") return "오래된 스냅샷";
  return "관측 시각 불명";
}

function freshnessDetail(freshness: Freshness): string | null {
  if (freshness.state === "fresh") return null;
  const safeDetail = freshness.reason.detail?.trim();
  if (safeDetail) return safeDetail;
  if (freshness.state === "stale") {
    return `마지막 관측이 ${durationLabel(freshness.ageMs)} 전이며 최신성 기준 ${durationLabel(freshness.staleAfterMs)}을 초과했습니다. 마지막 성공 배치를 유지합니다.`;
  }
  return "신뢰할 수 있는 관측 시각을 확인할 수 없습니다. 제공된 마지막 성공 배치를 유지합니다.";
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
      <NativeSelect
        size="sm"
        value={selectedMetricId}
        onChange={(event) => onChange(event.target.value)}
      >
        {metrics
          .slice()
          .sort((left, right) => left.order - right.order)
          .map((metric) => (
            <NativeSelectOption key={metric.metricId} value={metric.metricId}>
              {metric.label}
            </NativeSelectOption>
          ))}
      </NativeSelect>
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
      <Empty className="topology-state" aria-busy="true" aria-live="polite">
        <EmptyHeader>
          <EmptyMedia variant="icon"><Spinner label="Topology 불러오는 중" /></EmptyMedia>
          <EmptyTitle>Topology 스냅샷을 불러오는 중입니다</EmptyTitle>
          <EmptyDescription>가짜 리소스나 수치를 대신 표시하지 않습니다.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (state.status === "error") {
    return (
      <Alert className="topology-state topology-state--error" variant="destructive" role="alert">
        <AlertTriangle aria-hidden="true" data-icon="inline-start" />
        <AlertTitle>Topology 데이터에 연결할 수 없습니다</AlertTitle>
        <AlertDescription>{state.error.message}</AlertDescription>
        <Button variant="outline" size="sm" onClick={refresh}>
          <RefreshCw aria-hidden="true" data-icon="inline-start" /> 다시 시도
        </Button>
      </Alert>
    );
  }

  if (selectedMetric === null) {
    return (
      <Empty className="topology-state" role="status">
        <EmptyHeader>
          <EmptyMedia variant="icon"><Database aria-hidden="true" /></EmptyMedia>
          <EmptyTitle>면적에 사용할 지표가 없습니다</EmptyTitle>
          <EmptyDescription>
            백엔드 metric catalog에서 합산 가능한 절대값 지표를 제공해야 합니다.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (engineProjection === null || !engineProjection.ok) {
    return (
      <Alert className="topology-state topology-state--error" variant="destructive" role="alert">
        <AlertTriangle aria-hidden="true" data-icon="inline-start" />
        <AlertTitle>Topology 계약을 검증할 수 없습니다</AlertTitle>
        <AlertDescription>
          {engineProjection?.ok === false
            ? engineProjection.error.message
            : "Topology engine projection is unavailable."}
        </AlertDescription>
        <Button variant="outline" size="sm" onClick={refresh}>
          <RefreshCw aria-hidden="true" data-icon="inline-start" /> 다시 시도
        </Button>
      </Alert>
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
        <Badge className="demo-data-banner" variant="warning" role="status">
          DEMO DATA · {state.snapshot.dataOrigin.datasetId}
        </Badge>
      )}

      <header className="topology-context-bar">
        <Breadcrumb aria-label="Topology 범위" className="topology-breadcrumbs">
          <BreadcrumbList>
            <BreadcrumbItem>
              {scope.level === "fleet" ? (
                <BreadcrumbPage>클러스터</BreadcrumbPage>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setScope({ level: "fleet" })}
                >
                  클러스터
                </Button>
              )}
            </BreadcrumbItem>
            {cluster !== null && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  {scope.level === "cluster" ? (
                    <BreadcrumbPage>{cluster.displayName}</BreadcrumbPage>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setScope({ level: "cluster", clusterKey: cluster.entityKey })
                      }
                    >
                      {cluster.displayName}
                    </Button>
                  )}
                </BreadcrumbItem>
              </>
            )}
            {node !== null && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{node.displayName}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>

        <div className="topology-context-bar__actions">
          <Badge
            className="snapshot-status"
            variant={
              state.snapshot.completeness.state === "complete"
                ? "outline"
                : "warning"
            }
          >
            <CircleDot aria-hidden="true" data-icon="inline-start" />
            {state.snapshot.completeness.state === "complete" ? "완전한 스냅샷" : "부분 스냅샷"}
          </Badge>
          <Badge
            className="freshness-status"
            variant={
              state.snapshot.freshness.state === "fresh"
                ? "success"
                : state.snapshot.freshness.state === "stale"
                  ? "warning"
                  : "info"
            }
          >
            <Clock3 aria-hidden="true" data-icon="inline-start" />
            {freshnessLabel(state.snapshot.freshness)}
          </Badge>
          <MetricSelector
            metrics={state.snapshot.areaMetrics}
            selectedMetricId={selectedMetric.metricId}
            onChange={setSelectedMetricId}
          />
          <Button
            className="icon-action"
            size="icon"
            variant="outline"
            aria-label="Topology 새로고침"
            onClick={refresh}
            disabled={state.refreshing}
          >
            {state.refreshing
              ? <Spinner label="Topology 새로고침 중" />
              : <RefreshCw aria-hidden="true" />}
          </Button>
        </div>
      </header>

      <div
        className="topology-notices"
        role="region"
        aria-label="Topology 상태 알림"
      >
        {state.refreshError !== null && (
          <Alert className="topology-notice" variant="warning" role="status">
            <AlertTriangle aria-hidden="true" data-icon="inline-start" />
            <AlertTitle>새로고침 실패</AlertTitle>
            <AlertDescription>
              최신 갱신에 실패했습니다. 마지막 성공 스냅샷을 유지합니다.
            </AlertDescription>
          </Alert>
        )}

        {state.snapshot.completeness.state === "partial" && (
          <Alert className="topology-notice" variant="warning" role="status">
            <AlertTriangle aria-hidden="true" data-icon="inline-start" />
            <AlertTitle>일부 데이터만 표시 중</AlertTitle>
            <AlertDescription>
              <ul className="topology-notice__reasons">
                {state.snapshot.completeness.reasons.map((reason, index) => (
                  <li key={`${index}:${reason}`}>{reason}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {state.snapshot.freshness.state !== "fresh" && (
          <Alert
            className="topology-notice"
            variant={
              state.snapshot.freshness.state === "stale" ? "warning" : "info"
            }
            role="status"
          >
            <Clock3 aria-hidden="true" data-icon="inline-start" />
            <AlertTitle>
              {state.snapshot.freshness.state === "stale"
                ? "최신성 기준 초과"
                : "관측 시각 확인 불가"}
            </AlertTitle>
            <AlertDescription>
              {freshnessDetail(state.snapshot.freshness)}
            </AlertDescription>
          </Alert>
        )}
      </div>

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
        <Card
          className="pod-inspector"
          role="complementary"
          aria-label={`${inspectedPod.displayName} 상세`}
        >
          <CardHeader className="pod-inspector__header">
            <CardTitle>{inspectedPod.displayName}</CardTitle>
            <CardDescription>
              <Box aria-hidden="true" /> Pod
            </CardDescription>
            <CardAction>
              <Button
                className="icon-action"
                size="icon"
                variant="ghost"
                aria-label="Pod 상세 닫기"
                onClick={() => setInspectedPod(null)}
              >
                <X aria-hidden="true" />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="pod-inspector__content">
            <dl>
              <div><dt>Namespace</dt><dd>{inspectedPod.namespace}</dd></div>
              <div><dt>Phase</dt><dd>{inspectedPod.phase}</dd></div>
              <div><dt>상태</dt><dd>{inspectedPod.health}</dd></div>
              <div><dt>근거</dt><dd>{inspectedPod.healthReason}</dd></div>
            </dl>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

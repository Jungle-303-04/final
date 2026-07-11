import { useEffect, useMemo } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { ApiError } from "../../api";
import type { ProductOutletContext } from "../../app/ProductShell";
import { Surface } from "../../shared/ui/Surface";
import { MetricPresetPanel } from "./MetricPresetPanel";
import { LivePathCard, UsagePathCard } from "./MetricsPathCards";
import { METRIC_PRESETS } from "./presets";
import { useClusterList, useClusterUsage, useLiveMetrics } from "./useMetricsConnections";

export function MetricsConnectionPage() {
  const { session } = useOutletContext<ProductOutletContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const clusterList = useClusterList();
  const requestedClusterId = searchParams.get("cluster");

  const selection = useMemo(() => {
    if (clusterList.status !== "ready") return { cluster: null, inaccessibleId: null };
    if (requestedClusterId === null) {
      return { cluster: clusterList.clusters[0] ?? null, inaccessibleId: null };
    }
    const cluster = clusterList.clusters.find(({ clusterId }) => clusterId === requestedClusterId);
    return { cluster: cluster ?? null, inaccessibleId: cluster ? null : requestedClusterId };
  }, [clusterList, requestedClusterId]);

  useEffect(() => {
    if (requestedClusterId !== null || selection.cluster === null) return;
    const next = new URLSearchParams(searchParams);
    next.set("cluster", selection.cluster.clusterId);
    setSearchParams(next, { replace: true });
  }, [requestedClusterId, searchParams, selection.cluster, setSearchParams]);

  const selectedClusterId = selection.cluster?.clusterId ?? null;
  const usage = useClusterUsage(selectedClusterId);
  const live = useLiveMetrics(session.workspace_id, selectedClusterId);

  function selectCluster(clusterId: string) {
    const next = new URLSearchParams(searchParams);
    next.set("cluster", clusterId);
    setSearchParams(next);
  }

  return (
    <div className="product-content metrics-page">
      <header className="page-heading metrics-page__heading">
        <div>
          <span className="eyebrow">METRICS / REAL DATA PATHS</span>
          <h1>클러스터 관측 경로</h1>
          <p>스냅샷, 실시간 요약, 온디맨드 PromQL을 각각의 실제 계약으로 확인합니다.</p>
        </div>
        {clusterList.status === "ready" && clusterList.clusters.length > 0 ? (
          <label className="cluster-selector">
            <span>클러스터</span>
            <select
              value={selectedClusterId ?? ""}
              onChange={(event) => selectCluster(event.target.value)}
            >
              {clusterList.clusters.map((cluster) => (
                <option key={cluster.clusterId} value={cluster.clusterId}>
                  {cluster.name} · {cluster.clusterId}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </header>

      {clusterList.status === "loading" ? <ConnectionNotice text="접근 가능한 클러스터를 확인하는 중입니다." /> : null}
      {clusterList.status === "error" ? <ConnectionError error={clusterList.error} /> : null}
      {clusterList.status === "ready" && clusterList.clusters.length === 0 ? (
        <ConnectionNotice text="현재 세션에서 접근 가능한 실제 클러스터가 없습니다." />
      ) : null}
      {selection.inaccessibleId !== null ? (
        <ConnectionNotice
          tone="error"
          text={`요청한 클러스터 '${selection.inaccessibleId}'에 접근할 수 없습니다.`}
        />
      ) : null}

      {selection.cluster !== null ? (
        <>
          <section className="metrics-path-grid" aria-label="메트릭 데이터 경로 상태">
            <UsagePathCard state={usage} />
            <LivePathCard state={live} />
            <Surface className="metrics-path-card">
              <span className="eyebrow">ON-DEMAND</span>
              <h2>PromQL 명령 경로</h2>
              <p>명령 receipt를 받은 뒤 상태 API만 폴링합니다. POST는 자동 재시도하지 않습니다.</p>
              <strong>{METRIC_PRESETS.length}개 프리셋 준비됨</strong>
            </Surface>
          </section>

          <MetricPresetPanel key={selection.cluster.clusterId} cluster={selection.cluster} />
        </>
      ) : null}
    </div>
  );
}

function ConnectionNotice({ text, tone }: { text: string; tone?: "error" }) {
  return <Surface className="connection-notice" data-tone={tone}>{text}</Surface>;
}

function ConnectionError({ error }: { error: ApiError }) {
  return <ConnectionNotice tone="error" text={error.message} />;
}

import { ApiError, type FleetClusterSummary, type FleetHealth, type FleetSummary, type RcaTimeline, type RcaTimelineItem } from "../../api";
import { Metric } from "../../shared/ui/Metric";
import { StatusMark } from "../../shared/ui/StatusMark";
import { Surface } from "../../shared/ui/Surface";

const healthOrder: FleetHealth[] = ["critical", "warning", "stale", "unknown", "healthy"];

export function FleetPage({ fleet, timeline, timelineError, onRefresh }: {
  fleet: FleetSummary;
  timeline: RcaTimeline | null;
  timelineError: ApiError | null;
  onRefresh: () => void;
}) {
  const clusters = [...fleet.clusters].sort((left, right) => healthOrder.indexOf(left.health) - healthOrder.indexOf(right.health));
  const attentionClusterCount = fleet.totals.critical + fleet.totals.warning;

  return (
    <div className="product-content">
        <header className="page-heading">
          <div>
            <span className="eyebrow">FLEET / LIVE READ MODEL</span>
            <h1>무엇을 먼저 봐야 하나요?</h1>
            <p>접근 가능한 클러스터의 현재 health와 관측 신선도를 한 화면에서 확인합니다.</p>
          </div>
          <button className="button button--secondary" type="button" onClick={onRefresh}>새로고침 <span aria-hidden="true">↗</span></button>
        </header>

        <section className="status-strip" aria-label="Fleet 상태 요약">
          <Metric label="전체 클러스터" value={fleet.totals.clusters} />
          <Metric label="위험" value={fleet.totals.critical} tone="critical" note="즉시 확인" />
          <Metric label="주의" value={fleet.totals.warning} tone="warning" note="변화 감지" />
          <Metric label="열린 인시던트" value={fleet.totals.open_incidents} tone="critical" />
          <Metric label="승인 대기" value={fleet.totals.pending_approvals} />
          <Metric label="실행 중 워크플로" value={fleet.totals.running_workflows} />
        </section>

        <div className="fleet-layout">
          <Surface className="fleet-field">
            <SectionHeader eyebrow="CLUSTER SCAN" title="클러스터 상태" detail={`${clusters.length}개 접근 가능`} />
            {clusters.length ? (
              <div className="cluster-list">
                {clusters.map((cluster) => <ClusterRow key={cluster.cluster_id} cluster={cluster} />)}
              </div>
            ) : (
              <div className="empty-state"><strong>관측 가능한 클러스터가 없습니다.</strong><span>권한이 있거나 등록이 완료된 클러스터가 이 workspace에 없습니다.</span></div>
            )}
          </Surface>

          <aside className="attention-column">
            <Surface className="attention-panel">
              <SectionHeader eyebrow="ATTENTION" title="조치가 필요한 신호" detail={`${attentionClusterCount}개 클러스터`} />
              <div className="attention-counts">
                <Metric label="위험 클러스터" value={fleet.totals.critical} tone="critical" />
                <Metric label="최근 인시던트" value={fleet.totals.open_incidents} tone="warning" />
                <Metric label="이벤트 큐" value={fleet.totals.dead_letters} />
              </div>
            </Surface>
            <Surface className="activity-panel">
              <SectionHeader eyebrow="RCA TIMELINE" title="최근 운영 활동" detail={timeline ? `${timeline.items.length}건` : "권한 확인 필요"} />
              {timelineError && timelineError.kind !== "forbidden" && timelineError.kind !== "unauthorized" ? <p className="subtle-error">활동을 불러오지 못했습니다.</p> : null}
              {timeline?.items.length ? <ActivityList items={timeline.items} /> : <div className="empty-state empty-state--compact"><strong>표시할 운영 활동이 없습니다.</strong><span>백엔드 read model에 기록된 항목만 표시합니다.</span></div>}
            </Surface>
          </aside>
        </div>
    </div>
  );
}

function SectionHeader({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return <header className="section-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><span className="section-heading__detail">{detail}</span></header>;
}

function ClusterRow({ cluster }: { cluster: FleetClusterSummary }) {
  return (
    <article className="cluster-row" data-health={cluster.health}>
      <div className="cluster-row__identity"><StatusMark health={cluster.health} /><h3>{cluster.name}</h3><code>{cluster.cluster_id}</code></div>
      <div className="cluster-row__signals"><Signal label="PODS" value={`${cluster.pods_running}/${cluster.pods_total}`} /><Signal label="NODES" value={`${cluster.nodes_ready}/${cluster.nodes_total}`} /><Signal label="RESTART Δ" value={String(cluster.restarts_recent)} /></div>
      <div className="cluster-row__usage"><Usage label="CPU" value={cluster.cpu_pct} /><Usage label="MEM" value={cluster.mem_pct} /></div>
      <time className="cluster-row__last-seen" dateTime={cluster.last_seen_at ?? undefined}>{formatRelative(cluster.last_seen_at)}</time>
    </article>
  );
}

function Signal({ label, value }: { label: string; value: string }) { return <span><small>{label}</small><strong>{value}</strong></span>; }

function Usage({ label, value }: { label: string; value: number | null }) {
  return <span className="usage"><small>{label}</small>{value === null ? <strong>—</strong> : <><meter min="0" max="100" value={value} /><strong>{formatPercent(value)}</strong></>}</span>;
}

function ActivityList({ items }: { items: RcaTimelineItem[] }) {
  return <ol className="activity-list">{items.map((item) => <li key={`${item.correlation_id}-${item.updated_at ?? "unknown"}`}><span className="activity-list__marker" data-status={item.status} /><div><strong>{item.incident_symptom ?? item.root_cause ?? item.current_subject}</strong><span>{item.cluster_id ?? "클러스터 미상"} · {item.status}</span></div><time dateTime={item.updated_at ?? undefined}>{formatRelative(item.updated_at)}</time></li>)}</ol>;
}

function formatPercent(value: number): string { return `${Math.round(value)}%`; }

function formatRelative(value: string | null): string {
  if (!value) return "시간 정보 없음";
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "시간 정보 없음";
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}시간 전` : `${Math.round(hours / 24)}일 전`;
}

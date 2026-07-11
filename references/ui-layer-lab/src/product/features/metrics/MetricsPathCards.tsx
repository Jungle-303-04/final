import type { RealtimeConnectionState } from "../../api/live";
import { Surface } from "../../shared/ui/Surface";
import type { LiveMetricsState, UsageState } from "./useMetricsConnections";

export function UsagePathCard({ state }: { state: UsageState }) {
  if (state.status === "idle" || state.status === "loading") {
    return <PathCard eyebrow="30S SNAPSHOT" title="Usage 시계열" detail="불러오는 중" />;
  }
  if (state.status === "error") {
    return <PathCard eyebrow="30S SNAPSHOT" title="Usage 시계열" detail={state.error.message} tone="error" />;
  }

  const observedSamples = state.value.samples.filter(({ sampled_at }) => sampled_at !== null);
  const latest = observedSamples[observedSamples.length - 1];
  return (
    <Surface className="metrics-path-card">
      <span className="eyebrow">30S SNAPSHOT</span>
      <h2>Usage 시계열</h2>
      <p>{state.refreshing ? "백그라운드 갱신 중" : `${observedSamples.length}개 관측 샘플`}</p>
      {latest ? (
        <dl className="metrics-inline-values">
          <div><dt>팟</dt><dd>{formatPair(latest.usage.pod_running, latest.usage.pod_total)}</dd></div>
          <div><dt>노드</dt><dd>{formatPair(latest.usage.node_ready, latest.usage.node_total)}</dd></div>
          <div><dt>CPU</dt><dd>{formatPercent(latest.usage.cpu_pct)}</dd></div>
          <div><dt>메모리</dt><dd>{formatPercent(latest.usage.mem_pct)}</dd></div>
        </dl>
      ) : <strong>관측 시각이 있는 샘플 없음</strong>}
    </Surface>
  );
}

export function LivePathCard({ state }: { state: LiveMetricsState }) {
  const status = state.connection?.status ?? "idle";
  return (
    <Surface className="metrics-path-card">
      <span className="eyebrow">REALTIME.V1</span>
      <h2>실시간 요약</h2>
      <p>연결 상태: {realtimeStatusLabel(status)}</p>
      {state.summary ? (
        <dl className="metrics-inline-values">
          <div><dt>준비된 팟</dt><dd>{formatPair(state.summary.pods_ready, state.summary.pods_total)}</dd></div>
          <div><dt>재시작 Δ</dt><dd>{state.summary.restart_delta}</dd></div>
          <div><dt>Rollout</dt><dd>{state.summary.rollout_phase}</dd></div>
        </dl>
      ) : <strong>{status === "connected" ? "실시간 요약 대기 중" : "handshake 확인 전"}</strong>}
      {state.connection?.error ? <span className="metrics-path-card__error">{state.connection.error.message}</span> : null}
    </Surface>
  );
}

function PathCard({ eyebrow, title, detail, tone }: {
  eyebrow: string;
  title: string;
  detail: string;
  tone?: "error";
}) {
  return (
    <Surface className="metrics-path-card" data-tone={tone}>
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      <p>{detail}</p>
    </Surface>
  );
}

function formatPair(current: number | undefined, total: number | undefined): string {
  return current === undefined || total === undefined ? "—" : `${current}/${total}`;
}

function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${Math.round(value)}%`;
}

function realtimeStatusLabel(status: RealtimeConnectionState["status"]): string {
  return {
    idle: "대기",
    connecting: "handshake 중",
    connected: "연결됨",
    reconnecting: "재연결 중",
    disconnected: "연결 끊김",
    closed: "종료됨",
  }[status];
}

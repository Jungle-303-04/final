// 위젯 쿼리 엔진 — metrics.ts(팟-상향 집계)를 유일한 데이터 소스로 평가한다
// 불변식:
//  - I6: 플릿 스코프는 반드시 "가시 클러스터 목록"을 받아 계산 (호출부가 주입)
//  - I9: 스코프는 페이지가 주입. 쿼리 라벨 {cluster="…"}로만 재정의 가능
//  - I11: 수집기 비정상 스코프는 값을 지어내지 않고 nodata 반환
import { ALERTS, hashStr, mulberry32 } from '../api';
import {
  collectorOf,
  getClusterAgg,
  getFleetAgg,
  getNodeAggs,
  getPodMetrics,
  getServiceAggs,
  NODE_SPEC,
} from '../api';
import {
  GROUP_FORMS,
  GROUPABLE_METRICS,
  METRIC_META,
  type GroupKey,
  type MetricKey,
  type WidgetConfig,
  type WidgetData,
  type WidgetQuery,
  type WidgetScope,
} from './types';

/* ── 알림 수 (시나리오 정합: 알림 4건은 모두 클러스터02 관련) ── */
function alertCount(scope: WidgetScope): number {
  if (scope.level === 'fleet') return ALERTS.length;
  const clusterId = scope.clusterId;
  if (clusterId !== 'cluster02') return 0;
  if (scope.level === 'cluster') return ALERTS.length;
  if (scope.level === 'service')
    return ALERTS.filter((a) => a.resource.includes(scope.service)).length;
  return 1; // 노드 스코프: NodeNotReady 1건
}

/* ── 스코프의 팟 집합 (service/node 레벨) ── */
function podsInScope(scope: WidgetScope) {
  if (scope.level === 'service')
    return getPodMetrics(scope.clusterId).filter((p) => p.service === scope.service);
  if (scope.level === 'node')
    return getPodMetrics(scope.clusterId).filter((p) => p.nodeName === scope.node);
  return [];
}

/* ── 스칼라 평가 ─────────────────────── */
function scalar(metric: MetricKey, scope: WidgetScope, visibleClusterIds: string[]): WidgetData {
  if (scope.level === 'fleet') {
    const fleet = getFleetAgg(visibleClusterIds);
    const note =
      fleet.noData.length > 0 ? `수집기 비정상 ${fleet.noData.length}개 클러스터 제외` : undefined;
    switch (metric) {
      case 'cpu_use_pct':
        return { kind: 'scalar', value: fleet.cpuUsePct, unit: '%', live: true, note };
      case 'mem_use_pct':
        return { kind: 'scalar', value: fleet.memUsePct, unit: '%', live: true, note };
      case 'pod_count':
        return { kind: 'scalar', value: fleet.podCount, unit: '개', note };
      case 'cost_month':
        return { kind: 'scalar', value: fleet.costMonth, unit: '$', note };
      case 'cost_delta_pct': {
        const aggs = visibleClusterIds.map(getClusterAgg).filter((a) => a.available);
        const total = aggs.reduce((s, a) => s + a.costMonth, 0);
        const delta = total > 0 ? aggs.reduce((s, a) => s + a.costDeltaPct * a.costMonth, 0) / total : 0;
        return { kind: 'scalar', value: delta, unit: '%', note };
      }
      case 'restart_count': {
        const total = visibleClusterIds
          .filter((id) => collectorOf(id).healthy)
          .reduce((s, id) => s + getPodMetrics(id).reduce((x, p) => x + p.restarts, 0), 0);
        return { kind: 'scalar', value: total, unit: '회', note };
      }
      case 'node_ready_pct': {
        const nodes = visibleClusterIds.filter((id) => collectorOf(id).healthy).flatMap(getNodeAggs);
        const ready = nodes.filter((n) => n.ready).length;
        return { kind: 'scalar', value: nodes.length > 0 ? (ready / nodes.length) * 100 : 0, unit: '%', note };
      }
      case 'alert_count':
        return { kind: 'scalar', value: alertCount(scope), unit: '건' };
    }
  }

  // cluster/service/node 스코프 — 수집기 게이트 (I11)
  const collector = collectorOf(scope.clusterId);
  if (!collector.healthy && metric !== 'alert_count')
    return { kind: 'nodata', reason: collector.reason ?? '수집기 비정상' };

  if (scope.level === 'cluster') {
    const a = getClusterAgg(scope.clusterId);
    switch (metric) {
      case 'cpu_use_pct':
        return { kind: 'scalar', value: a.cpuUsePct, unit: '%', live: true };
      case 'mem_use_pct':
        return { kind: 'scalar', value: a.memUsePct, unit: '%', live: true };
      case 'pod_count':
        return { kind: 'scalar', value: a.podCount, unit: '개' };
      case 'cost_month':
        return { kind: 'scalar', value: a.costMonth, unit: '$', deltaPct: a.costDeltaPct };
      case 'cost_delta_pct':
        return { kind: 'scalar', value: a.costDeltaPct, unit: '%' };
      case 'restart_count':
        return { kind: 'scalar', value: getPodMetrics(scope.clusterId).reduce((s, p) => s + p.restarts, 0), unit: '회' };
      case 'node_ready_pct': {
        const nodes = getNodeAggs(scope.clusterId);
        return { kind: 'scalar', value: (nodes.filter((n) => n.ready).length / nodes.length) * 100, unit: '%' };
      }
      case 'alert_count':
        return { kind: 'scalar', value: alertCount(scope), unit: '건' };
    }
  }

  // service / node 스코프: 팟 집합 기준
  const pods = podsInScope(scope);
  if (pods.length === 0 && metric !== 'alert_count')
    return { kind: 'nodata', reason: '스코프에 해당하는 팟이 없어요' };
  switch (metric) {
    case 'cpu_use_pct': {
      // 사용률 분모: service 레벨은 요청량 합, node 레벨은 노드 용량 (가중 원칙 유지)
      const denom =
        scope.level === 'node' ? NODE_SPEC.cpuCap : pods.reduce((s, p) => s + p.cpuReq, 0);
      return { kind: 'scalar', value: (pods.reduce((s, p) => s + p.cpuUse, 0) / denom) * 100, unit: '%', live: true };
    }
    case 'mem_use_pct': {
      const denom =
        scope.level === 'node' ? NODE_SPEC.memCap : pods.reduce((s, p) => s + p.memReq, 0);
      return { kind: 'scalar', value: (pods.reduce((s, p) => s + p.memUse, 0) / denom) * 100, unit: '%', live: true };
    }
    case 'pod_count':
      return { kind: 'scalar', value: pods.length, unit: '개' };
    case 'cost_month':
      return { kind: 'scalar', value: pods.reduce((s, p) => s + p.costMonth, 0), unit: '$' };
    case 'restart_count':
      return { kind: 'scalar', value: pods.reduce((s, p) => s + p.restarts, 0), unit: '회' };
    case 'alert_count':
      return { kind: 'scalar', value: alertCount(scope), unit: '건' };
    case 'cost_delta_pct':
    case 'node_ready_pct':
      return { kind: 'nodata', reason: `${METRIC_META[metric].label}은(는) 이 스코프에서 제공되지 않아요` };
  }
}

/* ── 그룹 평가 (bar/donut/table) ──────── */
function grouped(
  metric: MetricKey,
  groupBy: GroupKey,
  limit: number,
  scope: WidgetScope,
  visibleClusterIds: string[],
): WidgetData {
  const meta = METRIC_META[metric];
  const pick = (g: { podCount: number; costMonth: number }, restarts?: number): number =>
    metric === 'pod_count' ? g.podCount : metric === 'cost_month' ? g.costMonth : restarts ?? 0;

  let rows: { name: string; value: number }[] = [];
  let note: string | undefined;

  if (scope.level === 'fleet') {
    if (groupBy === 'cluster') {
      const aggs = visibleClusterIds.map(getClusterAgg);
      const noData = aggs.filter((a) => !a.available);
      if (noData.length > 0) note = `데이터 없음 ${noData.length}개 제외`;
      rows = aggs
        .filter((a) => a.available)
        .map((a) => ({
          name: a.clusterId,
          value: metric === 'pod_count' ? a.podCount : metric === 'cost_month' ? a.costMonth : getPodMetrics(a.clusterId).reduce((s, p) => s + p.restarts, 0),
        }));
    } else {
      // 서비스별 플릿 합산
      const map = new Map<string, number>();
      const ok = visibleClusterIds.filter((id) => collectorOf(id).healthy);
      const skipped = visibleClusterIds.length - ok.length;
      if (skipped > 0) note = `데이터 없음 ${skipped}개 제외`;
      for (const id of ok)
        for (const g of getServiceAggs(id)) {
          const restarts =
            metric === 'restart_count'
              ? getPodMetrics(id).filter((p) => p.service === g.name).reduce((s, p) => s + p.restarts, 0)
              : undefined;
          map.set(g.name, (map.get(g.name) ?? 0) + pick(g, restarts));
        }
      rows = [...map.entries()].map(([name, value]) => ({ name, value }));
    }
  } else {
    const collector = collectorOf(scope.clusterId);
    if (!collector.healthy) return { kind: 'nodata', reason: collector.reason ?? '수집기 비정상' };
    const pods =
      scope.level === 'cluster' ? getPodMetrics(scope.clusterId) : podsInScope(scope);
    const keyOf = (p: (typeof pods)[number]) =>
      groupBy === 'service' ? p.service : groupBy === 'node' ? p.nodeName.split('.')[0] : groupBy === 'namespace' ? p.namespace : p.service;
    const map = new Map<string, number>();
    for (const p of pods) {
      const v = metric === 'pod_count' ? 1 : metric === 'cost_month' ? p.costMonth : p.restarts;
      map.set(keyOf(p), (map.get(keyOf(p)) ?? 0) + v);
    }
    rows = [...map.entries()].map(([name, value]) => ({ name, value }));
  }

  rows.sort((a, b) => b.value - a.value);
  return { kind: 'rows', rows: rows.slice(0, limit), unit: meta.unit, note };
}

/* ── 시계열 (line) — 시드 기반, 현재값 주변 파동 ── */
function series(metric: MetricKey, scope: WidgetScope, visibleClusterIds: string[]): WidgetData {
  const s = scalar(metric, scope, visibleClusterIds);
  if (s.kind !== 'scalar') return s;
  const seed = hashStr(`${JSON.stringify(scope)}:${metric}`);
  const r = mulberry32(seed);
  const vol = Math.max(Math.abs(s.value) * 0.08, 0.5);
  const points = Array.from({ length: 48 }, (_, i) => {
    const wave = Math.sin((i / 48) * Math.PI * 2 - 1.1) * vol * 1.4 + Math.sin((i / 48) * Math.PI * 7) * vol * 0.5;
    return Math.max(0, s.value + wave + (r() - 0.5) * vol);
  });
  points[points.length - 1] = s.value; // 마지막 점 = 현재값 (진실과 연출의 일치)
  return { kind: 'series', points, value: s.value, unit: s.unit, note: s.note };
}

/* ── 공개 API ─────────────────────────── */
export function evaluateWidget(
  config: WidgetConfig,
  scope: WidgetScope,
  visibleClusterIds: string[],
): WidgetData {
  const { query, form } = config;
  // 라벨 재정의 (I9): raw 쿼리의 cluster 라벨은 스코프를 좁힌다 — 가시 범위 밖이면 차단 (I6)
  let effective = scope;
  const override = query.raw?.match(/\{\s*cluster\s*=\s*"([^"]+)"\s*\}/)?.[1];
  if (override) {
    if (!visibleClusterIds.includes(override))
      return { kind: 'nodata', reason: `클러스터 ${override}에 대한 읽기 권한이 없어요` };
    effective = { level: 'cluster', clusterId: override };
  }

  if (GROUP_FORMS.includes(form)) {
    if (!query.groupBy) return { kind: 'nodata', reason: '그룹 기준(groupBy)이 필요해요' };
    if (!GROUPABLE_METRICS.includes(query.metric))
      return { kind: 'nodata', reason: `${METRIC_META[query.metric].label}은(는) 그룹 비교에 쓸 수 없어요 (비율 지표)` };
    return grouped(query.metric, query.groupBy, query.limit ?? 8, effective, visibleClusterIds);
  }
  if (form === 'line') return series(query.metric, effective, visibleClusterIds);
  return scalar(query.metric, effective, visibleClusterIds);
}

/* ── 고급 쿼리 파서 ────────────────────
 * 문법: [agg(]metric[{cluster="id"}][)] [by <group>] [limit N]
 * 예: mem_use_pct{cluster="cluster02"} / cost_month by service limit 5 */
export function parseQuery(
  raw: string,
): { ok: true; query: WidgetQuery } | { ok: false; error: string } {
  const text = raw.trim();
  const m = text.match(
    /^(?:(sum|avg|max)\s*\(\s*)?([a-z_]+)(\{[^}]*\})?\s*\)?\s*(?:by\s+(cluster|service|node|namespace))?\s*(?:limit\s+(\d+))?$/i,
  );
  if (!m) return { ok: false, error: '문법: metric{cluster="…"} [by 그룹] [limit N]' };
  const metric = m[2] as MetricKey;
  if (!(metric in METRIC_META))
    return { ok: false, error: `지원하지 않는 메트릭: ${metric} — 사용 가능: ${Object.keys(METRIC_META).join(', ')}` };
  const labels = m[3] ?? '';
  if (labels && !/^\{\s*cluster\s*=\s*"[^"]+"\s*\}$/.test(labels))
    return { ok: false, error: '라벨은 cluster="…"만 지원해요 (스코프는 페이지에서 자동 주입)' };
  const groupBy = m[4] as GroupKey | undefined;
  if (groupBy && !GROUPABLE_METRICS.includes(metric))
    return { ok: false, error: `${METRIC_META[metric].label}은(는) by ${groupBy}와 함께 쓸 수 없어요 (비율 지표는 그룹 합산이 무의미)` };
  return {
    ok: true,
    query: { metric, groupBy, limit: m[5] ? Number(m[5]) : undefined, raw: text },
  };
}

/** 폼 빌더 상태 → 쿼리 원문 (빌더가 만드는 쿼리를 그대로 보여준다) */
export function stringifyQuery(q: WidgetQuery): string {
  let s: string = q.metric;
  if (q.groupBy) s += ` by ${q.groupBy}`;
  if (q.limit) s += ` limit ${q.limit}`;
  return s;
}

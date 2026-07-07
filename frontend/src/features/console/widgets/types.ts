// 위젯 시스템 타입 (기획서 §4)
// 핵심 계약:
//  - 위젯 = 폼(시각화) + 쿼리(데이터) + 스팬(1~4칸). 폼마다 허용 스팬이 정해져 있다 (SPAN_RULES)
//  - 쿼리에는 페이지 스코프가 자동 주입된다 (I9). 명시적 cluster 라벨로만 재정의 가능
//  - 스코프 레벨마다 유효한 groupBy가 다르다 (GROUPS_FOR_LEVEL) — 무의미한 조합은 만들 수 없다

export type WidgetForm = 'map' | 'stat' | 'gauge' | 'line' | 'bar' | 'donut' | 'table';

export type MetricKey =
  | 'cpu_use_pct'
  | 'mem_use_pct'
  | 'pod_count'
  | 'cost_month'
  | 'cost_delta_pct'
  | 'restart_count'
  | 'node_ready_pct'
  | 'alert_count';

export type GroupKey = 'cluster' | 'service' | 'node' | 'namespace';

/** 위젯 보드를 호스팅하는 페이지의 스코프 — 쿼리에 자동 주입된다 (I9) */
export type WidgetScope =
  | { level: 'fleet' }
  | { level: 'cluster'; clusterId: string }
  | { level: 'service'; clusterId: string; service: string }
  | { level: 'node'; clusterId: string; node: string };

export type WidgetQuery = {
  metric: MetricKey;
  /** 그룹 폼(bar/donut/table)에서만 사용 */
  groupBy?: GroupKey;
  limit?: number;
  /** 고급 모드에서 사용자가 직접 쓴 원문 (폼 빌더와 왕복 변환) */
  raw?: string;
};

export type WidgetConfig = {
  id: string;
  title: string;
  form: WidgetForm;
  query: WidgetQuery;
  span: 1 | 2 | 3 | 4;
  thresholds?: { warn: number; danger: number }; // 게이지/스탯 색 임계값 (pct 계열)
};

export type WidgetData =
  | { kind: 'scalar'; value: number; unit: string; deltaPct?: number; live?: boolean; note?: string }
  | { kind: 'series'; points: number[]; value: number; unit: string; note?: string }
  | { kind: 'rows'; rows: { name: string; value: number }[]; unit: string; note?: string }
  | { kind: 'nodata'; reason: string };

/* ── 폼별 허용 스팬 (아이폰 위젯 문법) ── */
export const SPAN_RULES: Record<WidgetForm, (1 | 2 | 3 | 4)[]> = {
  map: [2, 3, 4],
  stat: [1, 2],
  gauge: [1],
  donut: [1, 2],
  bar: [2, 3, 4],
  line: [2, 3, 4],
  table: [2, 3, 4],
};

/** 그룹 폼인가 (groupBy 필수) */
export const GROUP_FORMS: WidgetForm[] = ['bar', 'donut', 'table'];

/* ── 스코프 레벨별 유효 groupBy (논리 모순 차단) ──
 * fleet: 클러스터/서비스별로 나눌 수 있다
 * cluster: 서비스/노드/네임스페이스별
 * service: 그 서비스의 팟이 퍼져 있는 노드별
 * node: 그 노드 위 팟들의 서비스별 */
export const GROUPS_FOR_LEVEL: Record<WidgetScope['level'], GroupKey[]> = {
  fleet: ['cluster', 'service'],
  cluster: ['service', 'node', 'namespace'],
  service: ['node'],
  node: ['service', 'namespace'],
};

export const METRIC_META: Record<
  MetricKey,
  { label: string; unit: string; kind: 'pct' | 'count' | 'usd'; live: boolean }
> = {
  cpu_use_pct: { label: 'CPU 사용률', unit: '%', kind: 'pct', live: true },
  mem_use_pct: { label: '메모리 사용률', unit: '%', kind: 'pct', live: true },
  pod_count: { label: '팟 수', unit: '개', kind: 'count', live: false },
  cost_month: { label: '월 비용', unit: '$', kind: 'usd', live: false },
  cost_delta_pct: { label: '비용 증감(전주)', unit: '%', kind: 'pct', live: false },
  restart_count: { label: '재시작 수', unit: '회', kind: 'count', live: false },
  node_ready_pct: { label: '노드 Ready 비율', unit: '%', kind: 'pct', live: false },
  alert_count: { label: '활성 알림', unit: '건', kind: 'count', live: false },
};

/** 그룹 지표로 쓸 수 있는 메트릭 (rows의 값) — 비율은 그룹 합산이 무의미하므로 제외 */
export const GROUPABLE_METRICS: MetricKey[] = ['pod_count', 'cost_month', 'restart_count'];

export const GROUP_LABEL: Record<GroupKey, string> = {
  cluster: '클러스터별',
  service: '서비스별',
  node: '노드별',
  namespace: '네임스페이스별',
};

export const FORM_META: Record<WidgetForm, { label: string; desc: string }> = {
  map: { label: '맵 (드릴다운)', desc: '히트맵 탐색 — 셀 클릭으로 한 단계 깊이' },
  stat: { label: '스탯', desc: '큰 숫자 하나 — 총량·현재값' },
  gauge: { label: '게이지', desc: '반원 게이지 — 사용률(%)' },
  line: { label: '라인', desc: '시계열 흐름 — 추세 확인' },
  bar: { label: '바', desc: '수평 막대 — 그룹 간 비교' },
  donut: { label: '도넛', desc: '구성 비율 — 상위 항목 점유' },
  table: { label: '테이블', desc: '순위표 — 상위 N 목록' },
};

export function scopeKey(s: WidgetScope): string {
  switch (s.level) {
    case 'fleet':
      return 'fleet';
    case 'cluster':
      return `cluster:${s.clusterId}`;
    case 'service':
      return `service:${s.clusterId}:${s.service}`;
    case 'node':
      return `node:${s.clusterId}:${s.node}`;
  }
}

export function scopeLabel(s: WidgetScope): string {
  switch (s.level) {
    case 'fleet':
      return '플릿 전체';
    case 'cluster':
      return s.clusterId;
    case 'service':
      return `${s.clusterId} / ${s.service}`;
    case 'node':
      return `${s.clusterId} / ${s.node.split('.')[0]}`;
  }
}

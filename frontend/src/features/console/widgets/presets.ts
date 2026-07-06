// 스코프 레벨별 기본 위젯 프리셋 — 처음 방문 시 이 구성으로 시작한다
import type { WidgetConfig, WidgetScope } from './types';

let seq = 0;
const w = (partial: Omit<WidgetConfig, 'id'>): WidgetConfig => ({ id: `preset-${++seq}`, ...partial });

export function presetsFor(level: WidgetScope['level']): WidgetConfig[] {
  switch (level) {
    case 'fleet':
      return [
        w({ title: '플릿 맵', form: 'map', query: { metric: 'pod_count' }, span: 4 }),
        w({ title: '팟 수', form: 'stat', query: { metric: 'pod_count' }, span: 1 }),
        w({ title: 'CPU 사용률', form: 'gauge', query: { metric: 'cpu_use_pct' }, span: 1 }),
        w({ title: '메모리 사용률', form: 'gauge', query: { metric: 'mem_use_pct' }, span: 1 }),
        w({ title: '활성 알림', form: 'stat', query: { metric: 'alert_count' }, span: 1 }),
        w({ title: 'CPU 추세', form: 'line', query: { metric: 'cpu_use_pct' }, span: 2 }),
        w({ title: '클러스터별 월 비용', form: 'bar', query: { metric: 'cost_month', groupBy: 'cluster', limit: 6 }, span: 2 }),
      ];
    case 'cluster':
      return [
        w({ title: '클러스터 맵', form: 'map', query: { metric: 'pod_count' }, span: 4 }),
        w({ title: 'CPU 사용률', form: 'gauge', query: { metric: 'cpu_use_pct' }, span: 1 }),
        w({ title: '메모리 사용률', form: 'gauge', query: { metric: 'mem_use_pct' }, span: 1 }),
        w({ title: '팟 수', form: 'stat', query: { metric: 'pod_count' }, span: 1 }),
        w({ title: '재시작 수', form: 'stat', query: { metric: 'restart_count' }, span: 1 }),
        w({ title: '메모리 추세', form: 'line', query: { metric: 'mem_use_pct' }, span: 2 }),
        w({ title: '서비스별 월 비용', form: 'table', query: { metric: 'cost_month', groupBy: 'service', limit: 6 }, span: 2 }),
      ];
    case 'service':
      return [
        w({ title: '팟맵', form: 'map', query: { metric: 'pod_count' }, span: 4 }),
        w({ title: '팟 수', form: 'stat', query: { metric: 'pod_count' }, span: 1 }),
        w({ title: '메모리 사용률', form: 'gauge', query: { metric: 'mem_use_pct' }, span: 1 }),
        w({ title: 'CPU 추세', form: 'line', query: { metric: 'cpu_use_pct' }, span: 2 }),
        w({ title: '노드별 팟 분포', form: 'table', query: { metric: 'pod_count', groupBy: 'node', limit: 6 }, span: 2 }),
      ];
    case 'node':
      return [
        w({ title: '팟맵', form: 'map', query: { metric: 'pod_count' }, span: 4 }),
        w({ title: 'CPU 사용률', form: 'gauge', query: { metric: 'cpu_use_pct' }, span: 1 }),
        w({ title: '메모리 사용률', form: 'gauge', query: { metric: 'mem_use_pct' }, span: 1 }),
        w({ title: '팟 수', form: 'stat', query: { metric: 'pod_count' }, span: 1 }),
        w({ title: '서비스별 비용', form: 'donut', query: { metric: 'cost_month', groupBy: 'service', limit: 5 }, span: 1 }),
      ];
  }
}

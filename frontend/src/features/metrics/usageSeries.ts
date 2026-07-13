import type { UsageSample } from '@/features/cluster/api';
import type { Series } from '@/ui/charts';

type UsageMetricKey = 'pod_running' | 'node_ready' | 'restart_total';

export function buildUsageSeries(samples: UsageSample[]): Series[] {
  if (!samples.length) return [];
  return [
    metricSeries('실행 팟', samples, 'pod_running'),
    metricSeries('준비 노드', samples, 'node_ready'),
    restartDeltaSeries(samples),
  ];
}

function metricSeries(id: string, samples: UsageSample[], key: UsageMetricKey): Series {
  return {
    id,
    data: samples.flatMap((sample, index) => {
      const value = valueOf(sample, key);
      return value == null ? [] : [{ x: pointTime(sample, index), y: value }];
    }),
  };
}

// restart_total 은 누적 카운터다. 같은 y축에서 팟/노드 수와 비교하려면 샘플 간 증가분으로 표시해야 한다.
function restartDeltaSeries(samples: UsageSample[]): Series {
  let previous: number | null = null;
  return {
    id: '재시작 증가',
    data: samples.flatMap((sample, index) => {
      const current = valueOf(sample, 'restart_total');
      if (current == null) return [];
      const delta = previous == null ? 0 : Math.max(0, current - previous);
      previous = current;
      return [{ x: pointTime(sample, index), y: delta }];
    }),
  };
}

function valueOf(sample: UsageSample, key: UsageMetricKey): number | null {
  if (!(key in sample.usage)) return null;
  const value = Number(sample.usage[key]);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function pointTime(sample: UsageSample, index: number): number {
  const parsed = sample.sampled_at ? Date.parse(sample.sampled_at) : NaN;
  return Number.isFinite(parsed) ? parsed : index + 1;
}

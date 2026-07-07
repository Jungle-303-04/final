import type { UsageSample } from '@/features/cluster/api';
import type { Series } from '@/shared/ui/charts';

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
  return { id, data: samples.map((sample, index) => ({ x: pointTime(sample, index), y: valueOf(sample, key) })) };
}

// restart_total 은 누적 카운터다. 같은 y축에서 팟/노드 수와 비교하려면 샘플 간 증가분으로 표시해야 한다.
function restartDeltaSeries(samples: UsageSample[]): Series {
  return {
    id: '재시작 증가',
    data: samples.map((sample, index) => {
      const current = valueOf(sample, 'restart_total');
      const previous = index > 0 ? valueOf(samples[index - 1], 'restart_total') : current;
      return { x: pointTime(sample, index), y: Math.max(0, current - previous) };
    }),
  };
}

function valueOf(sample: UsageSample, key: UsageMetricKey): number {
  return Number(sample.usage[key] ?? 0);
}

function pointTime(sample: UsageSample, index: number): number {
  const parsed = sample.sampled_at ? Date.parse(sample.sampled_at) : NaN;
  return Number.isFinite(parsed) ? parsed : index + 1;
}

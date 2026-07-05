import type { RealtimeFrame, TimelineEvent } from '../types';

export const initialRealtimeFrame: RealtimeFrame = {
  load: 61,
  health: 92,
  throughput: 1280,
  risk: 18,
  bars: [44, 58, 63, 72, 66, 81, 74, 69, 77, 62, 59, 71],
  events: [
    {
      id: 'live-1',
      time: '방금',
      title: '메트릭 신호 수신',
      detail: 'p95 지연 시간이 복구 구간으로 진입',
      tone: 'green',
    },
    {
      id: 'live-2',
      time: '12초 전',
      title: '권한 범위 확인',
      detail: '명령 실행 전 접근 가능한 리소스만 필터링',
      tone: 'blue',
    },
    {
      id: 'live-3',
      time: '28초 전',
      title: '증거 스트림 병합',
      detail: '로그, 메트릭, 이벤트가 하나의 RCA 컨텍스트로 결합',
      tone: 'purple',
    },
  ],
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function nextRealtimeFrame(frame: RealtimeFrame): RealtimeFrame {
  const nextBar = clamp((frame.bars.at(-1) ?? 60) + Math.random() * 32 - 14, 24, 96);
  const tone = nextBar > 78 ? 'amber' : nextBar < 42 ? 'green' : 'blue';
  const event: TimelineEvent = {
    id: `live-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    time: '방금',
    title: nextBar > 78 ? '부하 급등 감지' : '실시간 샘플 갱신',
    detail: nextBar > 78 ? '리소스 압박이 높아져 관측 강도를 올림' : '대시보드와 캔버스 지표가 동시에 갱신됨',
    tone,
  };

  return {
    load: clamp(frame.load + Math.random() * 14 - 6, 20, 94),
    health: clamp(frame.health + Math.random() * 8 - 3, 72, 99),
    throughput: clamp(frame.throughput + Math.random() * 180 - 70, 720, 1880),
    risk: clamp(frame.risk + Math.random() * 10 - 5, 8, 58),
    bars: [...frame.bars.slice(1), nextBar],
    events: [event, ...frame.events].slice(0, 4),
  };
}

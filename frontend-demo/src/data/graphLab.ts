import type { GraphModule, GraphNetworkNode } from '../types';

export const graphModules: GraphModule[] = [
  {
    id: 'live-stream',
    title: '실시간 처리량',
    description: '이벤트가 들어올 때마다 막대와 면적 그래프가 부드럽게 갱신됩니다.',
    kind: 'stream',
    accent: 'blue',
  },
  {
    id: 'health-radial',
    title: '서비스 건강도',
    description: '신뢰도, 안전도, 영향 범위를 원형 지표로 비교합니다.',
    kind: 'radial',
    accent: 'green',
  },
  {
    id: 'signal-heatmap',
    title: '신호 히트맵',
    description: '로그, 메트릭, 이벤트 밀도를 작은 셀 변화로 표현합니다.',
    kind: 'heatmap',
    accent: 'purple',
  },
  {
    id: 'evidence-stack',
    title: '증거 구성',
    description: 'RCA에 사용된 증거 소스 비중을 스택으로 보여줍니다.',
    kind: 'stack',
    accent: 'amber',
  },
  {
    id: 'dependency-network',
    title: '의존성 네트워크',
    description: '서비스 간 연결 상태와 위험 전파를 네트워크 형태로 보여줍니다.',
    kind: 'network',
    accent: 'rose',
  },
  {
    id: 'event-timeline',
    title: '이벤트 타임라인',
    description: '실시간 이벤트가 시간순으로 쌓이고 상태별 색상으로 구분됩니다.',
    kind: 'timeline',
    accent: 'slate',
  },
];

export const graphNetworkNodes: GraphNetworkNode[] = [
  { id: 'api', label: 'API' },
  { id: 'database', label: 'DB' },
  { id: 'queue', label: '큐' },
  { id: 'worker', label: '워커' },
  { id: 'ingress', label: 'Ingress' },
];

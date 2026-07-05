import type { CopilotAction, CopilotMessage, CopilotTool, StudioNote } from '../types';
import { operationsSnapshot as ops } from './operations';

export const copilotTools: CopilotTool[] = [
  {
    id: 'kubernetes',
    label: 'Kubernetes',
    description: 'Pod 상태와 이벤트를 수집',
    accent: 'blue',
    selected: true,
  },
  {
    id: 'metrics',
    label: '메트릭',
    description: `p95 ${ops.evidenceJobs.providerLatencyP95Ms}ms 추적`,
    accent: 'green',
    selected: true,
  },
  {
    id: 'logs',
    label: '로그',
    description: '레지스트리 401 증거 확인',
    accent: 'amber',
    selected: true,
  },
  {
    id: 'traces',
    label: '트레이스',
    description: '누락 증거는 노트로 표시',
    accent: 'rose',
    selected: false,
  },
  {
    id: 'safe-pr',
    label: 'Safe PR',
    description: '승인 전 수정안 생성',
    accent: 'purple',
    selected: true,
  },
  {
    id: 'command',
    label: '명령 큐',
    description: `${ops.command.leaseSeconds}s lease로 실행`,
    accent: 'slate',
    selected: false,
  },
];

export const copilotMessages: CopilotMessage[] = [
  {
    id: 'user-1',
    role: 'user',
    text: `${ops.rca.namespace}/${ops.rca.resourceName} 배포가 멈췄어. 원인, 영향 범위, 안전한 다음 액션을 한 번에 보여줘.`,
  },
  {
    id: 'assistant-1',
    role: 'assistant',
    accent: 'green',
    text: `좋아요. 브라우저에는 토큰을 두지 않고 세션 쿠키로 요청하면서, ${ops.realtime.podsReady}/${ops.realtime.podsTotal} Pod 상태와 증거 ${ops.evidenceJobs.completed}/${ops.evidenceJobs.queued}개를 묶고 있어요. 현재 RCA 신뢰도는 ${ops.rca.confidence.toFixed(2)}이고, 주요 근거는 ${ops.rca.supportingEvidence.join(', ')}입니다.`,
  },
];

export const copilotActions: CopilotAction[] = [
  {
    id: 'run-rca',
    title: 'RCA 플로우 실행',
    detail: `confidence ${ops.rca.confidence.toFixed(2)}까지 분석 단계를 시각화`,
    accent: 'blue',
    value: '0.92',
  },
  {
    id: 'add-evidence',
    title: '증거 노드 추가',
    detail: '새 provider 결과가 캔버스에 부드럽게 생성됨',
    accent: 'green',
    value: '+1',
  },
  {
    id: 'chart-node',
    title: '수치 차트 열기',
    detail: 'RCA 신뢰도와 임계값을 노드 안 차트로 표시',
    accent: 'purple',
    value: 'chart',
  },
];

export const studioNotes: StudioNote[] = [
  {
    id: 'note-security',
    title: '브라우저 보안 경계',
    body: 'Authorization 헤더를 만들지 않고 모든 API 호출은 credentials include를 사용합니다.',
    accent: 'blue',
    value: 'httpOnly',
  },
  {
    id: 'note-evidence',
    title: '증거 노트',
    body: `${ops.rca.supportingEvidence[1]}는 강한 근거이고 ${ops.rca.missingEvidence[0]}는 추가 수집 후보입니다.`,
    accent: 'amber',
    value: `${ops.evidenceJobs.completed}/${ops.evidenceJobs.queued}`,
  },
  {
    id: 'note-action',
    title: '다음 액션',
    body: 'Safe PR을 먼저 만들고, 승인 전까지 실제 클러스터 변경은 백엔드 권한 검사 뒤에만 실행합니다.',
    accent: 'green',
    value: ops.safePr.route,
  },
];

export const promptSuggestions = ['원인 요약', 'Safe PR 생성', '누락 증거 수집', '사용자에게 보고'];

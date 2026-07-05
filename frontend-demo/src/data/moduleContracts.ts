import type { ModuleContract } from '../types';
import { operationsSnapshot as ops } from './operations';

export const moduleContracts: Record<string, ModuleContract> = {
  overview: {
    id: 'overview',
    title: '데모 구조',
    purpose: 'AI 채팅이 운영 의도를 만들고, 노드 캔버스가 실행 흐름과 권한 경계를 시각화합니다.',
    input: '사용자 요청, 실시간 클러스터 신호, 선택된 도구',
    output: 'RCA 설명, 안전 액션, 운영 노트, 대시보드 수치',
    metric: `confidence ${ops.rca.confidence.toFixed(2)}, pods ${ops.realtime.podsReady}/${ops.realtime.podsTotal}`,
    accent: 'blue',
  },
  copilot: {
    id: 'copilot',
    title: 'AI 요청',
    purpose: '사용자 문장을 운영 플로우로 바꾸고 필요한 도구를 선택합니다.',
    input: `${ops.rca.namespace}/${ops.rca.resourceName} 장애 설명`,
    output: '분석 계획과 도구 호출 순서',
    metric: '선택 도구 5/6',
    accent: 'purple',
  },
  session: {
    id: 'session',
    title: '보안 세션',
    purpose: '브라우저가 토큰을 저장하지 않고 쿠키 세션으로만 API를 호출하게 합니다.',
    input: 'httpOnly service_session cookie',
    output: 'credentials include 요청과 백엔드 권한 필터',
    metric: '허용 클러스터 1개',
    accent: 'blue',
  },
  observe: {
    id: 'observe',
    title: '실시간 관측',
    purpose: '클러스터 상태를 작은 실시간 요약으로 바꿔 UI와 RCA에 공급합니다.',
    input: 'resource.delta, live.summary',
    output: `pods ${ops.realtime.podsReady}/${ops.realtime.podsTotal}, window ${ops.realtime.windowMs}ms`,
    metric: `seq ${ops.realtime.seq}`,
    accent: 'green',
  },
  evidence: {
    id: 'evidence',
    title: '증거 수집',
    purpose: 'Kubernetes, metrics, logs 같은 provider 결과를 RCA가 읽을 증거로 묶습니다.',
    input: '선택 도구와 권한 검사를 통과한 리소스 범위',
    output: 'cluster.evidence.received 이벤트',
    metric: `completed ${ops.evidenceJobs.completed}/${ops.evidenceJobs.queued}, p95 ${ops.evidenceJobs.providerLatencyP95Ms}ms`,
    accent: 'amber',
  },
  rca: {
    id: 'rca',
    title: 'RCA 분석',
    purpose: '증거를 점수화해서 원인, 신뢰도, 누락 증거를 설명합니다.',
    input: ops.rca.supportingEvidence.join(', '),
    output: `${ops.rca.rootCause}, confidence ${ops.rca.confidence.toFixed(2)}`,
    metric: `threshold ${ops.rca.confidenceThreshold.toFixed(2)}`,
    accent: 'purple',
  },
  plan: {
    id: 'plan',
    title: '액션 플랜',
    purpose: 'Safe PR, 명령 큐, 수동 검토 중 안전한 실행 경로를 고릅니다.',
    input: 'rca.completed와 정책 게이트',
    output: `${ops.safePr.route} 또는 ${ops.command.action}`,
    metric: `checks ${ops.safePr.checks}, lease ${ops.command.leaseSeconds}s`,
    accent: 'blue',
  },
  review: {
    id: 'review',
    title: '대시보드 반영',
    purpose: '운영자가 이해할 수 있는 노트, 차트, 타임라인으로 결과를 정리합니다.',
    input: 'safe_action.planned, operator.note.created',
    output: '타임라인 upsert와 사용자 보고 초안',
    metric: ops.rca.status,
    accent: 'green',
  },
  'policy-gate': {
    id: 'policy-gate',
    title: '승인 게이트',
    purpose: '상태 변경 API가 CSRF, Origin, 사용자 승인 없이 실행되지 않게 막습니다.',
    input: '상태 변경 액션 요청',
    output: 'approval.required 또는 policy.note.created',
    metric: 'Origin strict',
    accent: 'rose',
  },
  'canvas-chart': {
    id: 'canvas-chart',
    title: '수치 차트',
    purpose: 'RCA confidence와 임계값을 캔버스 노드 안에서 바로 확인하게 합니다.',
    input: 'metric.projection',
    output: '캔버스 차트 위젯',
    metric: ops.rca.confidence.toFixed(2),
    accent: 'purple',
  },
};

export function resolveModuleContract(nodeId?: string) {
  if (!nodeId) return moduleContracts.overview;
  if (nodeId.startsWith('evidence-')) return moduleContracts.evidence;
  return moduleContracts[nodeId] ?? moduleContracts.overview;
}

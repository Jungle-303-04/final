import type { RuntimeEventTemplate, RuntimeMetrics, SignalEdge, TimelineEvent, WorkflowNode } from '../types';
import { operationsSnapshot as ops } from './operations';

export const statusOrder = ['session', 'observe', 'evidence', 'rca', 'plan', 'review'] as const;

export const initialNodes: WorkflowNode[] = [
  {
    id: 'copilot',
    type: 'workflow',
    position: { x: 20, y: 270 },
    data: {
      accent: 'purple',
      title: 'AI 요청',
      subtitle: '채팅에서 운영 플로우 생성',
      status: 'running',
      metric: 5,
      metricLabel: '도구',
      metricUnit: '개',
      ports: [{ id: 'intent-out', label: 'intent', direction: 'output', event: 'copilot.plan.generated', tone: 'purple', count: 1 }],
      rows: [
        { id: 'target', label: '대상', value: `${ops.rca.namespace}/${ops.rca.resourceName}`, tone: 'blue' },
        { id: 'symptom', label: '증상', value: ops.rca.symptom, tone: 'rose' },
        { id: 'goal', label: '요청', value: '원인 + 안전 액션', tone: 'green' },
      ],
      fields: [
        {
          id: 'mode',
          label: '응답 모드',
          value: 'analysis-action',
          kind: 'select',
          options: [
            { label: '분석 + 실행 계획', value: 'analysis-action' },
            { label: '보고서 초안', value: 'report' },
            { label: '수정 PR 우선', value: 'safe-pr' },
          ],
        },
        { id: 'stream', label: '스트리밍 응답', value: 'on', kind: 'toggle' },
      ],
      blocks: [
        {
          id: 'tool-block',
          title: '도구 선택 블록',
          subtitle: 'Kubernetes, Metrics, Logs',
          accent: 'purple',
          rows: [
            { id: 'tools', label: '선택됨', value: '5/6', tone: 'green' },
            { id: 'policy', label: '권한', value: 'backend final', tone: 'blue' },
          ],
        },
      ],
    },
  },
  {
    id: 'session',
    type: 'workflow',
    position: { x: 420, y: 80 },
    data: {
      accent: 'blue',
      title: '보안 세션',
      subtitle: '프론트는 토큰을 저장하지 않음',
      status: 'done',
      metric: 1,
      metricLabel: '허용 클러스터',
      metricUnit: '개',
      ports: [
        { id: 'intent-in', label: 'intent', direction: 'input', event: 'copilot.plan.generated', tone: 'purple', count: 1 },
        { id: 'session-out', label: 'session', direction: 'output', event: 'credentials.include', tone: 'blue', count: 1 },
      ],
      rows: [
        { id: 'workspace', label: 'workspace', value: ops.session.workspaceId, tone: 'blue' },
        { id: 'cookie', label: '인증 방식', value: 'httpOnly cookie', tone: 'green' },
        { id: 'cors', label: 'API 호출', value: 'credentials include', tone: 'purple' },
      ],
      fields: [
        { id: 'cluster', label: '클러스터 범위', value: ops.session.accessibleClusters[0], kind: 'select', options: ops.session.accessibleClusters.map((cluster) => ({ label: cluster, value: cluster })) },
        { id: 'csrf', label: 'CSRF / Origin 검사', value: 'on', kind: 'toggle' },
      ],
      blocks: [
        {
          id: 'security-note',
          title: '브라우저 경계',
          subtitle: 'x-agent-token, kubeconfig 차단',
          accent: 'blue',
          rows: [
            { id: 'bearer', label: 'Bearer 저장', value: '금지', tone: 'rose' },
            { id: 'permission', label: '최종 권한', value: 'backend', tone: 'green' },
          ],
        },
      ],
    },
  },
  {
    id: 'observe',
    type: 'workflow',
    position: { x: 420, y: 430 },
    data: {
      accent: 'green',
      title: '실시간 관측',
      subtitle: '요약 스트림 + 정확한 수치',
      status: 'running',
      metric: ops.realtime.seq,
      metricLabel: 'seq',
      ports: [
        { id: 'intent-in', label: 'intent', direction: 'input', event: 'copilot.plan.generated', tone: 'purple', count: 1 },
        { id: 'summary-out', label: 'summary', direction: 'output', event: 'live.summary', tone: 'green', count: ops.realtime.restartDelta },
      ],
      rows: [
        { id: 'pods', label: 'pods ready', value: `${ops.realtime.podsReady}/${ops.realtime.podsTotal}`, tone: 'green' },
        { id: 'window', label: 'window', value: String(ops.realtime.windowMs), unit: 'ms', tone: 'blue' },
        { id: 'restart', label: 'restart delta', value: String(ops.realtime.restartDelta), tone: 'amber' },
      ],
      fields: [
        { id: 'window-control', label: '요약 윈도우', value: String(ops.realtime.windowMs), kind: 'number', min: 100, max: 60000, step: 100, unit: 'ms' },
        { id: 'phase', label: 'rollout phase', value: ops.realtime.rolloutPhase, kind: 'select', options: ['idle', 'progressing', 'degraded'].map((phase) => ({ label: phase, value: phase })) },
      ],
      blocks: ops.realtime.hotPods.map((pod) => ({
        id: `hot-${pod.pod}`,
        title: 'Hot Pod 노트',
        subtitle: `${pod.namespace}/${pod.pod}`,
        accent: 'rose',
        rows: [
          { id: 'cpu', label: 'cpu ratio', value: pod.cpuRatio.toFixed(2), tone: 'rose' },
          { id: 'ready', label: 'ready', value: pod.ready ? 'true' : 'false', tone: pod.ready ? 'green' : 'rose' },
        ],
      })),
    },
  },
  {
    id: 'evidence',
    type: 'workflow',
    position: { x: 820, y: 250 },
    data: {
      accent: 'amber',
      title: '증거 수집',
      subtitle: '선택된 도구가 provider 노드로 확장',
      status: 'idle',
      metric: ops.evidenceJobs.completed,
      metricLabel: '완료',
      metricUnit: `/${ops.evidenceJobs.queued}`,
      ports: [
        { id: 'session-in', label: 'session', direction: 'input', event: 'credentials.include', tone: 'blue', count: 1 },
        { id: 'summary-in', label: 'summary', direction: 'input', event: 'live.summary', tone: 'green', count: 1 },
        { id: 'evidence-out', label: 'evidence', direction: 'output', event: 'cluster.evidence.received', tone: 'amber', count: ops.evidenceJobs.completed },
      ],
      rows: [
        { id: 'completed', label: '완료/대기', value: `${ops.evidenceJobs.completed}/${ops.evidenceJobs.queued}`, tone: 'green' },
        { id: 'failed', label: '실패', value: String(ops.evidenceJobs.failed), tone: 'rose' },
        { id: 'p95', label: 'provider p95', value: String(ops.evidenceJobs.providerLatencyP95Ms), unit: 'ms', tone: 'blue' },
      ],
      fields: [
        { id: 'provider', label: 'provider 선택', value: 'metrics', kind: 'select', options: ops.evidenceJobs.providers.map((provider) => ({ label: provider.key, value: provider.key })) },
        { id: 'max-attempts', label: '재시도 횟수', value: String(ops.evidenceJobs.maxAttempts), kind: 'number', min: 1, max: 10, step: 1 },
      ],
      blocks: ops.evidenceJobs.providers.slice(0, 3).map((provider) => ({
        id: provider.key,
        title: provider.key,
        subtitle: provider.status,
        accent: provider.status === 'failed' ? 'rose' : 'green',
        rows: [
          { id: 'rows', label: 'rows', value: String(provider.rows), tone: 'blue' },
          { id: 'latency', label: 'latency', value: String(provider.latencyMs), unit: 'ms', tone: provider.status === 'failed' ? 'rose' : 'green' },
        ],
      })),
    },
  },
  {
    id: 'rca',
    type: 'workflow',
    position: { x: 1220, y: 115 },
    data: {
      accent: 'purple',
      title: 'RCA 분석',
      subtitle: '증거를 점수화하고 원인을 설명',
      status: 'idle',
      metric: ops.rca.confidence,
      metricLabel: 'confidence',
      ports: [
        { id: 'evidence-in', label: 'evidence', direction: 'input', event: 'cluster.evidence.received', tone: 'amber', count: 1 },
        { id: 'rca-out', label: 'rca', direction: 'output', event: 'rca.completed', tone: 'purple', count: 1 },
      ],
      rows: [
        { id: 'root', label: 'root cause', value: ops.rca.rootCause, tone: 'rose' },
        { id: 'confidence', label: 'confidence', value: ops.rca.confidence.toFixed(2), tone: 'green' },
        { id: 'threshold', label: 'threshold', value: ops.rca.confidenceThreshold.toFixed(2), tone: 'amber' },
      ],
      fields: [
        { id: 'threshold', label: '신뢰도 임계값', value: String(ops.rca.confidenceThreshold), kind: 'number', min: 0, max: 1, step: 0.01 },
        { id: 'explain-style', label: '설명 스타일', value: 'operator', kind: 'select', options: ['operator', 'executive', 'developer'].map((style) => ({ label: style, value: style })) },
      ],
      blocks: [
        {
          id: 'support',
          title: '강한 근거',
          subtitle: ops.rca.supportingEvidence.join(' + '),
          accent: 'green',
          rows: ops.rca.supportingEvidence.map((item, index) => ({ id: `support-${index}`, label: `#${index + 1}`, value: item, tone: 'green' })),
        },
        {
          id: 'missing',
          title: '추가 수집',
          subtitle: ops.rca.missingEvidence.join(', '),
          accent: 'rose',
          rows: ops.rca.missingEvidence.map((item, index) => ({ id: `missing-${index}`, label: `#${index + 1}`, value: item, tone: 'rose' })),
        },
      ],
    },
  },
  {
    id: 'plan',
    type: 'workflow',
    position: { x: 1220, y: 485 },
    data: {
      accent: 'blue',
      title: '액션 플랜',
      subtitle: 'Safe PR 또는 명령 큐로 분기',
      status: 'idle',
      metric: ops.safePr.files,
      metricLabel: 'patch',
      metricUnit: ' files',
      ports: [
        { id: 'rca-in', label: 'rca', direction: 'input', event: 'rca.completed', tone: 'purple', count: 1 },
        { id: 'action-out', label: 'action', direction: 'output', event: 'safe_action.planned', tone: 'blue', count: 2 },
      ],
      rows: [
        { id: 'route', label: 'route', value: ops.safePr.route, tone: 'green' },
        { id: 'checks', label: 'checks', value: String(ops.safePr.checks), tone: 'blue' },
        { id: 'lease', label: 'command lease', value: String(ops.command.leaseSeconds), unit: 's', tone: 'slate' },
      ],
      fields: [
        { id: 'route-select', label: '실행 경로', value: ops.safePr.route, kind: 'select', options: ['safe_pr', 'command', 'manual_review'].map((route) => ({ label: route, value: route })) },
        { id: 'canary', label: '카나리 비율', value: '25', kind: 'number', min: 0, max: 100, step: 5, unit: '%' },
      ],
      blocks: [
        {
          id: 'approval',
          title: '승인 전환',
          subtitle: '상태 변경은 백엔드 권한 검사 후',
          accent: 'blue',
          rows: [
            { id: 'owner', label: '소유자 승인', value: ops.safePr.approvalRequired ? '필요' : '불필요', tone: 'amber' },
            { id: 'origin', label: 'Origin 검사', value: 'on', tone: 'green' },
          ],
        },
      ],
    },
  },
  {
    id: 'review',
    type: 'workflow',
    position: { x: 1605, y: 300 },
    data: {
      accent: 'green',
      title: '대시보드 반영',
      subtitle: '노트, 차트, 사용자 보고서 생성',
      status: 'idle',
      metric: 1,
      metricLabel: 'timeline',
      ports: [
        { id: 'action-in', label: 'action', direction: 'input', event: 'safe_action.planned', tone: 'blue', count: 2 },
        { id: 'report-out', label: 'report', direction: 'output', event: 'operator.note.created', tone: 'green', count: 3 },
      ],
      rows: [
        { id: 'incident', label: 'incident', value: ops.rca.incidentId, tone: 'purple' },
        { id: 'updated', label: 'updated', value: ops.rca.updatedAt.slice(11, 19), tone: 'green' },
        { id: 'status', label: 'status', value: ops.rca.status, tone: 'blue' },
      ],
      fields: [
        { id: 'audience', label: '보고 대상', value: 'operator', kind: 'select', options: ['operator', 'developer', 'manager'].map((audience) => ({ label: audience, value: audience })) },
        { id: 'note', label: '노트 자동 생성', value: 'on', kind: 'toggle' },
      ],
      blocks: [
        {
          id: 'note',
          title: '운영 노트',
          subtitle: '사용자가 바로 편집 가능',
          accent: 'green',
          rows: [
            { id: 'summary', label: '요약', value: 'ImagePullBackOff', tone: 'rose' },
            { id: 'next', label: '다음 액션', value: 'Safe PR', tone: 'green' },
          ],
        },
      ],
    },
  },
];

export const initialEdges: SignalEdge[] = [
  { id: 'copilot-session', type: 'signal', source: 'copilot', target: 'session', data: { accent: 'blue', status: 'done', event: 'credentials.include', cadenceMs: 900 } },
  { id: 'copilot-observe', type: 'signal', source: 'copilot', target: 'observe', data: { accent: 'green', status: 'running', event: 'live.summary', cadenceMs: ops.realtime.windowMs } },
  { id: 'session-evidence', type: 'signal', source: 'session', target: 'evidence', data: { accent: 'blue', status: 'idle', event: 'authorized.fetch', cadenceMs: 1040 } },
  { id: 'observe-evidence', type: 'signal', source: 'observe', target: 'evidence', data: { accent: 'amber', status: 'running', event: 'agent.evidence.jobs', cadenceMs: 1120 } },
  { id: 'evidence-rca', type: 'signal', source: 'evidence', target: 'rca', data: { accent: 'purple', status: 'idle', event: 'cluster.evidence.received', cadenceMs: 860 } },
  { id: 'rca-plan', type: 'signal', source: 'rca', target: 'plan', data: { accent: 'blue', status: 'idle', event: 'safe_action.planned', cadenceMs: 980 } },
  { id: 'rca-review', type: 'signal', source: 'rca', target: 'review', data: { accent: 'green', status: 'idle', event: 'operator.note.created', cadenceMs: 1020 } },
  { id: 'plan-review', type: 'signal', source: 'plan', target: 'review', data: { accent: 'green', status: 'idle', event: 'dashboard.timeline.upserted', cadenceMs: 960 } },
];

export const initialMetrics: RuntimeMetrics = {
  confidence: Math.round(ops.rca.confidence * 100),
  blastRadius: 8,
  evidenceCount: ops.evidenceJobs.completed,
  pendingActions: 2,
  latency: [
    { label: '21:30', value: 420 },
    { label: '21:34', value: 510 },
    { label: '21:38', value: 610 },
    { label: '21:42', value: 540 },
    { label: '21:46', value: 370 },
    { label: '21:50', value: 260 },
    { label: '21:54', value: ops.evidenceJobs.providerLatencyP95Ms },
  ],
  saturation: [
    { label: 'API', value: 58 },
    { label: '워커', value: 74 },
    { label: 'DB', value: 41 },
    { label: '큐', value: 67 },
  ],
  incidents: [
    { label: 'kubernetes', value: 38 },
    { label: 'metrics', value: 128 },
    { label: 'logs', value: 64 },
    { label: 'traces', value: 0 },
  ],
};

export const initialEvents: TimelineEvent[] = [
  {
    id: 'event-1',
    time: '21:55',
    title: 'AI 플로우 초안 생성',
    detail: `${ops.rca.resourceName} confidence ${ops.rca.confidence.toFixed(2)}`,
    tone: 'purple',
  },
  {
    id: 'event-2',
    time: '21:54',
    title: '실시간 요약 수신',
    detail: `pods ${ops.realtime.podsReady}/${ops.realtime.podsTotal}, window ${ops.realtime.windowMs}ms`,
    tone: 'green',
  },
  {
    id: 'event-3',
    time: '21:52',
    title: '증거 provider 병합',
    detail: `completed ${ops.evidenceJobs.completed}/${ops.evidenceJobs.queued}, failed ${ops.evidenceJobs.failed}`,
    tone: 'amber',
  },
];

export const runtimeEvents: {
  flowStarted: RuntimeEventTemplate;
  edgeActivated: (nodeId: string, tone: RuntimeEventTemplate['tone']) => RuntimeEventTemplate;
  evidenceCreated: (tone: RuntimeEventTemplate['tone']) => RuntimeEventTemplate;
  approvalGateExists: RuntimeEventTemplate;
  approvalGateCreated: RuntimeEventTemplate;
  chartNodeRemoved: RuntimeEventTemplate;
  chartNodeCreated: RuntimeEventTemplate;
} = {
  flowStarted: {
    title: 'AI 운영 플로우 실행',
    detail: '채팅, 도구, 노드, 차트가 같은 상태로 전환됩니다',
    tone: 'purple',
  },
  edgeActivated: (nodeId: string, tone: RuntimeEventTemplate['tone']): RuntimeEventTemplate => ({
    title: `${nodeId} 노드 전환`,
    detail: '이벤트 패킷이 다음 노드로 이동 중',
    tone,
  }),
  evidenceCreated: (tone: RuntimeEventTemplate['tone']): RuntimeEventTemplate => ({
    title: '증거 노드 생성',
    detail: '새 provider 결과가 캔버스에 추가됨',
    tone,
  }),
  approvalGateExists: {
    title: '승인 게이트가 이미 있음',
    detail: '게이트 노드에서 Origin/CSRF 정책을 확인하세요',
    tone: 'amber',
  },
  approvalGateCreated: {
    title: '승인 게이트 생성',
    detail: '상태 변경 액션은 사용자 승인 후 실행',
    tone: 'rose',
  },
  chartNodeRemoved: {
    title: '수치 차트 제거',
    detail: '코파일럿 노트와 HUD 지표는 유지됨',
    tone: 'slate',
  },
  chartNodeCreated: {
    title: '수치 차트 생성',
    detail: 'RCA confidence 차트가 캔버스에 열림',
    tone: 'purple',
  },
};

export function createEvidenceNode(id: string, offset: number): WorkflowNode {
  const accent = offset % 2 ? 'amber' : 'green';
  return {
    id,
    type: 'workflow',
    position: { x: 850 + offset * 64, y: 820 + offset * 62 },
    data: {
      accent,
      title: '동적 증거 노드',
      subtitle: '도구 선택에서 생성된 provider',
      status: 'running',
      metric: 12 + offset,
      metricLabel: 'rows',
      ports: [
        { id: 'dynamic-in', label: 'job', direction: 'input', event: 'agent.evidence.jobs', tone: accent, count: 1 },
        { id: 'dynamic-out', label: 'result', direction: 'output', event: 'cluster.evidence.received', tone: 'green', count: 1 },
      ],
      rows: [
        { id: 'query', label: '쿼리 결과', value: `${12 + offset}행`, tone: 'green' },
        { id: 'source', label: '소스', value: offset % 2 ? '이벤트' : '메트릭', tone: 'blue' },
      ],
      fields: [
        { id: 'ttl', label: 'lease seconds', value: String(ops.evidenceJobs.leaseSeconds), kind: 'number', min: 1, max: 60, step: 1, unit: 's' },
        {
          id: 'source-select',
          label: 'source',
          value: offset % 2 ? 'kubernetes' : 'metrics',
          kind: 'select',
          options: ['kubernetes', 'metrics', 'logs', 'traces'].map((source) => ({ label: source, value: source })),
        },
      ],
      blocks: [
        {
          id: 'job-result',
          title: 'result payload',
          subtitle: 'bounded evidence',
          accent,
          rows: [
            { id: 'payload', label: 'payload', value: '18.1KB', tone: 'blue' },
            { id: 'attempt', label: 'attempt', value: `1/${ops.evidenceJobs.maxAttempts}`, tone: 'green' },
          ],
        },
      ],
    },
  };
}

export function createEvidenceEdge(node: WorkflowNode): SignalEdge {
  return {
    id: `${node.id}-rca`,
    type: 'signal',
    source: node.id,
    target: 'rca',
    animated: true,
    data: { accent: node.data.accent, status: 'running', label: '신규', event: 'cluster.evidence.received', cadenceMs: 920 },
  };
}

export function createPolicyGateNode(): WorkflowNode {
  return {
    id: 'policy-gate',
    type: 'workflow',
    position: { x: 1585, y: 620 },
    data: {
      accent: 'rose',
      title: '승인 게이트',
      subtitle: 'CSRF + Origin + 사용자 승인',
      status: 'blocked',
      rows: [
        { id: 'csrf', label: 'CSRF 토큰', value: '필수', tone: 'rose' },
        { id: 'origin', label: 'Origin 검사', value: '엄격', tone: 'amber' },
        { id: 'owner', label: '소유자 승인', value: '대기', tone: 'blue' },
      ],
      fields: [
        { id: 'origin-check', label: 'Origin 검사', value: 'on', kind: 'toggle' },
        { id: 'allowed-origin', label: 'allowed origin', value: 'https://console.example.com', kind: 'text' },
      ],
    },
  };
}

export function createPolicyGateEdges(): SignalEdge[] {
  return [
    {
      id: 'plan-policy-gate',
      type: 'signal',
      source: 'plan',
      target: 'policy-gate',
      animated: true,
      data: { accent: 'rose', status: 'blocked', event: 'approval.required', cadenceMs: 1400 },
    },
    {
      id: 'policy-gate-review',
      type: 'signal',
      source: 'policy-gate',
      target: 'review',
      data: { accent: 'rose', status: 'idle', event: 'policy.note.created', cadenceMs: 1500 },
    },
  ];
}

export function createCanvasChartNode(confidence: number): WorkflowNode {
  return {
    id: 'canvas-chart',
    type: 'canvasChart',
    position: { x: 1560, y: 55 },
    data: {
      accent: 'purple',
      title: 'RCA 수치 차트',
      subtitle: '캔버스 위 정확한 지표',
      status: 'running',
      metric: confidence / 100,
      metricLabel: 'confidence',
      chartValues: [64, 86, 42, 72, 51, 91, 58, Math.max(10, Math.min(100, confidence))],
      rows: [
        { id: 'confidence', label: 'confidence', value: ops.rca.confidence.toFixed(2), tone: 'green' },
        { id: 'threshold', label: 'threshold', value: ops.rca.confidenceThreshold.toFixed(2), tone: 'amber' },
      ],
    },
  };
}

export function createCanvasChartEdge(): SignalEdge {
  return {
    id: 'observe-canvas-chart',
    type: 'signal',
    source: 'rca',
    target: 'canvas-chart',
    animated: true,
    data: { accent: 'purple', status: 'running', event: 'metric.projection', cadenceMs: 740 },
  };
}

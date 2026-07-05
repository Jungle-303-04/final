import type { FeatureDemoContent, FeaturePage, FeaturePageId } from '../types';

export const featurePages: FeaturePage[] = [
  {
    id: 'action-flow',
    label: '액션 플로우',
    title: '액션 플로우 캔버스',
    summary: 'RCA 증거, 승인, 명령 실행, 실시간 복구 흐름을 노드 그래프로 확인합니다.',
    accent: 'blue',
    stats: [
      { label: '노드', value: '11', delta: '+ 동적 생성' },
      { label: '연결선', value: '14', delta: '애니메이션' },
      { label: '안전 액션', value: '3', delta: '보호됨' },
    ],
  },
  {
    id: 'fleet',
    label: '클러스터',
    title: '클러스터 플릿',
    summary: '멀티 클러스터 상태, 등록, 애드온, 리소스 압박, drift 상태를 봅니다.',
    accent: 'green',
    stats: [
      { label: '클러스터', value: '18', delta: '+2' },
      { label: '정상', value: '94%', delta: '+4%' },
      { label: 'Drift', value: '3', delta: '-6' },
    ],
  },
  {
    id: 'deployments',
    label: '배포',
    title: '지속 배포',
    summary: 'GitOps 서비스, 글로벌 서비스, 승격 파이프라인, 릴리스 안전 게이트를 봅니다.',
    accent: 'purple',
    stats: [
      { label: '서비스', value: '42', delta: '+5' },
      { label: '승격', value: '8', delta: '진행 중' },
      { label: '롤백', value: '1', delta: '준비됨' },
    ],
  },
  {
    id: 'stacks',
    label: '스택',
    title: 'IaC 스택 실행',
    summary: 'Terraform, Pulumi, Ansible 실행과 커밋 기반 승인 흐름을 확인합니다.',
    accent: 'amber',
    stats: [
      { label: '실행', value: '12', delta: '+3' },
      { label: '계획', value: '7', delta: '검토' },
      { label: '적용', value: '5', delta: '대기열' },
    ],
  },
  {
    id: 'services',
    label: '서비스',
    title: '서비스 토폴로지',
    summary: '워크로드, Pod, Ingress, 의존성, 소유자, 롤아웃 상태를 연결해 봅니다.',
    accent: 'blue',
    stats: [
      { label: 'Pod', value: '284', delta: '+18' },
      { label: '소유자', value: '16', delta: '매핑됨' },
      { label: '지연 시간', value: '212ms', delta: '-38%' },
    ],
  },
  {
    id: 'observability',
    label: '관측',
    title: '로그, 메트릭, 이벤트',
    summary: '메트릭 급등, 로그 스트림, 이벤트 히트맵, 증거 타임라인을 봅니다.',
    accent: 'green',
    stats: [
      { label: '신호', value: '1.8k', delta: '스트리밍' },
      { label: '알림', value: '6', delta: '-2' },
      { label: 'MTTR', value: '14m', delta: '-9m' },
    ],
  },
  {
    id: 'ai-ops',
    label: 'AI 운영',
    title: '에이전트 운영',
    summary: '근거 기반 RCA, 도구 추적, 수정 제안, 설명 가능한 결정을 확인합니다.',
    accent: 'purple',
    stats: [
      { label: '계획', value: '5', delta: '순위화' },
      { label: '도구', value: '24', delta: '감사됨' },
      { label: '신뢰도', value: '84%', delta: '+7%' },
    ],
  },
  {
    id: 'access',
    label: '접근 제어',
    title: 'RBAC와 세션',
    summary: 'SSO, 세션 경계, 클러스터 접근, 리소스 범위, 승인 사유를 봅니다.',
    accent: 'rose',
    stats: [
      { label: '역할', value: '9', delta: '범위 지정' },
      { label: '세션', value: '37', delta: '쿠키' },
      { label: '거부', value: '4', delta: '사유 표시' },
    ],
  },
  {
    id: 'audit',
    label: '감사',
    title: '감사와 추적성',
    summary: '모든 명령, 상태 변경, 승인, 도구 호출, 생성 산출물을 추적합니다.',
    accent: 'slate',
    stats: [
      { label: '이벤트', value: '3.2k', delta: '색인됨' },
      { label: '산출물', value: '58', delta: '연결됨' },
      { label: '누락', value: '0', delta: '닫힘' },
    ],
  },
  {
    id: 'screen-catalog',
    label: '화면 카탈로그',
    title: 'Plural 화면 카탈로그',
    summary: '공개 저장소 화면군을 우리 콘솔 톤으로 재구성한 재사용 화면 템플릿입니다.',
    accent: 'slate',
    stats: [
      { label: '화면군', value: '13', delta: '구조화' },
      { label: '템플릿', value: '8', delta: '재사용' },
      { label: '계약', value: '1', delta: 'manifest' },
    ],
  },
  {
    id: 'graph-lab',
    label: '그래프 랩',
    title: '실시간 그래프 랩',
    summary: '더미 실시간 프레임을 여러 차트 컴포넌트로 동시에 시각화합니다.',
    accent: 'green',
    stats: [
      { label: '그래프', value: '6', delta: '모듈화' },
      { label: '프레임', value: '1.8s', delta: '갱신' },
      { label: '오류', value: '0', delta: '검증' },
    ],
  },
  {
    id: 'animation-lab',
    label: '모션 랩',
    title: '애니메이션 UI 랩',
    summary: '명령 팔레트, 드로어, 로더, 생성형 UI에 쓸 재사용 모션 위젯입니다.',
    accent: 'amber',
    stats: [
      { label: '패턴', value: '12', delta: '준비됨' },
      { label: '위젯', value: '31', delta: '타입화' },
      { label: '모션', value: 'AA', delta: '감속 지원' },
    ],
  },
];

const baseTable = {
  columns: ['리소스', '클러스터', '상태', '신호'],
  rows: [
    { id: 'checkout-api', cells: ['결제 API', 'prod-us', 'healthy', 'p95 212ms'], stateCellIndex: 2 },
    { id: 'gateway-worker', cells: ['게이트웨이 워커', 'prod-eu', 'syncing', '롤아웃 74%'], stateCellIndex: 2 },
    { id: 'nats-broker', cells: ['NATS 브로커', 'shared', 'watch', 'lag 1.8x'], stateCellIndex: 2 },
    { id: 'dashboard-projection', cells: ['대시보드 프로젝션', 'prod-us', 'healthy', '6초 전 갱신'], stateCellIndex: 2 },
  ],
};

const basePipelineSteps = [
  { id: 'source', label: '소스', detail: 'PR 병합됨', state: 'complete' },
  { id: 'plan', label: '계획', detail: 'diff 확인됨', state: 'complete' },
  { id: 'gate', label: '게이트', detail: '소유자 검토', state: 'active' },
  { id: 'apply', label: '적용', detail: '점진 롤아웃', state: 'pending' },
] satisfies FeatureDemoContent['pipelineSteps'];

const baseAgentSteps = [
  { id: 'graph', label: '실시간 그래프 읽기', value: '준비됨' },
  { id: 'rank', label: '원인 후보 순위화', metric: 'confidence', suffix: '%' },
  { id: 'draft', label: '보호된 수정안 초안', value: '준비됨' },
  { id: 'approval', label: '사용자 승인 대기', value: '준비됨' },
] satisfies FeatureDemoContent['agentSteps'];

const baseMotionSamples = [
  { id: 'generated-node', label: '생성 노드' },
  { id: 'command-drawer', label: '명령 드로어' },
  { id: 'approval-toast', label: '승인 토스트' },
  { id: 'live-sparkline', label: '실시간 스파크라인' },
  { id: 'diff-preview', label: 'Diff 미리보기' },
  { id: 'scope-badge', label: '범위 배지' },
];

const baseAccessMatrix = {
  columns: ['보기', '디버그', '승인', '배포'],
  rows: [
    { id: 'frontend', label: '프론트엔드', permissions: ['allowed', 'allowed', 'denied', 'denied'] },
    { id: 'platform', label: '플랫폼', permissions: ['allowed', 'allowed', 'allowed', 'denied'] },
    { id: 'sre', label: 'SRE', permissions: ['allowed', 'allowed', 'allowed', 'allowed'] },
    { id: 'auditor', label: '감사자', permissions: ['allowed', 'denied', 'denied', 'denied'] },
  ],
} satisfies FeatureDemoContent['accessMatrix'];

function makeHeatmap(seed: number) {
  return Array.from({ length: 60 }, (_, index) => ((index * 17 + seed) % 5) + 1);
}

function content(overrides: Partial<FeatureDemoContent> = {}): FeatureDemoContent {
  return {
    orbitItems: ['관리', 'prod-us', 'prod-eu', '스테이징', '샌드박스', '엣지'],
    pipelineSteps: basePipelineSteps,
    table: baseTable,
    agentSteps: baseAgentSteps,
    motionSamples: baseMotionSamples,
    accessMatrix: baseAccessMatrix,
    heatmapCells: makeHeatmap(3),
    ...overrides,
  };
}

export const featureDemoContent: Record<FeaturePageId, FeatureDemoContent> = {
  'action-flow': content({
    orbitItems: ['입력', '증거', 'RCA', '승인', '배포', '관측'],
    heatmapCells: makeHeatmap(1),
  }),
  fleet: content({
    table: {
      columns: ['클러스터', '리전', '상태', '애드온'],
      rows: [
        { id: 'mgmt', cells: ['관리 클러스터', 'ap-northeast-2', 'healthy', '핵심 12/12'], stateCellIndex: 2 },
        { id: 'prod-us', cells: ['미국 운영', 'us-west-2', 'healthy', '핵심 11/12'], stateCellIndex: 2 },
        { id: 'prod-eu', cells: ['유럽 운영', 'eu-central-1', 'syncing', '핵심 10/12'], stateCellIndex: 2 },
        { id: 'sandbox', cells: ['샌드박스', 'ap-northeast-2', 'watch', '핵심 8/12'], stateCellIndex: 2 },
      ],
    },
    heatmapCells: makeHeatmap(2),
  }),
  deployments: content({
    orbitItems: ['소스', '계획', '승격', '카나리', '롤백', '감사'],
    heatmapCells: makeHeatmap(5),
  }),
  stacks: content({
    table: {
      columns: ['스택', '유형', '상태', '실행'],
      rows: [
        { id: 'cluster-creator', cells: ['클러스터 생성기', 'terraform', 'active', '계획 #184'], stateCellIndex: 2 },
        { id: 'network-base', cells: ['네트워크 기반', 'pulumi', 'healthy', '적용 #771'], stateCellIndex: 2 },
        { id: 'policy-pack', cells: ['정책 팩', 'ansible', 'watch', '검사 #42'], stateCellIndex: 2 },
        { id: 'observability', cells: ['관측 스택', 'terraform', 'syncing', '계획 #91'], stateCellIndex: 2 },
      ],
    },
    heatmapCells: makeHeatmap(7),
  }),
  services: content({
    orbitItems: ['Ingress', '서비스', '배포', 'Pod', 'Secret', 'HPA'],
    heatmapCells: makeHeatmap(11),
  }),
  observability: content({
    pipelineSteps: [
      { id: 'metric', label: '메트릭', detail: 'p95 이상치', state: 'active' },
      { id: 'log', label: '로그', detail: '오류 군집', state: 'complete' },
      { id: 'event', label: '이벤트', detail: '재시작 급증', state: 'complete' },
      { id: 'trace', label: '트레이스', detail: 'span 비교', state: 'pending' },
    ],
    heatmapCells: makeHeatmap(13),
  }),
  'ai-ops': content({
    motionSamples: [
      { id: 'tool-trace', label: '도구 추적' },
      { id: 'cause-ranking', label: '원인 순위' },
      { id: 'guardrail', label: '가드레일 검사' },
      { id: 'proposal', label: '제안 카드' },
      { id: 'explanation', label: '설명 가능성' },
      { id: 'approval', label: '승인 인계' },
    ],
    heatmapCells: makeHeatmap(17),
  }),
  access: content({
    pipelineSteps: [
      { id: 'session', label: '세션', detail: '쿠키 확인됨', state: 'complete' },
      { id: 'origin', label: 'Origin', detail: 'same-site 검사', state: 'complete' },
      { id: 'scope', label: '범위', detail: '리소스 필터링', state: 'active' },
      { id: 'command', label: '명령', detail: '백엔드 판단', state: 'pending' },
    ],
    heatmapCells: makeHeatmap(19),
  }),
  audit: content({
    table: {
      columns: ['이벤트', '행위자', '상태', '산출물'],
      rows: [
        { id: 'tool-call', cells: ['도구 호출', '에이전트', 'healthy', '쿼리 결과'], stateCellIndex: 2 },
        { id: 'approval', cells: ['승인', '소유자', 'active', '결정 기록'], stateCellIndex: 2 },
        { id: 'command', cells: ['명령', '백엔드', 'watch', '민감값 제거'], stateCellIndex: 2 },
        { id: 'rollback', cells: ['롤백', '시스템', 'pending', '후크'], stateCellIndex: 2 },
      ],
    },
    heatmapCells: makeHeatmap(23),
  }),
  'screen-catalog': content({
    table: {
      columns: ['화면군', '대표 화면', '상태', '재사용 포인트'],
      rows: [
        { id: 'cluster-screen', cells: ['클러스터', '목록/상세/생성', 'healthy', '목록 + 상세 패널'], stateCellIndex: 2 },
        { id: 'deploy-screen', cells: ['배포', '서비스/파이프라인', 'active', '상태 레인'], stateCellIndex: 2 },
        { id: 'access-screen', cells: ['접근 제어', '사용자/그룹/RBAC', 'watch', '매트릭스'], stateCellIndex: 2 },
        { id: 'audit-screen', cells: ['감사', '이벤트/위치/추적', 'healthy', '타임라인'], stateCellIndex: 2 },
      ],
    },
    heatmapCells: makeHeatmap(31),
  }),
  'graph-lab': content({
    pipelineSteps: [
      { id: 'sample', label: '샘플', detail: '더미 프레임 생성', state: 'complete' },
      { id: 'mutate', label: '변화', detail: '1.8초마다 갱신', state: 'active' },
      { id: 'render', label: '렌더', detail: '6개 그래프 동시 반영', state: 'active' },
      { id: 'verify', label: '검증', detail: '콘솔 오류 0 기준', state: 'pending' },
    ],
    heatmapCells: makeHeatmap(37),
  }),
  'animation-lab': content({
    heatmapCells: makeHeatmap(29),
  }),
};

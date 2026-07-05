import type { Accent, NodeStatus } from '../types';

export const statusLabels: Record<NodeStatus, string> = {
  idle: '대기',
  running: '실행 중',
  done: '완료',
  blocked: '차단',
};

export const uiText = {
  sidebar: {
    kicker: 'AI Ops Studio',
    title: 'AI 운영 스튜디오',
    live: '실시간',
    paused: '일시정지',
    navLabel: '데모 페이지',
  },
  metrics: {
    confidence: '신뢰도',
    blastRadius: '영향 범위',
    evidence: '증거',
    actions: '액션',
    latency: 'p95 지연 시간',
    recoveryTrend: '복구 추세',
    safe: '안전도',
    scope: '범위',
    evidenceMix: '증거 구성',
    signalUnit: '개 신호',
    saturation: '리소스 포화도',
    watching: '관측 중',
    eventStream: '이벤트 스트림',
    auditTimeline: '감사 타임라인',
  },
  toolbar: {
    run: '실행',
    evidence: '증거 추가',
    gate: '게이트',
    chartNode: '차트 노드',
    openCanvas: '캔버스 열기',
    live: '실시간',
    reset: '데모 초기화',
    lightMode: '라이트 모드',
    darkMode: '다크 모드',
  },
  canvas: {
    subtitle: 'AI 채팅 + 노드 캔버스 + 실시간 차트',
    toastTitle: '동적 UI 매니페스트를 React 컴포넌트로 렌더링',
    toastSubtitle: '브라우저에는 토큰을 저장하지 않음',
    fallbackStep: '워크플로우 단계',
    advanced: '고급 설정',
  },
  inspector: {
    selectedNode: '선택한 노드',
    status: '상태',
    rows: '행',
    empty: '캔버스 노드를 선택하세요',
    manifest: '동적 매니페스트',
    browserBoundary: '브라우저 보안 경계',
    noBearer: '프론트엔드는 Bearer 토큰을 저장하지 않음',
    credentials: 'API 호출은 credentials include 사용',
    backendPermission: '명령 권한은 백엔드가 최종 판단',
    serverSideTokens: 'provider 토큰은 서버 측에만 보관',
  },
  chartNode: {
    risk: '위험도',
    falling: '하락 중',
  },
  featureBadges: {
    blue: '주요',
    green: '정상',
    purple: 'AI',
    amber: '대기',
    slate: '추적',
    rose: '보호',
  } satisfies Record<Accent, string>,
  manifest: {
    layout: '레이아웃',
    auth: '인증',
    chartNodeVisible: '차트노드표시',
    widgets: '위젯',
    metrics: '지표',
    confidence: '신뢰도',
    evidence: '증거',
  },
};

export const resourceStateLabels: Record<string, string> = {
  healthy: '정상',
  syncing: '동기화',
  watch: '관찰',
  active: '진행',
  pending: '대기',
  complete: '완료',
  blocked: '차단',
};

export const nodeNameLabels: Record<string, string> = {
  intake: '장애 입력',
  evidence: '증거 수집',
  correlate: '상관 분석',
  rca: 'RCA 생성',
  plan: '수정 계획',
  approval: '승인 게이트',
  deploy: '안전 배포',
  observe: '관측 결과',
};

// Plural 복제 UI 공용 mock 데이터
export type CloudInstance = {
  id: string;
  name: string;
  status: '제공됨' | '생성 중';
  cloud: 'AWS' | 'GCP' | 'Azure';
  hosting: '공유됨' | '전용';
  region: string;
  size: string;
  ownerName: string;
  ownerEmail: string;
  url: string;
};

export const CLOUD_INSTANCES: CloudInstance[] = [
  {
    id: 'cluster01',
    name: '클러스터01',
    status: '제공됨',
    cloud: 'AWS',
    hosting: '공유됨',
    region: '미국 동부-1',
    size: '크기가 큰',
    ownerName: 'cluster01-cloud-sa',
    ownerEmail: 'cluster01-cloud-sa@srv.logo.dev',
    url: 'https://cluster01.console.cloud.logo.dev',
  },
  {
    id: 'cluster02',
    name: '클러스터02',
    status: '제공됨',
    cloud: 'AWS',
    hosting: '공유됨',
    region: '미국 동부-1',
    size: '크기가 큰',
    ownerName: 'cluster02-cloud-sa',
    ownerEmail: 'cluster02-cloud-sa@srv.logo.dev',
    url: 'https://cluster02.console.cloud.logo.dev',
  },
];

export type SelfHostedCluster = {
  id: string;
  name: string;
  provider: 'AWS' | 'GCP' | 'Azure';
  version: string;
  pingedAt: string;
  owner: string;
  upgrades: number;
};

export const SELF_HOSTED: SelfHostedCluster[] = [
  { id: 'sh-1', name: 'prod-mgmt', provider: 'AWS', version: 'v1.29.4', pingedAt: '5분 전', owner: 'woonyong.dev@gmail.com', upgrades: 2 },
];

export type MarketplaceApp = {
  name: string;
  slug: string;
  description: string;
  category: string;
  installed: boolean;
  trending?: boolean;
  publisher: string;
  releaseStatus?: 'ALPHA' | 'BETA' | 'GA';
};

// 우리 플랫폼이 클러스터에 설치해주는 실제 스택 (deploy/target/*.yaml과 일치)
export const MARKETPLACE_APPS: MarketplaceApp[] = [
  { name: 'Prometheus', slug: 'prometheus', description: '시계열 메트릭 수집·경보. 클러스터 메트릭 탭의 데이터 소스', category: 'Observability', installed: true, trending: true, publisher: 'LOGO', releaseStatus: 'GA' },
  { name: 'Loki', slug: 'loki', description: '로그 집계 저장소. 클러스터 로그 탭의 데이터 소스', category: 'Observability', installed: true, trending: true, publisher: 'LOGO', releaseStatus: 'GA' },
  { name: 'Alloy', slug: 'alloy', description: '메트릭·로그·트레이스 통합 수집기 (모든 노드에 DaemonSet 배포)', category: 'Observability', installed: true, publisher: 'LOGO', releaseStatus: 'GA' },
  { name: 'OpenTelemetry Collector', slug: 'opentelemetry', description: '분산 트레이싱 수집 파이프라인', category: 'Observability', installed: true, publisher: 'LOGO', releaseStatus: 'GA' },
  { name: 'Grafana', slug: 'grafana', description: '메트릭 시각화와 대시보드 구성 도구', category: 'Observability', installed: false, publisher: 'LOGO', releaseStatus: 'GA' },
  { name: 'NATS JetStream', slug: 'nats', description: '이벤트 버스 — 모든 워커 간 이벤트 드리븐 통신의 중추', category: 'Messaging', installed: true, publisher: 'LOGO', releaseStatus: 'GA' },
  { name: 'PostgreSQL', slug: 'postgres', description: '읽기 모델·감사 로그 저장용 관계형 데이터베이스', category: 'Database', installed: true, publisher: 'LOGO', releaseStatus: 'GA' },
  { name: 'cert-manager', slug: 'cert-manager', description: 'TLS 인증서 자동 발급·갱신', category: 'Security', installed: true, publisher: 'LOGO', releaseStatus: 'GA' },
  { name: 'Karpenter', slug: 'karpenter', description: '워크로드 기반 노드 오토스케일러', category: 'Infrastructure', installed: true, publisher: 'LOGO', releaseStatus: 'GA' },
  { name: 'ArgoCD', slug: 'argo-cd', description: '선언적 GitOps CD 도구 (자체 CD와 병행 사용 가능)', category: 'Deployment', installed: false, publisher: 'LOGO', releaseStatus: 'GA' },
  { name: 'Sentry', slug: 'sentry', description: '에러 트래킹과 성능 모니터링 플랫폼', category: 'Observability', installed: false, publisher: 'LOGO', releaseStatus: 'BETA' },
];

export const MARKETPLACE_CATEGORIES = ['All', 'Observability', 'Messaging', 'Database', 'Deployment', 'Security', 'Infrastructure'];

export type PackageRow = { name: string; version: string; type: 'helm' | 'terraform' | 'docker'; updatedAt: string };

export const REPO_PACKAGES: PackageRow[] = [
  { name: 'loki', version: '6.6.4', type: 'helm', updatedAt: '2일 전' },
  { name: 'observability-base', version: '0.3.1', type: 'terraform', updatedAt: '1주 전' },
  { name: 'loki', version: 'sha-2f8a41', type: 'docker', updatedAt: '3일 전' },
];

export type User = { id: string; name: string; email: string; admin: boolean; groups: string[] };

export const USERS: User[] = [
  { id: 'u1', name: '우녕', email: 'woonyong.dev@gmail.com', admin: true, groups: ['admins'] },
  { id: 'u2', name: 'cluster01-cloud-sa', email: 'cluster01-cloud-sa@srv.logo.dev', admin: false, groups: ['service'] },
  { id: 'u3', name: 'cluster02-cloud-sa', email: 'cluster02-cloud-sa@srv.logo.dev', admin: false, groups: ['service'] },
];

export type Group = { id: string; name: string; description: string; members: number };

export const GROUPS: Group[] = [
  { id: 'g1', name: 'admins', description: '관리자 그룹', members: 1 },
  { id: 'g2', name: 'service', description: '서비스 계정 그룹', members: 2 },
];

export type Role = { id: string; name: string; description: string; permissions: string[] };

export const ROLES: Role[] = [
  { id: 'r1', name: 'admin', description: '모든 권한', permissions: ['설치', '배포', '사용자', '지원', '통합', '퍼블리시'] },
];

export type Domain = { id: string; domain: string; creator: string; createdAt: string };

export const DOMAINS: Domain[] = [
  { id: 'd1', domain: 'jungle303.onlogo.dev', creator: 'woonyong.dev@gmail.com', createdAt: '2026-06-25' },
];

export type Invite = { id: string; email: string; createdAt: string };

export const INVITES: Invite[] = [{ id: 'i1', email: 'teammate@jungle.dev', createdAt: '2026-07-01' }];

export type AuditRow = { id: string; action: string; actor: string; ip: string; location: string; time: string };

export const AUDITS: AuditRow[] = [
  { id: 'a1', action: 'users:login', actor: 'woonyong.dev@gmail.com', ip: '211.36.142.7', location: '서울, KR', time: '10분 전' },
  { id: 'a2', action: 'cluster:pinged', actor: 'cluster01-cloud-sa@srv.logo.dev', ip: '54.163.20.11', location: '버지니아, US', time: '25분 전' },
  { id: 'a3', action: 'repository:installed', actor: 'woonyong.dev@gmail.com', ip: '211.36.142.7', location: '서울, KR', time: '2시간 전' },
];

export type LoginRow = { id: string; user: string; ip: string; location: string; time: string };

export const LOGINS: LoginRow[] = [
  { id: 'l1', user: 'woonyong.dev@gmail.com', ip: '211.36.142.7', location: '서울, KR', time: '10분 전' },
  { id: 'l2', user: 'woonyong.dev@gmail.com', ip: '211.36.142.7', location: '서울, KR', time: '어제' },
];

export type AccessToken = { id: string; token: string; createdAt: string; lastUsed: string };

export const ACCESS_TOKENS: AccessToken[] = [
  { id: 't1', token: 'logo-****-****-9f21', createdAt: '2026-06-26', lastUsed: '1시간 전' },
];

export type PublicKey = { id: string; name: string; digest: string; createdAt: string };

export const PUBLIC_KEYS: PublicKey[] = [
  { id: 'k1', name: 'macbook-pro', digest: 'SHA256:aX9…kQ2', createdAt: '2026-06-25' },
];

export const CURRENT_USER = {
  name: '우녕',
  email: 'woonyong.dev@gmail.com',
  provider: 'GitHub',
  avatar: 'W',
};

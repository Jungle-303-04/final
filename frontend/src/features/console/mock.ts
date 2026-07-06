// Console 복제 UI 공용 mock 데이터
//
// ── 시나리오: "7월 7일 새벽, dashboard-worker OOM 장애 대응" ──
// 규모: 클러스터 20개 × 노드 100개 × 노드당 팟 10개 = 팟 20,000개 (시드 기반 생성)
// 1. 클러스터02의 dashboard-worker가 OOMKilled → CrashLoopBackOff (알림 패널)
// 2. AI 에이전트가 RCA 실행 → PR#128 생성 (AI/셀프서비스 패널)
// 3. 클러스터02는 k8s v1.29로 뒤처짐 → 업그레이드 플랜 + 스택 run-292 진행 중 (스택 패널)
// 4. dashboard-worker:0.9.1 이미지에 Critical 취약점 1건 (보안 패널)
// 5. 비용 상위 클러스터 spot 전환 검토 (비용 패널)
// 6. 모든 활동이 감사 로그에 기록 (설정 → 감사 패널)

/* ── 시드 기반 의사난수 (렌더마다 동일한 데이터) ── */
export function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const pick = <T,>(r: () => number, arr: T[]): T => arr[Math.floor(r() * arr.length)];

/* ── 클러스터 20개 ────────────────────── */
export type ConsoleCluster = {
  id: string;
  name: string;
  provider: 'AWS' | 'GCP' | 'Azure';
  region: string;
  version: string;
  health: number; // 0-100
  upgrade: '최신' | '가능' | '뒤처짐' | '실패';
  pingedAt: string;
  nodes: number;
  pods: number;
};

const REGIONS = ['us-east-1', 'ap-northeast-2', 'eu-west-1', 'us-west-2'];
const VERSIONS: [string, ConsoleCluster['upgrade']][] = [
  ['v1.32.4', '최신'],
  ['v1.31.8', '가능'],
  ['v1.30.6', '가능'],
  ['v1.29.4', '뒤처짐'],
];

function genClusters(): ConsoleCluster[] {
  // 시나리오의 주인공 3개
  const fixed: ConsoleCluster[] = [
    { id: 'mgmt', name: 'logo-mgmt', provider: 'AWS', region: 'us-east-1', version: 'v1.32.4', health: 92, upgrade: '최신', pingedAt: '방금 전', nodes: 100, pods: 1000 },
    { id: 'cluster01', name: '클러스터01', provider: 'AWS', region: 'us-east-1', version: 'v1.31.8', health: 61, upgrade: '가능', pingedAt: '2분 전', nodes: 100, pods: 1000 },
    { id: 'cluster02', name: '클러스터02', provider: 'AWS', region: 'us-east-1', version: 'v1.29.4', health: 34, upgrade: '뒤처짐', pingedAt: '10분 전', nodes: 100, pods: 1000 },
  ];
  const envs = ['prod', 'staging', 'dev'];
  const rest: ConsoleCluster[] = Array.from({ length: 17 }, (_, i) => {
    const r = mulberry32(1000 + i);
    const env = envs[i % 3];
    const region = REGIONS[i % REGIONS.length];
    const [version, upgrade] = VERSIONS[Math.floor(r() * VERSIONS.length)];
    const health = upgrade === '최신' ? 75 + Math.floor(r() * 23) : upgrade === '뒤처짐' ? 25 + Math.floor(r() * 35) : 45 + Math.floor(r() * 45);
    return {
      id: `${env}-${region}-${String(i + 1).padStart(2, '0')}`,
      name: `${env}-${region.split('-')[0]}${region.slice(-1)}-${String(i + 1).padStart(2, '0')}`,
      provider: pick(r, ['AWS', 'AWS', 'GCP', 'Azure'] as const),
      region,
      version,
      health,
      upgrade,
      pingedAt: `${1 + Math.floor(r() * 14)}분 전`,
      nodes: 100,
      pods: 1000,
    };
  });
  return [...fixed, ...rest];
}

export const CLUSTERS: ConsoleCluster[] = genClusters();

/* ── 서비스 ───────────────────────────── */
export type ConsoleService = {
  id: string;
  name: string;
  cluster: string;
  repo: string;
  ref: string;
  status: '건강함' | '동기화 중' | '오래됨' | '실패';
  errors: number;
  updatedAt: string;
};

const CORE_SERVICES: ConsoleService[] = [
  { id: 's1', name: 'api-gateway', cluster: '클러스터01', repo: 'Jungle-303-04/final', ref: 'main', status: '건강함', errors: 0, updatedAt: '5분 전' },
  { id: 's2', name: 'realtime-gateway', cluster: '클러스터01', repo: 'Jungle-303-04/final', ref: 'main', status: '건강함', errors: 0, updatedAt: '5분 전' },
  { id: 's3', name: 'rca-worker', cluster: '클러스터01', repo: 'Jungle-303-04/final', ref: 'main', status: '동기화 중', errors: 0, updatedAt: '1분 전' },
  { id: 's4', name: 'dashboard-worker', cluster: '클러스터02', repo: 'Jungle-303-04/final', ref: 'main', status: '실패', errors: 2, updatedAt: '12분 전' },
  { id: 's5', name: 'alert-worker', cluster: '클러스터01', repo: 'Jungle-303-04/final', ref: 'main', status: '건강함', errors: 0, updatedAt: '20분 전' },
  { id: 's6', name: 'command-worker', cluster: '클러스터02', repo: 'Jungle-303-04/final', ref: 'main', status: '오래됨', errors: 0, updatedAt: '2시간 전' },
];

// 나머지 클러스터마다 monitoring + cluster-agent 배포 (글로벌 서비스)
const FLEET_SERVICES: ConsoleService[] = CLUSTERS.flatMap((c, i) => {
  const r = mulberry32(2000 + i);
  return [
    {
      id: `mon-${c.id}`,
      name: 'monitoring',
      cluster: c.name,
      repo: 'logo-inc/console',
      ref: 'v0.12.1',
      status: (r() > 0.92 ? '오래됨' : '건강함') as ConsoleService['status'],
      errors: 0,
      updatedAt: `${1 + Math.floor(r() * 50)}분 전`,
    },
    {
      id: `agent-${c.id}`,
      name: 'cluster-agent',
      cluster: c.name,
      repo: 'Jungle-303-04/final',
      ref: 'main',
      status: (c.health < 40 ? '동기화 중' : '건강함') as ConsoleService['status'],
      errors: 0,
      updatedAt: `${1 + Math.floor(r() * 20)}분 전`,
    },
  ];
});

export const SERVICES: ConsoleService[] = [...CORE_SERVICES, ...FLEET_SERVICES];

/* ── K8s 리소스 생성기 (클러스터당 노드 100 × 팟 10) ── */
export type K8sResource = {
  name: string;
  namespace?: string;
  status: string;
  ready?: string;
  restarts?: number;
  age: string;
};

export const POD_SERVICES = [
  'api-gateway', 'realtime-gateway', 'rca-worker', 'dashboard-worker', 'alert-worker',
  'command-worker', 'evidence-worker', 'plan-worker', 'diff-worker', 'mail-worker',
  'monitoring', 'cluster-agent', 'nats', 'postgres', 'coredns',
];
export const NAMESPACES = ['default', 'default', 'default', 'infra', 'kube-system'];

const k8sCache = new Map<string, Record<string, K8sResource[]>>();

function genClusterResources(clusterId: string): Record<string, K8sResource[]> {
  const cached = k8sCache.get(clusterId);
  if (cached) return cached;

  const seed = hashStr(clusterId);
  const r = mulberry32(seed);
  const unhealthy = clusterId === 'cluster02';

  // 노드 100개
  const nodes: K8sResource[] = Array.from({ length: 100 }, (_, i) => {
    const notReady = unhealthy ? i % 33 === 7 : r() > 0.985;
    return {
      name: `ip-10-${Math.floor(i / 50)}-${(i % 50) + 1}-${10 + (seed % 200)}.ec2.internal`,
      status: notReady ? 'NotReady' : '준비됨',
      age: `${3 + Math.floor(r() * 20)}일`,
    };
  });

  // 팟 1,000개 (노드 100 × 10)
  const pods: K8sResource[] = Array.from({ length: 1000 }, (_, i) => {
    const svc = POD_SERVICES[i % POD_SERVICES.length];
    const hash = ((seed + i * 2654435761) >>> 8).toString(16).slice(0, 5);
    const suffix = ((seed + i * 40503) >>> 4).toString(36).slice(0, 4);
    const bad = unhealthy && i % 250 === 3;
    const pending = !bad && r() > 0.993;
    return {
      name: `${svc}-${hash}-${suffix}`,
      namespace: NAMESPACES[i % NAMESPACES.length],
      status: bad ? 'CrashLoopBackOff' : pending ? 'Pending' : '실행 중',
      ready: bad || pending ? '0/1' : '1/1',
      restarts: bad ? 7 : r() > 0.9 ? 1 : 0,
      age: bad ? '12분' : `${1 + Math.floor(r() * 20)}일`,
    };
  });
  // 시나리오 1의 장애 팟을 클러스터02 최상단에 고정
  if (unhealthy)
    pods[0] = { name: 'dashboard-worker-5c2d-q9r4', namespace: 'default', status: 'CrashLoopBackOff', ready: '0/1', restarts: 7, age: '12분' };

  const deployments: K8sResource[] = POD_SERVICES.filter((s) => !['nats', 'postgres', 'coredns'].includes(s)).map((svc, i) => {
    const failing = unhealthy && svc === 'dashboard-worker';
    const replicas = 2 + ((seed + i) % 6);
    return {
      name: svc,
      namespace: 'default',
      status: failing ? '진행 중' : '실행 중',
      ready: failing ? `${replicas - 1}/${replicas}` : `${replicas}/${replicas}`,
      age: `${3 + (i % 9)}일`,
    };
  });

  const res: Record<string, K8sResource[]> = {
    deployments,
    pods,
    nodes,
    replicasets: deployments.map((d) => ({ ...d, name: `${d.name}-${(seed % 0xfff).toString(16)}` })),
    statefulsets: [
      { name: 'nats', namespace: 'infra', status: '실행 중', ready: '3/3', age: '11일' },
      { name: 'postgres', namespace: 'infra', status: '실행 중', ready: '1/1', age: '11일' },
    ],
    daemonsets: [
      { name: 'node-collector', namespace: 'infra', status: '실행 중', ready: '100/100', age: '11일' },
      { name: 'alloy', namespace: 'infra', status: '실행 중', ready: '100/100', age: '11일' },
    ],
    jobs: [{ name: 'db-migrate-20260707', namespace: 'default', status: '완료', ready: '1/1', age: '3일' }],
    cronjobs: [{ name: 'command-janitor', namespace: 'default', status: '실행 중', age: '11일' }],
    services: [
      { name: 'api-gateway', namespace: 'default', status: 'ClusterIP', age: '3일' },
      { name: 'realtime-gateway', namespace: 'default', status: 'LoadBalancer', age: '3일' },
      { name: 'nats', namespace: 'infra', status: 'ClusterIP', age: '11일' },
      { name: 'kubernetes', namespace: 'default', status: 'ClusterIP', age: '11일' },
    ],
    ingresses: [{ name: 'console-ingress', namespace: 'default', status: 'nginx', age: '11일' }],
    networkpolicies: [{ name: 'deny-all-default', namespace: 'default', status: '-', age: '11일' }],
    persistentvolumeclaims: [
      { name: 'nats-data-nats-0', namespace: 'infra', status: 'Bound', age: '11일' },
      { name: 'postgres-data', namespace: 'infra', status: 'Bound', age: '11일' },
    ],
    persistentvolumes: [{ name: `pvc-${(seed % 0xffffff).toString(16)}`, status: 'Bound', age: '11일' }],
    storageclasses: [{ name: 'gp3 (기본)', status: 'ebs.csi.aws.com', age: '11일' }],
    configmaps: [
      { name: 'app-config', namespace: 'default', status: '-', age: '3일' },
      { name: 'alloy-config', namespace: 'infra', status: '-', age: '11일' },
      { name: 'kube-root-ca.crt', namespace: 'default', status: '-', age: '11일' },
    ],
    secrets: [
      { name: 'app-secrets', namespace: 'default', status: 'Opaque', age: '3일' },
      { name: 'github-token', namespace: 'infra', status: 'Opaque', age: '11일' },
    ],
    events: unhealthy
      ? [
          { name: 'dashboard-worker-5c2d-q9r4 — OOMKilled', namespace: 'default', status: '경고', age: '12분' },
          { name: 'dashboard-worker-5c2d-q9r4 — BackOff restarting', namespace: 'default', status: '경고', age: '10분' },
          { name: 'node ip-10-0-8 — MemoryPressure', namespace: '-', status: '경고', age: '14분' },
        ]
      : [{ name: 'api-gateway — ScalingReplicaSet 4', namespace: 'default', status: '정상', age: '3일' }],
    namespaces: [
      { name: 'default', status: '활성', age: '11일' },
      { name: 'infra', status: '활성', age: '11일' },
      { name: 'kube-system', status: '활성', age: '11일' },
    ],
    roles: [{ name: 'deployer', namespace: 'default', status: '-', age: '11일' }],
    clusterroles: [{ name: 'cluster-admin', status: '-', age: '11일' }],
    serviceaccounts: [
      { name: 'console-sa', namespace: 'default', status: '-', age: '11일' },
      { name: 'cluster-agent', namespace: 'infra', status: '-', age: '11일' },
    ],
  };
  k8sCache.set(clusterId, res);
  return res;
}

export function getK8sResources(clusterId: string, resource: string): K8sResource[] {
  return genClusterResources(clusterId)[resource] ?? [];
}

/** 기간별 과거 시계열 생성 (기간마다 다른 파형 — 24시간은 일간 사이클, 1시간은 세밀한 노이즈) */
export function genHistorySeries(key: string, range: string, base: number, vol: number): number[] {
  const seed = hashStr(`${key}-${range}`);
  const r = mulberry32(seed);
  const len = 60;
  return Array.from({ length: len }, (_, i) => {
    let wave = 0;
    if (range === '24시간') wave = Math.sin((i / len) * Math.PI * 2 - 1.2) * vol * 1.6; // 일간 사이클
    else if (range === '6시간') wave = Math.sin((i / len) * Math.PI * 4) * vol * 1.2;
    else wave = Math.sin((i / len) * Math.PI * 8) * vol * 0.8;
    const spike = r() > 0.96 ? vol * 1.8 : 0; // 간헐적 스파이크
    return Math.max(2, Math.min(98, base + wave + (r() - 0.5) * vol + spike));
  });
}

/* ── 클러스터별 메트릭 (시드 기반, 클러스터마다 다름) ── */
export type ClusterMetricsData = {
  cpu: number;
  mem: number;
  disk: number;
  netMBs: number;
  cpuSeries: number[];
  memSeries: number[];
  topNodes: { name: string; cpu: number; mem: number; pods: number }[];
};

const metricsCache = new Map<string, ClusterMetricsData>();

export function getClusterMetrics(clusterId: string): ClusterMetricsData {
  const cached = metricsCache.get(clusterId);
  if (cached) return cached;

  const seed = hashStr(clusterId);
  const r = mulberry32(seed + 77);
  const unhealthy = clusterId === 'cluster02';
  const base = unhealthy ? 78 : 25 + Math.floor(r() * 40);

  const series = (b: number, vol: number) =>
    Array.from({ length: 30 }, (_, i) => {
      const wave = Math.sin((i + seed % 10) / 4) * vol;
      const spike = unhealthy && i > 22 ? (i - 22) * 4 : 0;
      return Math.max(4, Math.min(98, Math.round(b + wave + (r() - 0.5) * vol + spike)));
    });

  const cpuSeries = series(base, 12);
  const memSeries = series(Math.min(92, base + 18), 8);

  const nodes = genClusterResources(clusterId).nodes.slice(0, 5);
  const data: ClusterMetricsData = {
    cpu: cpuSeries[cpuSeries.length - 1],
    mem: memSeries[memSeries.length - 1],
    disk: 20 + Math.floor(r() * 45),
    netMBs: Math.round((3 + r() * 25) * 10) / 10,
    cpuSeries,
    memSeries,
    topNodes: nodes.map((n) => ({
      name: n.name,
      cpu: Math.max(5, Math.min(97, base + Math.floor((r() - 0.3) * 40))),
      mem: Math.max(10, Math.min(97, base + 10 + Math.floor((r() - 0.3) * 30))),
      pods: 8 + Math.floor(r() * 3),
    })),
  };
  metricsCache.set(clusterId, data);
  return data;
}

/* ── Git/파이프라인/스택 ──────────────── */
export type GitRepo = { id: string; url: string; health: '통과' | '실패'; pulledAt: string };

export const GIT_REPOS: GitRepo[] = [
  { id: 'r1', url: 'https://github.com/Jungle-303-04/final.git', health: '통과', pulledAt: '1분 전' },
  { id: 'r2', url: 'https://github.com/Jungle-303-04/infra.git', health: '통과', pulledAt: '3분 전' },
  { id: 'r3', url: 'https://github.com/logo-inc/console.git', health: '통과', pulledAt: '5분 전' },
];

export type Pipeline = { id: string; name: string; stages: string[]; status: '진행 중' | '대기' | '완료' };

export const PIPELINES: Pipeline[] = [
  { id: 'p1', name: 'dashboard-worker-pipeline', stages: ['staging', 'prod'], status: '진행 중' },
  { id: 'p2', name: 'api-gateway-pipeline', stages: ['dev', 'staging', 'prod'], status: '완료' },
  { id: 'p3', name: 'infra-pipeline', stages: ['plan', 'apply'], status: '대기' },
  { id: 'p4', name: 'fleet-monitoring-rollout', stages: ['canary', 'wave-1', 'wave-2'], status: '진행 중' },
];

export type StackRun = {
  id: string;
  status: '성공' | '실행 중' | '실패' | '대기';
  trigger: '수동' | 'PR' | '스케줄';
  plan: string;
  startedAt: string;
  duration: string;
};

export const STACK_RUNS: StackRun[] = [
  { id: 'run-292', status: '실행 중', trigger: '수동', plan: '+2 ~3 -2', startedAt: '5분 전', duration: '—' },
  { id: 'run-291', status: '성공', trigger: 'PR', plan: '+3 ~1 -0', startedAt: '1시간 전', duration: '2분 14초' },
  { id: 'run-290', status: '실패', trigger: '수동', plan: '+0 ~2 -1', startedAt: '어제', duration: '48초' },
  { id: 'run-289', status: '성공', trigger: '스케줄', plan: '+1 ~0 -0', startedAt: '2일 전', duration: '1분 52초' },
];

export const STACKS = [
  { id: 'stk-1', name: 'aws-network', type: 'Terraform', repo: 'Jungle-303-04/infra', status: '실행 중', updatedAt: '5분 전' },
  { id: 'stk-2', name: 'eks-cluster02-upgrade', type: 'Terraform', repo: 'Jungle-303-04/infra', status: '대기', updatedAt: '30분 전' },
  { id: 'stk-3', name: 'fleet-nodegroups', type: 'Terraform', repo: 'Jungle-303-04/infra', status: '성공', updatedAt: '3시간 전' },
  { id: 'stk-4', name: 'observability', type: 'Terraform', repo: 'Jungle-303-04/infra', status: '성공', updatedAt: '어제' },
];

export const STACK_ENV = [
  { key: 'AWS_REGION', value: 'us-east-1', secret: false },
  { key: 'TF_VAR_cluster_name', value: '클러스터02', secret: false },
  { key: 'AWS_SECRET_ACCESS_KEY', value: '••••••••', secret: true },
];

export const STACK_FILES = [
  { path: '/terraform/backend.tf', size: '1.2KB' },
  { path: '/terraform/vpc.tf', size: '4.8KB' },
  { path: '/terraform/eks.tf', size: '7.3KB' },
];

/* ── AI ───────────────────────────────── */
export type AgentRun = { id: string; prompt: string; status: '완료' | '실행 중' | '실패'; startedAt: string };

export const AGENT_RUNS: AgentRun[] = [
  { id: 'ar-1', prompt: 'dashboard-worker CrashLoop 원인 분석하고 수정 PR 만들어줘', status: '완료', startedAt: '10분 전' },
  { id: 'ar-2', prompt: '클러스터02 v1.31 업그레이드 플랜 만들어줘', status: '실행 중', startedAt: '2분 전' },
  { id: 'ar-3', prompt: '뒤처짐 상태 클러스터 6개 일괄 업그레이드 순서 짜줘', status: '완료', startedAt: '1시간 전' },
  { id: 'ar-4', prompt: '지난주 배포 실패 패턴 요약해줘', status: '완료', startedAt: '어제' },
];

export type AiThread = { id: string; title: string; lastMessage: string; updatedAt: string };

export const AI_THREADS: AiThread[] = [
  { id: 'th-1', title: 'CrashLoopBackOff 디버깅', lastMessage: 'PR#128을 생성했어요. 리뷰 후 머지하면 재배포됩니다.', updatedAt: '8분 전' },
  { id: 'th-2', title: '비용 최적화 상담', lastMessage: 'spot 전환 스택 실행(run-292)을 트리거했어요.', updatedAt: '5분 전' },
  { id: 'th-3', title: '플릿 업그레이드 전략', lastMessage: '뒤처짐 6개 클러스터를 리전별 웨이브로 나눴어요.', updatedAt: '1시간 전' },
];

export const SENTINELS = [
  { id: 'sn-1', name: 'nightly-healthcheck', schedule: '매일 03:00', lastRun: '오늘 03:00', status: '경고', findings: 3 },
  { id: 'sn-2', name: 'cert-expiry-watch', schedule: '매주 월요일', lastRun: '오늘 03:10', status: '경고', findings: 1 },
  { id: 'sn-3', name: 'fleet-version-skew', schedule: '매일 06:00', lastRun: '오늘 06:00', status: '성공', findings: 0 },
];

export const INFRA_RESEARCHES = [
  { id: 'ir-1', topic: '이벤트 드리븐 아키텍처 병목 분석 (NATS 처리량)', status: '완료', startedAt: '어제', pages: 4 },
  { id: 'ir-2', topic: '클러스터02 노드 타입 최적화 리서치', status: '실행 중', startedAt: '1시간 전', pages: 0 },
  { id: 'ir-3', topic: '20개 클러스터 리전 배치 재설계', status: '완료', startedAt: '3일 전', pages: 7 },
];

/* ── 보안 ─────────────────────────────── */
export const POLICIES = [
  { id: 'pol-1', name: 'no-privileged-containers', severity: '높음', violations: 1, description: '특권 컨테이너 금지' },
  { id: 'pol-2', name: 'require-resource-limits', severity: '중간', violations: 4, description: '리소스 리밋 필수' },
  { id: 'pol-3', name: 'disallow-latest-tag', severity: '낮음', violations: 2, description: ':latest 태그 금지' },
];

export const VULN_REPORTS = [
  { id: 'v1', artifact: 'dashboard-worker:0.9.1', critical: 1, high: 5, medium: 3, low: 8 },
  { id: 'v2', artifact: 'api-gateway:1.4.2', critical: 0, high: 2, medium: 7, low: 12 },
  { id: 'v3', artifact: 'rca-worker:1.1.0', critical: 0, high: 0, medium: 2, low: 5 },
  { id: 'v4', artifact: 'monitoring:v0.12.1', critical: 0, high: 1, medium: 4, low: 9 },
];

export const COMPLIANCE_REPORTS = [
  { id: 'cr-1', name: 'CIS Kubernetes Benchmark', cluster: '클러스터01', passed: 94, failed: 6, generatedAt: '오늘 03:00' },
  { id: 'cr-2', name: 'CIS Kubernetes Benchmark', cluster: '클러스터02', passed: 81, failed: 19, generatedAt: '오늘 03:00' },
  { id: 'cr-3', name: 'CIS Kubernetes Benchmark', cluster: '플릿 평균 (20개)', passed: 91, failed: 9, generatedAt: '오늘 03:00' },
];

/* ── 비용 (클러스터 20개 자동 생성) ───── */
export const COST_ROWS = CLUSTERS.map((c, i) => {
  const r = mulberry32(3000 + i);
  const cpu = 30 + r() * 120;
  const mem = cpu * (0.35 + r() * 0.2);
  const sto = cpu * (0.1 + r() * 0.08);
  return {
    id: `cost-${c.id}`,
    cluster: c.name,
    cpu: `$${cpu.toFixed(2)}`,
    memory: `$${mem.toFixed(2)}`,
    storage: `$${sto.toFixed(2)}`,
    total: `$${(cpu + mem + sto).toFixed(2)}`,
    totalNum: cpu + mem + sto,
  };
}).sort((a, b) => b.totalNum - a.totalNum);

/* ── 셀프서비스/플로우/워크벤치/엣지 ──── */
export const CATALOGS = [
  { id: 'cat-1', name: 'Data Engineering', apps: 8, description: '데이터 파이프라인 셀프서비스 카탈로그' },
  { id: 'cat-2', name: 'DevOps Tooling', apps: 12, description: '개발 도구 프로비저닝' },
  { id: 'cat-3', name: 'Observability', apps: 5, description: '모니터링 스택 템플릿' },
];

export const PR_AUTOMATIONS = [
  { id: 'pra-1', name: 'memory-limit-bump', repo: 'Jungle-303-04/final', role: '리소스 수정', createdAt: '오늘' },
  { id: 'pra-2', name: 'cluster-upgrade', repo: 'Jungle-303-04/infra', role: '업그레이드', createdAt: '2주 전' },
  { id: 'pra-3', name: 'service-scaler', repo: 'Jungle-303-04/final', role: '스케일링', createdAt: '1주 전' },
];

export const OUTSTANDING_PRS = [
  { id: 'opr-1', title: 'dashboard-worker 메모리 리밋 1Gi로 상향 (#128)', repo: 'Jungle-303-04/final', status: '리뷰 대기', createdAt: '10분 전' },
  { id: 'opr-2', title: 'Upgrade 클러스터02 to v1.30 (#127)', repo: 'Jungle-303-04/infra', status: '리뷰 대기', createdAt: '3시간 전' },
  { id: 'opr-3', title: '뒤처짐 클러스터 wave-1 업그레이드 (#126)', repo: 'Jungle-303-04/infra', status: '리뷰 대기', createdAt: '1시간 전' },
];

export const FLOWS = [
  { id: 'fl-1', name: 'gitops-core', services: 9, previews: 1, alerts: 0, updatedAt: '30분 전' },
  { id: 'fl-2', name: 'ai-workers', services: 12, previews: 0, alerts: 2, updatedAt: '12분 전' },
  { id: 'fl-3', name: 'fleet-observability', services: 40, previews: 0, alerts: 1, updatedAt: '1시간 전' },
];

export const WORKBENCHES = [
  { id: 'wb-1', name: 'sre-copilot', tools: 5, jobs: 12, updatedAt: '10분 전' },
  { id: 'wb-2', name: 'incident-triage', tools: 3, jobs: 4, updatedAt: '어제' },
];

export const EDGE_CLUSTERS = [
  { id: 'edge-1', name: 'factory-floor-1', status: '온라인', location: '부산', pingedAt: '1분 전' },
  { id: 'edge-2', name: 'store-kiosk-7', status: '오프라인', location: '서울', pingedAt: '3시간 전' },
];

export const EDGE_IMAGES = [
  { id: 'ei-1', name: 'edge-base-arm64', version: 'v0.4.2', size: '1.8GB', builtAt: '1주 전' },
];

/* ── 사용자/설정 ──────────────────────── */
export const CONSOLE_USERS = [
  { id: 'u1', name: '우녕', email: 'woonyong.dev@gmail.com', role: '관리자', lastLogin: '10분 전' },
  { id: 'u2', name: 'minmings', email: 'minmings@jungle.dev', role: '멤버', lastLogin: '1시간 전' },
  { id: 'u3', name: 'console-bot', email: 'bot@srv.logo.dev', role: '서비스', lastLogin: '1분 전' },
];

export const CONSOLE_GROUPS = [
  { id: 'g1', name: 'sre', members: 3, description: 'SRE 팀 — 알림 라우팅 대상' },
  { id: 'g2', name: 'developers', members: 8, description: '개발자 — 배포 권한' },
];

export const SERVICE_ACCOUNTS = [
  { id: 'sa-1', name: 'ci-deployer', email: 'ci-deployer@srv.logo.dev', tokens: 1, createdAt: '2주 전' },
  { id: 'sa-2', name: 'cluster-agent', email: 'cluster-agent@srv.logo.dev', tokens: 2, createdAt: '11일 전' },
];

export const PERSONAS = [
  { id: 'ps-1', name: 'platform-admin', description: '모든 메뉴 표시', members: 2 },
  { id: 'ps-2', name: 'app-developer', description: 'CD·플로우만 표시, 설정 숨김', members: 8 },
];

export const WEBHOOKS = [
  { id: 'wh-1', name: 'slack-deploy-notify', url: 'https://hooks.slack.com/…/deploy', events: '배포 완료', createdAt: '2주 전' },
];

export const NOTIF_SINKS = [
  { id: 'ns-1', name: 'slack-alerts', type: 'Slack', target: '#alerts', createdAt: '2주 전' },
  { id: 'ns-2', name: 'oncall-mail', type: 'Email', target: 'sre@jungle.dev', createdAt: '2주 전' },
];

export const ALERTS = [
  { id: 'al-1', name: 'PodCrashLooping', severity: '심각', resource: 'dashboard-worker-5c2d-q9r4', firedAt: '12분 전' },
  { id: 'al-2', name: 'HighMemoryUsage', severity: '경고', resource: 'dashboard-worker', firedAt: '15분 전' },
  { id: 'al-3', name: 'KubeVersionSkew', severity: '경고', resource: '클러스터02 외 5개', firedAt: '오늘 03:00' },
  { id: 'al-4', name: 'NodeNotReady', severity: '경고', resource: '클러스터02 노드 3개', firedAt: '14분 전' },
];

export const CONSOLE_AUDITS = [
  { id: 'ca-1', action: 'stack:run:triggered (run-292)', actor: '우녕', ip: '211.36.142.7', location: '서울, KR', time: '5분 전' },
  { id: 'ca-2', action: 'pr:created (#128 by AI)', actor: 'console-bot@srv.logo.dev', ip: '10.0.1.24', location: '클러스터 내부', time: '10분 전' },
  { id: 'ca-3', action: 'ai:agent-run:completed (ar-1)', actor: 'console-bot@srv.logo.dev', ip: '10.0.1.24', location: '클러스터 내부', time: '10분 전' },
  { id: 'ca-4', action: 'alert:fired (PodCrashLooping)', actor: 'alert-worker', ip: '10.0.2.71', location: '클러스터 내부', time: '12분 전' },
  { id: 'ca-5', action: 'users:login', actor: 'woonyong.dev@gmail.com', ip: '211.36.142.7', location: '서울, KR', time: '25분 전' },
];

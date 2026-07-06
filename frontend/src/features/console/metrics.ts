// 팟-상향 집계 메트릭 모델 (기획서 I3·I11)
//
// 원칙:
//  - 모든 수치는 "팟 레벨에서 생성 → 위로 합산"된다. 부모 값 = Σ(자식) (+ 명시된 오버헤드)
//  - 사용률(%)은 단순평균이 아니라 가중평균: Σ사용량 ÷ Σ용량
//  - 비용은 단가표(COST_RATES) 기반: 팟 = 요청량 × 단가, 노드 = 인스턴스 기본비 + Σ팟, 클러스터 = Σ노드
//  - 수집기(node-collector)가 비정상인 클러스터는 값을 지어내지 않는다 → available:false (I11)
//  - 팟 이름·노드 이름은 mock.ts의 K8s 브라우저 생성기와 같은 시드·공식 → 두 화면이 절대 어긋나지 않음
import { CLUSTERS, hashStr, mulberry32, NAMESPACES, POD_SERVICES } from './mock';

/* ── 단가표 (요청량 기반 비용 모델, USD/월) ── */
export const COST_RATES = {
  cpuCorePerMonth: 24.5, // vCPU 1개 예약 기준
  memGiPerMonth: 3.2, // 메모리 1Gi 예약 기준
  nodeBasePerMonth: 52.0, // 노드 인스턴스 기본비 (m5.xlarge 온디맨드 근사)
};

/* ── 노드 스펙 (전 클러스터 동일 — mock 세계관) ── */
export const NODE_SPEC = { cpuCap: 4000, memCap: 16384 }; // 4 vCPU(밀리코어), 16Gi(Mi)

/* ── 환경별 인스턴스 단가 계수 (prod 온디맨드 / staging RI / dev spot) ──
 * 팟 비용과 노드 기본비 양쪽에 같은 계수를 곱하므로 상향 합산 불변식(I3)이 유지된다. */
export function costFactorOf(clusterId: string): number {
  if (clusterId.startsWith('staging-')) return 0.72; // 예약 인스턴스
  if (clusterId.startsWith('dev-')) return 0.45; // spot
  return 1.0; // prod·mgmt·시나리오 클러스터: 온디맨드
}

/** 전주 대비 비용 증감(%) — 클러스터 레벨 표시용 (시드 고정) */
export function costDeltaOf(clusterId: string): number {
  if (clusterId === 'cluster02') return 9.4; // 시나리오: OOM 재시작 폭증으로 비용 급등
  const r = mulberry32(hashStr(clusterId) ^ 0xc057);
  return Math.round((r() * 20 - 8) * 10) / 10; // -8% ~ +12%
}

/* ── 서비스별 요청량 프로파일 (밀리코어 / Mi) ── */
const REQUEST_PROFILE: Record<string, { cpuReq: number; memReq: number }> = {
  'api-gateway': { cpuReq: 500, memReq: 512 },
  'realtime-gateway': { cpuReq: 500, memReq: 512 },
  'rca-worker': { cpuReq: 250, memReq: 512 },
  'dashboard-worker': { cpuReq: 250, memReq: 512 }, // 시나리오: 512Mi 한계에서 OOM
  'alert-worker': { cpuReq: 250, memReq: 256 },
  'command-worker': { cpuReq: 250, memReq: 256 },
  'evidence-worker': { cpuReq: 250, memReq: 256 },
  'plan-worker': { cpuReq: 250, memReq: 256 },
  'diff-worker': { cpuReq: 250, memReq: 256 },
  'mail-worker': { cpuReq: 100, memReq: 128 },
  monitoring: { cpuReq: 200, memReq: 384 },
  'cluster-agent': { cpuReq: 100, memReq: 128 },
  nats: { cpuReq: 500, memReq: 1024 },
  postgres: { cpuReq: 500, memReq: 2048 },
  coredns: { cpuReq: 100, memReq: 128 },
};

/* ── 수집기 상태 (I11) ─────────────────── */
export type CollectorState = {
  installed: boolean;
  healthy: boolean;
  lastScrape: string;
  reason?: string;
};

export function collectorOf(clusterId: string): CollectorState {
  if (clusterId.endsWith('-17'))
    return { installed: false, healthy: false, lastScrape: '—', reason: 'node-collector 미설치 — 마켓플레이스에서 설치하세요' };
  if (clusterId.endsWith('-09'))
    return { installed: true, healthy: false, lastScrape: '34분 전', reason: '스크레이프 실패 — node-collector 데몬셋 3개 팟 CrashLoop' };
  return { installed: true, healthy: true, lastScrape: '15초 전' };
}

/* ── 타입 ─────────────────────────────── */
export type PodMetric = {
  name: string;
  service: string;
  namespace: string;
  nodeIndex: number; // 0..99
  nodeName: string;
  cpuReq: number; // 밀리코어
  cpuUse: number;
  memReq: number; // Mi
  memUse: number;
  restarts: number;
  costMonth: number; // USD (요청량 기반)
  status: string;
};

export type NodeAgg = {
  name: string;
  index: number;
  podCount: number;
  cpuReq: number;
  cpuUse: number;
  cpuCap: number;
  memReq: number;
  memUse: number;
  memCap: number;
  costMonth: number; // 기본비 + Σ팟
  ready: boolean;
};

export type GroupAgg = {
  name: string; // 서비스명 또는 네임스페이스명
  podCount: number;
  cpuReq: number;
  cpuUse: number;
  memReq: number;
  memUse: number;
  costMonth: number; // Σ팟 (노드 기본비 제외 — 팟 귀속 비용만)
};

export type ClusterAgg = {
  clusterId: string;
  available: boolean; // 수집기 정상 여부 (I11)
  collector: CollectorState;
  podCount: number;
  cpuReq: number;
  cpuUse: number;
  cpuCap: number;
  cpuUsePct: number; // Σ사용 ÷ Σ용량 (가중)
  memReq: number;
  memUse: number;
  memCap: number;
  memUsePct: number;
  costMonth: number; // Σ노드
  costDeltaPct: number; // 전주 대비 (표시용)
};

export type FleetAgg = {
  clusterCount: number;
  availableCount: number;
  noData: string[]; // 수집기 비정상 클러스터 id
  podCount: number;
  cpuUsePct: number; // 가용 클러스터 가중평균
  memUsePct: number;
  costMonth: number;
};

/* ── 팟 메트릭 생성 (mock.ts 팟 이름 공식과 동일 시드) ── */
type ClusterMetricSet = {
  pods: PodMetric[];
  nodes: NodeAgg[];
  services: GroupAgg[];
  namespaces: GroupAgg[];
  agg: ClusterAgg;
};

const cache = new Map<string, ClusterMetricSet>();

function nodeNameOf(seed: number, i: number): string {
  // mock.ts genClusterResources의 노드 이름 공식과 동일
  return `ip-10-${Math.floor(i / 50)}-${(i % 50) + 1}-${10 + (seed % 200)}.ec2.internal`;
}

function buildCluster(clusterId: string): ClusterMetricSet {
  const cached = cache.get(clusterId);
  if (cached) return cached;

  const cluster = CLUSTERS.find((c) => c.id === clusterId);
  const collector = collectorOf(clusterId);
  const seed = hashStr(clusterId);
  const r = mulberry32(seed ^ 0x5eed);
  const unhealthy = clusterId === 'cluster02';

  // 건강 점수와 사용률의 상관: 아픈 클러스터일수록 압박이 높다 (색=상태 서사와 정합)
  const health = cluster?.health ?? 75;
  const pressure = 0.35 + ((100 - health) / 100) * 0.45; // 0.35 ~ 0.8
  const costFactor = costFactorOf(clusterId);

  const pods: PodMetric[] = Array.from({ length: 1000 }, (_, i) => {
    const svc = POD_SERVICES[i % POD_SERVICES.length];
    const hash = ((seed + i * 2654435761) >>> 8).toString(16).slice(0, 5);
    const suffix = ((seed + i * 40503) >>> 4).toString(36).slice(0, 4);
    const profile = REQUEST_PROFILE[svc] ?? { cpuReq: 250, memReq: 256 };
    const nodeIndex = i % 100;
    const jitter = 0.75 + r() * 0.5; // 팟별 편차
    // 시나리오: 클러스터02의 dashboard-worker는 메모리 한계 직전 (OOM 원인)
    const oomPressure = unhealthy && svc === 'dashboard-worker' ? 0.97 : 1;
    const cpuUse = Math.min(profile.cpuReq, Math.round(profile.cpuReq * pressure * jitter));
    const memUse =
      oomPressure < 1
        ? Math.round(profile.memReq * oomPressure)
        : Math.min(profile.memReq, Math.round(profile.memReq * (pressure * 0.9 + 0.08) * jitter));
    // 시나리오 팟(i=0, dashboard-worker-5c2d-q9r4)도 CrashLoop — mock.ts K8s 브라우저와 동일 규칙
    const bad = unhealthy && (i === 0 || i % 250 === 3);
    return {
      name: i === 0 && unhealthy ? 'dashboard-worker-5c2d-q9r4' : `${svc}-${hash}-${suffix}`,
      service: i === 0 && unhealthy ? 'dashboard-worker' : svc,
      namespace: NAMESPACES[i % NAMESPACES.length],
      nodeIndex,
      nodeName: nodeNameOf(seed, nodeIndex),
      cpuReq: profile.cpuReq,
      cpuUse,
      memReq: profile.memReq,
      memUse,
      restarts: bad ? 7 : r() > 0.9 ? 1 : 0,
      costMonth:
        ((profile.cpuReq / 1000) * COST_RATES.cpuCorePerMonth +
          (profile.memReq / 1024) * COST_RATES.memGiPerMonth) *
        costFactor,
      status: bad ? 'CrashLoopBackOff' : '실행 중',
    };
  });

  // 노드 집계 = Σ(소속 팟) + 인스턴스 기본비
  const nodes: NodeAgg[] = Array.from({ length: 100 }, (_, i) => {
    const mine = pods.filter((p) => p.nodeIndex === i);
    const notReady = unhealthy ? i % 33 === 7 : false;
    return {
      name: nodeNameOf(seed, i),
      index: i,
      podCount: mine.length,
      cpuReq: mine.reduce((s, p) => s + p.cpuReq, 0),
      cpuUse: mine.reduce((s, p) => s + p.cpuUse, 0),
      cpuCap: NODE_SPEC.cpuCap,
      memReq: mine.reduce((s, p) => s + p.memReq, 0),
      memUse: mine.reduce((s, p) => s + p.memUse, 0),
      memCap: NODE_SPEC.memCap,
      costMonth: COST_RATES.nodeBasePerMonth * costFactor + mine.reduce((s, p) => s + p.costMonth, 0),
      ready: !notReady,
    };
  });

  const groupBy = (key: (p: PodMetric) => string): GroupAgg[] => {
    const map = new Map<string, GroupAgg>();
    for (const p of pods) {
      const k = key(p);
      const g = map.get(k) ?? { name: k, podCount: 0, cpuReq: 0, cpuUse: 0, memReq: 0, memUse: 0, costMonth: 0 };
      g.podCount += 1;
      g.cpuReq += p.cpuReq;
      g.cpuUse += p.cpuUse;
      g.memReq += p.memReq;
      g.memUse += p.memUse;
      g.costMonth += p.costMonth;
      map.set(k, g);
    }
    return [...map.values()].sort((a, b) => b.costMonth - a.costMonth);
  };

  const cpuUse = nodes.reduce((s, n) => s + n.cpuUse, 0);
  const memUse = nodes.reduce((s, n) => s + n.memUse, 0);
  const cpuCap = nodes.reduce((s, n) => s + n.cpuCap, 0);
  const memCap = nodes.reduce((s, n) => s + n.memCap, 0);

  const agg: ClusterAgg = {
    clusterId,
    available: collector.healthy,
    collector,
    podCount: pods.length,
    cpuReq: nodes.reduce((s, n) => s + n.cpuReq, 0),
    cpuUse,
    cpuCap,
    cpuUsePct: (cpuUse / cpuCap) * 100,
    memReq: nodes.reduce((s, n) => s + n.memReq, 0),
    memUse,
    memCap,
    memUsePct: (memUse / memCap) * 100,
    costMonth: nodes.reduce((s, n) => s + n.costMonth, 0),
    costDeltaPct: costDeltaOf(clusterId),
  };

  const set: ClusterMetricSet = { pods, nodes, services: groupBy((p) => p.service), namespaces: groupBy((p) => p.namespace), agg };
  cache.set(clusterId, set);
  return set;
}

/* ── 공개 API ─────────────────────────── */
/** 클러스터 집계. 수집기 비정상이면 available:false — 값 사용 금지, "데이터 없음" 표시 (I11) */
export function getClusterAgg(clusterId: string): ClusterAgg {
  const collector = collectorOf(clusterId);
  if (!collector.healthy) {
    return {
      clusterId,
      available: false,
      collector,
      podCount: 0,
      cpuReq: 0,
      cpuUse: 0,
      cpuCap: 0,
      cpuUsePct: 0,
      memReq: 0,
      memUse: 0,
      memCap: 0,
      memUsePct: 0,
      costMonth: 0,
      costDeltaPct: 0,
    };
  }
  return buildCluster(clusterId).agg;
}

export function getPodMetrics(clusterId: string): PodMetric[] {
  return collectorOf(clusterId).healthy ? buildCluster(clusterId).pods : [];
}

export function getNodeAggs(clusterId: string): NodeAgg[] {
  return collectorOf(clusterId).healthy ? buildCluster(clusterId).nodes : [];
}

export function getServiceAggs(clusterId: string): GroupAgg[] {
  return collectorOf(clusterId).healthy ? buildCluster(clusterId).services : [];
}

export function getNamespaceAggs(clusterId: string): GroupAgg[] {
  return collectorOf(clusterId).healthy ? buildCluster(clusterId).namespaces : [];
}

/** 플릿 집계 — 반드시 "뷰어에게 보이는 클러스터 목록"을 받아 계산 (I6) */
export function getFleetAgg(clusterIds: string[]): FleetAgg {
  const aggs = clusterIds.map(getClusterAgg);
  const ok = aggs.filter((a) => a.available);
  const cpuCap = ok.reduce((s, a) => s + a.cpuCap, 0);
  const memCap = ok.reduce((s, a) => s + a.memCap, 0);
  return {
    clusterCount: clusterIds.length,
    availableCount: ok.length,
    noData: aggs.filter((a) => !a.available).map((a) => a.clusterId),
    podCount: ok.reduce((s, a) => s + a.podCount, 0),
    cpuUsePct: cpuCap > 0 ? (ok.reduce((s, a) => s + a.cpuUse, 0) / cpuCap) * 100 : 0,
    memUsePct: memCap > 0 ? (ok.reduce((s, a) => s + a.memUse, 0) / memCap) * 100 : 0,
    costMonth: ok.reduce((s, a) => s + a.costMonth, 0),
  };
}

/* ── 불변식 자가 검증 (I3) — 개발용 ────── */
export function validateInvariants(clusterId: string): string[] {
  const errors: string[] = [];
  if (!collectorOf(clusterId).healthy) return errors; // 결측은 검증 대상 아님
  const { pods, nodes, services, namespaces, agg } = buildCluster(clusterId);
  const close = (a: number, b: number) => Math.abs(a - b) < 0.01;

  const podCpu = pods.reduce((s, p) => s + p.cpuUse, 0);
  const nodeCpu = nodes.reduce((s, n) => s + n.cpuUse, 0);
  const svcCpu = services.reduce((s, g) => s + g.cpuUse, 0);
  const nsCpu = namespaces.reduce((s, g) => s + g.cpuUse, 0);
  if (!close(podCpu, nodeCpu)) errors.push(`CPU: Σ팟(${podCpu}) ≠ Σ노드(${nodeCpu})`);
  if (!close(podCpu, svcCpu)) errors.push(`CPU: Σ팟(${podCpu}) ≠ Σ서비스(${svcCpu})`);
  if (!close(podCpu, nsCpu)) errors.push(`CPU: Σ팟(${podCpu}) ≠ Σ네임스페이스(${nsCpu})`);
  if (!close(podCpu, agg.cpuUse)) errors.push(`CPU: Σ팟(${podCpu}) ≠ 클러스터(${agg.cpuUse})`);

  const podMem = pods.reduce((s, p) => s + p.memUse, 0);
  if (!close(podMem, agg.memUse)) errors.push(`MEM: Σ팟(${podMem}) ≠ 클러스터(${agg.memUse})`);

  const podCost = pods.reduce((s, p) => s + p.costMonth, 0);
  const expected = podCost + nodes.length * COST_RATES.nodeBasePerMonth * costFactorOf(clusterId);
  if (!close(expected, agg.costMonth)) errors.push(`비용: Σ팟+노드기본비(${expected.toFixed(2)}) ≠ 클러스터(${agg.costMonth.toFixed(2)})`);

  const badPod = pods.find((p) => p.cpuUse > p.cpuReq || p.memUse > p.memReq);
  if (badPod) errors.push(`팟 ${badPod.name}: 사용량이 요청량 초과`);

  const counts = nodes.map((n) => n.podCount);
  if (counts.some((c) => c !== 10)) errors.push('노드당 팟 10개 불변식 위반');

  return errors;
}

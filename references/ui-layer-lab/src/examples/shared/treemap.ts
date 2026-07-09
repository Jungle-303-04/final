export type TreemapMetric = "capacity" | "errorRate" | "traffic";

export type ClusterNode = {
  id: string;
  name: string;
  environment: "운영" | "스테이징" | "개발" | "관리";
  status: "정상" | "주의" | "위험" | "정보 없음";
  capacity: number | null;
  errorRate: number | null;
  traffic: number | null;
  score: number | null;
};

export type TreemapRect = ClusterNode & {
  x: number;
  y: number;
  width: number;
  height: number;
  areaValue: number | null;
  colorValue: number | null;
};

export const clusterTreemapData: ClusterNode[] = [
  { id: "logo-mgmt", name: "logo-mgmt", environment: "관리", status: "정상", capacity: 92, errorRate: 0.8, traffic: 58, score: 92 },
  { id: "cluster-01", name: "클러스터01", environment: "운영", status: "주의", capacity: 61, errorRate: 3.8, traffic: 74, score: 61 },
  { id: "cluster-02", name: "클러스터02", environment: "운영", status: "위험", capacity: 34, errorRate: 9.4, traffic: 42, score: 34 },
  { id: "prod-us1-01", name: "prod-us1-01", environment: "운영", status: "주의", capacity: 53, errorRate: 4.1, traffic: 88, score: 53 },
  { id: "staging-ap2-02", name: "staging-ap2-02", environment: "스테이징", status: "정상", capacity: 81, errorRate: 1.2, traffic: 36, score: 81 },
  { id: "dev-eu1-03", name: "dev-eu1-03", environment: "개발", status: "주의", capacity: 69, errorRate: 2.4, traffic: 26, score: 69 },
  { id: "prod-us2-04", name: "prod-us2-04", environment: "운영", status: "주의", capacity: 55, errorRate: 4.8, traffic: 92, score: 55 },
  { id: "staging-us1-05", name: "staging-us1-05", environment: "스테이징", status: "정상", capacity: 81, errorRate: 1.1, traffic: 33, score: 81 },
  { id: "dev-ap2-06", name: "dev-ap2-06", environment: "개발", status: "정상", capacity: 76, errorRate: 1.6, traffic: 49, score: 76 },
  { id: "prod-eu1-07", name: "prod-eu1-07", environment: "운영", status: "주의", capacity: 54, errorRate: 5.7, traffic: 81, score: 54 },
  { id: "staging-us2-08", name: "staging-us2-08", environment: "스테이징", status: "위험", capacity: 33, errorRate: 11.2, traffic: 45, score: 33 },
  { id: "dev-us1-09", name: "dev-us1-09", environment: "개발", status: "정보 없음", capacity: null, errorRate: null, traffic: null, score: null },
  { id: "prod-ap2-10", name: "prod-ap2-10", environment: "운영", status: "정상", capacity: 73, errorRate: 2.1, traffic: 68, score: 73 },
  { id: "staging-eu1-11", name: "staging-eu1-11", environment: "스테이징", status: "정상", capacity: 81, errorRate: 1.3, traffic: 39, score: 81 },
  { id: "dev-us2-12", name: "dev-us2-12", environment: "개발", status: "위험", capacity: 48, errorRate: 8.6, traffic: 28, score: 48 },
  { id: "prod-us1-13", name: "prod-us1-13", environment: "운영", status: "주의", capacity: 69, errorRate: 3.2, traffic: 96, score: 69 },
  { id: "staging-ap2-14", name: "staging-ap2-14", environment: "스테이징", status: "정상", capacity: 79, errorRate: 0.9, traffic: 31, score: 79 },
  { id: "dev-eu1-15", name: "dev-eu1-15", environment: "개발", status: "정상", capacity: 93, errorRate: 0.5, traffic: 22, score: 93 },
  { id: "prod-us2-16", name: "prod-us2-16", environment: "운영", status: "정상", capacity: 87, errorRate: 1.0, traffic: 90, score: 87 },
  { id: "staging-us1-17", name: "staging-us1-17", environment: "스테이징", status: "정보 없음", capacity: null, errorRate: null, traffic: null, score: null }
];

export function metricLabel(metric: TreemapMetric) {
  if (metric === "capacity") return "용량 기준";
  if (metric === "errorRate") return "오류율 기준";
  return "트래픽 기준";
}

export function metricValue(node: ClusterNode, metric: TreemapMetric) {
  return node[metric];
}

export function metricUnit(metric: TreemapMetric) {
  if (metric === "errorRate") return "%";
  return "";
}

export function layoutTreemap(nodes: ClusterNode[], metric: TreemapMetric): TreemapRect[] {
  const sorted = [...nodes].sort((a, b) => {
    const aValue = metricValue(a, metric) ?? -1;
    const bValue = metricValue(b, metric) ?? -1;
    return bValue - aValue;
  });
  const fallback = Math.max(8, Math.round(average(sorted, metric) * 0.35));
  const weighted = sorted.map((node) => ({
    node,
    weight: metricValue(node, metric) ?? fallback
  }));

  return slice(weighted, 0, 0, 100, 100, true).map((rect) => ({
    ...rect.node,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    areaValue: metricValue(rect.node, metric),
    colorValue: metric === "errorRate" ? rect.node.errorRate : rect.node.score
  }));
}

export function colorClass(node: TreemapRect) {
  if (node.status === "정보 없음") return "is-disabled";
  if (node.status === "위험") return "is-danger";
  if (node.status === "주의") return "is-warning";
  return "is-good";
}

function average(nodes: ClusterNode[], metric: TreemapMetric) {
  const values = nodes.map((node) => metricValue(node, metric)).filter((value): value is number => value !== null);
  if (!values.length) return 20;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function slice(
  items: Array<{ node: ClusterNode; weight: number }>,
  x: number,
  y: number,
  width: number,
  height: number,
  vertical: boolean
): Array<{ node: ClusterNode; x: number; y: number; width: number; height: number }> {
  if (items.length === 0) return [];
  if (items.length === 1) return [{ node: items[0].node, x, y, width, height }];

  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let acc = 0;
  let index = 0;
  for (; index < items.length - 1; index += 1) {
    if (acc + items[index].weight > total / 2 && index > 0) break;
    acc += items[index].weight;
  }

  const first = items.slice(0, index + 1);
  const second = items.slice(index + 1);
  const firstTotal = first.reduce((sum, item) => sum + item.weight, 0);
  const ratio = firstTotal / total;

  if (vertical) {
    const firstWidth = width * ratio;
    return [
      ...slice(first, x, y, firstWidth, height, false),
      ...slice(second, x + firstWidth, y, width - firstWidth, height, false)
    ];
  }

  const firstHeight = height * ratio;
  return [
    ...slice(first, x, y, width, firstHeight, true),
    ...slice(second, x, y + firstHeight, width, height - firstHeight, true)
  ];
}

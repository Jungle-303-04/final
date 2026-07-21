import { useInventoryResources, type Row } from "./inventoryResourcesFeed";

// UI-PHASE2-001: 물리 토폴로지(노드·파드) 전용 라이브 어댑터.
// `GET /api/clusters/{id}/inventory/resources?resource_type=node|pod` 만 읽는다.
// 계약이 노출하지 않는 값(CPU/MEM/용량/파드→노드 귀속 등)은 절대 지어내지 않는다.
// 관측이 없으면 status="unavailable" 로 정직하게 비운다.

export type TopologyStatus = "loading" | "ready" | "unavailable";

export interface InvNode {
  name: string;
  status: string;
  health: string;
  cluster: string;
  key: string;
}

export interface InvPod {
  name: string;
  namespace: string | null;
  status: string;
  health: string;
  cluster: string;
  key: string;
}

export interface ClusterTopologyView {
  status: TopologyStatus;
  nodes: InvNode[];
  pods: InvPod[];
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toNode(row: Row): InvNode {
  return {
    name: str(row.name),
    status: str(row.status),
    health: str(row.health),
    cluster: str(row.cluster),
    key: str(row._key) || str(row.name),
  };
}

function toPod(row: Row): InvPod {
  return {
    name: str(row.name),
    namespace: typeof row.ns === "string" ? row.ns : null,
    status: str(row.status),
    health: str(row.health),
    cluster: str(row.cluster),
    key: str(row._key) || str(row.name),
  };
}

/**
 * 한 클러스터의 관측된 노드·파드를 인벤토리 계약에서 읽는다. `clusterId`가 null
 * 이면(클러스터 뷰) 아무 요청도 하지 않고 빈 결과를 낸다. 노드·파드 각각 한 번씩
 * `useInventoryResources`를 재사용하며, 두 리소스 타입의 상태를 합쳐 하나의
 * 정직한 status로 노출한다(둘 다 unavailable 일 때만 unavailable).
 */
export function useClusterTopology(clusterId: string | null): ClusterTopologyView {
  const nodeView = useInventoryResources(clusterId, "node");
  const podView = useInventoryResources(clusterId, "pod");
  const status: TopologyStatus =
    nodeView.status === "loading" || podView.status === "loading"
      ? "loading"
      : nodeView.status === "unavailable" && podView.status === "unavailable"
        ? "unavailable"
        : "ready";
  return {
    status,
    nodes: nodeView.rows.map(toNode),
    pods: podView.rows.map(toPod),
  };
}

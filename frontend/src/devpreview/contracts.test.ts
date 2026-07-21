import { describe, expect, it } from "vitest";

import { projectCluster } from "./contracts";

// projectCluster 단위 테스트용 wire 입력 — production 코드가 아니라 테스트에서만 만든다.
// (실제 클러스터 목록은 항상 GET /api/clusters에서 온다; 오프라인 fixture 모드는 제거됨.)
function contractCluster(input: {
  clusterId: string;
  displayName: string;
  environment: string;
  role: "management" | "target";
  eksClusterName?: string;
}) {
  return {
    workspace_id: "default",
    cluster_id: input.clusterId,
    name: input.clusterId,
    environment: input.environment,
    provider: "eks" as const,
    observation_mode: "agent" as const,
    status: "registered",
    settings: {
      name: input.displayName,
      cluster_role: input.role,
      provider_config: input.eksClusterName
        ? { eks_cluster_name: input.eksClusterName }
        : {},
    },
    connection_status: "online",
    connection_stage: "ready" as const,
    last_agent_id: `${input.clusterId}-agent`,
    last_agent_seen_at: "2026-07-20T00:00:00.000Z",
    node_count: input.role === "management" ? 2 : 3,
    pod_count: input.role === "management" ? 24 : 36,
    namespace_count: input.role === "management" ? 8 : 12,
    kubernetes_version: "v1.34.9-eks",
    crd_discovery_status: "exact" as const,
    incident_count: 0,
    server_count: null,
    app_count: null,
    open_incidents: 0,
    last_seen_at: "2026-07-20T00:00:00.000Z",
    created_at: "2026-07-20T00:00:00.000Z",
    updated_at: "2026-07-20T00:00:00.000Z",
  };
}

describe("devpreview projectCluster", () => {
  it("projects management scope as read-only without losing wire evidence", () => {
    const management = projectCluster(contractCluster({
      clusterId: "management-server",
      displayName: "매니지먼트 서버",
      environment: "management",
      role: "management",
    }));

    expect(management).toMatchObject({
      id: "management-server",
      role: "management",
      readOnly: true,
      connectionStatus: "online",
      observationMode: "agent",
    });
  });

  it("projects target scope as mutable", () => {
    const target = projectCluster(contractCluster({
      clusterId: "game-server",
      displayName: "게임 서버",
      environment: "production",
      role: "target",
    }));

    expect(target).toMatchObject({
      id: "game-server",
      role: "target",
      readOnly: false,
    });
  });

  it("uses the actual AWS EKS cluster name instead of a registration alias", () => {
    const target = projectCluster(contractCluster({
      clusterId: "game-server-live",
      displayName: "게임 서버",
      environment: "production",
      role: "target",
      eksClusterName: "game-server",
    }));

    expect(target.displayName).toBe("game-server");
  });
});

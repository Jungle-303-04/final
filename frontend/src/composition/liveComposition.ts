import {
  TopologyGatewayError,
  type TopologyHierarchyGateway,
} from "../features/topology/contracts";

const liveOrigin = { kind: "live", adapterId: "openapi-pending" } as const;

export function createLiveTopologyGateway(): TopologyHierarchyGateway {
  return {
    dataOrigin: liveOrigin,
    async getSnapshot() {
      throw new TopologyGatewayError(
        "unconfigured",
        "승인된 OpenAPI가 아직 연결되지 않았습니다. live adapter를 추정 구현하지 않습니다.",
      );
    },
  };
}

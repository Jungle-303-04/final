export interface ResourceCapabilitiesEndpointResponse {
  subject: {
    resource_id: string;
    snapshot_id: string;
    cluster_id: string;
    resource_type: string;
    kind: string;
    namespace: string | null;
    name: string;
  };
  revision: string;
  capabilities: Array<{
    capability_id: "deployment.restart" | "deployment.scale" | "pod.exec";
    method: "POST" | "WEBSOCKET";
    path: string;
  }>;
}

export interface ResourceCapabilitiesEndpointDependencies {
  getResourceCapabilities(
    resourceId: string,
    signal?: AbortSignal,
  ): Promise<ResourceCapabilitiesEndpointResponse>;
}

export interface ResourceActionsEndpointDependencies {
  restartDeployment(
    clusterId: string,
    namespace: string,
    deployment: string,
    options?: { signal?: AbortSignal },
  ): Promise<{ accepted: boolean; event_id: string; correlation_id: string }>;
  scaleDeployment(
    clusterId: string,
    namespace: string,
    deployment: string,
    options: { replicas: number; signal?: AbortSignal },
  ): Promise<{ accepted: boolean; event_id: string; correlation_id: string }>;
}

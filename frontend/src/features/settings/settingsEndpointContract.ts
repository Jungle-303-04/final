export interface SettingsAccessProfileEndpoint {
  workspace_id: string;
  user_id: string;
  cluster_id: string;
  roles: string[];
  authority: "opsia_rbac";
  permissions: {
    permission: string;
    category: string;
    allowed: boolean;
  }[];
  kubernetes_rules: {
    status: "unavailable";
    reason_code: string;
    detail: string;
  };
  restricted_resource_types: {
    status: "unavailable";
    reason_code: string;
    detail: string;
  };
  revision: string;
}

export interface SettingsEndpointDependencies {
  getSettingsAccessProfile(
    clusterId: string,
    signal?: AbortSignal,
  ): Promise<SettingsAccessProfileEndpoint>;
}

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
  } | {
    status: "observed";
    authority: "cluster_agent_service_account";
    namespace: string;
    observed_at: string;
    subject: SettingsKubernetesSubjectEndpoint;
    resource_rules: SettingsKubernetesPolicyRuleEndpoint[];
    non_resource_rules: SettingsKubernetesPolicyRuleEndpoint[];
    truncated: boolean;
  };
  restricted_resource_types: {
    status: "unavailable";
    reason_code: string;
    detail: string;
  } | {
    status: "observed";
    authority: "cluster_agent_service_account";
    namespace: string;
    observed_at: string;
    completeness: "exact" | "partial";
    reason_codes: string[];
    items: SettingsRestrictedResourceTypeEndpoint[];
  };
  revision: string;
}

export interface SettingsKubernetesSubjectEndpoint {
  kind: "ServiceAccount" | "User" | "Group";
  namespace: string;
  name: string;
}

export interface SettingsKubernetesPolicyRuleEndpoint {
  verbs: string[];
  api_groups: string[];
  resources: string[];
  resource_names: string[];
  non_resource_urls: string[];
}

export interface SettingsRestrictedResourceTypeEndpoint {
  api_group: string;
  version: string;
  resource: string;
  kind: string;
  namespaced: boolean;
  reason_code: "list_permission_not_observed";
}

export interface SettingsEndpointDependencies {
  getSettingsAccessProfile(
    clusterId: string,
    namespace: string,
    signal?: AbortSignal,
  ): Promise<SettingsAccessProfileEndpoint>;
  getPrometheusIntegration(
    clusterId: string,
    signal?: AbortSignal,
  ): Promise<PrometheusIntegrationEndpoint>;
  updatePrometheusIntegration(
    input: PrometheusIntegrationUpdateEndpointInput,
    signal?: AbortSignal,
  ): Promise<PrometheusIntegrationEndpoint>;
}

export interface PrometheusIntegrationReceiptEndpoint {
  accepted: true;
  command_id: string;
  event_id: string;
  audit_event_id: string;
  correlation_id: string;
  status: "queued" | "leased" | "running" | "cancel_requested" | "cancelling" | "completed" | "failed" | "cancelled";
  audit_id?: string | null;
}

export interface PrometheusIntegrationEndpoint {
  cluster_id: string;
  revision: string | null;
  operation_id: string | null;
  address: string | null;
  header_keys: string[];
  state: "unconfigured" | "pending" | "connected" | "failed";
  error_code: string | null;
  receipt?: PrometheusIntegrationReceiptEndpoint | null;
}

export interface PrometheusIntegrationUpdateEndpointInput {
  clusterId: string;
  prometheusUrl: string;
  headers?: Readonly<Record<string, string>>;
}

export interface SettingsPermissionDecision {
  permission: string;
  category: string;
  allowed: boolean;
}

export interface SettingsUnavailableEvidence {
  status: "unavailable";
  reasonCode: string;
  detail: string;
}

export interface SettingsKubernetesSubject {
  kind: "ServiceAccount" | "User" | "Group";
  namespace: string;
  name: string;
}

export interface SettingsKubernetesPolicyRule {
  verbs: readonly string[];
  apiGroups: readonly string[];
  resources: readonly string[];
  resourceNames: readonly string[];
  nonResourceUrls: readonly string[];
}

export interface SettingsObservedKubernetesRules {
  status: "observed";
  authority: "cluster_agent_service_account";
  namespace: string;
  observedAt: string;
  subject: SettingsKubernetesSubject;
  resourceRules: readonly SettingsKubernetesPolicyRule[];
  nonResourceRules: readonly SettingsKubernetesPolicyRule[];
  truncated: boolean;
}

export interface SettingsRestrictedResourceType {
  apiGroup: string;
  version: string;
  resource: string;
  kind: string;
  namespaced: boolean;
  reasonCode: "list_permission_not_observed";
}

export interface SettingsObservedRestrictedResourceTypes {
  status: "observed";
  authority: "cluster_agent_service_account";
  namespace: string;
  observedAt: string;
  completeness: "exact" | "partial";
  reasonCodes: readonly string[];
  items: readonly SettingsRestrictedResourceType[];
}

export interface SettingsAccessProfile {
  workspaceId: string;
  userId: string;
  clusterId: string;
  roles: readonly string[];
  authority: "opsia_rbac";
  permissions: readonly SettingsPermissionDecision[];
  kubernetesRules: SettingsUnavailableEvidence | SettingsObservedKubernetesRules;
  restrictedResourceTypes: SettingsUnavailableEvidence | SettingsObservedRestrictedResourceTypes;
  revision: string;
}

export type SettingsFailureCode =
  | "unauthorized"
  | "forbidden"
  | "invalid-response"
  | "invalid-request"
  | "offline"
  | "rate-limited"
  | "error";

export class SettingsPortFailure extends Error {
  readonly code: SettingsFailureCode;

  constructor(code: SettingsFailureCode) {
    super(`Settings port failed: ${code}`);
    this.name = "SettingsPortFailure";
    this.code = code;
  }
}

export interface SettingsPort {
  getAccessProfile(
    clusterId: string,
    namespace: string,
    signal?: AbortSignal,
  ): Promise<SettingsAccessProfile>;
  getPrometheusIntegration(
    clusterId: string,
    signal?: AbortSignal,
  ): Promise<PrometheusIntegrationStatus>;
  updatePrometheusIntegration(
    input: PrometheusIntegrationUpdate,
    signal?: AbortSignal,
  ): Promise<PrometheusIntegrationStatus>;
}

export interface PrometheusIntegrationHeader {
  name: string;
  value: string;
}

export interface PrometheusIntegrationUpdate {
  clusterId: string;
  url: string;
  headers?: readonly PrometheusIntegrationHeader[];
}

export interface PrometheusIntegrationStatus {
  clusterId: string;
  configurationRevision: string | null;
  operationId: string | null;
  url: string | null;
  headerNames: readonly string[];
  state: "unconfigured" | "pending" | "connected" | "failed";
  errorCode: string | null;
  receipt: import("../../shared/parity/referenceParity").CommandReceipt | null;
}

export const EMPTY_SETTINGS_PORT: SettingsPort = {
  getAccessProfile: () => Promise.reject(new SettingsPortFailure("error")),
  getPrometheusIntegration: () => Promise.reject(new SettingsPortFailure("error")),
  updatePrometheusIntegration: () => Promise.reject(new SettingsPortFailure("error")),
};

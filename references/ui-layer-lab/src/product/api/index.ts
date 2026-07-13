export * from "./barrels/ai";
export * from "./barrels/catalog";
export * from "./barrels/gitops";
export * from "./barrels/metrics";
export * from "./barrels/rca";
export * from "./barrels/workloads";

export {
  ApiError,
  apiRequest,
  apiRequestNoContent,
  isApiError,
  type ApiErrorKind,
  type ApiPath,
} from "./client";
export {
  getSession,
  login,
  logout,
  type LoginCredentials,
} from "./auth";
export { getFleetSummary } from "./fleet";
export { listClusters, type ListClustersOptions } from "./clusters";
export { getCluster } from "./cluster-detail";
export { getClusterConnectionStatus } from "./cluster-connection";
export {
  getProviderCatalog,
  getProviderClusterDiscovery,
  preflightTargetRegistration,
  registerTarget,
  PROVIDERS_CATALOG_PATH,
  PROVIDERS_CLUSTER_DISCOVERY_PATH,
  TARGETS_PATH,
  TARGETS_PREFLIGHT_PATH,
  type TargetPreflightInput,
  type TargetProviderSelectionInput,
  type TargetRegisterInput,
} from "./cluster-registration";
export {
  clusterImportCandidateSchema,
  clusterRegistrationFlowSchema,
  providerCatalogSchema,
  providerClusterDiscoverySchema,
  providerConfigFieldSchema,
  providerCredentialRequirementSchema,
  providerDefinitionSchema,
  targetBootstrapStepSchema,
  targetInstallResponseSchema,
  targetPreflightResponseSchema,
  type ClusterImportCandidate,
  type ClusterRegistrationFlow,
  type ProviderCatalog,
  type ProviderClusterDiscovery,
  type ProviderConfigField,
  type ProviderCredentialRequirement,
  type ProviderDefinition,
  type TargetBootstrapStep,
  type TargetInstallResponse,
  type TargetPreflightResponse,
} from "./cluster-registration-schemas";
export { getInventorySummary } from "./inventory-summary";
export {
  listInventoryResourcesByType,
  type InventoryResourceTypeQuery,
} from "./inventory-query";
export {
  listInventoryEvents,
  type InventoryEventListOptions,
} from "./inventory-events";
export {
  getClusterSummary,
  getClusterNodesSummary,
  getNodePodsSummary,
} from "./cluster-summary";
export {
  connectRealtime,
  createRealtimeClient,
  type RealtimeClient,
  type RealtimeClientOptions,
  type RealtimeConnectionState,
  type RealtimeConnectionStatus,
} from "./live";
export {
  getInventoryResourceDetail,
  listInventoryResources,
  listInventoryServices,
  listInventoryWorkloads,
  type HomeInventoryResourceType,
  type InventoryListOptions,
  type InventoryResourceDetailOptions,
  type InventoryResourceIdentity,
  type InventoryResourceQuery,
} from "./inventory";
export {
  clusterListSchema,
  clusterSummarySchema,
  clusterAgentStatusSchema,
  clusterResponseSchema,
  type ClusterList,
  type ClusterSummary,
  type ClusterAgentStatus,
  type ClusterResponse,
} from "./cluster-schemas";
export {
  clusterConnectionStatusSchema,
  type ClusterConnectionStatus,
} from "./cluster-connection-schemas";
export {
  connectionStageSchema,
  type ConnectionStage,
} from "./cluster-stage-schemas";
export {
  inventorySummarySchema,
  type InventorySummary,
} from "./inventory-summary-schemas";
export {
  inventoryQueryResponseSchema,
  type InventoryQueryResponse,
} from "./inventory-query-schemas";
export {
  inventoryEventListSchema,
  type InventoryEventList,
} from "./inventory-events-schemas";
export {
  clusterSummaryDetailSchema,
  clusterNodesSummarySchema,
  nodePodsSummarySchema,
  type ClusterSummaryDetail,
  type ClusterNodesSummary,
  type NodePodsSummary,
  type ClusterWorkloadHealthItem,
  type NodeSummaryItem,
  type PodSummaryItem,
} from "./cluster-summary-schemas";
export {
  inventoryResourceDetailSchema,
  inventoryResourceListSchema,
  inventoryResourceSchema,
  type InventoryResource,
  type InventoryResourceDetail,
  type InventoryResourceList,
} from "./inventory-schemas";
export {
  liveSummarySchema,
  parseRealtimeMessage,
  realtimeMessageSchema,
  type LiveSubscription,
  type LiveSummary,
  type LiveSummaryMessage,
  type RealtimeMessage,
} from "./live-schemas";
export {
  authSessionSchema,
  fleetClusterSummarySchema,
  fleetHealthSchema,
  fleetSummarySchema,
  fleetTotalsSchema,
  logoutResponseSchema,
  type AuthSession,
  type FleetClusterSummary,
  type FleetHealth,
  type FleetSummary,
  type FleetTotals,
} from "./schemas";

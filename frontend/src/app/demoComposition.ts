import type { AuthPort, ProductSession } from "../features/auth/authContract";
import type { AlertEvent, AlertEventsPort } from "../features/alerts/alertEventsContract";
import type { AlertRule, AlertRuleInput, AlertRulesPort } from "../features/alerts/alertRulesContract";
import type { AiAssistantPort } from "../features/ai-assistant/aiAssistantContract";
import type {
  ApplicationCardModel,
  ApplicationDetailModel,
  ApplicationsPort,
} from "../features/applications/applicationsContract";
import type {
  ClusterDisconnectPort,
  ClustersPort,
} from "../features/clusters/clustersContract";
import type { GlobalFilterPort, GlobalFilterSuggestion } from "../features/global-filter/globalFilterContract";
import type {
  HomeClusterChoice,
  HomeClusterOverview,
  HomeNodeCollection,
  HomePodCollection,
  HomePort,
} from "../features/home/homeContract";
import type { IssuesPort, IssueSummary } from "../features/issues/issuesContract";
import type { GitOpsPort, ReleasePlan, ReleaseRun } from "../features/gitops/gitOpsContract";
import type { LogStreamPort } from "../features/log-stream/logStreamContract";
import type { ChangeTimelinePort } from "../features/resources/changeTimelineContract";
import type { PhysicalTopologyPort } from "../features/resources/physicalTopologyContract";
import { EMPTY_PHYSICAL_TOPOLOGY_REALTIME_PORT } from "../features/resources/physicalTopologyRealtimeContract";
import type { RelationTopologyPort } from "../features/resources/relationTopologyContract";
import type {
  ResourceActionsPort,
  ResourceCapabilitiesPort,
} from "../features/resources/resourceCapabilitiesContract";
import type { ResourceMetricsHistoryPort } from "../features/resources/resourceMetricsHistoryContract";
import type {
  ResourceCatalog,
  ResourceDetail,
  ResourceSummary,
  ResourcesPort,
} from "../features/resources/resourcesContract";
import type {
  ResourcesFilterPort,
  ResourcesFilterSnapshot,
} from "../features/resources/resourcesFilterContract";
import { createApplicationsSurface } from "../features/applications/createApplicationsSurface";
import { createAlertsSurface } from "../pages/alerts/createAlertsSurface";
import { createClustersSurface } from "../pages/clusters/createClustersSurface";
import { createGitOpsSurface } from "../pages/gitops/createGitOpsSurface";
import { createHomeSurface } from "../pages/home/createHomeSurface";
import { createIssuesSurface } from "../pages/issues/createIssuesSurface";
import { createResourcesSurface } from "../pages/resources/createResourcesSurface";
import { createSettingsSurface } from "../pages/settings/createSettingsSurface";
import { createProductComposition } from "./productComposition";

const DEMO_SESSION: ProductSession = {
  displayName: "Opsia Demo Operator",
  email: "operator@opsia.demo",
  userId: "demo-operator",
  roles: ["service_admin", "operator", "approver"],
  workspaceId: "opsia-demo",
};

const now = Date.now();
const isoMinutesAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

const DEMO_CLUSTERS: HomeClusterChoice[] = [
  {
    id: "prod-seoul",
    workspaceId: "opsia-demo",
    name: "prod-seoul",
    environment: "production",
    provider: "eks",
    connectionStage: "ready",
    registrationState: "active",
    connectionState: "online",
    lastObservedAt: isoMinutesAgo(1),
    nodeCount: 6,
    podCount: 84,
    incidentCount: 2,
    serverCount: 6,
    appCount: 12,
    openIncidentCount: 2,
  },
  {
    id: "staging-seoul",
    workspaceId: "opsia-demo",
    name: "staging-seoul",
    environment: "staging",
    provider: "gke",
    connectionStage: "ready",
    registrationState: "active",
    connectionState: "online",
    lastObservedAt: isoMinutesAgo(2),
    nodeCount: 3,
    podCount: 31,
    incidentCount: 0,
    serverCount: 3,
    appCount: 7,
    openIncidentCount: 0,
  },
  {
    id: "edge-busan",
    workspaceId: "opsia-demo",
    name: "edge-busan",
    environment: "edge",
    provider: "onprem",
    connectionStage: "snapshot_received",
    registrationState: "active",
    connectionState: "stale",
    lastObservedAt: isoMinutesAgo(18),
    nodeCount: 2,
    podCount: 14,
    incidentCount: 1,
    serverCount: 2,
    appCount: 3,
    openIncidentCount: 1,
  },
];

const DEMO_INCIDENTS: IssueSummary[] = [
  {
    id: "issue:opsia-demo/corr-checkout",
    workspaceId: "opsia-demo",
    incidentId: "inc-checkout-oom",
    correlationId: "corr-checkout",
    clusterId: "prod-seoul",
    namespace: "commerce",
    resourceKind: "Deployment",
    resourceName: "checkout-api",
    symptom: "Checkout API 응답 지연과 Pod 재시작",
    currentSubject: "deployment/commerce/checkout-api",
    status: "investigating",
    rootCause: "Memory pressure",
    confidence: 0.91,
    supportingEvidence: ["OOMKilled 6회", "메모리 사용률 96%", "배포 직후 재시작 증가"],
    missingEvidence: ["최근 15분 사용자 오류율"],
    evidenceRef: "evidence://corr-checkout",
    actionRoute: "approval",
    commandId: null,
    pullRequestUrl: null,
    errorReason: null,
    updatedAt: isoMinutesAgo(3),
  },
  {
    id: "issue:opsia-demo/corr-payment",
    workspaceId: "opsia-demo",
    incidentId: "inc-payment-lag",
    correlationId: "corr-payment",
    clusterId: "prod-seoul",
    namespace: "payments",
    resourceKind: "Deployment",
    resourceName: "payment-worker",
    symptom: "결제 이벤트 처리 지연",
    currentSubject: "deployment/payments/payment-worker",
    status: "monitoring",
    rootCause: "Kafka consumer lag spike",
    confidence: 0.78,
    supportingEvidence: ["consumer lag 12,840", "처리량 41% 감소"],
    missingEvidence: [],
    evidenceRef: "evidence://corr-payment",
    actionRoute: null,
    commandId: "cmd-payment-scale",
    pullRequestUrl: null,
    errorReason: null,
    updatedAt: isoMinutesAgo(12),
  },
  {
    id: "issue:opsia-demo/corr-edge",
    workspaceId: "opsia-demo",
    incidentId: "inc-edge-disconnected",
    correlationId: "corr-edge",
    clusterId: "edge-busan",
    namespace: "opsia-system",
    resourceKind: "DaemonSet",
    resourceName: "opsia-agent",
    symptom: "클러스터 텔레메트리 수집 중단",
    currentSubject: "daemonset/opsia-system/opsia-agent",
    status: "open",
    rootCause: null,
    confidence: 0.54,
    supportingEvidence: ["마지막 heartbeat 18분 전"],
    missingEvidence: ["노드 네트워크 상태", "agent 로그"],
    evidenceRef: "evidence://corr-edge",
    actionRoute: null,
    commandId: null,
    pullRequestUrl: null,
    errorReason: null,
    updatedAt: isoMinutesAgo(18),
  },
];

const DEMO_RESOURCES: ResourceSummary[] = [
  resource({
    id: "deployment:prod-seoul/commerce/checkout-api",
    inventoryKey: "deployment:commerce/checkout-api",
    uid: "uid-checkout-deployment",
    resourceType: "deployment",
    apiVersion: "apps/v1",
    kind: "Deployment",
    namespace: "commerce",
    name: "checkout-api",
    status: "2/3 Ready",
    health: "critical",
    healthStatus: "critical",
    facts: {
      type: "workload",
      desiredReplicas: 3,
      readyReplicas: 2,
      availableReplicas: 2,
      updatedReplicas: 3,
      unavailableReplicas: 1,
      generation: 42,
      observedGeneration: 42,
    },
  }),
  resource({
    id: "pod:prod-seoul/commerce/checkout-api-7f96d4d7c9-kt92m",
    inventoryKey: "pod:commerce/checkout-api-7f96d4d7c9-kt92m",
    uid: "uid-checkout-pod",
    resourceType: "pod",
    kind: "Pod",
    namespace: "commerce",
    name: "checkout-api-7f96d4d7c9-kt92m",
    status: "CrashLoopBackOff",
    health: "critical",
    healthStatus: "critical",
    facts: {
      type: "pod",
      phase: "Running",
      nodeName: "ip-10-20-1-12",
      owner: { kind: "ReplicaSet", name: "checkout-api-7f96d4d7c9" },
      readiness: { ready: 1, total: 2 },
      restartCount: 6,
      cpuMillicores: 412,
      memoryMebibytes: 982,
      podIp: "10.20.4.18",
      hostIp: "10.20.1.12",
      waitingReasons: ["CrashLoopBackOff"],
      terminatedReasons: ["OOMKilled"],
      containerNames: ["checkout-api", "otel-sidecar"],
    },
  }),
  resource({
    id: "pod:prod-seoul/commerce/orders-api-6f5d4cdbb8-wt4ps",
    inventoryKey: "pod:commerce/orders-api-6f5d4cdbb8-wt4ps",
    uid: "uid-orders-pod",
    resourceType: "pod",
    kind: "Pod",
    namespace: "commerce",
    name: "orders-api-6f5d4cdbb8-wt4ps",
    status: "Running",
    health: "healthy",
    healthStatus: "healthy",
    facts: {
      type: "pod",
      phase: "Running",
      nodeName: "ip-10-20-1-13",
      owner: { kind: "ReplicaSet", name: "orders-api-6f5d4cdbb8" },
      readiness: { ready: 2, total: 2 },
      restartCount: 0,
      cpuMillicores: 188,
      memoryMebibytes: 346,
      podIp: "10.20.4.23",
      hostIp: "10.20.1.13",
      waitingReasons: [],
      terminatedReasons: [],
      containerNames: ["orders-api", "otel-sidecar"],
    },
  }),
  resource({
    id: "deployment:prod-seoul/payments/payment-worker",
    inventoryKey: "deployment:payments/payment-worker",
    uid: "uid-payment-worker",
    resourceType: "deployment",
    apiVersion: "apps/v1",
    kind: "Deployment",
    namespace: "payments",
    name: "payment-worker",
    status: "4/4 Ready",
    health: "warning",
    healthStatus: "warning",
    facts: {
      type: "workload",
      desiredReplicas: 4,
      readyReplicas: 4,
      availableReplicas: 4,
      updatedReplicas: 4,
      unavailableReplicas: 0,
      generation: 18,
      observedGeneration: 18,
    },
  }),
  resource({
    id: "service:prod-seoul/commerce/checkout",
    inventoryKey: "service:commerce/checkout",
    uid: "uid-checkout-service",
    resourceType: "service",
    kind: "Service",
    namespace: "commerce",
    name: "checkout",
    status: "ClusterIP",
    health: "healthy",
    healthStatus: "healthy",
    facts: {
      type: "service",
      serviceType: "ClusterIP",
      clusterIp: "172.20.14.92",
      externalUrl: "https://checkout.demo.opsia.dev",
      externalHosts: ["checkout.demo.opsia.dev"],
      selector: [{ key: "app", value: "checkout-api" }],
      ports: [{ name: "http", protocol: "TCP", port: 80, targetPort: "8080", nodePort: null }],
    },
  }),
  resource({
    id: "node:prod-seoul/ip-10-20-1-12",
    inventoryKey: "node:ip-10-20-1-12",
    uid: "uid-node-12",
    resourceType: "node",
    kind: "Node",
    namespace: null,
    name: "ip-10-20-1-12",
    status: "Ready",
    health: "warning",
    healthStatus: "warning",
    facts: {
      type: "node",
      ready: true,
      podCapacity: 110,
      cpuMillicores: 6840,
      memoryMebibytes: 14300,
      cpuRatio: 0.72,
      memoryRatio: 0.89,
    },
  }),
  resource({
    id: "event:prod-seoul/commerce/checkout-oom",
    inventoryKey: "event:commerce/checkout-oom",
    uid: null,
    identityStability: "fallback",
    resourceType: "event",
    kind: "Event",
    namespace: "commerce",
    name: "checkout-oom",
    status: "Warning",
    health: "warning",
    healthStatus: "warning",
    facts: {
      type: "event",
      eventType: "Warning",
      reason: "BackOff",
      message: "Back-off restarting failed container checkout-api",
      occurrenceCount: 6,
      firstSeenAt: isoMinutesAgo(27),
      lastSeenAt: isoMinutesAgo(3),
      reportingComponent: "kubelet",
      involvedResource: { kind: "Pod", name: "checkout-api-7f96d4d7c9-kt92m", uid: "uid-checkout-pod" },
    },
  }),
];

const DEMO_APPLICATIONS: ApplicationCardModel[] = [
  application({
    id: "app-checkout",
    name: "checkout-api",
    health: { status: "degraded", readyPods: 2, totalPods: 3, restarts: 6 },
    hasDrift: true,
    driftSummary: "spec.template.resources.limits.memory differs",
    openIncidents: 1,
    repositoryRef: "opsia-demo/checkout-api",
    manifestPath: "deploy/prod/checkout",
  }),
  application({
    id: "app-orders",
    name: "orders-api",
    health: { status: "healthy", readyPods: 4, totalPods: 4, restarts: 0 },
    hasDrift: false,
    driftSummary: null,
    openIncidents: 0,
    repositoryRef: "opsia-demo/orders-api",
    manifestPath: "deploy/prod/orders",
  }),
  application({
    id: "app-payment",
    name: "payment-worker",
    health: { status: "degraded", readyPods: 4, totalPods: 4, restarts: 1 },
    hasDrift: false,
    driftSummary: null,
    openIncidents: 1,
    repositoryRef: "opsia-demo/payment-worker",
    manifestPath: "deploy/prod/payments",
  }),
];

export function createDemoComposition() {
  const homePort = createDemoHomePort();
  const clustersPort = createDemoClustersPort();
  const resourcesPort = createDemoResourcesPort();
  const resourcesFilterPort = createDemoResourcesFilterPort();
  const issuesPort = createDemoIssuesPort();
  const applicationsPort = createDemoApplicationsPort();
  const gitOpsPort = createDemoGitOpsPort();
  const alertEventsPort = createDemoAlertEventsPort();
  const alertRulesPort = createDemoAlertRulesPort();

  return createProductComposition([
    { id: "home", Component: createHomeSurface(homePort) },
    { id: "clusters", Component: createClustersSurface(clustersPort) },
    {
      id: "resources",
      Component: createResourcesSurface(
        resourcesPort,
        resourcesFilterPort,
        createDemoPhysicalTopologyPort(),
        EMPTY_PHYSICAL_TOPOLOGY_REALTIME_PORT,
        homePort,
        createDemoRelationTopologyPort(),
        createDemoChangeTimelinePort(),
        createDemoMetricsPort(),
        createDemoResourceCapabilitiesPort(),
        createDemoResourceActionsPort(),
      ),
    },
    { id: "issues", Component: createIssuesSurface(issuesPort) },
    { id: "alerts", Component: createAlertsSurface(alertRulesPort) },
    { id: "applications", Component: createApplicationsSurface(applicationsPort) },
    { id: "gitops", Component: createGitOpsSurface(gitOpsPort) },
    { id: "settings", Component: createSettingsSurface() },
  ], createDemoAuthPort(), homePort, createDemoGlobalFilterPort(), createDemoAiPort(), createDemoLogPort(), alertEventsPort, "demo");
}

function createDemoAuthPort(): AuthPort {
  return {
    loadSession: async () => ({ status: "authenticated", session: DEMO_SESSION }),
    signIn: async () => DEMO_SESSION,
    signOut: async () => undefined,
  };
}

function createDemoHomePort(): HomePort {
  return {
    listClusterChoices: async () => ({ completeness: "unknown", clusters: DEMO_CLUSTERS }),
    loadClusterOverview: async (clusterId) => clusterOverview(clusterId),
    loadNodes: async (clusterId) => nodeCollection(clusterId),
    loadNodePods: async (clusterId, nodeName) => podCollection(clusterId, nodeName),
  };
}

function createDemoClustersPort(): ClustersPort & ClusterDisconnectPort {
  return {
    connect: async ({ name }) => ({
      clusterId: `demo-${name}`,
      installCommand: `helm upgrade --install opsia-agent opsia/agent --set clusterName=${name}`,
      expiresAt: isoMinutesAgo(-30),
    }),
    loadConnection: async () => ({
      status: "connected",
      stage: "ready",
      agentVersion: "1.8.0-demo",
      lastSeenAt: isoMinutesAgo(0),
    }),
    reissue: async (clusterId) => ({
      clusterId,
      installCommand: `helm upgrade --install opsia-agent opsia/agent --set clusterId=${clusterId}`,
      expiresAt: isoMinutesAgo(-30),
    }),
    disconnect: async () => ({
      status: "disconnected",
      commandId: "demo-disconnect",
      uninstallCommand: null,
      residualResources: [],
      failureReason: null,
    }),
    loadDisconnect: async () => ({ status: "completed", cleanupCompleted: true, failureReason: null }),
    confirmManualCleanup: async () => ({
      status: "disconnected",
      commandId: null,
      uninstallCommand: null,
      residualResources: [],
      failureReason: null,
    }),
  };
}

function createDemoResourcesPort(): ResourcesPort {
  return {
    loadCatalog: async (clusterId) => resourceCatalog(clusterId),
    listResources: async (clusterId, query) => {
      const items = DEMO_RESOURCES.filter((item) =>
        item.clusterId === clusterId &&
        item.resourceType === query.resourceType &&
        (!query.namespace || item.namespace === query.namespace));
      return {
        clusterId,
        resourceType: query.resourceType,
        namespace: query.namespace ?? null,
        includeDeleted: query.includeDeleted ?? false,
        completeness: "unknown",
        limit: query.limit ?? 100,
        returned: items.length,
        limitReached: false,
        excludedCount: 0,
        dataQualityWarnings: [],
        items,
      };
    },
    loadResourceDetail: async (clusterId, identity) => resourceDetail(clusterId, identity),
  };
}

function createDemoResourcesFilterPort(): ResourcesFilterPort {
  return {
    listFacetPage: async (_state, options) => {
      const snapshot = resourceSnapshot();
      if (options.axis === "clusters") {
        return {
          axis: options.axis,
          items: DEMO_CLUSTERS.map((cluster) => ({
            axis: "cluster" as const,
            value: cluster.id,
            clusterId: cluster.id,
            name: cluster.name,
            provider: cluster.provider,
            availability: "available" as const,
          })),
          selectedResolutions: [], nextCursor: null, hasMore: false, snapshot,
        };
      }
      if (options.axis === "namespaces") {
        return {
          axis: options.axis,
          items: ["commerce", "payments", "observability"].map((namespace) => ({
            axis: "namespace" as const,
            value: `prod-seoul/${namespace}`,
            clusterId: "prod-seoul",
            namespace,
            availability: "available" as const,
          })),
          selectedResolutions: [], nextCursor: null, hasMore: false, snapshot,
        };
      }
      return {
        axis: options.axis,
        items: DEMO_APPLICATIONS.map((item) => ({
          axis: "application" as const,
          value: item.id,
          applicationId: item.id,
          name: item.name,
          environment: item.environments[0] ?? null,
          availability: "available" as const,
        })),
        selectedResolutions: [], nextCursor: null, hasMore: false, snapshot,
      };
    },
    listResourcePage: async (state) => {
      const query = state.resources.query.trim().toLocaleLowerCase();
      const namespaces = new Set(state.common.namespaces.map((item) => item.namespace));
      const items = DEMO_RESOURCES.filter((item) =>
        (state.common.clusters.length === 0 || state.common.clusters.includes(item.clusterId)) &&
        (namespaces.size === 0 || (item.namespace !== null && namespaces.has(item.namespace))) &&
        (state.resources.types.length === 0 || state.resources.types.includes(item.resourceType)) &&
        (state.resources.health.length === 0 || state.resources.health.includes(item.health)) &&
        (query.length === 0 || [item.name, item.kind, item.namespace ?? ""].some((value) => value.toLocaleLowerCase().includes(query))));
      return {
        items: items.map((item) => ({
          resource: item,
          cluster: { clusterId: item.clusterId, name: item.clusterId, provider: "eks" },
          applicationIds: item.namespace === "payments" ? ["app-payment"] : ["app-checkout"],
          applicationBindingCompleteness: "exact" as const,
        })),
        nextCursor: null,
        hasMore: false,
        counts: {
          filteredCount: items.length,
          unfilteredCount: DEMO_RESOURCES.length,
          filteredCountCompleteness: "exact",
          unfilteredCountCompleteness: "exact",
        },
        snapshot: resourceSnapshot(),
        excludedCount: 0,
        dataQualityWarnings: [],
      };
    },
    listLabelFacetPage: async () => ({
      surface: "resources",
      items: [
        { key: "team", value: "commerce", selector: "team=commerce", matchCount: 4, countCompleteness: "exact" },
        { key: "tier", value: "backend", selector: "tier=backend", matchCount: 3, countCompleteness: "exact" },
        { key: "managed-by", value: "argocd", selector: "managed-by=argocd", matchCount: 6, countCompleteness: "exact" },
      ],
      selectedResolutions: [],
      nextCursor: null,
      hasMore: false,
      counts: {
        filteredCount: DEMO_RESOURCES.length,
        unfilteredCount: DEMO_RESOURCES.length,
        filteredCountCompleteness: "exact",
        unfilteredCountCompleteness: "exact",
      },
      snapshot: resourceSnapshot(),
    }),
  };
}

function createDemoPhysicalTopologyPort(): PhysicalTopologyPort {
  return {
    loadPhysicalTopology: async () => ({
      clusterId: "prod-seoul",
      clusterProjectionRevision: 1042,
      servers: [
        { id: "node:12", name: "ip-10-20-1-12", cpuPercent: 72, memoryPercent: 89, status: "Ready", matchedPodCount: 2, totalPodCount: 17, matchedPodCountCompleteness: "exact", totalPodCountCompleteness: "exact" },
        { id: "node:13", name: "ip-10-20-1-13", cpuPercent: 44, memoryPercent: 58, status: "Ready", matchedPodCount: 1, totalPodCount: 14, matchedPodCountCompleteness: "exact", totalPodCountCompleteness: "exact" },
        { id: "node:14", name: "ip-10-20-1-14", cpuPercent: 31, memoryPercent: 47, status: "Ready", matchedPodCount: 0, totalPodCount: 13, matchedPodCountCompleteness: "exact", totalPodCountCompleteness: "exact" },
      ],
      pods: [
        { id: "pod:checkout", name: "checkout-api-7f96d4d7c9-kt92m", namespace: "commerce", serverId: "node:12", usagePercent: 96, cpuMillicores: 412, cpuRequestMillicores: 500, memoryMebibytes: 982, memoryRequestMebibytes: 1024, phase: "CrashLoopBackOff", health: "critical", restartCount: 6, matchesFilter: true },
        { id: "pod:orders", name: "orders-api-6f5d4cdbb8-wt4ps", namespace: "commerce", serverId: "node:13", usagePercent: 54, cpuMillicores: 188, cpuRequestMillicores: 350, memoryMebibytes: 346, memoryRequestMebibytes: 640, phase: "Running", health: "healthy", restartCount: 0, matchesFilter: true },
        { id: "pod:payment", name: "payment-worker-77986d8d9-r8fzq", namespace: "payments", serverId: "node:12", usagePercent: 77, cpuMillicores: 310, cpuRequestMillicores: 400, memoryMebibytes: 522, memoryRequestMebibytes: 768, phase: "Running", health: "warning", restartCount: 1, matchesFilter: true },
      ],
      truncatedByServer: { "node:12": 15, "node:13": 13, "node:14": 13 },
      unassignedTruncatedCount: 0,
      counts: { filteredCount: 3, unfilteredCount: 44, filteredCountCompleteness: "exact", unfilteredCountCompleteness: "exact" },
      projectionCompleteness: "exact",
      metricsCompleteness: "exact",
      metricsObservedAt: isoMinutesAgo(1),
      partialReasonCodes: [],
      snapshot: resourceSnapshot(),
    }),
  };
}

function createDemoRelationTopologyPort(): RelationTopologyPort {
  return {
    loadRelationTopology: async () => ({
      nodes: [
        { id: "ingress:checkout", kind: "Ingress", name: "checkout", status: "Ready" },
        { id: "service:checkout", kind: "Service", name: "checkout", status: "Ready" },
        { id: "deployment:checkout", kind: "Deployment", name: "checkout-api", status: "Degraded" },
        { id: "pod:checkout", kind: "Pod", name: "checkout-api-7f96d4d7c9-kt92m", status: "CrashLoopBackOff" },
      ],
      edges: [
        { from: "ingress:checkout", to: "service:checkout", type: "routes_to" },
        { from: "service:checkout", to: "pod:checkout", type: "selects" },
        { from: "deployment:checkout", to: "pod:checkout", type: "owns" },
      ],
    }),
  };
}

function createDemoChangeTimelinePort(): ChangeTimelinePort {
  return {
    loadChangeTimeline: async (_state, options) => ({
      ...options,
      buckets: [
        { startMs: options.fromMs, endMs: options.fromMs + options.bucketMs, total: 1, warnings: 0 },
        { startMs: options.fromMs + options.bucketMs, endMs: options.fromMs + options.bucketMs * 2, total: 2, warnings: 1 },
        { startMs: options.fromMs + options.bucketMs * 2, endMs: options.toMs, total: 3, warnings: 2 },
      ],
      events: [
        { id: "deploy-241", kind: "deployment", occurredMs: now - 31 * 60_000, title: "checkout-api v2.4.1 배포", severity: "info" },
        { id: "event-oom", kind: "inventory_event", occurredMs: now - 17 * 60_000, title: "checkout-api OOMKilled", severity: "warning" },
        { id: "inc-checkout", kind: "incident", occurredMs: now - 12 * 60_000, title: "Checkout API 응답 지연", severity: "critical" },
      ],
      gaps: [],
    }),
  };
}

function createDemoMetricsPort(): ResourceMetricsHistoryPort {
  return {
    loadResourceMetricsHistory: async (_state, resourceIds) => ({
      series: resourceIds.map((resourceId) => {
        const item = DEMO_RESOURCES.find((candidate) => candidate.id === resourceId) ?? DEMO_RESOURCES[0];
        return {
          resourceId,
          clusterId: item.clusterId,
          resourceType: item.resourceType === "node" ? "node" as const : "pod" as const,
          namespace: item.namespace,
          name: item.name,
          points: Array.from({ length: 12 }, (_, index) => ({
            observedAt: new Date(now - (11 - index) * 5 * 60_000).toISOString(),
            cpuMillicores: 180 + index * 17 + (index % 3) * 24,
            memoryMebibytes: 420 + index * 36,
          })),
          hasSparklinePoints: true,
          completeness: "exact" as const,
          partialReasonCodes: [],
        };
      }),
      completeness: "exact",
      partialReasonCodes: [],
      snapshot: resourceSnapshot(),
    }),
  };
}

function createDemoResourceCapabilitiesPort(): ResourceCapabilitiesPort {
  return {
    loadResourceCapabilities: async (resourceId) => {
      const item = DEMO_RESOURCES.find((candidate) => candidate.id === resourceId) ?? DEMO_RESOURCES[0];
      return {
        subject: {
          resourceId,
          snapshotId: "demo-snapshot-1042",
          clusterId: item.clusterId,
          resourceType: item.resourceType,
          kind: item.kind,
          namespace: item.namespace,
          name: item.name,
        },
        revision: "d".repeat(64),
        capabilities: item.resourceType === "deployment"
          ? [
            { capabilityId: "deployment.restart", method: "POST", path: "/demo/restart" },
            { capabilityId: "deployment.scale", method: "POST", path: "/demo/scale" },
          ]
          : [],
      };
    },
  };
}

function createDemoResourceActionsPort(): ResourceActionsPort {
  const receipt = { accepted: true, eventId: "demo-action-event", correlationId: "demo-action-correlation" };
  return {
    restartDeployment: async () => receipt,
    scaleDeployment: async () => receipt,
  };
}

function createDemoIssuesPort(): IssuesPort {
  return {
    listIssues: async (clusterId, limit = 50) => {
      const items = DEMO_INCIDENTS.filter((item) => !clusterId || item.clusterId === clusterId).slice(0, limit);
      return { clusterId, completeness: "unknown", dataQualityWarnings: [], excludedCount: 0, items, limit, limitReached: false, returned: items.length };
    },
    loadIssue: async (incidentId, clusterId) => {
      const issue = DEMO_INCIDENTS.find((item) => item.incidentId === incidentId) ?? DEMO_INCIDENTS[0];
      return { ...issue, requestedClusterId: clusterId, requestedIncidentId: incidentId, dataQualityWarnings: [], missingEvidence: [...(issue.missingEvidence ?? [])], supportingEvidence: [...(issue.supportingEvidence ?? [])] };
    },
    loadRecentChanges: async (incidentId) => ({
      incidentId,
      limit: 5,
      items: [{
        eventId: "change-checkout-241",
        changedAt: isoMinutesAgo(31),
        namespace: "commerce",
        resourceKind: "Deployment",
        resourceName: "checkout-api",
        imageBefore: "registry.demo/checkout:v2.4.0",
        imageAfter: "registry.demo/checkout:v2.4.1",
        pullRequestUrl: "https://github.com/opsia-demo/checkout-api/pull/241",
        commitSha: "a3f9c2e",
        repositoryId: "opsia-demo/checkout-api",
        repoRef: "main",
        workflowRunId: "deploy-241",
      }],
    }),
    loadEvidence: async (correlationId) => ({
      correlationId,
      items: [{
        id: `evidence:${correlationId}`,
        correlationId,
        kind: "incident.evidence",
        clusterId: DEMO_INCIDENTS.find((item) => item.correlationId === correlationId)?.clusterId ?? "prod-seoul",
        evidenceRef: `evidence://${correlationId}`,
        summary: "Kubernetes 이벤트, 메트릭, 배포 변경을 연관 분석했습니다.",
        sources: [
          { source: "kubernetes", summary: "Pod restart 6회와 OOMKilled 이벤트", schemaVersion: 1, collector: "opsia-agent", collectorVersion: "1.8.0", sourceVersion: "v1", queryVersion: null, collectedAt: isoMinutesAgo(3), evidenceKey: "k8s-events", sourceId: "prod-seoul", agentId: "agent-prod-1", windowStart: isoMinutesAgo(30) },
          { source: "metrics", summary: "메모리 사용량이 limit의 96%까지 상승", schemaVersion: 1, collector: "prometheus", collectorVersion: null, sourceVersion: "2.54", queryVersion: "v1", collectedAt: isoMinutesAgo(2), evidenceKey: "memory-working-set", sourceId: "prometheus-main", agentId: null, windowStart: isoMinutesAgo(30) },
        ],
        createdAt: isoMinutesAgo(2),
      }],
      limit: 50, offset: 0, hasMore: false, nextCursor: null,
    }),
    loadReports: async (correlationId) => {
      const issue = DEMO_INCIDENTS.find((item) => item.correlationId === correlationId) ?? DEMO_INCIDENTS[0];
      return {
        correlationId,
        items: [{
          id: `report:${correlationId}`,
          correlationId,
          incidentId: issue.incidentId,
          clusterId: issue.clusterId,
          namespace: issue.namespace,
          resourceKind: issue.resourceKind,
          resourceName: issue.resourceName,
          rootCause: issue.rootCause ?? "수집 에이전트 연결 단절",
          action: "메모리 limit 변경을 검토하고 승인 후 롤링 재시작",
          symptom: issue.symptom,
          severity: issue.status === "open" ? "critical" : "warning",
          confidence: issue.confidence,
          reason: "배포 변경 시점과 메모리 급증 및 OOMKilled가 일치합니다.",
          evidenceRef: issue.evidenceRef,
          supportingEvidence: [...(issue.supportingEvidence ?? [])],
          missingEvidence: [...(issue.missingEvidence ?? [])],
          secondarySymptoms: ["readiness probe 실패", "p95 latency 증가"],
          selectedCandidateId: null,
          candidates: [],
          supportingEvidenceRefs: [],
          missingEvidenceChecks: [],
          narrative: {
            locale: "ko",
            executiveSummary: "checkout-api가 메모리 제한을 초과해 반복 재시작했고 응답 지연이 발생했습니다.",
            impact: "결제 진입 단계의 일부 요청이 지연되거나 재시도되었습니다.",
            reasoning: "OOMKilled 이벤트, 메모리 사용률, 배포 타임라인이 동일한 원인을 가리킵니다.",
            recommendedAction: "메모리 limit 상향을 승인하고 한 개 Pod부터 점진적으로 재시작합니다.",
            recurrencePrevention: ["OOMKilled와 메모리 사용률을 함께 경보", "배포 전 리소스 회귀 검사 추가"],
            limitations: ["사용자 오류율 데이터는 데모 데이터에 포함되지 않았습니다."],
          },
          narrativeStatus: "generated",
          createdAt: isoMinutesAgo(2),
        }],
        limit: 50, offset: 0, hasMore: false, nextCursor: null,
      };
    },
    loadAuditTimeline: async (correlationId) => ({
      correlationId,
      items: [
        { eventId: "audit-alert", subject: "alert.fired", source: "alert-engine", createdAt: isoMinutesAgo(16), causationId: null, journeyStage: "alert", payloadSummary: { severity: "critical" } },
        { eventId: "audit-evidence", subject: "evidence.collected", source: "opsia-agent", createdAt: isoMinutesAgo(13), causationId: "audit-alert", journeyStage: "evidence", payloadSummary: { sources: 2 } },
        { eventId: "audit-rca", subject: "rca.generated", source: "opsia-ai", createdAt: isoMinutesAgo(4), causationId: "audit-evidence", journeyStage: "rca", payloadSummary: { confidence: 0.91 } },
      ],
      limit: 50, hasMore: false, nextCursor: null,
    }),
    loadRecoveryPlan: async (correlationId) => ({
      id: `plan:${correlationId}`,
      correlationId,
      incidentId: DEMO_INCIDENTS.find((item) => item.correlationId === correlationId)?.incidentId ?? "inc-checkout-oom",
      evidenceRef: `evidence://${correlationId}`,
      status: "selection_requested",
      summary: "안전한 복구 조치를 선택하세요.",
      recommendedActionId: "increase-memory",
      executionRoute: "approval",
      selectionRequired: true,
      selectedActionId: null,
      selectedBy: null,
      selectedAction: null,
      candidates: [
        { id: "increase-memory", title: "메모리 limit 상향", description: "1Gi에서 1.5Gi로 변경 후 롤링 재시작", route: "deployment.patch", rank: 1, score: 0.91, riskLevel: "medium", blastRadius: "checkout-api Deployment", approvalRequired: true, prerequisites: ["현재 manifest SHA 확인"], validationChecks: ["ready replicas 3/3", "OOMKilled 재발 없음"], rollbackPlan: "이전 limit과 image로 복원", evidenceRefs: [`evidence://${correlationId}`] },
        { id: "restart-only", title: "현재 설정으로 재시작", description: "설정 변경 없이 실패 Pod만 교체", route: "deployment.restart", rank: 2, score: 0.48, riskLevel: "low", blastRadius: "Pod 1개", approvalRequired: false, prerequisites: [], validationChecks: ["새 Pod readiness 확인"], rollbackPlan: "추가 조치 없음", evidenceRefs: [] },
      ],
    }),
    selectRecoveryAction: async (selection) => ({ kind: "accepted", receipt: { accepted: true, eventId: "demo-recovery-selected", correlationId: selection.correlationId } }),
  };
}

function createDemoApplicationsPort(): ApplicationsPort {
  return {
    listApplications: async (filter) => DEMO_APPLICATIONS.filter((item) => {
      const query = filter.query.trim().toLocaleLowerCase();
      return (filter.applications.length === 0 || filter.applications.includes(item.id)) &&
        (filter.statuses.length === 0 || filter.statuses.includes(item.health.status)) &&
        (query.length === 0 || item.name.toLocaleLowerCase().includes(query));
    }),
    getApplication: async (applicationId) => applicationDetail(applicationId),
    listDeployments: async (applicationId) => [
      { id: `${applicationId}-deploy-241`, environment: "production", clusterId: "prod-seoul", gitSha: "a3f9c2e", version: "v2.4.1", deployedAt: isoMinutesAgo(31), deployedBy: "release-bot", status: "succeeded", gitOpsChangeId: "change-241" },
      { id: `${applicationId}-deploy-240`, environment: "production", clusterId: "prod-seoul", gitSha: "7b21d4c", version: "v2.4.0", deployedAt: isoMinutesAgo(1470), deployedBy: "release-bot", status: "succeeded", gitOpsChangeId: "change-240" },
    ],
    getDrift: async (applicationId) => applicationId === "app-checkout" ? {
      status: "drifted",
      summary: "Git의 메모리 limit과 클러스터 값이 다릅니다.",
      differences: [{ resource: "Deployment/checkout-api", fieldPath: "spec.template.spec.containers[0].resources.limits.memory", oldValue: "1Gi", newValue: "1536Mi", valueRedacted: false, changedBy: "demo-operator", changedAt: isoMinutesAgo(11) }],
      observedAt: isoMinutesAgo(1),
    } : { status: "in_sync", summary: "Git과 클러스터가 일치합니다.", differences: [], observedAt: isoMinutesAgo(1) },
  };
}

function createDemoGitOpsPort(): GitOpsPort {
  const plans: ReleasePlan[] = [
    releasePlan("plan-checkout", "Checkout 긴급 복구", "app-checkout", "checkout-api"),
    releasePlan("plan-orders", "Orders 정기 배포", "app-orders", "orders-api"),
  ];
  const runs: ReleaseRun[] = [{
    run_id: "run-241",
    plan_id: "plan-checkout",
    plan_name: "Checkout 긴급 복구",
    status: "waiting_approval",
    derived_status: "attention",
    current_wave: 1,
    total_waves: 2,
    started_by: "release-bot",
    settings: { runtime_mode: "review" },
    github: { repository: "opsia-demo/checkout-api", pull_request: 241 },
    rollback: { available: true },
    health: { status: "degraded" },
    attention: { reason: "production approval required" },
    steps: [{ run_step_id: "step-241-1", application_id: "app-checkout", name: "Canary 1 Pod", wave: 1, status: "waiting_approval", health: { ready: false }, rollback: {}, details: {}, workflow: {}, approval_id: "approval-241" }],
    events: [{ audit_id: "audit-run-241", event_type: "approval.requested", message: "Production deployment approval requested", actor: "release-bot", details: {}, created_at: isoMinutesAgo(8) }],
    created_at: isoMinutesAgo(9),
    updated_at: isoMinutesAgo(8),
  }];
  return {
    listApplications: async () => DEMO_APPLICATIONS.map((item) => ({ id: item.id, name: item.name, repository: item.repositoryRef ?? "opsia-demo/repository", branch: item.defaultBranch ?? "main", clusterId: "prod-seoul", manifestPath: item.manifestPath ?? "deploy/prod" })),
    listSyncTargets: async () => DEMO_APPLICATIONS.map((item, index) => ({ id: `${item.id}:prod`, applicationId: item.id, applicationName: item.name, clusterId: "prod-seoul", namespace: index === 2 ? "payments" : "commerce", environment: "production", syncStatus: item.hasDrift ? "out_of_sync" : "synced", revision: index === 0 ? "a3f9c2e" : "7b21d4c", observedAt: isoMinutesAgo(1) })),
    listClusters: async () => DEMO_CLUSTERS.map((cluster) => ({ id: cluster.id, name: cluster.name, environment: cluster.environment, connectionStatus: cluster.connectionState })),
    listPlans: async () => plans,
    listRuns: async (planId) => runs.filter((run) => !planId || run.plan_id === planId),
    connectApplication: async (input) => ({ id: `app-${input.name.toLocaleLowerCase().replace(/\s+/gu, "-")}`, name: input.name, repository: input.repository, branch: input.branch, clusterId: input.clusterId, manifestPath: input.manifestPath }),
    savePlan: async (plan) => plan,
    previewPlan: async (plan) => ({ plan_id: plan.plan_id, executable: true, summary: `${plan.steps.length}개 단계, 2개 wave`, waves: [{ wave: 1, step_ids: ["demo-step-1"], applications: [plan.steps[0]?.application_id ?? "app-checkout"] }], steps: plan.steps.map((step, index) => ({ step_id: step.step_id ?? `demo-step-${index + 1}`, application_id: step.application_id, name: step.name, position: step.position, wave: index + 1, blocked_by: [], gate: "approval", strategy: "rolling", environment: String(step.config.environment ?? "production"), action: "deploy" })), blockers: [] }),
    checkReadiness: async () => ({ ready: true, mode: "review", summary: "모든 사전 검사를 통과했습니다.", checks: [{ check_id: "demo.health", name: "Cluster health", status: "passed", message: "Target cluster is reachable", blockers: [] }], next_actions: [], blockers: [], warnings: [] }),
    startPlan: async () => runs[0],
    renderManifest: async () => ({ manifest: "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: checkout-api\n", files: [{ path: "deploy/prod/checkout/deployment.yaml", content: "apiVersion: apps/v1", action: "upsert", description: "Demo deployment manifest" }], resources: [{ api_version: "apps/v1", kind: "Deployment", namespace: "commerce", name: "checkout-api" }], resource_count: 1, diagnostics: [], warnings: [], summary: "1개 리소스가 생성됩니다." }),
    submitSafePr: async () => ({ accepted: true, event_id: "demo-pr-event", correlation_id: "demo-pr-correlation", workflow_run_id: "demo-workflow", application_id: "app-checkout", repo_ref: "opsia-demo/checkout-api", base_branch: "main", manifest_path: "deploy/prod/checkout", commit_sha: "a3f9c2e", patch_sha256: "d".repeat(64), manifest: "apiVersion: apps/v1\nkind: Deployment\n", files: [], resources: [], resource_count: 1, diagnostics: [], warnings: [], summary: "Demo PR submitted" }),
    runAction: async () => runs[0],
  };
}

function createDemoAlertEventsPort(): AlertEventsPort {
  let events: AlertEvent[] = [
    alertEvent("evt-checkout-memory", "Checkout memory pressure", "critical", "firing", "commerce", "Deployment", "checkout-api", 96, 85, "inc-checkout-oom"),
    alertEvent("evt-payment-lag", "Payment consumer lag", "high", "firing", "payments", "Deployment", "payment-worker", 12840, 5000, "inc-payment-lag"),
    alertEvent("evt-edge-stale", "Agent heartbeat stale", "warning", "acked", "opsia-system", "DaemonSet", "opsia-agent", 18, 10, "inc-edge-disconnected"),
  ];
  return {
    list: async () => events,
    acknowledge: async (eventId) => {
      events = events.map((event) => event.event_id === eventId ? { ...event, status: "acked", acknowledged_at: isoMinutesAgo(0), acknowledged_by: DEMO_SESSION.userId } : event);
      return events.find((event) => event.event_id === eventId) ?? events[0];
    },
    promote: async (eventId) => ({ incident_id: events.find((event) => event.event_id === eventId)?.incident_id ?? `demo-${eventId}` }),
  };
}

function createDemoAlertRulesPort(): AlertRulesPort {
  let rules: AlertRule[] = [
    alertRule("rule-memory", "Pod memory pressure", "mem_pct", ">", 85, "critical", ["slack:#ops-alerts", "pagerduty:primary"], isoMinutesAgo(16), 7),
    alertRule("rule-restarts", "CrashLoop restart spike", "restart_count", ">=", 3, "high", ["slack:#ops-alerts"], isoMinutesAgo(19), 3),
    alertRule("rule-not-ready", "Production Pod not ready", "pod_not_ready", ">", 0, "medium", ["email:platform@demo.local"], null, 0),
  ];
  return {
    list: async () => rules,
    create: async (input) => {
      const id = `demo-rule-${rules.length + 1}`;
      rules = [...rules, { ...input, id, lastFiredAt: null, occurrenceCount: 0, createdAt: isoMinutesAgo(0), updatedAt: isoMinutesAgo(0) }];
      return { ruleId: id };
    },
    update: async (ruleId, input) => {
      rules = rules.map((rule) => rule.id === ruleId ? { ...rule, ...input, updatedAt: isoMinutesAgo(0) } : rule);
      return rules.find((rule) => rule.id === ruleId) ?? rules[0];
    },
    remove: async (ruleId) => { rules = rules.filter((rule) => rule.id !== ruleId); },
  };
}

function createDemoGlobalFilterPort(): GlobalFilterPort {
  const suggestions: GlobalFilterSuggestion[] = [
    ...DEMO_CLUSTERS.map((cluster) => ({ type: "cluster" as const, id: cluster.id, label: cluster.name, count: cluster.podCount, count_completeness: "exact" as const })),
    { type: "namespace", id: "prod-seoul/commerce", label: "commerce", clusterId: "prod-seoul", count: 24, count_completeness: "exact" },
    { type: "namespace", id: "prod-seoul/payments", label: "payments", clusterId: "prod-seoul", count: 11, count_completeness: "exact" },
    ...DEMO_APPLICATIONS.map((item) => ({ type: "application" as const, id: item.id, label: item.name, count: 1, count_completeness: "exact" as const })),
    { type: "resource", id: "checkout-api", label: "checkout-api", kind: "Deployment", count: 3, count_completeness: "exact" },
    { type: "label", id: "team=commerce", label: "team=commerce", key: "team", value: "commerce", count: 4, count_completeness: "exact" },
  ];
  return {
    search: async (query) => {
      const normalized = query.trim().toLocaleLowerCase();
      return suggestions.filter((item) => normalized.length === 0 || item.label.toLocaleLowerCase().includes(normalized));
    },
  };
}

function createDemoAiPort(): AiAssistantPort {
  return {
    loadSuggestions: async () => [
      { id: "demo-incident", label: "현재 장애 요약", prompt: "현재 가장 영향이 큰 장애와 근거를 요약해줘" },
      { id: "demo-change", label: "최근 변경 분석", prompt: "최근 배포와 장애 발생 시점을 비교해줘" },
      { id: "demo-action", label: "안전한 조치", prompt: "checkout-api에 가장 안전한 복구 조치를 제안해줘" },
    ],
    ask: async (_context, message) => ({
      answer: `데모 분석 결과입니다. “${message}” 질문과 관련해 checkout-api의 메모리 사용률이 96%까지 상승했고 OOMKilled가 6회 발생했습니다. v2.4.1 배포 이후 시작되었으므로 메모리 limit 변경을 승인 후 점진적으로 적용하는 것이 안전합니다.`,
      evidence: [
        { type: "incident", id: "inc-checkout-oom", label: "Checkout API 응답 지연", link: "/issues?detail=inc-checkout-oom" },
        { type: "resource", id: "checkout-api", label: "Deployment/checkout-api", link: "/resources?resources.q=checkout-api" },
      ],
      action: null,
    }),
    createAlertRule: async () => ({ ruleId: "demo-ai-rule" }),
  };
}

function createDemoLogPort(): LogStreamPort {
  return {
    open: (target, handlers) => {
      let closed = false;
      queueMicrotask(() => {
        if (closed) return;
        handlers.onEvent({ type: "connected", streamId: "demo-log-stream" });
        [
          "INFO request completed method=POST path=/checkout status=200 duration_ms=184",
          "WARN memory usage above 90 percent container=checkout-api",
          "ERROR worker terminated reason=OOMKilled restart_count=6",
        ].forEach((line, index) => handlers.onEvent({ type: "log", id: `demo-log-${index}`, observedAt: isoMinutesAgo(2 - index), pod: target.name, container: target.type === "pod" ? target.container ?? "app" : "app", line, lineTruncated: false }));
      });
      return () => { closed = true; };
    },
  };
}

function clusterOverview(clusterId: string): HomeClusterOverview {
  const cluster = DEMO_CLUSTERS.find((item) => item.id === clusterId) ?? DEMO_CLUSTERS[0];
  const relatedIncidents = DEMO_INCIDENTS.filter((item) => item.clusterId === cluster.id);
  return {
    clusterId: cluster.id,
    name: cluster.name,
    health: cluster.connectionState === "stale" ? "stale" : relatedIncidents.length > 0 ? "warning" : "healthy",
    usage: {
      observedAt: cluster.lastObservedAt,
      podsRunning: Math.max((cluster.podCount ?? 1) - relatedIncidents.length, 0),
      podsTotal: cluster.podCount ?? 0,
      nodesReady: cluster.connectionState === "stale" ? Math.max((cluster.nodeCount ?? 1) - 1, 0) : cluster.nodeCount ?? 0,
      nodesTotal: cluster.nodeCount ?? 0,
      restartCount: cluster.id === "prod-seoul" ? 7 : cluster.id === "edge-busan" ? 2 : 0,
      cpuPercent: cluster.id === "prod-seoul" ? 63.4 : 41.2,
      memoryPercent: cluster.id === "prod-seoul" ? 78.6 : 55.3,
    },
    workloads: [
      { id: `${cluster.id}:checkout`, identityStability: "ephemeral", name: "checkout-api", kind: "Deployment", namespace: "commerce", health: cluster.id === "prod-seoul" ? "critical" : "healthy", ready: cluster.id === "prod-seoul" ? "2/3" : "3/3", restartCount: cluster.id === "prod-seoul" ? 6 : 0 },
      { id: `${cluster.id}:orders`, identityStability: "ephemeral", name: "orders-api", kind: "Deployment", namespace: "commerce", health: "healthy", ready: "4/4", restartCount: 0 },
      { id: `${cluster.id}:payment`, identityStability: "ephemeral", name: "payment-worker", kind: "Deployment", namespace: "payments", health: cluster.id === "prod-seoul" ? "warning" : "healthy", ready: "4/4", restartCount: 1 },
    ],
    warnings: relatedIncidents.map((incident, index) => ({ id: `warning:${incident.correlationId}`, identityStability: "ephemeral", name: incident.symptom ?? "Operational warning", namespace: incident.namespace, reason: index === 0 ? "BackOff" : "TelemetryStale", message: incident.rootCause, involvedKind: incident.resourceKind, involvedName: incident.resourceName, occurrenceCount: index === 0 ? 6 : 1, lastSeenAt: incident.updatedAt })),
    incidents: relatedIncidents.map((incident) => ({ id: incident.id, incidentId: incident.incidentId, correlationId: incident.correlationId, symptom: incident.symptom, rootCause: incident.rootCause, namespace: incident.namespace, resourceKind: incident.resourceKind, resourceName: incident.resourceName, status: incident.status, createdAt: incident.updatedAt })),
    dataQualityWarnings: [],
  };
}

function nodeCollection(clusterId: string): HomeNodeCollection {
  return {
    clusterId,
    completeness: "unknown",
    nodes: [
      { id: `${clusterId}:node-12`, identityStability: "ephemeral", name: "ip-10-20-1-12", ready: true, health: "warning", podsRunning: 17, podsCapacity: 110, cpuPercent: 72, memoryPercent: 89, restartCount: 6, conditions: ["MemoryPressure"] },
      { id: `${clusterId}:node-13`, identityStability: "ephemeral", name: "ip-10-20-1-13", ready: true, health: "healthy", podsRunning: 14, podsCapacity: 110, cpuPercent: 44, memoryPercent: 58, restartCount: 0, conditions: [] },
      { id: `${clusterId}:node-14`, identityStability: "ephemeral", name: "ip-10-20-1-14", ready: true, health: "healthy", podsRunning: 13, podsCapacity: 110, cpuPercent: 31, memoryPercent: 47, restartCount: 0, conditions: [] },
    ],
  };
}

function podCollection(clusterId: string, nodeName: string): HomePodCollection {
  return {
    clusterId,
    nodeName,
    completeness: "unknown",
    pods: [
      { id: `${clusterId}:${nodeName}:checkout`, identityStability: "ephemeral", name: "checkout-api-7f96d4d7c9-kt92m", namespace: "commerce", phase: "Running", health: "critical", readiness: { ready: 1, total: 2 }, restartCount: 6, owner: { kind: "Deployment", name: "checkout-api" }, cpuMillicores: 412, memoryMebibytes: 982, incidentCorrelationId: "corr-checkout" },
      { id: `${clusterId}:${nodeName}:orders`, identityStability: "ephemeral", name: "orders-api-6f5d4cdbb8-wt4ps", namespace: "commerce", phase: "Running", health: "healthy", readiness: { ready: 2, total: 2 }, restartCount: 0, owner: { kind: "Deployment", name: "orders-api" }, cpuMillicores: 188, memoryMebibytes: 346, incidentCorrelationId: null },
    ],
  };
}

function resource(overrides: Partial<ResourceSummary>): ResourceSummary {
  return {
    id: "resource:demo",
    identityStability: "uid",
    inventoryKey: "resource:demo",
    uid: "uid-demo",
    clusterId: "prod-seoul",
    resourceType: "pod",
    apiVersion: "v1",
    kind: "Pod",
    namespace: "default",
    name: "demo-resource",
    status: "Unknown",
    health: "unknown",
    healthStatus: "unknown",
    facts: { type: "generic" },
    observedAt: isoMinutesAgo(1),
    firstSeenAt: isoMinutesAgo(14_400),
    lastSeenAt: isoMinutesAgo(1),
    deletedAt: null,
    ...overrides,
  };
}

function resourceCatalog(clusterId: string): ResourceCatalog {
  const rows = DEMO_RESOURCES.filter((item) => item.clusterId === clusterId);
  const types = [...new Set(rows.map((item) => item.resourceType))];
  return {
    clusterId,
    completeness: "unknown",
    observedAt: isoMinutesAgo(1),
    items: types.map((resourceType) => {
      const typed = rows.filter((item) => item.resourceType === resourceType);
      return {
        resourceType,
        count: typed.length,
        healthCounts: {
          healthy: typed.filter((item) => item.health === "healthy").length,
          warning: typed.filter((item) => item.health === "warning").length,
          critical: typed.filter((item) => item.health === "critical").length,
          stale: typed.filter((item) => item.health === "stale").length,
          unknown: typed.filter((item) => item.health === "unknown").length,
        },
      };
    }),
  };
}

function resourceDetail(clusterId: string, identity: { resourceType: string; kind: string; namespace: string | null; name: string }): ResourceDetail {
  const selected = DEMO_RESOURCES.find((item) => item.clusterId === clusterId && item.resourceType === identity.resourceType && item.name === identity.name) ?? DEMO_RESOURCES[0];
  const events = DEMO_RESOURCES.filter((item) => item.resourceType === "event" && item.namespace === selected.namespace);
  return {
    clusterId,
    identity,
    resource: selected,
    relatedCompleteness: "unknown",
    related: [{ name: "Related resources", items: DEMO_RESOURCES.filter((item) => item.namespace === selected.namespace && item.id !== selected.id && item.resourceType !== "event").slice(0, 4), excludedCount: 0 }],
    relatedExcludedCount: 0,
    eventsCompleteness: "unknown",
    events,
    eventExcludedCount: 0,
    dataQualityWarnings: [],
  };
}

function resourceSnapshot(): ResourcesFilterSnapshot {
  return { snapshotRevision: 1042, authorizationRevision: "demo-auth-1", filterFingerprint: "demo-filter", observedAt: isoMinutesAgo(1), stale: false, partialReasonCodes: [] };
}

function application(overrides: Partial<ApplicationCardModel>): ApplicationCardModel {
  return {
    id: "app-demo",
    name: "demo-app",
    environments: ["production"],
    lifecycleStatus: "active",
    health: { status: "healthy", readyPods: 3, totalPods: 3, restarts: 0 },
    currentDeployment: { version: "v2.4.1", image: "registry.demo/app:v2.4.1", imageDigest: "sha256:demo", gitSha: "a3f9c2e", deployedAt: isoMinutesAgo(31), deployedBy: "release-bot" },
    hasDrift: false,
    driftSummary: null,
    resourceCounts: [{ kind: "Deployment", count: 1 }, { kind: "Service", count: 1 }, { kind: "Pod", count: 3 }],
    resourceCountsCompleteness: "exact",
    openIncidents: 0,
    repositoryRef: "opsia-demo/app",
    defaultBranch: "main",
    manifestPath: "deploy/prod",
    ...overrides,
  };
}

function applicationDetail(applicationId: string): ApplicationDetailModel {
  const item = DEMO_APPLICATIONS.find((candidate) => candidate.id === applicationId) ?? DEMO_APPLICATIONS[0];
  return {
    ...item,
    endpoints: [{ id: `${item.id}:ingress`, kind: "Ingress", name: item.name, address: `https://${item.name}.demo.opsia.dev` }],
    endpointsCompleteness: "exact",
    recentActivity: [
      { id: `${item.id}:deploy`, type: "deployment", summary: `${item.currentDeployment?.version ?? "latest"} deployed`, occurredAt: item.currentDeployment?.deployedAt ?? isoMinutesAgo(31) },
      { id: `${item.id}:change`, type: "change", summary: "Resource limits updated through GitOps", occurredAt: isoMinutesAgo(35) },
    ],
    recentIncidents: DEMO_INCIDENTS.filter((incident) => incident.resourceName === item.name).map((incident) => ({ id: incident.incidentId ?? incident.id, title: incident.symptom, status: incident.status, startedAt: incident.updatedAt })),
  };
}

function releasePlan(planId: string, name: string, applicationId: string, applicationName: string): ReleasePlan {
  return {
    plan_id: planId,
    name,
    description: `${applicationName}의 안전한 단계별 배포 계획`,
    status: "active",
    settings: { approval_policy: "manual_each_step", runtime_mode: "review" },
    updated_at: isoMinutesAgo(8),
    steps: [{ step_id: `${planId}-step-1`, application_id: applicationId, name: applicationName, position: 0, depends_on: [], config: { environment: "production", strategy: "rolling", cluster_id: "prod-seoul", namespace: applicationId === "app-payment" ? "payments" : "commerce", approval_gate: "required" } }],
  };
}

function alertEvent(eventId: string, ruleName: string, severity: AlertEvent["severity"], status: AlertEvent["status"], namespace: string, kind: string, name: string, observedValue: number, threshold: number, incidentId: string): AlertEvent {
  return {
    event_id: eventId,
    rule_id: `rule-${eventId}`,
    rule_name: ruleName,
    source: "opsia",
    severity,
    subject: { cluster: name === "opsia-agent" ? "edge-busan" : "prod-seoul", namespace, kind, name },
    fired_at: isoMinutesAgo(status === "acked" ? 18 : 16),
    resolved_at: null,
    status,
    observed_value: observedValue,
    threshold,
    evidence: [{ type: "metric_sample", metric: ruleName, observed_at: isoMinutesAgo(2), subject: { cluster: "prod-seoul", namespace, kind, name }, value: observedValue, summary: `${ruleName}: ${observedValue}`, link: null }],
    incident_id: incidentId,
    acknowledged_at: status === "acked" ? isoMinutesAgo(12) : null,
    acknowledged_by: status === "acked" ? "demo-operator" : null,
    promoted_at: isoMinutesAgo(10),
    promoted_by: "opsia-ai",
  };
}

function alertRule(id: string, name: string, metric: AlertRule["metric"], comparator: AlertRule["comparator"], threshold: number, severity: AlertRule["severity"], channels: string[], lastFiredAt: string | null, occurrenceCount: number): AlertRule {
  const input: AlertRuleInput = { name, scope: { clusters: ["prod-seoul"], namespaces: [], applications: [], labels: [] }, metric, comparator, threshold, forSeconds: 300, severity, channels, enabled: true };
  return { ...input, id, lastFiredAt, occurrenceCount, createdAt: isoMinutesAgo(10_080), updatedAt: isoMinutesAgo(60) };
}

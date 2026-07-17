import { describe, expect, it, vi } from "vitest";
import type {
  HomeClusterOverview,
  HomeNodeCollection,
  HomePodCollection,
} from "./homeContract";
import { createHomeAdapter } from "./createHomeAdapter";
import { CLUSTER_LIST, endpoints } from "./createHomeAdapter.testSupport";

describe("canonical Home adapter mapping", () => {
  it("loads only the composition-injected dashboard refresh policy", async () => {
    const policy = {
      staleAfterSeconds: 15,
      refreshAfterSeconds: 37,
      keepLastSuccess: true as const,
      pauseWhenHidden: true as const,
      eventInvalidation: true,
      retryAfterSeconds: null,
      retryLimit: null,
      postMutationRefreshAfterSeconds: null,
    };
    const getPolicy = vi.fn().mockResolvedValue(policy);

    await expect(
      createHomeAdapter(endpoints(), { getPolicy }).loadDashboardRefreshPolicy(),
    ).resolves.toBe(policy);
    expect(getPolicy).toHaveBeenCalledWith("dashboard", undefined);
  });

  it("maps the session-visible cluster list and forwards the AbortSignal", async () => {
    const controller = new AbortController();
    const dependencies = endpoints();

    await expect(createHomeAdapter(dependencies).listClusterChoices(controller.signal))
      .resolves.toEqual({
        completeness: "unknown",
        clusters: [
          {
            id: "cluster-1",
            workspaceId: "workspace-main",
            name: "Production",
            environment: "production",
            provider: "eks",
            connectionStage: null,
            registrationState: "active",
            connectionState: "online",
            lastObservedAt: "2026-07-12T10:00:00.000Z",
            nodeCount: 2,
            podCount: 18,
            namespaceCount: 6,
            kubernetesVersion: "v1.33.1",
            crdDiscoveryStatus: "exact",
            incidentCount: 1,
            serverCount: 2,
            appCount: null,
            openIncidentCount: 1,
          },
          {
            id: "kubernetes-ops",
            workspaceId: "workspace-main",
            name: "Management",
            environment: "management",
            provider: "unknown",
            connectionStage: null,
            registrationState: "pending",
            connectionState: "pending",
            lastObservedAt: null,
            nodeCount: 0,
            podCount: 0,
            namespaceCount: null,
            kubernetesVersion: null,
            crdDiscoveryStatus: null,
            incidentCount: 0,
            serverCount: null,
            appCount: null,
            openIncidentCount: null,
          },
        ],
      });
    expect(dependencies.listClusters).toHaveBeenCalledWith({}, controller.signal);
  });

  it("preserves an explicit connection stage without inferring progress", async () => {
    const cluster = {
      ...CLUSTER_LIST.clusters[0],
      connection_stage: "ready" as const,
    };
    const dependencies = endpoints({
      listClusters: vi.fn(async () => ({ clusters: [cluster] })),
    });

    await expect(createHomeAdapter(dependencies).listClusterChoices()).resolves.toMatchObject({
      clusters: [{ id: "cluster-1", connectionStage: "ready" }],
    });
  });

  it("maps durable agent installation outcomes without inventing a ready cluster", async () => {
    const applied = {
      ...CLUSTER_LIST.clusters[0],
      cluster_id: "cluster-applied",
      status: "install_applied",
      connection_status: "pending_install",
      connection_stage: "awaiting_install" as const,
    };
    const failed = {
      ...CLUSTER_LIST.clusters[0],
      cluster_id: "cluster-failed",
      status: "install_failed",
      connection_status: "install_failed",
      connection_stage: "error" as const,
    };
    const dependencies = endpoints({
      listClusters: vi.fn(async () => ({ clusters: [applied, failed] })),
    });

    await expect(createHomeAdapter(dependencies).listClusterChoices()).resolves.toMatchObject({
      clusters: [
        {
          id: "cluster-applied",
          registrationState: "pending",
          connectionState: "pending",
          connectionStage: "awaiting_install",
        },
        {
          id: "cluster-failed",
          registrationState: "expired",
          connectionState: "offline",
          connectionStage: "error",
        },
      ],
    });
  });

  it("maps cluster health, usage, workloads, warnings, and incidents", async () => {
    const result = await createHomeAdapter(endpoints()).loadClusterOverview("cluster-1");

    expect(result).toEqual({
      clusterId: "cluster-1",
      name: "Production",
      health: "critical",
      usage: {
        observedAt: "2026-07-12T10:00:00.000Z",
        podsRunning: 17,
        podsTotal: 18,
        nodesReady: 2,
        nodesTotal: 2,
        restartCount: 3,
        cpuPercent: 42.5,
        memoryPercent: 61.25,
      },
      workloads: [
        {
          id: "workload:cluster-1/shop/Deployment/catalog-api",
          identityStability: "ephemeral",
          name: "catalog-api",
          kind: "Deployment",
          namespace: "shop",
          health: "healthy",
          ready: "3/3",
          restartCount: 0,
        },
        {
          id: "workload:cluster-1/shop/StatefulSet/checkout-api",
          identityStability: "ephemeral",
          name: "checkout-api",
          kind: "StatefulSet",
          namespace: "shop",
          health: "warning",
          ready: "1/2",
          restartCount: 3,
        },
      ],
      warnings: [{
        id: "warning:cluster-1/shop/checkout-warning",
        identityStability: "ephemeral",
        name: "checkout-warning",
        namespace: "shop",
        reason: "BackOff",
        message: "Container is restarting",
        involvedKind: "Pod",
        involvedName: "checkout-api-0",
        occurrenceCount: 2,
        lastSeenAt: "2026-07-12T09:59:00.000Z",
      }],
      incidents: [{
        id: "incident-1",
        incidentId: "incident-1",
        correlationId: "correlation-1",
        symptom: "Restart loop",
        rootCause: null,
        namespace: "shop",
        resourceKind: "Pod",
        resourceName: "checkout-api-0",
        status: "open",
        createdAt: "2026-07-12T09:58:00.000Z",
      }],
      dataQualityWarnings: [],
    } satisfies HomeClusterOverview);
  });

  it("maps bounded custom resource counts and Helm coverage without browser inference", async () => {
    await expect(createHomeAdapter(endpoints()).loadInsights("cluster-1")).resolves.toEqual({
      clusterId: "cluster-1",
      topology: {
        coverage: {
          availability: "available",
          observedAt: "2026-07-12T10:00:00.000Z",
          reasonCodes: [],
        },
        nodeCount: 12,
        edgeCount: 9,
        omittedNodeCount: 0,
        omittedEdgeCount: 0,
        relationCompleteness: "exact",
      },
      explore: {
        traffic: {
          coverage: {
            availability: "unavailable",
            observedAt: null,
            reasonCodes: ["traffic_observation_not_integrated"],
          },
        },
        cost: {
          coverage: {
            availability: "unavailable",
            observedAt: null,
            reasonCodes: ["cost_observation_not_integrated"],
          },
        },
      },
      posture: {
        networkPolicy: {
          coverage: {
            availability: "unavailable",
            observedAt: null,
            reasonCodes: ["network_policy_coverage_not_reported"],
          },
          totalPolicies: null,
          coveredWorkloads: null,
          totalWorkloads: null,
        },
        gitops: {
          coverage: {
            availability: "available",
            observedAt: "2026-07-12T10:00:00.000Z",
            reasonCodes: [],
          },
          controllerCount: 2,
          providerCounts: { argo: 1, flux: 1 },
          healthCounts: { healthy: 1, degraded: 1 },
        },
        audit: {
          coverage: {
            availability: "available",
            observedAt: "2026-07-12T10:00:00.000Z",
            reasonCodes: [],
          },
          totalCheckCount: 6,
          totalFindingCount: 3,
          severityCounts: { warning: 2, danger: 1 },
        },
      },
      customResources: {
        coverage: {
          availability: "available",
          observedAt: "2026-07-12T10:00:00.000Z",
          reasonCodes: [],
        },
        items: [{
          apiGroup: "argoproj.io",
          version: "v1alpha1",
          kind: "Application",
          count: 7,
        }],
        totalKinds: 1,
        totalResources: 7,
        hasMore: false,
      },
      helm: {
        coverage: {
          availability: "partial",
          observedAt: "2026-07-12T10:00:00.000Z",
          reasonCodes: ["source_resources_incomplete"],
        },
        releaseCount: 2,
        statusCounts: { deployed: 1, failed: 1 },
      },
      certificateExpiry: {
        coverage: {
          availability: "available",
          observedAt: "2026-07-12T10:00:00.000Z",
          reasonCodes: [],
        },
        items: [{
          secret: {
            apiGroup: "",
            version: "v1",
            kind: "Secret",
            namespace: "shop",
            name: "api-tls",
            uid: "secret-api-tls",
          },
          sourceCertificate: {
            apiGroup: "cert-manager.io",
            version: "v1",
            kind: "Certificate",
            namespace: "shop",
            name: "api-certificate",
            uid: "certificate-api",
          },
          notAfter: "2026-07-20T10:00:00.000Z",
          status: "expiring",
          secondsRemaining: 345_600,
          observedAt: "2026-07-12T10:00:00.000Z",
        }],
        tlsSecretCount: 1,
        observedExpiryCount: 1,
        expiringCount: 1,
        expiredCount: 0,
        earliestExpiry: "2026-07-20T10:00:00.000Z",
        warningBeforeSeconds: 2_592_000,
        hasMore: false,
      },
      refreshAfterSeconds: 30,
    });
  });

  it("maps nodes without claiming endpoint completeness or stable identity", async () => {
    await expect(createHomeAdapter(endpoints()).loadNodes("cluster-1")).resolves.toEqual({
      clusterId: "cluster-1",
      completeness: "unknown",
      nodes: [
        {
          id: "node:cluster-1/worker-a",
          identityStability: "ephemeral",
          name: "worker-a",
          kubernetesVersion: "v1.30.7",
          ready: true,
          health: "healthy",
          podsRunning: 9,
          podsCapacity: 110,
          cpuPercent: 37.5,
          memoryPercent: 54,
          restartCount: 0,
          conditions: [],
        },
        {
          id: "node:cluster-1/worker-b",
          identityStability: "ephemeral",
          name: "worker-b",
          kubernetesVersion: "v1.30.7",
          ready: false,
          health: "warning",
          podsRunning: 8,
          podsCapacity: 110,
          cpuPercent: null,
          memoryPercent: null,
          restartCount: 3,
          conditions: ["MemoryPressure"],
        },
      ],
    } satisfies HomeNodeCollection);
  });

  it("maps Pod readiness, owner, usage, and incident correlation", async () => {
    const dependencies = endpoints();
    const controller = new AbortController();

    await expect(createHomeAdapter(dependencies).loadNodePods(
      "cluster-1",
      "worker-b",
      controller.signal,
    )).resolves.toEqual({
      clusterId: "cluster-1",
      nodeName: "worker-b",
      completeness: "unknown",
      pods: [{
        id: "pod:cluster-1/worker-b/shop/checkout-api-0",
        identityStability: "ephemeral",
        name: "checkout-api-0",
        namespace: "shop",
        phase: "Running",
        health: "warning",
        readiness: { ready: 1, total: 2 },
        restartCount: 3,
        owner: { kind: "StatefulSet", name: "checkout-api" },
        cpuMillicores: 245.5,
        memoryMebibytes: 382,
        incidentCorrelationId: "correlation-1",
      }],
    } satisfies HomePodCollection);
    expect(dependencies.getNodePodsSummary).toHaveBeenCalledWith(
      "cluster-1",
      "worker-b",
      controller.signal,
    );
  });
});

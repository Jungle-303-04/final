import { describe, expect, it, vi } from "vitest";
import { createApplicationsAdapter, sortApplicationsByAttention } from "./createApplicationsAdapter";
import {
  ApplicationsFailure,
  type ApplicationCardModel,
  type ApplicationsApiDependencies,
} from "./applicationsContract";

const FILTER = {
  clusters: [], namespaces: [], applications: [], labels: [], environments: [], statuses: [],
  pendingPromotion: false, query: "",
};

function endpointItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "app-healthy",
    name: "healthy",
    environments: ["prod"],
    lifecycle_status: "active",
    health: { status: "healthy", ready_pods: 2, total_pods: 2, restarts: 0 },
    runtime_readiness: {
      completeness: "exact" as const,
      status: "healthy" as const,
      ready_pods: 2,
      total_pods: 2,
      restarts: 0,
    },
    current_deployment: null,
    delivery: {
      availability: "unavailable" as const,
      status: null,
      workflow_run_id: null,
      observed_at: null,
    },
    batch_runtime: {
      availability: "unavailable" as const,
      completeness: "unavailable" as const,
      status: null,
      active_runs: null,
      failed_runs: null,
      succeeded_runs: null,
    },
    has_drift: false,
    drift_summary: null,
    resource_counts: [{ kind: "Deployment", count: 1 }],
    resource_counts_completeness: "exact" as const,
    open_incidents: 0,
    repository_ref: null,
    default_branch: null,
    manifest_path: null,
    ...overrides,
  };
}

function detailEndpointItem(overrides: Record<string, unknown> = {}) {
  return {
    ...endpointItem(),
    scope: {
      availability: "available" as const,
      completeness: "exact" as const,
      selected_instance_id: "binding-prod",
      instances: [{
        id: "binding-prod",
        environment: "prod",
        status: "active",
        scope: {
          workspace_id: "workspace-a",
          cluster_id: "cluster-1",
          namespaces: ["prod"],
          freshness: "live" as const,
        },
      }],
      partial_reason_codes: [],
      selected_scope: "application" as const,
      workload_scope: {
        availability: "available" as const,
        completeness: "exact" as const,
        application_scope_available: true,
        selected_workload_key: null,
        workloads: [],
        partial_reason_codes: [],
      },
    },
    endpoints: [],
    endpoints_completeness: "exact" as const,
    recent_activity: [],
    recent_incidents: [],
    topology: {
      availability: "available" as const,
      completeness: "exact" as const,
      observed_at: "2026-07-14T09:00:00+00:00",
      nodes: [
        {
          id: "deployment-1",
          cluster_id: "cluster-1",
          resource_type: "workload",
          kind: "Deployment",
          namespace: "prod",
          name: "checkout",
          status: "Ready",
          health: "healthy",
          observed_at: "2026-07-14T09:00:00+00:00",
        },
      ],
      edges: [],
      partial_reason_codes: [],
    },
    history: {
      availability: "available" as const,
      completeness: "partial" as const,
      entries: [],
      partial_reason_codes: ["bounded_workflow_history"],
    },
    source: {
      availability: "available" as const,
      completeness: "exact" as const,
      conflict: "aligned" as const,
      repository_ref: "opsia/checkout",
      default_branch: "main",
      manifest_path: "deploy/prod",
      partial_reason_codes: [],
    },
    workload: null,
    ...overrides,
  };
}

function api(overrides: Partial<ApplicationsApiDependencies> = {}): ApplicationsApiDependencies {
  return {
    listApplicationCatalog: vi.fn().mockResolvedValue({ applications: [endpointItem()] }),
    getApplicationOverview: vi.fn().mockResolvedValue({
      application: detailEndpointItem(),
    }),
    listApplicationDeploymentHistory: vi.fn().mockResolvedValue({ deployments: [] }),
    getApplicationDrift: vi.fn().mockResolvedValue({
      status: "in_sync", summary: null, differences: [], observed_at: null,
    }),
    ...overrides,
  } as ApplicationsApiDependencies;
}

describe("Applications product adapter", () => {
  it("maps only the strict product projection and sorts incidents, drift, degraded, healthy", async () => {
    const dependencies = api({
      listApplicationCatalog: vi.fn().mockResolvedValue({ applications: [
        endpointItem(),
        endpointItem({
          id: "app-degraded",
          name: "degraded",
          health: { status: "degraded", ready_pods: 1, total_pods: 2, restarts: null },
          runtime_readiness: {
            completeness: "exact",
            status: "degraded",
            ready_pods: 1,
            total_pods: 2,
            restarts: null,
          },
        }),
        endpointItem({ id: "app-drift", name: "drift", has_drift: true, drift_summary: "replicas differ" }),
        endpointItem({ id: "app-incident", name: "incident", open_incidents: 2 }),
      ] }),
    });
    const adapter = createApplicationsAdapter(dependencies);

    const result = await adapter.listApplications(FILTER);

    expect(result.map((application) => application.id)).toEqual([
      "app-incident", "app-drift", "app-degraded", "app-healthy",
    ]);
    expect(result[0]).not.toHaveProperty("provider_secret");
    expect(result[0]?.delivery).toEqual({
      availability: "unavailable",
      status: null,
      workflowRunId: null,
      observedAt: null,
    });
    expect(dependencies.listApplicationCatalog).toHaveBeenCalledWith(FILTER, undefined);
  });

  it("maps detail, deployment links, and semantic drift without inventing values", async () => {
    const dependencies = api({
      getApplicationOverview: vi.fn().mockResolvedValue({
        application: detailEndpointItem({
          endpoints: null,
          endpoints_completeness: "unavailable",
          recent_activity: [{ id: "activity-1", type: "deployment", summary: "deployed", occurred_at: null }],
          recent_incidents: [],
        }),
      }),
      listApplicationDeploymentHistory: vi.fn().mockResolvedValue({ deployments: [{
        id: "deployment-1", environment: "prod", cluster_id: null, git_sha: "abc",
        version: null, deployed_at: null, deployed_by: null, status: "succeeded",
        gitops_change_id: "change-42",
      }] }),
      getApplicationDrift: vi.fn().mockResolvedValue({
        status: "drifted",
        summary: "one field",
        differences: [{ resource: "Deployment/checkout", field_path: "spec.replicas", old_value: 3, new_value: 1, value_redacted: false, changed_by: null, changed_at: null }],
        observed_at: null,
      }),
    });
    const adapter = createApplicationsAdapter(dependencies);

    await expect(adapter.getApplication("app-healthy")).resolves.toMatchObject({
      endpoints: null,
      scope: {
        selectedInstanceId: "binding-prod",
        instances: [{ scope: { workspaceId: "workspace-a", freshness: "live" } }],
      },
      recentActivity: [{ id: "activity-1", occurredAt: null }],
      topology: { nodes: [{ id: "deployment-1" }] },
      history: { partialReasonCodes: ["bounded_workflow_history"] },
      source: { conflict: "aligned" },
    });
    expect(dependencies.getApplicationOverview).toHaveBeenCalledWith(
      "app-healthy",
      undefined,
      undefined,
    );
    await expect(adapter.listDeployments("app-healthy")).resolves.toMatchObject([
      { id: "deployment-1", gitOpsChangeId: "change-42", deployedAt: null },
    ]);
    await expect(adapter.getDrift("app-healthy")).resolves.toMatchObject({
      status: "drifted",
      differences: [{ fieldPath: "spec.replicas", oldValue: 3, newValue: 1 }],
    });
  });

  it("maps a selected workload without reusing application delivery or incident evidence", async () => {
    const workload = {
      key: "workload-a",
      resource: {
        api_group: "apps",
        version: "v1",
        kind: "Deployment",
        namespace: "prod",
        name: "checkout",
        uid: "deployment-uid",
      },
      scope: {
        workspace_id: "workspace-a",
        cluster_id: "cluster-1",
        namespaces: ["prod"],
        freshness: "live" as const,
      },
      observed_at: "2026-07-14T09:00:00+00:00",
    };
    const dependencies = api({
      getApplicationOverview: vi.fn().mockResolvedValue({
        application: detailEndpointItem({
          scope: {
            ...detailEndpointItem().scope,
            selected_scope: "workload",
            workload_scope: {
              availability: "available",
              completeness: "exact",
              application_scope_available: false,
              selected_workload_key: "workload-a",
              workloads: [workload],
              partial_reason_codes: [],
            },
          },
          workload: {
            workload,
            runtime_readiness: {
              completeness: "exact",
              status: "healthy",
              ready_pods: 1,
              total_pods: 1,
              restarts: 0,
            },
            resource_counts: [{ kind: "Deployment", count: 1 }, { kind: "Pod", count: 1 }],
            resource_counts_completeness: "exact",
            topology: detailEndpointItem().topology,
            history: { availability: "unavailable", reason_codes: ["workload_history_link_not_persisted"] },
            cost: { availability: "unavailable", reason_codes: ["cost_observation_not_integrated"] },
            actions: { availability: "unavailable", reason_codes: ["workload_action_capabilities_not_connected"] },
          },
        }),
      }),
    });
    const adapter = createApplicationsAdapter(dependencies);

    await expect(adapter.getApplication("app-healthy", undefined, "binding-prod", "workload-a"))
      .resolves.toMatchObject({
        scope: { selectedScope: "workload", workloadScope: { selectedWorkloadKey: "workload-a" } },
        workload: {
          workload: { resource: { apiGroup: "apps", name: "checkout" } },
          runtimeReadiness: { readyPods: 1 },
          history: { reasonCodes: ["workload_history_link_not_persisted"] },
        },
      });
    expect(dependencies.getApplicationOverview).toHaveBeenCalledWith(
      "app-healthy",
      undefined,
      "binding-prod",
      "workload-a",
    );
  });

  it("preserves aborts and normalizes unavailable/invalid boundaries", async () => {
    const abort = new DOMException("aborted", "AbortError");
    await expect(createApplicationsAdapter(api({
      listApplicationCatalog: vi.fn().mockRejectedValue(abort),
    })).listApplications(FILTER)).rejects.toBe(abort);

    await expect(createApplicationsAdapter(api({
      getApplicationOverview: vi.fn().mockRejectedValue({ status: 404 }),
    })).getApplication("app-missing")).rejects.toEqual(new ApplicationsFailure("unavailable"));

    await expect(createApplicationsAdapter(api()).getApplication(" "))
      .rejects.toEqual(new ApplicationsFailure("invalid-response"));
  });

  it("keeps equal-priority ordering deterministic", () => {
    const cards = ["zeta", "alpha"].map((name) => ({
      id: `app-${name}`,
      name,
      environments: [],
      lifecycleStatus: "unknown",
      health: { status: "unknown", readyPods: null, totalPods: null, restarts: null },
      runtimeReadiness: {
        completeness: "unavailable",
        status: "unknown",
        readyPods: null,
        totalPods: null,
        restarts: null,
      },
      currentDeployment: null,
      delivery: {
        availability: "unavailable",
        status: null,
        workflowRunId: null,
        observedAt: null,
      },
      batchRuntime: {
        availability: "unavailable",
        completeness: "unavailable",
        status: null,
        activeRuns: null,
        failedRuns: null,
        succeededRuns: null,
      },
      hasDrift: null,
      driftSummary: null,
      resourceCounts: null,
      resourceCountsCompleteness: "unavailable",
      openIncidents: null,
      repositoryRef: null,
      defaultBranch: null,
      manifestPath: null,
    } satisfies ApplicationCardModel));
    expect(sortApplicationsByAttention(cards).map((card) => card.name)).toEqual(["alpha", "zeta"]);
  });
});

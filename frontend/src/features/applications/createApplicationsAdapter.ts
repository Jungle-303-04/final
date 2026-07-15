import {
  ApplicationsFailure,
  type ApplicationCatalogEndpointItem,
  type ApplicationCardModel,
  type ApplicationDetailEndpointItem,
  type ApplicationDetailModel,
  type ApplicationsApiDependencies,
  type ApplicationsFailureCode,
  type ApplicationsPort,
} from "./applicationsContract";

export function createApplicationsAdapter(
  api: ApplicationsApiDependencies,
): ApplicationsPort {
  return {
    listApplications: (filter, signal) => withFailure(async () => {
      const response = await api.listApplicationCatalog(filter, signal);
      return sortApplicationsByAttention(response.applications.map(toCard));
    }),
    getApplication: (applicationId, signal, instanceId, workloadKey) => withFailure(async () => {
      assertApplicationId(applicationId);
      assertInstanceId(instanceId);
      assertWorkloadKey(workloadKey);
      const response = workloadKey === null || workloadKey === undefined
        ? await api.getApplicationOverview(applicationId, signal, instanceId)
        : await api.getApplicationOverview(applicationId, signal, instanceId, workloadKey);
      return toDetail(response.application);
    }),
    listDeployments: (applicationId, signal, instanceId) => withFailure(async () => {
      assertApplicationId(applicationId);
      assertInstanceId(instanceId);
      const response = await api.listApplicationDeploymentHistory(applicationId, signal, instanceId);
      return response.deployments.map((deployment) => ({
        id: deployment.id,
        environment: deployment.environment,
        clusterId: deployment.cluster_id,
        gitSha: deployment.git_sha,
        version: deployment.version,
        deployedAt: deployment.deployed_at,
        deployedBy: deployment.deployed_by,
        status: deployment.status,
        gitOpsChangeId: deployment.gitops_change_id,
      }));
    }),
    getDrift: (applicationId, signal, instanceId) => withFailure(async () => {
      assertApplicationId(applicationId);
      assertInstanceId(instanceId);
      const response = await api.getApplicationDrift(applicationId, signal, instanceId);
      return {
        status: response.status,
        summary: response.summary,
        differences: response.differences.map((difference) => ({
          resource: difference.resource,
          fieldPath: difference.field_path,
          oldValue: difference.old_value,
          newValue: difference.new_value,
          valueRedacted: difference.value_redacted,
          changedBy: difference.changed_by,
          changedAt: difference.changed_at,
        })),
        observedAt: response.observed_at,
      };
    }),
  };
}

export function sortApplicationsByAttention(
  applications: readonly ApplicationCardModel[],
): ApplicationCardModel[] {
  return [...applications].sort((left, right) => (
    attentionRank(left) - attentionRank(right) ||
    left.name.localeCompare(right.name) ||
    left.id.localeCompare(right.id)
  ));
}

function toCard(item: ApplicationCatalogEndpointItem): ApplicationCardModel {
  return {
    id: item.id,
    name: item.name,
    environments: [...item.environments],
    lifecycleStatus: item.lifecycle_status,
    health: {
      status: item.health.status,
      readyPods: item.health.ready_pods,
      totalPods: item.health.total_pods,
      restarts: item.health.restarts,
    },
    runtimeReadiness: {
      completeness: item.runtime_readiness.completeness,
      status: item.runtime_readiness.status,
      readyPods: item.runtime_readiness.ready_pods,
      totalPods: item.runtime_readiness.total_pods,
      restarts: item.runtime_readiness.restarts,
    },
    currentDeployment: item.current_deployment === null ? null : {
      version: item.current_deployment.version,
      image: item.current_deployment.image,
      imageDigest: item.current_deployment.image_digest,
      gitSha: item.current_deployment.git_sha,
      deployedAt: item.current_deployment.deployed_at,
      deployedBy: item.current_deployment.deployed_by,
    },
    delivery: {
      availability: item.delivery.availability,
      status: item.delivery.status,
      workflowRunId: item.delivery.workflow_run_id,
      observedAt: item.delivery.observed_at,
    },
    batchRuntime: {
      availability: item.batch_runtime.availability,
      completeness: item.batch_runtime.completeness,
      status: item.batch_runtime.status,
      activeRuns: item.batch_runtime.active_runs,
      failedRuns: item.batch_runtime.failed_runs,
      succeededRuns: item.batch_runtime.succeeded_runs,
    },
    hasDrift: item.has_drift,
    driftSummary: item.drift_summary,
    resourceCounts: item.resource_counts?.map((count) => ({ ...count })) ?? null,
    resourceCountsCompleteness: item.resource_counts_completeness,
    openIncidents: item.open_incidents,
    repositoryRef: item.repository_ref,
    defaultBranch: item.default_branch,
    manifestPath: item.manifest_path,
  };
}

function toDetail(item: ApplicationDetailEndpointItem): ApplicationDetailModel {
  return {
    ...toCard(item),
    scope: {
      availability: item.scope.availability,
      completeness: item.scope.completeness,
      selectedInstanceId: item.scope.selected_instance_id,
      instances: item.scope.instances.map((instance) => ({
        id: instance.id,
        environment: instance.environment,
        status: instance.status,
        scope: {
          workspaceId: instance.scope.workspace_id,
          clusterId: instance.scope.cluster_id,
          namespaces: [...instance.scope.namespaces],
          freshness: instance.scope.freshness,
        },
      })),
      partialReasonCodes: [...item.scope.partial_reason_codes],
      selectedScope: item.scope.selected_scope,
      workloadScope: {
        availability: item.scope.workload_scope.availability,
        completeness: item.scope.workload_scope.completeness,
        applicationScopeAvailable: item.scope.workload_scope.application_scope_available,
        selectedWorkloadKey: item.scope.workload_scope.selected_workload_key,
        workloads: item.scope.workload_scope.workloads.map(toWorkloadScopeItem),
        partialReasonCodes: [...item.scope.workload_scope.partial_reason_codes],
      },
    },
    endpoints: item.endpoints?.map((endpoint) => ({
      id: endpoint.id,
      kind: endpoint.kind,
      name: endpoint.name,
      address: endpoint.url,
    })) ?? null,
    endpointsCompleteness: item.endpoints_completeness,
    recentActivity: item.recent_activity.map((activity) => ({
      id: activity.id,
      type: activity.type,
      summary: activity.summary,
      occurredAt: activity.occurred_at,
    })),
    recentIncidents: item.recent_incidents.map((incident) => ({
      id: incident.id,
      title: incident.title,
      status: incident.status,
      startedAt: incident.started_at,
    })),
    topology: {
      availability: item.topology.availability,
      completeness: item.topology.completeness,
      observedAt: item.topology.observed_at,
      nodes: item.topology.nodes?.map((node) => ({
        id: node.id,
        clusterId: node.cluster_id,
        resourceType: node.resource_type,
        kind: node.kind,
        namespace: node.namespace,
        name: node.name,
        status: node.status,
        health: node.health,
        observedAt: node.observed_at,
      })) ?? null,
      edges: item.topology.edges?.map((edge) => ({
        id: edge.id,
        fromId: edge.from_id,
        toId: edge.to_id,
        type: edge.type,
        evidenceType: edge.evidence_type,
        authority: edge.authority,
        observedAt: edge.observed_at,
      })) ?? null,
      partialReasonCodes: [...item.topology.partial_reason_codes],
    },
    history: {
      availability: item.history.availability,
      completeness: item.history.completeness,
      entries: item.history.entries?.map((entry) => ({
        id: entry.id,
        type: entry.type,
        status: entry.status,
        summary: entry.summary,
        occurredAt: entry.occurred_at,
        workflowRunId: entry.workflow_run_id,
        gitOpsChangeId: entry.gitops_change_id,
      })) ?? null,
      partialReasonCodes: [...item.history.partial_reason_codes],
    },
    source: {
      availability: item.source.availability,
      completeness: item.source.completeness,
      conflict: item.source.conflict,
      repositoryRef: item.source.repository_ref,
      defaultBranch: item.source.default_branch,
      manifestPath: item.source.manifest_path,
      partialReasonCodes: [...item.source.partial_reason_codes],
    },
    workload: item.workload === null ? null : {
      workload: toWorkloadScopeItem(item.workload.workload),
      runtimeReadiness: {
        completeness: item.workload.runtime_readiness.completeness,
        status: item.workload.runtime_readiness.status,
        readyPods: item.workload.runtime_readiness.ready_pods,
        totalPods: item.workload.runtime_readiness.total_pods,
        restarts: item.workload.runtime_readiness.restarts,
      },
      resourceCounts: item.workload.resource_counts?.map((count) => ({ ...count })) ?? null,
      resourceCountsCompleteness: item.workload.resource_counts_completeness,
      topology: {
        availability: item.workload.topology.availability,
        completeness: item.workload.topology.completeness,
        observedAt: item.workload.topology.observed_at,
        nodes: item.workload.topology.nodes?.map((node) => ({
          id: node.id,
          clusterId: node.cluster_id,
          resourceType: node.resource_type,
          kind: node.kind,
          namespace: node.namespace,
          name: node.name,
          status: node.status,
          health: node.health,
          observedAt: node.observed_at,
        })) ?? null,
        edges: item.workload.topology.edges?.map((edge) => ({
          id: edge.id,
          fromId: edge.from_id,
          toId: edge.to_id,
          type: edge.type,
          evidenceType: edge.evidence_type,
          authority: edge.authority,
          observedAt: edge.observed_at,
        })) ?? null,
        partialReasonCodes: [...item.workload.topology.partial_reason_codes],
      },
      history: {
        availability: item.workload.history.availability,
        reasonCodes: [...item.workload.history.reason_codes],
      },
      cost: {
        availability: item.workload.cost.availability,
        reasonCodes: [...item.workload.cost.reason_codes],
      },
      actions: {
        availability: item.workload.actions.availability,
        reasonCodes: [...item.workload.actions.reason_codes],
      },
    },
  };
}

function toWorkloadScopeItem(
  item: NonNullable<ApplicationDetailEndpointItem["workload"]>["workload"],
): ApplicationDetailModel["scope"]["workloadScope"]["workloads"][number] {
  return {
    key: item.key,
    resource: {
      apiGroup: item.resource.api_group,
      version: item.resource.version,
      kind: item.resource.kind,
      namespace: item.resource.namespace,
      name: item.resource.name,
      uid: item.resource.uid,
    },
    scope: {
      workspaceId: item.scope.workspace_id,
      clusterId: item.scope.cluster_id,
      namespaces: [...item.scope.namespaces],
      freshness: item.scope.freshness,
    },
    observedAt: item.observed_at,
  };
}

function assertInstanceId(instanceId: string | null | undefined): void {
  if (instanceId !== null && instanceId !== undefined && instanceId.trim() === "") {
    throw new ApplicationsFailure("invalid-response");
  }
}

function assertWorkloadKey(workloadKey: string | null | undefined): void {
  if (workloadKey === null || workloadKey === undefined) return;
  if (workloadKey.trim() === "" || workloadKey.length > 128) {
    throw new ApplicationsFailure("invalid-response");
  }
}

function attentionRank(application: ApplicationCardModel): number {
  if (application.openIncidents !== null && application.openIncidents > 0) return 0;
  if (application.hasDrift === true) return 1;
  const status = application.health.status?.toLowerCase() ?? "";
  if (["degraded", "failed", "error", "unhealthy", "critical"].includes(status)) return 2;
  return 3;
}

async function withFailure<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isAbortError(error) || error instanceof ApplicationsFailure) throw error;
    throw normalizeFailure(error);
  }
}

function normalizeFailure(error: unknown): ApplicationsFailure {
  const kind = readString(error, "kind");
  const status = readNumber(error, "status");
  const codeByKind: Record<string, ApplicationsFailureCode> = {
    forbidden: "forbidden",
    network: "offline",
    "not-found": "unavailable",
    "invalid-payload": "invalid-response",
  };
  if (kind !== null && codeByKind[kind]) return new ApplicationsFailure(codeByKind[kind]);
  if (status === 403) return new ApplicationsFailure("forbidden");
  if (status === 404 || status === 503) return new ApplicationsFailure("unavailable");
  return new ApplicationsFailure("unknown");
}

function assertApplicationId(applicationId: string): void {
  if (applicationId.trim() === "") throw new ApplicationsFailure("invalid-response");
}

function readString(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null || !(key in value)) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : null;
}

function readNumber(value: unknown, key: string): number | null {
  if (typeof value !== "object" || value === null || !(key in value)) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "number" && Number.isFinite(field) ? field : null;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error &&
    error.name === "AbortError";
}

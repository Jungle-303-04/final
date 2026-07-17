import {
  GitOpsPortFailure,
  type GitOpsFailureCode,
  type GitOpsActionCapability,
  type GitOpsApplicationDetail,
  type GitOpsApplicationScope,
  type GitOpsClusterScope,
  type GitOpsDesiredLiveDiffAvailability,
  type GitOpsOperationObservation,
  type GitOpsPort,
  type GitOpsResourceRef,
  type GitOpsSource,
  type GitOpsSyncTarget,
  type GitOpsResourceInsights,
  type GitOpsResourceTree,
  type ReleaseApplication,
  type ReleaseCluster,
} from "./gitOpsContract";
import type {
  GitOpsApplicationDetailEndpoint,
  GitOpsEndpointDependencies,
  GitOpsOverviewItemEndpoint,
} from "./gitOpsEndpointContract";

export function createGitOpsAdapter(endpoints: GitOpsEndpointDependencies): GitOpsPort {
  return {
    async getApplicationDetail(applicationId, signal) {
      return withPortFailure(async () => toApplicationDetail(
        (await endpoints.getApplicationDetail(applicationId, signal)).application,
      ));
    },
    async getResourceTree(locator, signal) {
      const endpoint = endpoints.getResourceTree;
      if (!endpoint) throw new GitOpsPortFailure("not-found");
      return withPortFailure(async () => toResourceTree(
        await endpoint(locator, signal),
      ));
    },
    async getResourceInsights(locator, signal) {
      const endpoint = endpoints.getResourceInsights;
      if (!endpoint) throw new GitOpsPortFailure("not-found");
      return withPortFailure(async () => toResourceInsights(
        (await endpoint(locator, signal)).insights,
      ));
    },
    async executeResourceAction(locator, input, signal) {
      const endpoint = endpoints.executeResourceAction;
      if (!endpoint) throw new GitOpsPortFailure("not-found");
      return withPortFailure(async () => {
        const response = await endpoint(locator, {
          cluster_id: locator.clusterId,
          resource: toEndpointResourceRef(input.insights.resource),
          resource_version: input.insights.resourceVersion,
          capability_revision: input.insights.capabilities.revision,
          action: input.action,
          confirmation: input.confirmation,
          reason: input.reason,
          ...(input.refreshMode ? { refresh_mode: input.refreshMode } : {}),
          ...(input.options ? {
            options: {
              revision: input.options.revision,
              prune: input.options.prune,
              dry_run: input.options.dryRun,
              force: input.options.force,
              apply_only: input.options.applyOnly,
              sync_options: input.options.syncOptions,
              resources: input.options.resources.map((resource) => ({
                api_group: resource.apiGroup,
                kind: resource.kind,
                namespace: resource.namespace,
                name: resource.name,
              })),
            },
          } : {}),
        }, input.idempotencyKey, signal);
        return {
          accepted: response.accepted,
          commandId: response.command_id,
          eventId: response.event_id,
          auditEventId: response.audit_event_id,
          correlationId: response.correlation_id,
          status: response.status,
        };
      });
    },
    async listApplications(signal) {
      return withPortFailure(async () => {
        const response = await endpoints.listApplications(signal);
        return response.applications.map(toApplication).filter((item): item is ReleaseApplication => item !== null);
      });
    },
    async listSyncTargets(signal, query) {
      return withPortFailure(async () => {
        const response = await endpoints.listOverview(query ?? {}, signal);
        return response.items.map(toOverviewSyncTarget).sort(compareSyncTargets);
      });
    },
    async listClusters(signal) {
      return withPortFailure(async () => {
        const response = await endpoints.listClusters(signal);
        return response.clusters.map(toCluster);
      });
    },
    async connectApplication(input, signal) {
      return withPortFailure(async () => {
        const response = await endpoints.connectApplication(input, signal);
        const application = toApplication(response.application);
        if (!application) throw new Error("connected application is missing an id");
        return application;
      });
    },
    async listPlans(signal) {
      return withPortFailure(async () => (await endpoints.listPlans(signal)).plans);
    },
    async listRuns(planId, signal) {
      return withPortFailure(async () => (await endpoints.listRuns(planId, signal)).runs);
    },
    savePlan: (plan, signal) => withPortFailure(() => endpoints.savePlan(plan, signal)),
    previewPlan: (plan, signal) => withPortFailure(() => endpoints.previewPlan(plan, signal)),
    checkReadiness: (plan, signal) => withPortFailure(() => endpoints.checkReadiness(plan, signal)),
    startPlan: (plan, signal) => withPortFailure(() => endpoints.startPlan(plan, signal)),
    renderManifest: (plan, stepIndex, signal) =>
      withPortFailure(() => endpoints.renderManifest(plan, stepIndex, signal)),
    submitSafePr: (plan, stepIndex, signal) =>
      withPortFailure(() => endpoints.submitSafePr(plan, stepIndex, signal)),
    runAction: (runId, action, reason, signal) =>
      withPortFailure(() => endpoints.runAction(runId, action, reason, signal)),
  };
}

function toOverviewSyncTarget(
  item: GitOpsOverviewItemEndpoint,
): GitOpsSyncTarget {
  if (!item.id || !item.display_name || !item.scope.cluster_id) {
    throw new GitOpsPortFailure("invalid-response");
  }
  if (item.authority === "controller" && item.resource === null) {
    throw new GitOpsPortFailure("invalid-response");
  }
  const resourceLocator = item.resource?.namespace
    ? {
      clusterId: item.scope.cluster_id,
      apiVersion: item.resource.api_group
        ? `${item.resource.api_group}/${item.resource.version}`
        : item.resource.version,
      kind: item.resource.kind,
      namespace: item.resource.namespace,
      name: item.resource.name,
    }
    : null;
  return {
    id: item.id,
    applicationId: item.application_ids[0]
      ?? item.resource?.uid
      ?? item.binding_id
      ?? item.id,
    applicationName: item.display_name,
    clusterId: item.scope.cluster_id,
    namespace: item.resource?.namespace ?? item.scope.namespaces[0] ?? null,
    environment: item.environment,
    syncStatus: item.status,
    revision: item.revision,
    observedAt: item.observed_at,
    authority: item.authority,
    provider: item.provider,
    kind: item.resource?.kind ?? null,
    health: item.health,
    resourceLocator,
    freshness: item.scope.freshness,
    partialReasonCodes: item.partial_reason_codes,
  };
}

function toResourceTree(
  value: import("./gitOpsEndpointContract").GitOpsResourceTreeEndpoint,
): GitOpsResourceTree {
  return {
    scope: toClusterScope(value.scope),
    root: toResourceRef(value.root),
    nodes: value.nodes.map((node) => ({
      id: node.id,
      resource: toResourceRef(node.resource),
      role: node.role,
      status: node.status,
      health: node.health,
    })),
    edges: value.edges,
    coverage: {
      state: value.coverage.state,
      reasonCodes: value.coverage.reason_codes,
      observedCount: value.coverage.observed_count,
      returnedCount: value.coverage.returned_count,
    },
  };
}

function toResourceInsights(
  value: import("./gitOpsEndpointContract").GitOpsResourceInsightsEndpoint["insights"],
): GitOpsResourceInsights {
  return {
    scope: toClusterScope(value.scope),
    resource: toResourceRef(value.resource),
    resourceVersion: value.resource_version,
    provider: value.provider,
    status: value.status,
    health: value.health,
    revision: value.revision,
    source: value.source ? toResourceRef(value.source) : null,
    conditions: value.conditions.map((condition) => ({
      type: condition.type,
      status: condition.status,
      reason: condition.reason,
      message: condition.message,
      observedAt: condition.observed_at,
    })),
    history: value.history.map((entry) => ({
      id: entry.id,
      revision: entry.revision,
      deployedAt: entry.deployed_at,
      phase: entry.phase,
      message: entry.message,
      initiatedBy: entry.initiated_by,
    })),
    capabilities: {
      scope: toClusterScope(value.capabilities.scope),
      resource: toResourceRef(value.capabilities.resource),
      revision: value.capabilities.revision,
      actions: value.capabilities.actions,
    },
  };
}

function toEndpointResourceRef(value: GitOpsResourceRef) {
  return {
    api_group: value.apiGroup,
    version: value.version,
    kind: value.kind,
    namespace: value.namespace,
    name: value.name,
    uid: value.uid,
  };
}

function toApplicationDetail(
  value: GitOpsApplicationDetailEndpoint["application"],
): GitOpsApplicationDetail {
  return {
    applicationId: value.application_id,
    name: value.name,
    resource: toResourceRef(value.resource),
    scope: toScope(value.scope),
    source: toSource(value.source),
    desiredLiveDiff: toDesiredLiveDiff(value.desired_live_diff),
    operation: toOperation(value.operation),
    capabilities: [toCapability(value.capabilities[0]), toCapability(value.capabilities[1])],
  };
}

function toResourceRef(
  value: GitOpsApplicationDetailEndpoint["application"]["resource"],
): GitOpsResourceRef {
  return {
    apiGroup: value.api_group,
    version: value.version,
    kind: value.kind,
    namespace: value.namespace,
    name: value.name,
    uid: value.uid,
  };
}

function toScope(
  value: GitOpsApplicationDetailEndpoint["application"]["scope"],
): GitOpsApplicationScope {
  return {
    availability: value.availability,
    scope: value.scope ? toClusterScope(value.scope) : null,
    reasonCode: value.reason_code,
  };
}

function toClusterScope(
  value: NonNullable<GitOpsApplicationDetailEndpoint["application"]["scope"]["scope"]>,
): GitOpsClusterScope {
  return {
    workspaceId: value.workspace_id,
    clusterId: value.cluster_id,
    namespaces: value.namespaces,
    freshness: value.freshness,
  };
}

function toSource(
  value: GitOpsApplicationDetailEndpoint["application"]["source"],
): GitOpsSource {
  return {
    repositoryRef: value.repository_ref,
    defaultBranch: value.default_branch,
    manifestPath: value.manifest_path,
  };
}

function toDesiredLiveDiff(
  value: GitOpsApplicationDetailEndpoint["application"]["desired_live_diff"],
): GitOpsDesiredLiveDiffAvailability {
  return {
    availability: value.availability,
    sourceRevision: value.source_revision,
    liveObservationRevision: value.live_observation_revision,
    reasonCode: value.reason_code,
  };
}

function toOperation(
  value: GitOpsApplicationDetailEndpoint["application"]["operation"],
): GitOpsOperationObservation {
  return {
    availability: value.availability,
    inProgress: value.in_progress,
    workflowRunId: value.workflow_run_id,
    status: value.status,
    observedAt: value.observed_at,
    reasonCode: value.reason_code,
  };
}

function toCapability(
  value: GitOpsApplicationDetailEndpoint["application"]["capabilities"][number],
): GitOpsActionCapability {
  return {
    action: value.action,
    authorization: value.authorization,
    availability: value.availability,
    enabled: false,
    operationBlocked: value.operation_blocked,
    reasonCode: value.reason_code,
  };
}

function compareSyncTargets(left: GitOpsSyncTarget, right: GitOpsSyncTarget): number {
  return left.applicationName.localeCompare(right.applicationName) ||
    (left.clusterId ?? "").localeCompare(right.clusterId ?? "") ||
    left.id.localeCompare(right.id);
}

function toCluster(value: {
  cluster_id: string;
  name: string;
  environment: string;
  connection_status: string;
}): ReleaseCluster {
  return {
    id: value.cluster_id,
    name: value.name || value.cluster_id,
    environment: value.environment,
    connectionStatus: value.connection_status,
  };
}

function toApplication(value: Record<string, unknown>): ReleaseApplication | null {
  const id = firstStringValue(value, ["id", "application_id"]);
  if (!id) return null;
  return {
    id,
    name: firstStringValue(value, ["name", "display_name"]) || id,
    repository: firstStringValue(value, ["repository_ref", "repo_ref"]),
    branch: firstStringValue(value, ["default_branch", "branch"]),
    clusterId: stringValue(value.cluster_id),
    manifestPath: stringValue(value.manifest_path),
  };
}

function firstStringValue(value: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const current = stringValue(value[key]);
    if (current !== "") return current;
  }
  return "";
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

async function withPortFailure<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isAbortError(error) || error instanceof GitOpsPortFailure) throw error;
    throw toPortFailure(error);
  }
}

function toPortFailure(error: unknown): GitOpsPortFailure {
  const codeByKind: Record<string, GitOpsFailureCode> = {
    unauthorized: "unauthorized",
    forbidden: "forbidden",
    network: "offline",
    "invalid-payload": "invalid-response",
    "not-found": "not-found",
    "rate-limited": "rate-limited",
  };
  const kind = typeof error === "object" && error !== null && "kind" in error &&
    typeof error.kind === "string" ? error.kind : "";
  const retryAfter = typeof error === "object" && error !== null && "retryAfter" in error &&
    typeof error.retryAfter === "number" ? error.retryAfter : null;
  return new GitOpsPortFailure(codeByKind[kind] ?? "error", retryAfter);
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

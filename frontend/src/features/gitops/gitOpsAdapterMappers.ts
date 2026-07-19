import {
  GitOpsPortFailure,
  type GitOpsActionCapability,
  type GitOpsApplicationDetail,
  type GitOpsApplicationScope,
  type GitOpsClusterScope,
  type GitOpsDesiredLiveDiffAvailability,
  type GitOpsOperationObservation,
  type GitOpsResourceInsights,
  type GitOpsResourceRef,
  type GitOpsResourceTree,
  type GitOpsSource,
  type GitOpsSyncTarget,
} from "./gitOpsContract";
import type {
  GitOpsApplicationDetailEndpoint,
  GitOpsOverviewItemEndpoint,
} from "./gitOpsEndpointContract";

export function toOverviewSyncTarget(item: GitOpsOverviewItemEndpoint): GitOpsSyncTarget {
  if (!item.id || !item.display_name || !item.scope.cluster_id) {
    throw new GitOpsPortFailure("invalid-response");
  }
  if (item.authority === "controller" && item.resource === null) {
    throw new GitOpsPortFailure("invalid-response");
  }
  const applicationIds = [...item.application_ids];
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
    applicationIds,
    applicationId: applicationIds[0]
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

export function toResourceTree(
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

export function toResourceInsights(
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

export function toEndpointResourceRef(value: GitOpsResourceRef) {
  return {
    api_group: value.apiGroup,
    version: value.version,
    kind: value.kind,
    namespace: value.namespace,
    name: value.name,
    uid: value.uid,
  };
}

export function toApplicationDetail(
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

export function compareSyncTargets(left: GitOpsSyncTarget, right: GitOpsSyncTarget): number {
  return left.applicationName.localeCompare(right.applicationName) ||
    (left.clusterId ?? "").localeCompare(right.clusterId ?? "") ||
    left.id.localeCompare(right.id);
}

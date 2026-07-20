import {
  GitOpsPortFailure,
  type GitOpsFailureCode,
  type GitOpsPort,
  type ReleaseApplication,
  type ReleaseCluster,
} from "./gitOpsContract";
import type { GitOpsEndpointDependencies } from "./gitOpsEndpointContract";
import { createRepositoryConnectionAdapter } from "./createRepositoryConnectionAdapter";
import {
  compareSyncTargets,
  toApplicationDetail,
  toEndpointResourceRef,
  toOverviewSyncTarget,
  toResourceInsights,
  toResourceTree,
} from "./gitOpsAdapterMappers";
export function createGitOpsAdapter(endpoints: GitOpsEndpointDependencies): GitOpsPort {
  return {
    ...createRepositoryConnectionAdapter(endpoints),
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
    decideApproval: (approvalId, decision, reason, signal) => withPortFailure(async () => {
      await endpoints.decideApproval(approvalId, decision, reason, signal);
    }),
    renderManifest: (plan, stepIndex, signal) =>
      withPortFailure(() => endpoints.renderManifest(plan, stepIndex, signal)),
    submitSafePr: (plan, stepIndex, signal) =>
      withPortFailure(() => endpoints.submitSafePr(plan, stepIndex, signal)),
    runAction: (runId, action, reason, signal) =>
      withPortFailure(() => endpoints.runAction(runId, action, reason, signal)),
  };
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

import {
  GitOpsPortFailure,
  type GitOpsFailureCode,
  type GitOpsPort,
  type GitOpsSyncTarget,
  type ReleaseApplication,
  type ReleaseCluster,
} from "./gitOpsContract";
import type { GitOpsEndpointDependencies } from "./gitOpsEndpointContract";

export function createGitOpsAdapter(endpoints: GitOpsEndpointDependencies): GitOpsPort {
  return {
    async listApplications(signal) {
      return withPortFailure(async () => {
        const response = await endpoints.listApplications(signal);
        return response.applications.map(toApplication).filter((item): item is ReleaseApplication => item !== null);
      });
    },
    async listSyncTargets(signal) {
      return withPortFailure(async () => {
        const response = await endpoints.listApplications(signal);
        const applications = response.applications
          .map(toApplication)
          .filter((item): item is ReleaseApplication => item !== null);
        const groups = await Promise.all(applications.map(async (application) => {
          const deployments = await endpoints.listApplicationDeployments(application.id, { signal });
          return deployments.deployments.map((deployment) => toSyncTarget(application, deployment));
        }));
        return groups.flat().sort(compareSyncTargets);
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

function toSyncTarget(
  application: ReleaseApplication,
  value: Record<string, unknown>,
): GitOpsSyncTarget {
  const bindingId = stringValue(value.binding_id);
  if (!bindingId) throw new GitOpsPortFailure("invalid-response");
  const poll = mapValue(value.gitops_poll);
  return {
    id: `${application.id}:${bindingId}`,
    applicationId: application.id,
    applicationName: application.name,
    clusterId: nullableStringValue(value.cluster_id),
    namespace: nullableStringValue(value.namespace),
    environment: nullableStringValue(value.environment),
    syncStatus: poll ? nullableStringValue(poll.status) : null,
    revision: poll ? nullableStringValue(poll.last_seen_commit_sha) : null,
    observedAt: poll ? nullableStringValue(poll.last_polled_at) : null,
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

function nullableStringValue(value: unknown): string | null {
  const normalized = stringValue(value).trim();
  return normalized || null;
}

function mapValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
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

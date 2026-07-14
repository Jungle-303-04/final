import {
  ApplicationsGitOpsFailure,
  type ApplicationCatalog,
  type ApplicationsGitOpsApiDependencies,
  type ApplicationsGitOpsFailureCode,
  type ApplicationsGitOpsPort,
  type ApplicationSummary,
  type DeploymentTarget,
  type GitOpsSnapshot,
  type JsonMap,
  type WorkflowRunSummary,
} from "./applicationsGitOpsContract";

export function createApplicationsGitOpsAdapter(
  api: ApplicationsGitOpsApiDependencies,
): ApplicationsGitOpsPort {
  return {
    async listApplications(signal) {
      try {
        const response = await api.listApplications({ signal });
        return parseApplicationCatalog(response.applications);
      } catch (error) {
        throw normalizeFailure(error);
      }
    },

    async loadGitOpsSnapshot(applicationId, signal) {
      if (applicationId.trim() === "") {
        throw new ApplicationsGitOpsFailure("invalid-response");
      }
      try {
        const [deploymentResponse, runResponse] = await Promise.all([
          api.listApplicationDeployments(applicationId, { signal }),
          api.listApplicationRuns(applicationId, { signal }),
        ]);
        return parseGitOpsSnapshot(
          deploymentResponse.deployments,
          runResponse.runs,
        );
      } catch (error) {
        throw normalizeFailure(error);
      }
    },
  };
}

function parseApplicationCatalog(rows: JsonMap[]): ApplicationCatalog {
  return { applications: rows.map(parseApplication) };
}

function parseApplication(row: JsonMap): ApplicationSummary {
  return {
    id: requiredString(row, "application_id"),
    name: requiredString(row, "name"),
    repositoryId: optionalString(row, "repository_id"),
    repositoryRef: optionalString(row, "repo_ref"),
    branch: optionalString(row, "default_branch"),
    manifestPath: optionalString(row, "manifest_path"),
    status: optionalString(row, "status"),
  };
}

function parseGitOpsSnapshot(
  deploymentRows: JsonMap[],
  runRows: JsonMap[],
): GitOpsSnapshot {
  return {
    deployments: deploymentRows.map(parseDeployment),
    runs: runRows.map(parseRun),
  };
}

function parseDeployment(row: JsonMap): DeploymentTarget {
  const poll = optionalMap(row, "gitops_poll");
  return {
    id: requiredString(row, "binding_id"),
    clusterId: optionalString(row, "cluster_id"),
    namespace: optionalString(row, "namespace"),
    environment: optionalString(row, "environment"),
    manifestPath: optionalString(row, "manifest_path"),
    pollStatus: poll ? optionalString(poll, "status") : null,
    lastCommitSha: poll ? optionalString(poll, "last_seen_commit_sha") : null,
    lastPolledAt: poll ? optionalString(poll, "last_polled_at") : null,
  };
}

function parseRun(row: JsonMap): WorkflowRunSummary {
  const gate = optionalMap(row, "promotion_gate");
  const eligible = gate ? optionalBoolean(gate, "eligible") : null;
  return {
    id: firstRequiredString(row, ["workflow_run_id", "run_id"]),
    status: optionalString(row, "status"),
    currentStep: firstOptionalString(row, ["current_step", "step"]),
    revision: firstOptionalString(row, ["revision", "source_revision", "commit_sha"]),
    updatedAt: firstOptionalString(row, ["updated_at", "completed_at", "created_at"]),
    promotionGate: eligible === null ? "pending" : eligible ? "eligible" : "blocked",
    failedResourceCount: gate ? optionalNumber(gate, "failed_resource_count") : null,
  };
}

function requiredString(row: JsonMap, key: string): string {
  const value = optionalString(row, key);
  if (value === null) throw new ApplicationsGitOpsFailure("invalid-response");
  return value;
}

function firstRequiredString(row: JsonMap, keys: readonly string[]): string {
  const value = firstOptionalString(row, keys);
  if (value === null) throw new ApplicationsGitOpsFailure("invalid-response");
  return value;
}

function firstOptionalString(row: JsonMap, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = optionalString(row, key);
    if (value !== null) return value;
  }
  return null;
}

function optionalString(row: JsonMap, key: string): string | null {
  const value = row[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function optionalBoolean(row: JsonMap, key: string): boolean | null {
  return typeof row[key] === "boolean" ? row[key] : null;
}

function optionalNumber(row: JsonMap, key: string): number | null {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function optionalMap(row: JsonMap, key: string): JsonMap | null {
  const value = row[key];
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonMap
    : null;
}

function normalizeFailure(error: unknown): ApplicationsGitOpsFailure {
  if (isAbortError(error)) throw error;
  if (error instanceof ApplicationsGitOpsFailure) return error;
  const kind = readString(error, "kind");
  const status = readNumber(error, "status");
  const codeByKind: Record<string, ApplicationsGitOpsFailureCode> = {
    forbidden: "forbidden",
    network: "offline",
    "not-found": "unavailable",
    "invalid-payload": "invalid-response",
  };
  if (kind !== null && codeByKind[kind]) {
    return new ApplicationsGitOpsFailure(codeByKind[kind]);
  }
  if (status === 403) return new ApplicationsGitOpsFailure("forbidden");
  if (status === 404 || status === 503) {
    return new ApplicationsGitOpsFailure("unavailable");
  }
  return new ApplicationsGitOpsFailure("unknown");
}

function readString(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null || !(key in value)) return null;
  const field = (value as JsonMap)[key];
  return typeof field === "string" ? field : null;
}

function readNumber(value: unknown, key: string): number | null {
  if (typeof value !== "object" || value === null || !(key in value)) return null;
  const field = (value as JsonMap)[key];
  return typeof field === "number" && Number.isFinite(field) ? field : null;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error &&
    error.name === "AbortError";
}

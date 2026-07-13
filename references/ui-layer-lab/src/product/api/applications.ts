import { apiRequest, type ApiPath } from "./client";
import {
  applicationListSchema,
  applicationResponseSchema,
  deploymentBindingListSchema,
  workflowRunListSchema,
  type ApplicationList,
  type ApplicationResponse,
  type DeploymentBindingList,
  type WorkflowRunList,
} from "./applications-schemas";
import { encodePathSegment, withQuery } from "./url";

export const APPLICATIONS_DEFAULT_LIMIT = 100;
export const APPLICATIONS_MAX_LIMIT = 500;
export const APPLICATION_RUNS_PATH =
  "/api/applications/{application_id}/runs" as const;

export interface ApplicationListOptions {
  limit?: number;
  signal?: AbortSignal;
}

export interface ApplicationHistoryOptions {
  limit?: number;
  signal?: AbortSignal;
}

/** Lists Applications visible to the signed-in user. */
export async function listApplications(
  options: ApplicationListOptions = {},
): Promise<ApplicationList> {
  const limit = options.limit ?? APPLICATIONS_DEFAULT_LIMIT;
  assertLimit(limit);
  const path = withQuery("/api/applications" as ApiPath, [["limit", limit]]);
  return apiRequest(path, applicationListSchema, { signal: options.signal });
}

/** Loads one Application and its repository metadata. */
export function getApplication(
  applicationId: string,
  signal?: AbortSignal,
): Promise<ApplicationResponse> {
  assertApplicationId(applicationId);
  const path = `/api/applications/${encodePathSegment(applicationId)}` as ApiPath;
  return apiRequest(path, applicationResponseSchema, { signal });
}

/** Lists the deployment bindings/environments configured for an Application. */
export async function listApplicationDeployments(
  applicationId: string,
  options: ApplicationHistoryOptions = {},
): Promise<DeploymentBindingList> {
  assertApplicationId(applicationId);
  const limit = options.limit ?? APPLICATIONS_DEFAULT_LIMIT;
  assertLimit(limit);
  const basePath =
    `/api/applications/${encodePathSegment(applicationId)}/deployments` as ApiPath;
  const path = withQuery(basePath, [["limit", limit]]);
  return apiRequest(path, deploymentBindingListSchema, { signal: options.signal });
}

/** Lists GitOps workflow runs for an Application. */
export async function listApplicationRuns(
  applicationId: string,
  options: ApplicationHistoryOptions = {},
): Promise<WorkflowRunList> {
  assertApplicationId(applicationId);
  const limit = options.limit ?? APPLICATIONS_DEFAULT_LIMIT;
  assertLimit(limit);
  const basePath = APPLICATION_RUNS_PATH.replace(
    "{application_id}",
    encodePathSegment(applicationId),
  ) as ApiPath;
  const path = withQuery(basePath, [["limit", limit]]);
  return apiRequest(path, workflowRunListSchema, { signal: options.signal });
}

function assertLimit(limit: number): void {
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > APPLICATIONS_MAX_LIMIT
  ) {
    throw new RangeError(
      `application history limit must be an integer from 1 to ${APPLICATIONS_MAX_LIMIT}`,
    );
  }
}

function assertApplicationId(applicationId: string): void {
  if (applicationId.trim() === "") {
    throw new RangeError("applicationId must not be empty");
  }
}

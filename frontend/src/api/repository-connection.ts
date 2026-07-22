import { apiRequest, type ApiPath } from "./client";
import {
  repositoryConnectionStatusSchema,
  type RepositoryConnectionStatus,
} from "./repository-connection-schemas";
import { withQuery } from "./url";

/** Reads the server-owned terminal state for a repository registration. */
export function getRepositoryConnectionStatus(
  repoRef: string,
  signal?: AbortSignal,
): Promise<RepositoryConnectionStatus> {
  const path = withQuery(
    "/api/repositories/connection-status" as ApiPath,
    [["repo_ref", repoRef]],
  );
  return apiRequest(path, repositoryConnectionStatusSchema, { signal });
}

import { apiRequest, type ApiPath } from "./client";
import {
  releaseAuditListSchema,
  type ReleaseAuditListEndpoint,
} from "./release-audit-schemas";
import { withQuery } from "./url";

export const RELEASE_AUDIT_PATH = "/api/release-audit" as ApiPath;

export function listReleaseAuditEvents(
  options: { limit?: number; signal?: AbortSignal } = {},
): Promise<ReleaseAuditListEndpoint> {
  const limit = options.limit ?? 200;
  if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) {
    throw new RangeError("Release audit limit must be an integer from 1 to 1000");
  }
  return apiRequest(
    withQuery(RELEASE_AUDIT_PATH, [["limit", limit]]),
    releaseAuditListSchema,
    { signal: options.signal },
  );
}

import { apiRequest, type ApiPath } from "./client";
import {
  browserRefreshPoliciesSchema,
  type BrowserRefreshPoliciesEndpoint,
} from "./refresh-policies-schemas";

export const REFRESH_POLICIES_PATH: ApiPath = "/api/refresh-policies";

export function getBrowserRefreshPolicies(
  signal?: AbortSignal,
): Promise<BrowserRefreshPoliciesEndpoint> {
  return apiRequest(REFRESH_POLICIES_PATH, browserRefreshPoliciesSchema, { signal });
}

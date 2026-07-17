import { getBrowserRefreshPolicies } from "../../api";
import {
  createBrowserRefreshPolicyRegistry,
  type BrowserRefreshPolicy,
  type BrowserRefreshPolicyRegistry,
} from "../../shared/data/browserRefreshPolicyRegistry";

type BrowserRefreshPoliciesEndpoint = Awaited<ReturnType<typeof getBrowserRefreshPolicies>>;
type RefreshPolicyKey = keyof BrowserRefreshPoliciesEndpoint["policies"];
type EndpointPolicy = BrowserRefreshPoliciesEndpoint["policies"][RefreshPolicyKey];

export function createApiBrowserRefreshPolicyRegistry(): BrowserRefreshPolicyRegistry<RefreshPolicyKey> {
  return createBrowserRefreshPolicyRegistry<RefreshPolicyKey, EndpointPolicy>({
    load: getBrowserRefreshPolicies,
    map: toBrowserRefreshPolicy,
  });
}

function toBrowserRefreshPolicy(policy: EndpointPolicy): BrowserRefreshPolicy {
  return {
    staleAfterSeconds: policy.stale_after_seconds,
    refreshAfterSeconds: policy.refresh_after_seconds,
    keepLastSuccess: policy.keep_last_success,
    pauseWhenHidden: policy.pause_when_hidden,
    eventInvalidation: policy.event_invalidation,
    retryAfterSeconds: policy.retry_after_seconds,
    retryLimit: policy.retry_limit,
    postMutationRefreshAfterSeconds: policy.post_mutation_refresh_after_seconds,
  };
}

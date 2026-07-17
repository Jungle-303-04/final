import { apiRequest, type ApiPath } from "./client";
import {
  gitOpsResourceActionReceiptSchema,
  gitOpsResourceInsightsSchema,
  gitOpsResourceTreeSchema,
  type GitOpsResourceActionEndpointRequest,
  type GitOpsResourceActionReceiptEndpoint,
  type GitOpsResourceInsightsEndpoint,
  type GitOpsResourceTreeEndpoint,
} from "./gitops-resource-detail-schemas";
import { encodePathSegment } from "./url";

export interface GitOpsResourceEndpointLocator {
  clusterId: string;
  apiVersion: string;
  kind: string;
  namespace: string;
  name: string;
}

const GITOPS_RESOURCE_PATH = "/api/gitops/resources/{kind}/{namespace}/{name}" as const;

function resourcePath(locator: GitOpsResourceEndpointLocator, suffix: "tree" | "insights" | "actions"): ApiPath {
  const segments = [locator.clusterId, locator.apiVersion, locator.kind, locator.namespace, locator.name];
  if (segments.some((segment) => segment.trim() === "")) {
    throw new RangeError("GitOps resource locator fields must not be empty");
  }
  const base = GITOPS_RESOURCE_PATH
    .replace("{kind}", encodePathSegment(locator.kind))
    .replace("{namespace}", encodePathSegment(locator.namespace))
    .replace("{name}", encodePathSegment(locator.name));
  const query = new URLSearchParams({
    cluster_id: locator.clusterId,
    api_version: locator.apiVersion,
  });
  return `${base}/${suffix}?${query.toString()}` as ApiPath;
}

export function getGitOpsResourceTree(
  locator: GitOpsResourceEndpointLocator,
  signal?: AbortSignal,
): Promise<GitOpsResourceTreeEndpoint> {
  return apiRequest(resourcePath(locator, "tree"), gitOpsResourceTreeSchema, { signal });
}

export function getGitOpsResourceInsights(
  locator: GitOpsResourceEndpointLocator,
  signal?: AbortSignal,
): Promise<GitOpsResourceInsightsEndpoint> {
  return apiRequest(resourcePath(locator, "insights"), gitOpsResourceInsightsSchema, { signal });
}

export function executeGitOpsResourceAction(
  locator: GitOpsResourceEndpointLocator,
  request: GitOpsResourceActionEndpointRequest,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<GitOpsResourceActionReceiptEndpoint> {
  if (idempotencyKey.trim() === "") throw new RangeError("idempotencyKey must not be empty");
  return apiRequest(resourcePath(locator, "actions"), gitOpsResourceActionReceiptSchema, {
    body: JSON.stringify(request),
    headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey },
    method: "POST",
    signal,
  });
}

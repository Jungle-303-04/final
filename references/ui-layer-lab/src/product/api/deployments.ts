import { apiRequest, type ApiPath } from "./client";
import {
  deploymentActionAcceptedSchema,
  type DeploymentActionAccepted,
} from "./deployments-schemas";
import { encodePathSegment } from "./url";

export const DEPLOYMENT_MAX_REPLICAS = 100;
export const DEPLOYMENT_MAX_REASON_LENGTH = 500;

export interface DeploymentActionOptions {
  reason?: string | null;
  approvalRef?: string | null;
  policyDecisionRef?: string | null;
  signal?: AbortSignal;
}

export interface ScaleDeploymentOptions extends DeploymentActionOptions {
  replicas: number;
}

/** Requests Kubernetes to recreate the Pods owned by a Deployment. */
export function restartDeployment(
  clusterId: string,
  namespace: string,
  deployment: string,
  options: DeploymentActionOptions = {},
): Promise<DeploymentActionAccepted> {
  assertReason(options.reason);
  const path = deploymentActionPath(clusterId, namespace, deployment, "restart");
  return apiRequest(path, deploymentActionAcceptedSchema, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(toActionBody(options)),
    signal: options.signal,
  });
}

/** Requests Kubernetes to change the Deployment's desired replica count. */
export function scaleDeployment(
  clusterId: string,
  namespace: string,
  deployment: string,
  options: ScaleDeploymentOptions,
): Promise<DeploymentActionAccepted> {
  assertReplicas(options.replicas);
  assertReason(options.reason);
  const path = deploymentActionPath(clusterId, namespace, deployment, "scale");
  return apiRequest(path, deploymentActionAcceptedSchema, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      replicas: options.replicas,
      ...toActionBody(options),
    }),
    signal: options.signal,
  });
}

function deploymentActionPath(
  clusterId: string,
  namespace: string,
  deployment: string,
  action: "restart" | "scale",
): ApiPath {
  return `/api/clusters/${encodePathSegment(clusterId)}/namespaces/${encodePathSegment(namespace)}/deployments/${encodePathSegment(deployment)}/${action}` as ApiPath;
}

function toActionBody(options: DeploymentActionOptions): Record<string, string> {
  const body: Record<string, string> = {};
  if (options.reason != null) body.reason = options.reason;
  if (options.approvalRef != null) body.approval_ref = options.approvalRef;
  if (options.policyDecisionRef != null) {
    body.policy_decision_ref = options.policyDecisionRef;
  }
  return body;
}

function assertReplicas(replicas: number): void {
  if (
    !Number.isInteger(replicas) ||
    replicas < 0 ||
    replicas > DEPLOYMENT_MAX_REPLICAS
  ) {
    throw new RangeError(
      `deployment replicas must be an integer from 0 to ${DEPLOYMENT_MAX_REPLICAS}`,
    );
  }
}

function assertReason(reason: string | null | undefined): void {
  if (reason != null && reason.length > DEPLOYMENT_MAX_REASON_LENGTH) {
    throw new RangeError(
      `deployment action reason must be at most ${DEPLOYMENT_MAX_REASON_LENGTH} characters`,
    );
  }
}

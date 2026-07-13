import { apiRequest, type ApiPath } from "./client";
import {
  deploymentActionAcceptedSchema,
  deploymentRestartRequestSchema,
  deploymentScaleRequestSchema,
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
  assertDeploymentIdentity(clusterId, namespace, deployment);
  assertReason(options.reason);
  const path = deploymentActionPath(clusterId, namespace, deployment, "restart");
  const body = deploymentRestartRequestSchema.parse(toActionBody(options));
  return apiRequest(path, deploymentActionAcceptedSchema, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
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
  assertDeploymentIdentity(clusterId, namespace, deployment);
  assertReplicas(options.replicas);
  assertReason(options.reason);
  const path = deploymentActionPath(clusterId, namespace, deployment, "scale");
  const body = deploymentScaleRequestSchema.parse({
    replicas: options.replicas,
    ...toActionBody(options),
  });
  return apiRequest(path, deploymentActionAcceptedSchema, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
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

function assertDeploymentIdentity(
  clusterId: string,
  namespace: string,
  deployment: string,
): void {
  assertNonEmptyIdentity(clusterId, "clusterId");
  assertNonEmptyIdentity(namespace, "namespace");
  assertNonEmptyIdentity(deployment, "name");
}

function assertNonEmptyIdentity(value: string, field: string): void {
  if (value.trim() === "") {
    throw new RangeError(`deployment ${field} must not be empty`);
  }
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

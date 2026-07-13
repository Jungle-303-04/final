import { apiRequest, type ApiPath } from "./client";
import {
  commandAcceptedSchema,
  type CommandAccepted,
} from "./commands-schemas";

export interface SubmitCommandInput {
  clusterId: string;
  action: string;
  namespace: string;
  reason?: string | null;
  diff?: Record<string, unknown> | null;
  approvalRef?: string | null;
  policyDecisionRef?: string | null;
}

export interface SubmitCommandOptions {
  signal?: AbortSignal;
}

/** Queues one allowlisted operational command for the target Cluster Agent. */
export function submitCommand(
  input: SubmitCommandInput,
  options: SubmitCommandOptions = {},
): Promise<CommandAccepted> {
  assertRequiredIdentifier(input.clusterId, "clusterId");
  assertRequiredIdentifier(input.action, "action");
  assertRequiredIdentifier(input.namespace, "namespace");

  const path = "/api/commands" as ApiPath;
  return apiRequest(path, commandAcceptedSchema, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      cluster_id: input.clusterId,
      action: input.action,
      namespace: input.namespace,
      reason: input.reason,
      diff: input.diff,
      approval_ref: input.approvalRef,
      policy_decision_ref: input.policyDecisionRef,
    }),
    signal: options.signal,
  });
}

function assertRequiredIdentifier(value: string, field: string): void {
  if (!value.trim()) {
    throw new TypeError(`command ${field} is required`);
  }
}

import { apiRequest, type ApiPath } from "./client";
import {
  approvalDecisionResponseSchema,
  type ApprovalDecisionResponse,
} from "./approvals-schemas";
import { encodePathSegment } from "./url";

export interface ApprovalDecisionOptions {
  reason?: string | null;
  signal?: AbortSignal;
}

/** Grants a pending GitOps approval; the backend then emits the deploy event. */
export function grantApproval(
  approvalId: string,
  options: ApprovalDecisionOptions = {},
): Promise<ApprovalDecisionResponse> {
  return decideApproval("grant", approvalId, options);
}

/** Rejects a pending GitOps approval and records the optional reason. */
export function rejectApproval(
  approvalId: string,
  options: ApprovalDecisionOptions = {},
): Promise<ApprovalDecisionResponse> {
  return decideApproval("reject", approvalId, options);
}

function decideApproval(
  decision: "grant" | "reject",
  approvalId: string,
  options: ApprovalDecisionOptions,
): Promise<ApprovalDecisionResponse> {
  const path =
    `/api/approvals/${encodePathSegment(approvalId)}/${decision}` as ApiPath;
  return apiRequest(path, approvalDecisionResponseSchema, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason: options.reason ?? null }),
    signal: options.signal,
  });
}

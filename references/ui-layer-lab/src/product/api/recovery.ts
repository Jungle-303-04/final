import { apiRequest, type ApiPath } from "./client";
import {
  recoveryActionAcceptedSchema,
  recoveryPlanSchema,
  type RecoveryActionAccepted,
  type RecoveryPlan,
} from "./recovery-schemas";
import { encodePathSegment } from "./url";

export interface SelectRecoveryActionInput {
  expectedPlanId: string;
  actionId?: string;
  reason?: string;
}

export interface RecoveryRequestOptions {
  signal?: AbortSignal;
}

/** Loads the recovery candidates generated for one Incident correlation. */
export function getRecoveryPlanByCorrelation(
  correlationId: string,
  options: RecoveryRequestOptions = {},
): Promise<RecoveryPlan> {
  const path =
    `/api/rca/recovery-plans/by-correlation/${encodePathSegment(correlationId)}` as ApiPath;
  return apiRequest(path, recoveryPlanSchema, { signal: options.signal });
}

/** Selects one recovery candidate without executing it directly. */
export function selectRecoveryAction(
  correlationId: string,
  input: SelectRecoveryActionInput,
  options: RecoveryRequestOptions = {},
): Promise<RecoveryActionAccepted> {
  const path =
    `/api/rca/recovery-plans/by-correlation/${encodePathSegment(correlationId)}/actions/select` as ApiPath;
  return apiRequest(path, recoveryActionAcceptedSchema, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      expected_plan_id: input.expectedPlanId,
      action_id: input.actionId,
      reason: input.reason,
    }),
    signal: options.signal,
  });
}

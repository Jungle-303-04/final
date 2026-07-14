import { z } from "zod";

export const deploymentActionReasonSchema = z.string().max(500).nullable().optional();

const deploymentAuditFields = {
  reason: deploymentActionReasonSchema,
  approval_ref: z.string().nullable().optional(),
  policy_decision_ref: z.string().nullable().optional(),
};

export const deploymentRestartRequestSchema = z.strictObject({
  ...deploymentAuditFields,
});

export const deploymentScaleRequestSchema = z.strictObject({
  replicas: z.number().int().min(0).max(100),
  ...deploymentAuditFields,
});

export const deploymentActionAcceptedSchema = z.strictObject({
  accepted: z.boolean(),
  event_id: z.string().min(1),
  correlation_id: z.string().min(1),
});

export type DeploymentActionAccepted = z.infer<
  typeof deploymentActionAcceptedSchema
>;
export type DeploymentRestartRequest = z.infer<
  typeof deploymentRestartRequestSchema
>;
export type DeploymentScaleRequest = z.infer<typeof deploymentScaleRequestSchema>;

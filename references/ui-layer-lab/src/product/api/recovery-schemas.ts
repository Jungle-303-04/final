import { z } from "zod";

const jsonMapSchema = z.record(z.string(), z.unknown());

export const recoveryActionCandidateSchema = z.strictObject({
  action_id: z.string().min(1),
  title: z.string(),
  description: z.string(),
  route: z.string(),
  rank: z.number().int(),
  score: z.number().finite(),
  risk_level: z.string(),
  blast_radius: z.string(),
  approval_required: z.boolean(),
  prerequisites: z.array(z.string()),
  validation_checks: z.array(z.string()),
  rollback_plan: z.string(),
  evidence_refs: z.array(z.string()),
});

export const recoveryPlanSchema = z.strictObject({
  plan_id: z.string().min(1),
  correlation_id: z.string().min(1),
  incident_id: z.string().min(1),
  evidence_ref: z.string().min(1),
  status: z.string().min(1),
  summary: z.string(),
  target: jsonMapSchema,
  recommended_action_id: z.string().min(1),
  execution_route: z.string(),
  selection_required: z.boolean(),
  selected_action_id: z.string().nullable(),
  selected_by: z.string().nullable(),
  selected_action: recoveryActionCandidateSchema.nullable(),
  candidates: z.array(recoveryActionCandidateSchema),
});

export const recoveryActionAcceptedSchema = z.strictObject({
  accepted: z.boolean(),
  event_id: z.string().min(1),
  correlation_id: z.string().min(1),
});

export type RecoveryActionCandidate = z.infer<
  typeof recoveryActionCandidateSchema
>;
export type RecoveryPlan = z.infer<typeof recoveryPlanSchema>;
export type RecoveryActionAccepted = z.infer<
  typeof recoveryActionAcceptedSchema
>;

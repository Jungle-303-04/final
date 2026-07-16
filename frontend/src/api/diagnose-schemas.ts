import { z } from "zod";

const freshnessSchema = z.enum(["live", "stale", "partial", "disconnected"]);
const diagnoseStatusSchema = z.enum([
  "queued",
  "running",
  "awaiting_confirmation",
  "completed",
  "failed",
  "stopped",
  "stale",
  "unavailable",
]);
const diagnoseEventKindSchema = z.enum([
  "phase",
  "turn",
  "step",
  "thinking",
  "verdict",
  "command.proposal",
  "command.receipt",
  "operation",
  "error",
  "closed",
]);

export const diagnoseAgentSchema = z.strictObject({
  agent_id: z.string().min(1),
  isolated: z.boolean(),
  model: z.string().min(1).nullable().optional(),
  effort: z.enum(["minimal", "low", "medium", "high"]),
});

export const diagnoseScopeSchema = z.strictObject({
  workspace_id: z.string().min(1),
  cluster_id: z.string().min(1),
  namespaces: z.array(z.string()),
  freshness: freshnessSchema,
});

export const diagnoseResourceRefSchema = z.strictObject({
  api_group: z.string(),
  version: z.string(),
  kind: z.string().min(1),
  namespace: z.string().nullable(),
  name: z.string().min(1),
  uid: z.string().min(1),
});

export const diagnoseTargetSchema = z.strictObject({
  scope: diagnoseScopeSchema,
  resource: diagnoseResourceRefSchema,
});

export const diagnoseRunSchema = z.strictObject({
  run_id: z.string().min(1),
  target: diagnoseTargetSchema,
  agent: diagnoseAgentSchema,
  requested_by: z.string().min(1),
  status: diagnoseStatusSchema,
  target_key: z.string().min(1),
  deduplication_key: z.string().min(1),
  status_reason: z.string().min(1).nullable().optional(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export const diagnoseCapabilitiesSchema = z.strictObject({
  enabled: z.boolean(),
  agent: diagnoseAgentSchema,
  label: z.string().min(1),
  disclosure_revision: z.string().min(1),
  consented: z.boolean(),
  reason_codes: z.array(z.string()),
});

export const diagnoseRunListSchema = z.strictObject({
  runs: z.array(diagnoseRunSchema),
  complete: z.boolean(),
  history_status: z.enum(["available", "degraded"]),
  reason_codes: z.array(z.string()),
});

export const diagnoseLaunchResultSchema = z.strictObject({
  run: diagnoseRunSchema,
  created: z.boolean(),
  deduplicated: z.boolean(),
});

export const diagnoseEventSchema = z.strictObject({
  run_id: z.string().min(1),
  sequence: z.number().int().positive(),
  kind: diagnoseEventKindSchema,
  payload: z.record(z.string(), z.unknown()),
  occurred_at: z.string().datetime({ offset: true }),
});

export const diagnoseHistoryClearSchema = z.strictObject({
  deleted_runs: z.number().int().nonnegative(),
});

export const diagnoseConsentGrantSchema = z.strictObject({
  scope: diagnoseScopeSchema,
  agent_id: z.string().min(1),
  disclosure_revision: z.string().min(1),
  surface: z.enum(["browser", "desktop"]),
  granted_at: z.string().datetime({ offset: true }),
});

export type DiagnoseCapabilitiesEndpoint = z.infer<typeof diagnoseCapabilitiesSchema>;
export type DiagnoseRunEndpoint = z.infer<typeof diagnoseRunSchema>;
export type DiagnoseEventEndpoint = z.infer<typeof diagnoseEventSchema>;

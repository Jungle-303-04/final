import { z } from "zod";

const nullableStringSchema = z.string().nullable();
const integerSchema = z.number().int();

export const authSessionSchema = z.strictObject({
  authenticated: z.boolean(),
  display_name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  user_id: z.string(),
  roles: z.array(z.string()),
  workspace_id: z.string(),
});

export const logoutResponseSchema = z.strictObject({
  authenticated: z.literal(false),
});

export const fleetHealthSchema = z.enum([
  "healthy",
  "warning",
  "critical",
  "stale",
  "unknown",
]);

export const fleetClusterSummarySchema = z.strictObject({
  cluster_id: z.string(),
  name: z.string(),
  health: fleetHealthSchema,
  pods_running: integerSchema,
  pods_total: integerSchema,
  nodes_ready: integerSchema,
  nodes_total: integerSchema,
  open_incidents: integerSchema,
  restarts_recent: integerSchema,
  cpu_pct: z.number().nullable(),
  mem_pct: z.number().nullable(),
  last_seen_at: nullableStringSchema,
});

export const fleetTotalsSchema = z.strictObject({
  clusters: integerSchema,
  healthy: integerSchema,
  warning: integerSchema,
  critical: integerSchema,
  stale: integerSchema,
  unknown: integerSchema,
  open_incidents: integerSchema,
  pending_approvals: integerSchema,
  running_workflows: integerSchema,
  dead_letters: integerSchema,
});

export const fleetSummarySchema = z.strictObject({
  clusters: z.array(fleetClusterSummarySchema),
  totals: fleetTotalsSchema,
});

export const rcaTimelineItemSchema = z.strictObject({
  workspace_id: z.string(),
  correlation_id: z.string(),
  cluster_id: nullableStringSchema,
  incident_id: nullableStringSchema,
  incident_namespace: nullableStringSchema,
  incident_resource_kind: nullableStringSchema,
  incident_resource_name: nullableStringSchema,
  incident_symptom: nullableStringSchema,
  evidence_ref: nullableStringSchema,
  current_subject: z.string(),
  status: z.string(),
  root_cause: nullableStringSchema,
  confidence: z.number().nullable(),
  supporting_evidence: z.array(z.string()),
  missing_evidence: z.array(z.string()),
  action_route: nullableStringSchema,
  command_id: nullableStringSchema,
  pr_url: nullableStringSchema,
  error_reason: nullableStringSchema,
  updated_at: nullableStringSchema,
});

export const rcaTimelineSchema = z.strictObject({
  items: z.array(rcaTimelineItemSchema),
});

export type AuthSession = z.infer<typeof authSessionSchema>;
export type FleetHealth = z.infer<typeof fleetHealthSchema>;
export type FleetClusterSummary = z.infer<typeof fleetClusterSummarySchema>;
export type FleetTotals = z.infer<typeof fleetTotalsSchema>;
export type FleetSummary = z.infer<typeof fleetSummarySchema>;
export type RcaTimelineItem = z.infer<typeof rcaTimelineItemSchema>;
export type RcaTimeline = z.infer<typeof rcaTimelineSchema>;

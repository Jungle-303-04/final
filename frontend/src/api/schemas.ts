import { z } from "zod";
import { recentChangeItemSchema } from "./recent-changes-schemas";
import type { AuthEndpointSession } from "../features/auth/authEndpointContract";

const nullableStringSchema = z.string().nullable();
const integerSchema = z.number().int();

const authLogoutCapabilitySchema = z.strictObject({
  action: z.enum(["end_session", "upstream_identity_required"]),
  supported: z.boolean(),
  reauthentication_expected: z.boolean(),
});

export const authSessionSchema = z.strictObject({
  authenticated: z.literal(true),
  auth_enabled: z.literal(true),
  auth_mode: z.enum(["password", "trusted_proxy"]),
  display_name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  user_id: z.string().min(1),
  groups: z.array(z.string().min(1)),
  roles: z.array(z.string().min(1)).min(1),
  workspace_id: z.string().min(1),
  logout: authLogoutCapabilitySchema,
}).superRefine((session, context) => {
  const expected = session.auth_mode === "password"
    ? ["end_session", true, false] as const
    : ["upstream_identity_required", false, true] as const;
  const actual = [
    session.logout.action,
    session.logout.supported,
    session.logout.reauthentication_expected,
  ] as const;
  if (actual.some((value, index) => value !== expected[index])) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "logout capability must match the authentication authority",
      path: ["logout"],
    });
  }
}) satisfies z.ZodType<AuthEndpointSession>;

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

/**
 * Additive queue contract.  It intentionally remains separate from the legacy
 * timeline schema so an older strict frontend can keep consuming timeline
 * responses while a new frontend rolls out the richer Issue presentation.
 */
export const rcaIssueItemSchema = rcaTimelineItemSchema.extend({
  issue_severity: z.enum(["critical", "warning"]).nullable(),
  severity_availability: z.enum(["available", "unavailable"]),
  severity_reason_code: z.enum([
    "source_incomplete",
    "outside_two_tier_scale",
  ]).nullable(),
}).superRefine((item, context) => {
  if (
    item.severity_availability === "available"
    && (item.issue_severity === null || item.severity_reason_code !== null)
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "available severity requires a tier" });
  }
  if (
    item.severity_availability === "unavailable"
    && (item.issue_severity !== null || item.severity_reason_code === null)
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "unavailable severity requires a reason" });
  }
});

export const rcaIssueQueueItemSchema = rcaIssueItemSchema.extend({
  category: z.string().min(1).nullable(),
  category_availability: z.enum(["available", "unavailable"]),
  category_reason_code: z.literal("source_incomplete").nullable(),
}).superRefine((item, context) => {
  if (
    item.category_availability === "available"
    && (item.category === null || item.category_reason_code !== null)
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "available category requires a value" });
  }
  if (
    item.category_availability === "unavailable"
    && (item.category !== null || item.category_reason_code === null)
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "unavailable category requires a reason" });
  }
});

const rcaIssueQueueFacetSchema = z.strictObject({
  value: z.string().min(1),
  count: integerSchema.nonnegative(),
});

const rcaIssueQueueVisibilitySchema = z.strictObject({
  state: z.enum(["complete", "partial", "restricted"]),
  completeness: z.enum(["exact", "partial", "unavailable"]),
  authorized_cluster_count: integerSchema.nonnegative(),
  requested_namespaces: z.array(z.string().min(1)),
  reason_codes: z.array(z.string().min(1)),
}).superRefine((visibility, context) => {
  if (visibility.state !== "complete" && visibility.reason_codes.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "incomplete visibility requires a reason" });
  }
  if (visibility.state === "complete" && visibility.completeness !== "exact") {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "complete visibility must be exact" });
  }
});

export const rcaIssueListSchema = z.strictObject({
  items: z.array(rcaIssueQueueItemSchema),
  total: integerSchema.nonnegative(),
  total_matched: integerSchema.nonnegative(),
  count_completeness: z.literal("exact"),
  recent_changes: z.array(recentChangeItemSchema.extend({ incident_id: z.string().min(1) })),
  visibility: rcaIssueQueueVisibilitySchema,
  facets: z.strictObject({
    namespaces: z.array(rcaIssueQueueFacetSchema),
    severities: z.array(rcaIssueQueueFacetSchema),
    categories: z.array(rcaIssueQueueFacetSchema),
  }),
}).superRefine((queue, context) => {
  if (queue.total !== queue.items.length || queue.total > queue.total_matched) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "queue counts are inconsistent" });
  }
  const incidents = new Set(queue.items.flatMap((item) => item.incident_id ? [item.incident_id] : []));
  if (queue.recent_changes.some((change) => !incidents.has(change.incident_id))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "recent change is outside the queue page" });
  }
});

export const resourceIssueOnsetSchema = z.strictObject({
  first_observed_at: z.string().datetime({ offset: true }),
  source: z.literal("timeline_created_at"),
  timing_kind: z.null(),
  timing_availability: z.literal("unavailable"),
  timing_reason_code: z.literal("health_transition_evidence_unavailable"),
});

export const resourceIssueItemSchema = rcaIssueItemSchema.extend({
  onset: resourceIssueOnsetSchema,
});

export const resourceIssueListSchema = z.strictObject({
  scope: z.strictObject({
    workspace_id: z.string().min(1),
    cluster_id: z.string().min(1),
    namespaces: z.array(z.string()),
    freshness: z.enum(["live", "stale", "partial", "disconnected"]),
  }),
  coverage_availability: z.enum(["available", "partial", "unavailable"]),
  observed_at: z.string().nullable(),
  reason_codes: z.array(z.string()),
  items: z.array(resourceIssueItemSchema),
  limit: z.number().int().min(1).max(100),
  has_more: z.boolean(),
});

export type AuthSession = z.infer<typeof authSessionSchema>;
export type FleetHealth = z.infer<typeof fleetHealthSchema>;
export type FleetClusterSummary = z.infer<typeof fleetClusterSummarySchema>;
export type FleetTotals = z.infer<typeof fleetTotalsSchema>;
export type FleetSummary = z.infer<typeof fleetSummarySchema>;
export type RcaTimelineItem = z.infer<typeof rcaTimelineItemSchema>;
export type RcaTimeline = z.infer<typeof rcaTimelineSchema>;
export type RcaIssueItem = z.infer<typeof rcaIssueItemSchema>;
export type RcaIssueQueueItem = z.infer<typeof rcaIssueQueueItemSchema>;
export type RcaIssueList = z.infer<typeof rcaIssueListSchema>;
export type ResourceIssueItem = z.infer<typeof resourceIssueItemSchema>;
export type ResourceIssueList = z.infer<typeof resourceIssueListSchema>;

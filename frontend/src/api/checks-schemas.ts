import { z } from "zod";

const availabilitySchema = z.enum(["available", "partial", "unavailable"]);
const observedAvailabilitySchema = z.enum(["available", "partial"]);
const freshnessSchema = z.enum(["live", "stale", "partial", "disconnected"]);
const severitySchema = z.enum(["warning", "danger"]);
const reasonsSchema = z.array(z.string().min(1));
const requiredReasonsSchema = reasonsSchema.min(1);

export const checksClusterScopeSchema = z.strictObject({
  workspace_id: z.string().min(1),
  cluster_id: z.string().min(1),
  namespaces: z.array(z.string().min(1)),
  freshness: freshnessSchema,
});

export const checksScopeCoverageSchema = z.strictObject({
  availability: availabilitySchema,
  scopes: z.array(checksClusterScopeSchema),
  observed_at: z.string().min(1).nullable(),
  reason_codes: reasonsSchema,
}).superRefine((value, context) => {
  if (value.availability !== "available" && value.reason_codes.length === 0) {
    context.addIssue({ code: "custom", message: "incomplete checks scope requires reasons" });
  }
});

const resourceSchema = z.strictObject({
  api_group: z.string(),
  version: z.string(),
  kind: z.string().min(1),
  namespace: z.string().min(1).nullable(),
  name: z.string().min(1),
  uid: z.string().min(1),
});

export const checksFindingSchema = z.strictObject({
  finding_id: z.string().min(1).max(253),
  cluster_id: z.string().min(1),
  check_id: z.string().min(1).max(253),
  category: z.string().min(1),
  severity: severitySchema,
  message: z.string().min(1),
  resource: resourceSchema,
});

const observedResultSetSchema = z.strictObject({
  availability: observedAvailabilitySchema,
  evaluated_at: z.string().min(1),
  checks: z.array(checksFindingSchema),
  total_check_count: z.number().int().nonnegative(),
  total_finding_count: z.number().int().nonnegative(),
  reason_codes: reasonsSchema,
}).superRefine((value, context) => {
  if (value.total_finding_count !== value.checks.length) {
    context.addIssue({ code: "custom", message: "finding count must match checks" });
  }
  if (value.availability === "available" && value.reason_codes.length > 0) {
    context.addIssue({ code: "custom", message: "available checks cannot carry reasons" });
  }
  if (value.availability === "partial" && value.reason_codes.length === 0) {
    context.addIssue({ code: "custom", message: "partial checks require reasons" });
  }
});

const unavailableResultSetSchema = z.strictObject({
  availability: z.literal("unavailable"),
  evaluated_at: z.null(),
  checks: z.null(),
  total_check_count: z.null(),
  total_finding_count: z.null(),
  reason_codes: requiredReasonsSchema,
});

export const checksResultSetSchema = z.union([
  observedResultSetSchema,
  unavailableResultSetSchema,
]);

export const checksCatalogEntrySchema = z.strictObject({
  check_id: z.string().min(1).max(253),
  title: z.string().min(1),
  category: z.string().min(1),
  severity: severitySchema,
  description: z.string().min(1),
  remediation: z.string().min(1),
});

const observedCatalogSchema = z.strictObject({
  availability: observedAvailabilitySchema,
  entries: z.array(checksCatalogEntrySchema),
  reason_codes: reasonsSchema,
}).superRefine((value, context) => {
  if (value.availability === "available" && value.reason_codes.length > 0) {
    context.addIssue({ code: "custom", message: "available catalog cannot carry reasons" });
  }
  if (value.availability === "partial" && value.reason_codes.length === 0) {
    context.addIssue({ code: "custom", message: "partial catalog requires reasons" });
  }
});

const unavailableCatalogSchema = z.strictObject({
  availability: z.literal("unavailable"),
  entries: z.null(),
  reason_codes: requiredReasonsSchema,
});

export const checksCatalogSchema = z.union([observedCatalogSchema, unavailableCatalogSchema]);

export const checksVisibilitySchema = z.strictObject({
  cluster_id: z.string().min(1),
  state: z.enum(["ok", "limited", "degraded"]),
  namespace_scope: z.array(z.string().min(1)),
  core: z.record(z.string().min(1), z.enum(["allowed", "namespace_limited", "unavailable"])),
  missing_optional_kinds: z.array(z.string().min(1)),
});

export const checksVisibilitySummarySchema = z.strictObject({
  availability: availabilitySchema,
  clusters: z.array(checksVisibilitySchema),
  reason_codes: reasonsSchema,
}).superRefine((value, context) => {
  if (value.availability === "available" && value.reason_codes.length > 0) {
    context.addIssue({ code: "custom", message: "available visibility cannot carry reasons" });
  }
  if (value.availability !== "available" && value.reason_codes.length === 0) {
    context.addIssue({ code: "custom", message: "incomplete visibility requires reasons" });
  }
});

export const checksOverviewSchema = z.strictObject({
  scope_coverage: checksScopeCoverageSchema,
  result_set: checksResultSetSchema,
  catalog: checksCatalogSchema,
  visibility: checksVisibilitySummarySchema,
});

const observedDetailSchema = z.strictObject({
  requested_check_id: z.string().min(1).max(253),
  availability: observedAvailabilitySchema,
  title: z.string().min(1),
  category: z.string().min(1),
  effective_severity: severitySchema,
  message: z.string().min(1),
  remediation: z.string().min(1),
  affected_resource_count: z.number().int().nonnegative(),
  findings: z.array(checksFindingSchema),
  reason_codes: reasonsSchema,
}).superRefine((value, context) => {
  if (value.affected_resource_count !== value.findings.length) {
    context.addIssue({ code: "custom", message: "affected count must match findings" });
  }
  if (value.availability === "available" && value.reason_codes.length > 0) {
    context.addIssue({ code: "custom", message: "available detail cannot carry reasons" });
  }
  if (value.availability === "partial" && value.reason_codes.length === 0) {
    context.addIssue({ code: "custom", message: "partial detail requires reasons" });
  }
});

const unavailableDetailSchema = z.strictObject({
  requested_check_id: z.string().min(1).max(253),
  availability: z.literal("unavailable"),
  title: z.null(),
  category: z.null(),
  effective_severity: z.null(),
  message: z.null(),
  remediation: z.null(),
  affected_resource_count: z.null(),
  findings: z.null(),
  reason_codes: requiredReasonsSchema,
});

export const checksDetailSchema = z.union([observedDetailSchema, unavailableDetailSchema]);

export const checksDetailResponseSchema = z.strictObject({
  scope_coverage: checksScopeCoverageSchema,
  detail: checksDetailSchema,
});

export const checksSettingsPolicySchema = z.strictObject({
  hidden_check_ids: z.array(z.string().min(1).max(253)).max(200),
  hidden_categories: z.array(z.string().min(1).max(253)).max(200),
  hidden_namespaces: z.array(z.string().min(3).max(507)).max(200),
});

export const checksSettingsSchema = z.strictObject({
  workspace_id: z.string().min(1),
  user_id: z.string().min(1),
  policy: checksSettingsPolicySchema,
  revision: z.number().int().nonnegative(),
  invalidation_generation: z.number().int().nonnegative(),
  can_edit: z.boolean(),
  updated_at: z.string().min(1).nullable(),
});

export const checksSettingsUpdateSchema = checksSettingsSchema.extend({
  event_id: z.string().min(1),
  audit_event_id: z.string().min(1),
});

export type ChecksOverviewEndpoint = z.infer<typeof checksOverviewSchema>;
export type ChecksDetailEndpoint = z.infer<typeof checksDetailResponseSchema>;
export type ChecksSettingsEndpoint = z.infer<typeof checksSettingsSchema>;
export type ChecksSettingsUpdateEndpoint = z.infer<typeof checksSettingsUpdateSchema>;

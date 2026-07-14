import { z } from "zod";

import {
  filterCountCompletenessSchema,
  rfc3339TimestampSchema,
} from "./resource-filter-schemas";

const nullableTimestampSchema = rfc3339TimestampSchema.nullable();
const nullableTextSchema = z.string().min(1).nullable();

export const applicationHealthSchema = z.strictObject({
  status: z.enum(["healthy", "degraded", "unknown"]),
  ready_pods: z.number().int().nonnegative().nullable(),
  total_pods: z.number().int().nonnegative().nullable(),
  restarts: z.number().int().nonnegative().nullable(),
}).superRefine((health, context) => {
  if (
    health.ready_pods !== null &&
    health.total_pods !== null &&
    health.ready_pods > health.total_pods
  ) {
    context.addIssue({
      code: "custom",
      message: "ready pods cannot exceed total pods",
      path: ["ready_pods"],
    });
  }
});

export const applicationCurrentDeploymentSchema = z.strictObject({
  version: nullableTextSchema,
  image: nullableTextSchema,
  image_digest: nullableTextSchema,
  git_sha: nullableTextSchema,
  deployed_at: nullableTimestampSchema,
  deployed_by: nullableTextSchema,
});

export const applicationResourceCountSchema = z.strictObject({
  kind: z.string().min(1),
  count: z.number().int().nonnegative(),
});

export const applicationCatalogItemSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  environments: z.array(z.string().min(1)),
  lifecycle_status: z.string().min(1),
  health: applicationHealthSchema,
  current_deployment: applicationCurrentDeploymentSchema.nullable(),
  has_drift: z.boolean().nullable(),
  drift_summary: nullableTextSchema,
  resource_counts: z.array(applicationResourceCountSchema).nullable(),
  resource_counts_completeness: filterCountCompletenessSchema,
  open_incidents: z.number().int().nonnegative().nullable(),
  repository_ref: nullableTextSchema,
  default_branch: nullableTextSchema,
  manifest_path: nullableTextSchema,
}).superRefine((item, context) => {
  if (item.has_drift !== true && item.drift_summary !== null) {
    context.addIssue({
      code: "custom",
      message: "an in-sync application cannot have a drift summary",
      path: ["drift_summary"],
    });
  }
  if (item.has_drift === true && item.drift_summary === null) {
    context.addIssue({
      code: "custom",
      message: "confirmed drift requires a summary",
      path: ["drift_summary"],
    });
  }
  if (item.resource_counts_completeness === "unavailable" && item.resource_counts !== null) {
    context.addIssue({
      code: "custom",
      message: "unavailable resource counts must be null",
      path: ["resource_counts"],
    });
  }
  if (item.resource_counts_completeness !== "unavailable" && item.resource_counts === null) {
    context.addIssue({
      code: "custom",
      message: "available resource counts must be an array",
      path: ["resource_counts"],
    });
  }
  const kinds = item.resource_counts?.map((count) => count.kind) ?? [];
  if (kinds.some((kind, index) => index > 0 && kind <= kinds[index - 1]!)) {
    context.addIssue({
      code: "custom",
      message: "resource count kinds must be unique and sorted",
      path: ["resource_counts"],
    });
  }
});

export const applicationCatalogSchema = z.strictObject({
  applications: z.array(applicationCatalogItemSchema),
});

export const applicationEndpointSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.string().min(1),
  name: z.string().min(1),
  url: z.string().min(1),
});

export const applicationActivitySchema = z.strictObject({
  id: z.string().min(1),
  type: z.enum(["deployment", "incident", "change"]),
  summary: nullableTextSchema,
  occurred_at: nullableTimestampSchema,
});

export const applicationIncidentPreviewSchema = z.strictObject({
  id: z.string().min(1),
  title: nullableTextSchema,
  status: z.string().min(1),
  started_at: nullableTimestampSchema,
});

export const applicationDetailItemSchema = applicationCatalogItemSchema.extend({
  endpoints: z.array(applicationEndpointSchema).nullable(),
  endpoints_completeness: filterCountCompletenessSchema,
  recent_activity: z.array(applicationActivitySchema).max(3),
  recent_incidents: z.array(applicationIncidentPreviewSchema).max(3),
}).superRefine((item, context) => {
  if (item.endpoints_completeness === "unavailable" && item.endpoints !== null) {
    context.addIssue({ code: "custom", message: "unavailable endpoints must be null", path: ["endpoints"] });
  }
  if (item.endpoints_completeness !== "unavailable" && item.endpoints === null) {
    context.addIssue({ code: "custom", message: "available endpoints must be an array", path: ["endpoints"] });
  }
});

export const applicationDetailSchema = z.strictObject({
  application: applicationDetailItemSchema,
});

export const applicationDeploymentSchema = z.strictObject({
  id: z.string().min(1),
  environment: nullableTextSchema,
  cluster_id: z.string().min(1),
  git_sha: nullableTextSchema,
  version: nullableTextSchema,
  deployed_at: nullableTimestampSchema,
  deployed_by: nullableTextSchema,
  status: z.enum(["succeeded", "failed", "running", "pending", "unknown"]),
  gitops_change_id: nullableTextSchema,
});

export const applicationDeploymentHistorySchema = z.strictObject({
  deployments: z.array(applicationDeploymentSchema),
});

const driftValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const applicationDriftDifferenceSchema = z.strictObject({
  resource: z.string().min(1),
  field_path: z.string().min(1),
  old_value: driftValueSchema,
  new_value: driftValueSchema,
  value_redacted: z.boolean(),
  changed_by: nullableTextSchema,
  changed_at: nullableTimestampSchema,
}).superRefine((difference, context) => {
  if (
    difference.value_redacted &&
    (difference.old_value !== null || difference.new_value !== null)
  ) {
    context.addIssue({
      code: "custom",
      message: "redacted values must be null",
      path: ["value_redacted"],
    });
  }
});

export const applicationDriftSchema = z.strictObject({
  status: z.enum(["in_sync", "drifted", "unknown"]),
  summary: nullableTextSchema,
  differences: z.array(applicationDriftDifferenceSchema),
  observed_at: nullableTimestampSchema,
}).superRefine((drift, context) => {
  if (drift.status !== "drifted" && (drift.differences.length > 0 || drift.summary !== null)) {
    context.addIssue({
      code: "custom",
      message: "non-drift responses cannot contain evidence",
      path: ["differences"],
    });
  }
  if (drift.status === "drifted" && (drift.differences.length === 0 || drift.summary === null)) {
    context.addIssue({
      code: "custom",
      message: "drifted responses must contain evidence",
      path: ["differences"],
    });
  }
});

export type ApplicationCatalogEndpoint = z.infer<typeof applicationCatalogSchema>;
export type ApplicationCatalogEndpointItem = z.infer<typeof applicationCatalogItemSchema>;
export type ApplicationDetailEndpoint = z.infer<typeof applicationDetailSchema>;
export type ApplicationDetailEndpointItem = z.infer<typeof applicationDetailItemSchema>;
export type ApplicationDeploymentHistoryEndpoint = z.infer<typeof applicationDeploymentHistorySchema>;
export type ApplicationDriftEndpoint = z.infer<typeof applicationDriftSchema>;

import { z } from "zod";

import { workloadDetailResourceRefSchema } from "./workload-resource-ref-schemas";

const safeIntegerSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const signedSafeIntegerSchema = z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
const quantitySchema = z.strictObject({
  unit: z.enum(["millicores", "bytes"]),
  value: safeIntegerSchema,
});
const provenanceSchema = z.strictObject({
  collector: z.string().min(1).max(120),
  algorithm_revision: z.string().min(1).max(120),
  source_revision: z.string().min(1).max(160),
  window_started_at: z.string().min(1),
  window_ended_at: z.string().min(1),
  sample_interval_seconds: z.number().int().min(1).max(86_400),
});
const metricSchema = z.strictObject({
  container: z.string().min(1).max(253),
  resource: z.enum(["cpu", "memory"]),
  fit: z.enum(["balanced", "oversized", "under_requested", "missing_request", "insufficient_history"]),
  action: z.enum(["increase", "reduction", "review", "in_range", "need_data"]),
  confidence: z.enum(["high", "medium", "low", "none"]),
  current_request: quantitySchema.nullable(),
  observed_demand: quantitySchema.nullable(),
  recommended_request: quantitySchema.nullable(),
  sample_count: safeIntegerSchema,
  expected_samples: safeIntegerSchema,
  coverage_basis_points: z.number().int().min(0).max(10_000),
  signals: z.array(z.enum(["hpa", "oom", "bursty", "throttling", "query_error", "history_incomplete"])),
  reason_codes: z.array(z.string().min(1)),
}).superRefine((metric, context) => {
  const unit = metric.resource === "cpu" ? "millicores" : "bytes";
  if ([metric.current_request, metric.observed_demand, metric.recommended_request]
    .some((quantity) => quantity !== null && quantity.unit !== unit)) {
    context.addIssue({ code: "custom", message: "quantity unit must match resource" });
  }
  if ((metric.action === "increase" || metric.action === "reduction") && metric.recommended_request === null) {
    context.addIssue({ code: "custom", message: "actionable result requires recommendation" });
  }
  if (metric.sample_count > metric.expected_samples) {
    context.addIssue({ code: "custom", message: "sample count exceeds expected samples" });
  }
  if (new Set(metric.signals).size !== metric.signals.length) {
    context.addIssue({ code: "custom", message: "signals must be unique" });
  }
});
export const rightsizingObservedWorkloadSchema = z.strictObject({
  availability: z.enum(["available", "partial"]),
  resource: workloadDetailResourceRefSchema,
  observed_at: z.string().min(1),
  freshness: z.enum(["live", "stale", "partial", "disconnected"]),
  provenance: provenanceSchema,
  replicas: z.number().int().min(0).max(100_000),
  scaled_to_zero: z.boolean(),
  classification: z.enum(["increase", "reduction", "review", "in_range", "need_data"]),
  impact: z.strictObject({
    replicas: z.number().int().min(0).max(100_000),
    cpu_millicores_change: signedSafeIntegerSchema,
    memory_bytes_change: signedSafeIntegerSchema,
  }),
  rows: z.array(metricSchema).min(1).max(400),
  reason_codes: z.array(z.string().min(1)),
}).superRefine((workload, context) => {
  if (workload.availability === "partial" && workload.reason_codes.length === 0) {
    context.addIssue({ code: "custom", message: "partial evidence requires reasons" });
  }
  if (workload.impact.replicas !== workload.replicas) {
    context.addIssue({ code: "custom", message: "impact replicas must match workload" });
  }
  if (workload.scaled_to_zero &&
    (workload.impact.cpu_millicores_change !== 0 || workload.impact.memory_bytes_change !== 0)) {
    context.addIssue({ code: "custom", message: "scaled-to-zero impact must remain zero" });
  }
  const identities = workload.rows.map((row) => `${row.container}\u0000${row.resource}`);
  if (new Set(identities).size !== identities.length) {
    context.addIssue({ code: "custom", message: "container resource rows must be unique" });
  }
});
const unavailableSchema = z.strictObject({
  availability: z.literal("unavailable"),
  reason_codes: z.array(z.string().min(1)).min(1),
}).superRefine((value, context) => {
  if (new Set(value.reason_codes).size !== value.reason_codes.length) {
    context.addIssue({ code: "custom", message: "unavailable reasons must be unique" });
  }
});
const observedScanSchema = z.strictObject({
  availability: z.enum(["available", "partial"]),
  observed_at: z.string().min(1),
  provenance: provenanceSchema,
  coverage: z.strictObject({
    workloads_discovered: safeIntegerSchema,
    workloads_evaluated: safeIntegerSchema,
    workloads_with_data: safeIntegerSchema,
    truncated: z.boolean(),
  }),
  workloads: z.array(rightsizingObservedWorkloadSchema).max(200),
  failures: z.array(z.strictObject({
    resource: workloadDetailResourceRefSchema.nullable(),
    reason_code: z.string().min(1).max(160),
  })).max(200),
  reason_codes: z.array(z.string().min(1)),
}).superRefine((scan, context) => {
  if (scan.availability === "partial" && scan.reason_codes.length === 0) {
    context.addIssue({ code: "custom", message: "partial scan requires reasons" });
  }
  if (scan.availability === "available" && scan.failures.length > 0) {
    context.addIssue({ code: "custom", message: "available scan cannot contain failures" });
  }
  if (!(scan.coverage.workloads_with_data <= scan.coverage.workloads_evaluated &&
    scan.coverage.workloads_evaluated <= scan.coverage.workloads_discovered)) {
    context.addIssue({ code: "custom", message: "coverage counts must be monotonic" });
  }
  const uids = scan.workloads.map((workload) => workload.resource.uid);
  if (new Set(uids).size !== uids.length) {
    context.addIssue({ code: "custom", message: "workloads must be unique" });
  }
});
export const rightsizingWorkloadEvidenceSchema = z.union([
  rightsizingObservedWorkloadSchema,
  unavailableSchema,
]);
export const rightsizingScanSchema = z.strictObject({
  scope: z.strictObject({
    workspace_id: z.string().min(1),
    cluster_id: z.string().min(1),
    namespaces: z.array(z.string().min(1)),
    freshness: z.enum(["live", "stale", "partial", "disconnected"]),
  }),
  namespace_scope: z.array(z.string().min(1)).max(100),
  result: z.union([
    unavailableSchema,
    observedScanSchema,
  ]),
  refresh_after_seconds: z.number().int().min(1).max(3600),
}).superRefine((scan, context) => {
  if (new Set(scan.namespace_scope).size !== scan.namespace_scope.length ||
    [...scan.namespace_scope].sort().some((value, index) => value !== scan.namespace_scope[index])) {
    context.addIssue({ code: "custom", message: "namespace scope must be unique and sorted" });
  }
  if (scan.scope.namespaces.length !== scan.namespace_scope.length ||
    scan.scope.namespaces.some((value, index) => value !== scan.namespace_scope[index])) {
    context.addIssue({ code: "custom", message: "scope namespaces must match request scope" });
  }
});

export type RightsizingScanEndpoint = z.infer<typeof rightsizingScanSchema>;

import { z } from "zod";

const jsonMapSchema = z.record(z.string(), z.unknown());

const inventoryResourceCountForbiddenSchema = z.strictObject({
  namespace: z.string().min(1).nullable(),
  api_group: z.string(),
  version: z.string().min(1),
  resource: z.string().min(1),
  kind: z.string().min(1),
  namespaced: z.boolean(),
  reason_code: z.literal("list_permission_not_observed"),
});

const inventoryResourceCountsEvidenceSchema = z.strictObject({
  completeness: z.enum(["observed", "partial", "unavailable"]),
  observed_at: z.string().nullable(),
  namespace_scope: z.array(z.string()),
  reason_codes: z.array(z.string()),
  forbidden: z.array(inventoryResourceCountForbiddenSchema),
}).superRefine((value, context) => {
  const observed = value.completeness === "observed";
  if (observed && (value.observed_at === null || value.reason_codes.length > 0)) {
    context.addIssue({ code: "custom", message: "observed counts evidence is inconsistent" });
  }
  if (!observed && value.reason_codes.length === 0) {
    context.addIssue({ code: "custom", message: "incomplete counts evidence requires reasons" });
  }
  if (value.completeness === "unavailable"
    && (value.observed_at !== null || value.forbidden.length > 0)) {
    context.addIssue({ code: "custom", message: "unavailable counts evidence is inconsistent" });
  }
});

/** Runtime contract for `GET /clusters/{cluster_id}/inventory/summary`. */
export const inventorySummarySchema = z.strictObject({
  cluster_id: z.string(),
  latest_snapshot: jsonMapSchema.nullable(),
  counts: z.array(jsonMapSchema),
  counts_evidence: inventoryResourceCountsEvidenceSchema,
});

export type InventorySummary = z.infer<typeof inventorySummarySchema>;

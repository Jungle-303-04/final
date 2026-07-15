import { z } from "zod";

const availabilitySchema = z.enum(["available", "partial", "unavailable"]);
const freshnessSchema = z.enum(["live", "stale", "partial", "disconnected"]);
const reasonCodesSchema = z.array(z.string().min(1)).min(1);

export const costClusterScopeSchema = z.strictObject({
  workspace_id: z.string().min(1),
  cluster_id: z.string().min(1),
  namespaces: z.array(z.string().min(1)),
  freshness: freshnessSchema,
});

export const costScopeCoverageSchema = z.strictObject({
  availability: availabilitySchema,
  scopes: z.array(costClusterScopeSchema),
  observed_at: z.string().min(1).nullable(),
  reason_codes: z.array(z.string().min(1)),
}).superRefine((value, context) => {
  if (value.availability !== "available" && value.reason_codes.length === 0) {
    context.addIssue({ code: "custom", message: "incomplete cost scope requires reasons" });
  }
});

export const costObservationStatusSchema = z.strictObject({
  availability: z.literal("unavailable"),
  observed_at: z.null(),
  currency: z.null(),
  data_window: z.null(),
  reason_codes: reasonCodesSchema,
});

export const costObservationSummarySchema = z.strictObject({
  availability: z.literal("unavailable"),
  hourly_cost: z.null(),
  monthly_projection: z.null(),
  storage_cost: z.null(),
  idle_cost: z.null(),
  efficiency: z.null(),
  savings_recommendations: z.null(),
  reason_codes: reasonCodesSchema,
});

export const costOverviewSchema = z.strictObject({
  scope_coverage: costScopeCoverageSchema,
  observation: costObservationStatusSchema,
  summary: costObservationSummarySchema,
  refresh_after_seconds: z.number().int().min(1).max(3600),
});

export type CostOverviewEndpoint = z.infer<typeof costOverviewSchema>;

import { z } from "zod";

const availabilitySchema = z.enum(["available", "partial", "unavailable"]);
const freshnessSchema = z.enum(["live", "stale", "partial", "disconnected"]);
const reasonCodesSchema = z.array(z.string().min(1)).min(1);

export const trafficClusterScopeSchema = z.strictObject({
  workspace_id: z.string().min(1),
  cluster_id: z.string().min(1),
  namespaces: z.array(z.string().min(1)),
  freshness: freshnessSchema,
});

export const trafficScopeCoverageSchema = z.strictObject({
  availability: availabilitySchema,
  scopes: z.array(trafficClusterScopeSchema),
  observed_at: z.string().min(1).nullable(),
  reason_codes: z.array(z.string().min(1)),
}).superRefine((value, context) => {
  if (value.availability !== "available" && value.reason_codes.length === 0) {
    context.addIssue({ code: "custom", message: "incomplete traffic scope requires reasons" });
  }
});

export const trafficObservationStatusSchema = z.strictObject({
  availability: z.literal("unavailable"),
  observed_at: z.null(),
  reason_codes: reasonCodesSchema,
});

export const trafficObservationSummarySchema = z.strictObject({
  availability: z.literal("unavailable"),
  total_flow_count: z.null(),
  denied_flow_count: z.null(),
  external_flow_count: z.null(),
  reason_codes: reasonCodesSchema,
});

export const trafficRelationshipsSchema = z.strictObject({
  availability: z.literal("unavailable"),
  edges: z.null(),
  reason_codes: reasonCodesSchema,
});

export const trafficOverviewSchema = z.strictObject({
  scope_coverage: trafficScopeCoverageSchema,
  observation: trafficObservationStatusSchema,
  summary: trafficObservationSummarySchema,
  relationships: trafficRelationshipsSchema,
});

export type TrafficOverviewEndpoint = z.infer<typeof trafficOverviewSchema>;

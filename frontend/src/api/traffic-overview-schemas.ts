import { z } from "zod";

const availabilitySchema = z.enum(["available", "partial", "unavailable"]);
const observedAvailabilitySchema = z.enum(["available", "partial"]);
const freshnessSchema = z.enum(["live", "stale", "partial", "disconnected"]);
const reasonCodesSchema = z.array(z.string().min(1)).min(1);
const observedReasonCodesSchema = z.array(z.string().min(1));

export const trafficSinceSchema = z.enum(["1m", "5m", "15m", "1h"]);
export const trafficSortSchema = z.enum(["connections", "last_seen", "source", "destination"]);
export const trafficSortOrderSchema = z.enum(["asc", "desc"]);
export const trafficProtocolSchema = z.enum(["tcp", "udp", "http", "grpc", "dns", "unknown"]);
export const trafficVerdictSchema = z.enum(["forwarded", "dropped", "error", "unknown"]);

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

const trafficUnavailableObservationStatusSchema = z.strictObject({
  availability: z.literal("unavailable"),
  observed_at: z.null(),
  reason_codes: reasonCodesSchema,
});

const trafficObservedObservationStatusSchema = z.strictObject({
  availability: observedAvailabilitySchema,
  observed_at: z.string().min(1),
  since: trafficSinceSchema,
  source_keys: z.array(z.string().min(1)).min(1).max(16),
  reason_codes: observedReasonCodesSchema,
}).superRefine(partialRequiresReason);

export const trafficObservationStatusSchema = z.union([
  trafficObservedObservationStatusSchema,
  trafficUnavailableObservationStatusSchema,
]);

const trafficUnavailableObservationSummarySchema = z.strictObject({
  availability: z.literal("unavailable"),
  total_flow_count: z.null(),
  denied_flow_count: z.null(),
  external_flow_count: z.null(),
  reason_codes: reasonCodesSchema,
});

const trafficObservedObservationSummarySchema = z.strictObject({
  availability: observedAvailabilitySchema,
  total_flow_count: z.number().int().nonnegative().safe(),
  denied_flow_count: z.number().int().nonnegative().safe(),
  external_flow_count: z.number().int().nonnegative().safe(),
  reason_codes: observedReasonCodesSchema,
}).superRefine((value, context) => {
  partialRequiresReason(value, context);
  if (value.denied_flow_count > value.total_flow_count) {
    context.addIssue({ code: "custom", message: "denied count exceeds total" });
  }
  if (value.external_flow_count > value.total_flow_count) {
    context.addIssue({ code: "custom", message: "external count exceeds total" });
  }
});

export const trafficObservationSummarySchema = z.union([
  trafficObservedObservationSummarySchema,
  trafficUnavailableObservationSummarySchema,
]);

export const trafficEndpointSchema = z.strictObject({
  cluster_id: z.string().min(1),
  name: z.string().min(1).max(512),
  namespace: z.string().max(253).nullable(),
  kind: z.string().min(1).max(120),
  workload: z.string().max(253).nullable(),
  service: z.string().max(253).nullable(),
  ip: z.string().max(255).nullable(),
  identity_stability: z.literal("provider_observed"),
});

export const trafficRelationshipSchema = z.strictObject({
  flow_id: z.string().min(1).max(128),
  source_key: z.string().min(1).max(80),
  source: trafficEndpointSchema,
  target: trafficEndpointSchema,
  protocol: trafficProtocolSchema,
  port: z.number().int().min(1).max(65_535).nullable(),
  verdict: trafficVerdictSchema,
  connections: z.number().int().nonnegative().safe(),
  bytes_sent: z.number().int().nonnegative().safe().nullable(),
  bytes_received: z.number().int().nonnegative().safe().nullable(),
  observed_at: z.string().min(1),
});

const trafficFlowFacetsSchema = z.strictObject({
  protocols: z.array(z.strictObject({
    value: trafficProtocolSchema,
    count: z.number().int().positive().safe(),
  })).max(6),
  verdicts: z.array(z.strictObject({
    value: trafficVerdictSchema,
    count: z.number().int().positive().safe(),
  })).max(4),
});

const trafficUnavailableRelationshipsSchema = z.strictObject({
  availability: z.literal("unavailable"),
  edges: z.null(),
  reason_codes: reasonCodesSchema,
});

const trafficObservedRelationshipsSchema = z.strictObject({
  availability: observedAvailabilitySchema,
  edges: z.array(trafficRelationshipSchema).max(200),
  total_count: z.number().int().nonnegative().safe(),
  has_more: z.boolean(),
  next_cursor: z.string().min(1).max(8192).nullable(),
  facets: trafficFlowFacetsSchema,
  reason_codes: observedReasonCodesSchema,
}).superRefine((value, context) => {
  partialRequiresReason(value, context);
  if (value.edges.length > value.total_count) {
    context.addIssue({ code: "custom", message: "flow page exceeds total" });
  }
  if (value.has_more !== (value.next_cursor !== null)) {
    context.addIssue({ code: "custom", message: "flow cursor is inconsistent" });
  }
});

export const trafficRelationshipsSchema = z.union([
  trafficObservedRelationshipsSchema,
  trafficUnavailableRelationshipsSchema,
]);

export const trafficOverviewSchema = z.strictObject({
  scope_coverage: trafficScopeCoverageSchema,
  observation: trafficObservationStatusSchema,
  summary: trafficObservationSummarySchema,
  relationships: trafficRelationshipsSchema,
  refresh_after_seconds: z.number().int().min(1).max(3_600),
});

export type TrafficOverviewEndpoint = z.infer<typeof trafficOverviewSchema>;

function partialRequiresReason(
  value: { availability: "available" | "partial"; reason_codes: string[] },
  context: z.RefinementCtx,
) {
  if (value.availability === "partial" && value.reason_codes.length === 0) {
    context.addIssue({ code: "custom", message: "partial traffic observation requires reasons" });
  }
}

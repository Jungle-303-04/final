import { z } from "zod";

const availabilitySchema = z.enum(["available", "partial", "unavailable"]);
const nullableTextSchema = z.string().min(1).nullable();

export const helmClusterScopeSchema = z.strictObject({
  workspace_id: z.string().min(1),
  cluster_id: z.string().min(1),
  namespaces: z.array(z.string().min(1)),
  freshness: z.enum(["live", "stale", "partial", "disconnected"]),
});

export const helmResourceRefSchema = z.strictObject({
  api_group: z.string(),
  version: z.string(),
  kind: z.string().min(1),
  namespace: nullableTextSchema,
  name: z.string().min(1),
  uid: z.string().min(1),
});

export const helmUnavailableFeatureSchema = z.strictObject({
  availability: z.literal("unavailable"),
  reason_code: z.string().min(1),
});

export const helmResourceHealthSchema = helmUnavailableFeatureSchema.extend({
  health: z.null(),
});

export const helmObservationCoverageSchema = z.strictObject({
  availability: availabilitySchema,
  observed_at: nullableTextSchema,
  reason_codes: z.array(z.string().min(1)),
}).superRefine((value, context) => {
  if (value.availability !== "available" && value.reason_codes.length === 0) {
    context.addIssue({ code: "custom", message: "incomplete Helm coverage requires reasons" });
  }
});

export const helmReleaseSchema = z.strictObject({
  scope: helmClusterScopeSchema,
  name: z.string().min(1),
  storage_namespace: z.string().min(1),
  storage: helmResourceRefSchema,
  chart: z.null(),
  app_version: z.null(),
  status: nullableTextSchema,
  revision: z.number().int().positive().nullable(),
  observed_at: nullableTextSchema,
  resource_health: helmResourceHealthSchema,
});

export const helmReleaseHistoryEntrySchema = z.strictObject({
  storage: helmResourceRefSchema,
  revision: z.number().int().positive().nullable(),
  status: nullableTextSchema,
  observed_at: nullableTextSchema,
});

export const helmReleaseListSchema = z.strictObject({
  releases: z.array(helmReleaseSchema),
  coverage: helmObservationCoverageSchema,
  refresh_after_seconds: z.number().int().min(1).max(3600),
});

export const helmReleaseDetailSchema = z.strictObject({
  refresh_after_seconds: z.number().int().min(1).max(3600),
  detail: z.strictObject({
    release: helmReleaseSchema,
    history: z.array(helmReleaseHistoryEntrySchema),
    manifest: helmUnavailableFeatureSchema,
    values: helmUnavailableFeatureSchema,
    owned_resources: helmUnavailableFeatureSchema,
    commands: helmUnavailableFeatureSchema,
  }),
});

export type HelmReleaseListEndpoint = z.infer<typeof helmReleaseListSchema>;
export type HelmReleaseDetailEndpoint = z.infer<typeof helmReleaseDetailSchema>;

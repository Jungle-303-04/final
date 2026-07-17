import { z } from "zod";

import { helmUpgradeTargetSchema } from "./helm-common-schemas";

const nullableObservedAtSchema = z.string().min(1).nullable();

export const helmChartSourceSchema = z.strictObject({
  source_id: z.string().min(1),
  provider: z.enum(["repository", "oci"]),
  name: z.string().min(1),
  reference: z.string().min(1),
  status: z.enum(["active", "disabled"]),
  actions: z.array(z.enum(["refresh", "delete"])).max(2),
  credentials_configured: z.boolean(),
  observed_at: nullableObservedAtSchema,
});

export const helmChartSourcePageSchema = z.strictObject({
  items: z.array(helmChartSourceSchema),
  limit: z.number().int().min(1).max(100),
  has_more: z.boolean(),
  next_cursor: z.string().min(1).max(4096).nullable(),
}).superRefine((value, context) => {
  if (value.has_more !== (value.next_cursor !== null)) {
    context.addIssue({
      code: "custom",
      message: "Helm chart source pagination is inconsistent",
      path: ["next_cursor"],
    });
  }
});

export type HelmChartSourceEndpoint = z.infer<typeof helmChartSourceSchema>;
export type HelmChartSourcePageEndpoint = z.infer<typeof helmChartSourcePageSchema>;

export const helmRepositoryRefreshSchema = z.strictObject({
  source_id: z.string().min(1).max(80),
  chart_count: z.number().int().nonnegative().max(50_000),
  observed_at: z.string().min(1),
  event_id: z.string().min(1),
  correlation_id: z.string().min(1),
});

export type HelmRepositoryRefreshEndpoint = z.infer<typeof helmRepositoryRefreshSchema>;

export const helmChartSummarySchema = z.strictObject({
  source: helmChartSourceSchema,
  name: z.string().min(1).max(512),
  version: z.string().min(1).max(256),
  app_version: z.string().max(256).nullable(),
  description: z.string().max(4096).nullable(),
  deprecated: z.boolean(),
});

export const helmChartCatalogPageSchema = z.strictObject({
  availability: z.enum(["available", "partial", "unavailable"]),
  items: z.array(helmChartSummarySchema).max(100),
  total: z.number().int().nonnegative().max(1_000_000),
  limit: z.number().int().min(1).max(100),
  query: z.string().max(200),
  source_id: z.string().min(1).max(80).nullable(),
  provider: z.enum(["repository", "oci"]).nullable(),
  all_versions: z.boolean(),
  observed_at: nullableObservedAtSchema,
  truncated: z.boolean(),
  reason_codes: z.array(z.string().min(1)),
}).superRefine((value, context) => {
  if (value.availability !== "available" && value.reason_codes.length === 0) {
    context.addIssue({ code: "custom", message: "Incomplete chart catalog requires reasons" });
  }
  if (value.availability === "unavailable" && (value.items.length > 0 || value.total > 0)) {
    context.addIssue({ code: "custom", message: "Unavailable chart catalog cannot contain results" });
  }
  if (value.total < value.items.length) {
    context.addIssue({ code: "custom", message: "Chart catalog total is inconsistent" });
  }
  if (value.truncated && !value.reason_codes.includes("helm_chart_catalog_truncated")) {
    context.addIssue({ code: "custom", message: "Truncated chart catalog requires a reason" });
  }
  if (value.source_id !== null && value.items.some((item) => item.source.source_id !== value.source_id)) {
    context.addIssue({ code: "custom", message: "Chart source filter is inconsistent" });
  }
});

const helmChartVersionSchema = z.strictObject({
  version: z.string().min(1).max(256),
  app_version: z.string().max(256).nullable(),
  deprecated: z.boolean(),
});

const helmChartValuesSchema = z.discriminatedUnion("availability", [
  z.strictObject({
    availability: z.literal("available"),
    schema: z.record(z.string(), z.unknown()),
  }),
  z.strictObject({
    availability: z.literal("unavailable"),
    schema: z.null(),
    reason_code: z.string().min(1).max(120),
  }),
]);

const helmChartInstallSchema = z.discriminatedUnion("availability", [
  z.strictObject({
    availability: z.literal("available"),
    target: helmUpgradeTargetSchema,
  }),
  z.strictObject({
    availability: z.literal("unavailable"),
    target: z.null(),
    reason_code: z.string().min(1).max(120),
  }),
]);

export const helmChartDetailSchema = z.strictObject({
  availability: z.enum(["available", "partial", "unavailable"]),
  chart: helmChartSummarySchema.nullable(),
  versions: z.array(helmChartVersionSchema).max(200),
  values_schema: helmChartValuesSchema,
  install: helmChartInstallSchema,
  observed_at: nullableObservedAtSchema,
  truncated: z.boolean(),
  reason_codes: z.array(z.string().min(1)),
}).superRefine((value, context) => {
  if (value.availability !== "available" && value.reason_codes.length === 0) {
    context.addIssue({ code: "custom", message: "Incomplete chart detail requires reasons" });
  }
  if (value.availability === "unavailable" && (value.chart !== null || value.versions.length > 0)) {
    context.addIssue({ code: "custom", message: "Unavailable chart detail cannot contain metadata" });
  }
  if (value.truncated && !value.reason_codes.includes("helm_chart_versions_truncated")) {
    context.addIssue({ code: "custom", message: "Truncated chart detail requires a reason" });
  }
});

export type HelmChartSummaryEndpoint = z.infer<typeof helmChartSummarySchema>;
export type HelmChartCatalogPageEndpoint = z.infer<typeof helmChartCatalogPageSchema>;
export type HelmChartDetailEndpoint = z.infer<typeof helmChartDetailSchema>;

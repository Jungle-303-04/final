import { z } from "zod";

import { helmChartSourceSchema } from "./helm-chart-sources-schemas";

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

const helmUpgradeScalarSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const helmUpgradeInputSchema = z.strictObject({
  name: z.string().min(1).max(253),
  value_type: z.enum(["string", "integer", "number", "boolean"]),
  required: z.boolean(),
  default: helmUpgradeScalarSchema,
  allowed_values: z.array(helmUpgradeScalarSchema),
}).superRefine((value, context) => {
  for (const candidate of [value.default, ...value.allowed_values]) {
    if (candidate !== null && !upgradeScalarMatches(value.value_type, candidate)) {
      context.addIssue({ code: "custom", message: "Helm upgrade input scalar type is inconsistent" });
    }
  }
});

export const helmReleaseCommandsSchema = z.strictObject({
  availability: z.literal("available"),
  actions: z.tuple([z.literal("upgrade"), z.literal("rollback"), z.literal("uninstall")]),
  confirmation_required: z.literal(true),
  realtime: z.literal(true),
  upgrade_targets: z.array(z.strictObject({
    item_id: z.string().min(1).max(120),
    name: z.string().min(1).max(120),
    version: z.string().min(1).max(80),
    chart_version: z.string().min(1).max(80),
    inputs: z.array(helmUpgradeInputSchema),
  })).min(1),
}).superRefine((value, context) => {
  const targets = value.upgrade_targets.map((item) => `${item.item_id}\u001f${item.version}`);
  if (new Set(targets).size !== targets.length) {
    context.addIssue({ code: "custom", message: "Helm upgrade targets must be unique" });
  }
  for (const target of value.upgrade_targets) {
    const names = target.inputs.map((item) => item.name);
    if (new Set(names).size !== names.length) {
      context.addIssue({ code: "custom", message: "Helm upgrade inputs must be unique" });
    }
  }
});

export const helmResourceHealthSchema = helmUnavailableFeatureSchema.extend({
  health: z.null(),
}).or(z.strictObject({
  availability: z.enum(["available", "partial"]),
  health: z.string().min(1),
  resource_count: z.number().int().nonnegative(),
  observed_at: nullableTextSchema,
  reason_codes: z.array(z.string().min(1)),
}).superRefine((value, context) => {
  if (value.availability === "partial" && value.reason_codes.length === 0) {
    context.addIssue({ code: "custom", message: "partial Helm resource health requires reasons" });
  }
}));

export const helmOwnedResourceSchema = z.strictObject({
  resource: helmResourceRefSchema,
  status: z.string().min(1),
  health: z.string().min(1),
  observed_at: nullableTextSchema,
});

export const helmOwnedResourcesSchema = helmUnavailableFeatureSchema.or(z.strictObject({
  availability: z.enum(["available", "partial"]),
  items: z.array(helmOwnedResourceSchema),
  observed_at: nullableTextSchema,
  truncated: z.boolean(),
  reason_codes: z.array(z.string().min(1)),
}).superRefine((value, context) => {
  if (value.availability === "partial" && value.reason_codes.length === 0) {
    context.addIssue({ code: "custom", message: "partial Helm owned resources require reasons" });
  }
  if (value.truncated && !value.reason_codes.includes("helm_owned_resources_truncated")) {
    context.addIssue({ code: "custom", message: "truncated Helm owned resources require a reason" });
  }
}));

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
  storage_resource_version: nullableTextSchema,
  chart: nullableTextSchema,
  chart_version: nullableTextSchema,
  chart_reason_codes: z.array(z.string().min(1)),
  app_version: z.null(),
  status: nullableTextSchema,
  revision: z.number().int().positive().nullable(),
  observed_at: nullableTextSchema,
  resource_health: helmResourceHealthSchema,
}).superRefine((value, context) => {
  if ((value.chart === null) !== (value.chart_version === null)) {
    context.addIssue({ code: "custom", message: "Helm chart identity is inconsistent" });
  }
  if (value.chart === null && value.chart_reason_codes.length === 0) {
    context.addIssue({ code: "custom", message: "Unavailable Helm chart identity requires reasons" });
  }
  if (value.chart !== null && value.chart_reason_codes.length > 0) {
    context.addIssue({ code: "custom", message: "Observed Helm chart identity cannot contain reasons" });
  }
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
  post_mutation_refresh_after_seconds: z.number().positive().max(60),
});

export const helmReleaseDetailSchema = z.strictObject({
  refresh_after_seconds: z.number().int().min(1).max(3600),
  post_mutation_refresh_after_seconds: z.number().positive().max(60),
  detail: z.strictObject({
    release: helmReleaseSchema,
    history: z.array(helmReleaseHistoryEntrySchema),
    manifest: helmUnavailableFeatureSchema,
    values: helmUnavailableFeatureSchema,
    owned_resources: helmOwnedResourcesSchema,
    commands: helmUnavailableFeatureSchema.or(helmReleaseCommandsSchema),
  }),
});

export const helmChartVersionSchema = z.strictObject({
  version: z.string().min(1).max(256),
  app_version: z.string().min(1).max(256).nullable(),
  deprecated: z.boolean(),
});

export const helmReleaseUpgradeInfoSchema = z.strictObject({
  availability: availabilitySchema,
  chart_name: nullableTextSchema,
  current_version: nullableTextSchema,
  latest_version: nullableTextSchema,
  update_available: z.boolean().nullable(),
  source: helmChartSourceSchema.nullable(),
  observed_at: nullableTextSchema,
  reason_codes: z.array(z.string().min(1)),
  refresh_after_seconds: z.number().int().min(1).max(3600),
}).superRefine((value, context) => {
  const complete = value.chart_name !== null
    && value.current_version !== null
    && value.latest_version !== null
    && value.update_available !== null
    && value.source !== null;
  if (value.availability === "unavailable" && (complete || value.reason_codes.length === 0)) {
    context.addIssue({ code: "custom", message: "Unavailable Helm upgrade info is inconsistent" });
  }
  if (value.availability !== "unavailable" && !complete) {
    context.addIssue({ code: "custom", message: "Helm upgrade info lacks exact source evidence" });
  }
  if (value.availability === "partial" && value.reason_codes.length === 0) {
    context.addIssue({ code: "custom", message: "Partial Helm upgrade info requires reasons" });
  }
  if (value.availability === "available" && value.reason_codes.length > 0) {
    context.addIssue({ code: "custom", message: "Available Helm upgrade info cannot contain reasons" });
  }
});

export const helmReleaseVersionListSchema = z.strictObject({
  availability: availabilitySchema,
  chart_name: nullableTextSchema,
  current_version: nullableTextSchema,
  source: helmChartSourceSchema.nullable(),
  versions: z.array(helmChartVersionSchema).max(200),
  observed_at: nullableTextSchema,
  truncated: z.boolean(),
  reason_codes: z.array(z.string().min(1)),
  refresh_after_seconds: z.number().int().min(1).max(3600),
}).superRefine((value, context) => {
  const complete = value.chart_name !== null
    && value.current_version !== null
    && value.source !== null
    && value.versions.length > 0;
  if (value.availability === "unavailable" && (value.versions.length > 0 || value.source !== null || value.reason_codes.length === 0)) {
    context.addIssue({ code: "custom", message: "Unavailable Helm versions are inconsistent" });
  }
  if (value.availability !== "unavailable" && !complete) {
    context.addIssue({ code: "custom", message: "Helm versions lack exact source evidence" });
  }
  if (value.availability === "partial" && value.reason_codes.length === 0) {
    context.addIssue({ code: "custom", message: "Partial Helm versions require reasons" });
  }
  if (value.availability === "available" && value.reason_codes.length > 0) {
    context.addIssue({ code: "custom", message: "Available Helm versions cannot contain reasons" });
  }
  if (value.truncated && !value.reason_codes.includes("helm_chart_versions_truncated")) {
    context.addIssue({ code: "custom", message: "Truncated Helm versions require a reason" });
  }
});

export const helmReleaseUpgradeBatchSchema = z.strictObject({
  releases: z.record(z.string().min(1), helmReleaseUpgradeInfoSchema),
  coverage: helmObservationCoverageSchema,
  truncated: z.boolean(),
  reason_codes: z.array(z.string().min(1)),
  refresh_after_seconds: z.number().int().min(1).max(3600),
}).superRefine((value, context) => {
  if (Object.keys(value.releases).length > 100) {
    context.addIssue({ code: "custom", message: "Helm upgrade batch exceeds its bound" });
  }
  if (value.truncated !== value.reason_codes.includes("helm_upgrade_batch_truncated")) {
    context.addIssue({ code: "custom", message: "Helm upgrade batch truncation is inconsistent" });
  }
});

export type HelmReleaseListEndpoint = z.infer<typeof helmReleaseListSchema>;
export type HelmReleaseDetailEndpoint = z.infer<typeof helmReleaseDetailSchema>;
export type HelmReleaseUpgradeInfoEndpoint = z.infer<typeof helmReleaseUpgradeInfoSchema>;
export type HelmReleaseVersionListEndpoint = z.infer<typeof helmReleaseVersionListSchema>;
export type HelmReleaseUpgradeBatchEndpoint = z.infer<typeof helmReleaseUpgradeBatchSchema>;

function upgradeScalarMatches(
  valueType: "string" | "integer" | "number" | "boolean",
  value: string | number | boolean,
): boolean {
  if (valueType === "string") return typeof value === "string";
  if (valueType === "integer") return typeof value === "number" && Number.isInteger(value);
  if (valueType === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === "boolean";
}

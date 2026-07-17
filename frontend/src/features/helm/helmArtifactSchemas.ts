import { z } from "zod";

const MAX_ARTIFACT_BYTES = 4 * 1024 * 1024;

export const helmArtifactKindSchema = z.enum([
  "manifest",
  "values",
  "manifest_diff",
  "values_diff",
  "notes_diff",
  "hooks_diff",
  "resources_diff",
]);

const commonArtifactShape = {
  namespace: z.string().min(1),
  release_name: z.string().min(1),
  revision: z.number().int().positive(),
  comparison_revision: z.number().int().positive().nullable(),
  all_values: z.boolean(),
  source_bytes: z.number().int().nonnegative(),
  redaction_applied: z.literal(true),
  truncated: z.boolean(),
};

const textArtifactSchema = z.strictObject({
  ...commonArtifactShape,
  artifact: z.enum([
    "manifest",
    "values",
    "manifest_diff",
    "values_diff",
    "notes_diff",
  ]),
  format: z.enum(["yaml", "unified_diff"]),
  content: z.string().max(MAX_ARTIFACT_BYTES),
  content_sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  content_bytes: z.number().int().nonnegative().max(MAX_ARTIFACT_BYTES),
}).superRefine((value, context) => {
  if (new TextEncoder().encode(value.content).byteLength !== value.content_bytes) {
    context.addIssue({ code: "custom", message: "Helm artifact byte count is invalid" });
  }
  const isDiff = value.artifact.endsWith("_diff");
  if (isDiff !== (value.comparison_revision !== null)) {
    context.addIssue({ code: "custom", message: "Helm artifact revisions are inconsistent" });
  }
  if (isDiff !== (value.format === "unified_diff")) {
    context.addIssue({ code: "custom", message: "Helm artifact format is inconsistent" });
  }
  if (value.all_values && value.artifact !== "values" && value.artifact !== "values_diff") {
    context.addIssue({ code: "custom", message: "Helm all-values evidence is inconsistent" });
  }
});

const hookDiffItemSchema = z.strictObject({
  api_version: z.string().max(253),
  kind: z.string().min(1).max(253),
  name: z.string().min(1).max(253),
  namespace: z.string().max(253),
  events: z.array(z.string().min(1)),
  weight: z.number().int(),
  delete_policies: z.array(z.string().min(1)),
  output_log_policies: z.array(z.string().min(1)),
  manifest_changed: z.boolean(),
});

const hooksDiffSchema = z.strictObject({
  revision1: z.number().int().positive(),
  revision2: z.number().int().positive(),
  added: z.array(hookDiffItemSchema),
  removed: z.array(hookDiffItemSchema),
  modified: z.array(hookDiffItemSchema),
  unchanged: z.array(hookDiffItemSchema),
  parse_error_count: z.number().int().nonnegative(),
});

const hooksArtifactSchema = z.strictObject({
  ...commonArtifactShape,
  artifact: z.literal("hooks_diff"),
  format: z.literal("structured"),
  all_values: z.literal(false),
  projection_sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  projection_bytes: z.number().int().nonnegative().max(MAX_ARTIFACT_BYTES),
  hooks_diff: hooksDiffSchema,
}).superRefine((value, context) => {
  validateStructuredArtifact(
    value,
    value.hooks_diff,
    value.projection_bytes,
    context,
  );
});

export const helmRenderedResourceRefSchema = z.strictObject({
  api_version: z.string().max(253),
  kind: z.string().min(1).max(253),
  name: z.string().min(1).max(253),
  namespace: z.string().max(253),
});

const resourceFieldValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const helmRenderedResourceChangeSchema = helmRenderedResourceRefSchema.extend({
  summary: z.string().max(1024),
  field_count: z.number().int().positive(),
  fields: z.array(z.strictObject({
    path: z.string().min(1).max(2048),
    old_value: resourceFieldValueSchema,
    new_value: resourceFieldValueSchema,
  })),
}).strict().superRefine((value, context) => {
  if (value.fields.length > value.field_count) {
    context.addIssue({
      code: "custom",
      message: "Retained Helm resource fields exceed the field count",
    });
  }
});

const resourcesDiffSchema = z.strictObject({
  revision1: z.number().int().positive(),
  revision2: z.number().int().positive(),
  added: z.array(helmRenderedResourceRefSchema),
  removed: z.array(helmRenderedResourceRefSchema),
  modified: z.array(helmRenderedResourceChangeSchema),
  unchanged: z.array(helmRenderedResourceRefSchema),
  parse_error_count: z.number().int().nonnegative(),
});

const resourcesArtifactSchema = z.strictObject({
  ...commonArtifactShape,
  artifact: z.literal("resources_diff"),
  format: z.literal("structured"),
  all_values: z.literal(false),
  projection_sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  projection_bytes: z.number().int().nonnegative().max(MAX_ARTIFACT_BYTES),
  resources_diff: resourcesDiffSchema,
}).superRefine((value, context) => {
  validateStructuredArtifact(
    value,
    value.resources_diff,
    value.projection_bytes,
    context,
  );
});

export const helmArtifactResultSchema = z.union([
  textArtifactSchema,
  hooksArtifactSchema,
  resourcesArtifactSchema,
]);

const helmValuesPreviewResourcesSchema = z.strictObject({
  added: z.array(helmRenderedResourceRefSchema),
  removed: z.array(helmRenderedResourceRefSchema),
  modified: z.array(helmRenderedResourceChangeSchema),
  unchanged: z.array(helmRenderedResourceRefSchema),
  parse_error_count: z.number().int().nonnegative(),
});

export const helmValuesPreviewResultSchema = z.strictObject({
  namespace: z.string().min(1).max(63),
  release_name: z.string().min(1).max(53),
  expected_revision: z.number().int().positive(),
  catalog_item_id: z.string().min(1).max(120),
  catalog_version: z.string().min(1).max(80),
  chart_name: z.string().min(1).max(512),
  chart_version: z.string().min(1).max(256),
  resources: helmValuesPreviewResourcesSchema,
  projection_sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  projection_bytes: z.number().int().nonnegative().max(MAX_ARTIFACT_BYTES),
  source_bytes: z.number().int().nonnegative().max(32 * 1024 * 1024),
  redaction_applied: z.literal(true),
  truncated: z.boolean(),
}).superRefine((value, context) => {
  if (new TextEncoder().encode(JSON.stringify(value.resources)).byteLength !== value.projection_bytes) {
    context.addIssue({ code: "custom", message: "Helm preview byte count is invalid" });
  }
});

export type HelmArtifactResultEndpoint = z.infer<typeof helmArtifactResultSchema>;
export type HelmValuesPreviewResultEndpoint = z.infer<typeof helmValuesPreviewResultSchema>;

function validateStructuredArtifact(
  value: {
    revision: number;
    comparison_revision: number | null;
  },
  projection: { revision1: number; revision2: number },
  projectionBytes: number,
  context: z.RefinementCtx,
) {
  if (
    value.comparison_revision === null ||
    projection.revision1 !== value.revision ||
    projection.revision2 !== value.comparison_revision ||
    projection.revision1 === projection.revision2
  ) {
    context.addIssue({ code: "custom", message: "Helm structured revisions are inconsistent" });
  }
  if (new TextEncoder().encode(JSON.stringify(projection)).byteLength !== projectionBytes) {
    context.addIssue({ code: "custom", message: "Helm structured byte count is invalid" });
  }
}

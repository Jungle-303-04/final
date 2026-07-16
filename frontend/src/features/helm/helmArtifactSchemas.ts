import { z } from "zod";

export const helmArtifactKindSchema = z.enum([
  "manifest",
  "values",
  "manifest_diff",
  "values_diff",
]);

export const helmArtifactResultSchema = z.strictObject({
  artifact: helmArtifactKindSchema,
  format: z.enum(["yaml", "unified_diff"]),
  namespace: z.string().min(1),
  release_name: z.string().min(1),
  revision: z.number().int().positive(),
  comparison_revision: z.number().int().positive().nullable(),
  all_values: z.boolean(),
  content: z.string().max(4 * 1024 * 1024),
  content_sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  content_bytes: z.number().int().nonnegative().max(4 * 1024 * 1024),
  source_bytes: z.number().int().nonnegative(),
  redaction_applied: z.literal(true),
  truncated: z.boolean(),
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
});

export type HelmArtifactResultEndpoint = z.infer<typeof helmArtifactResultSchema>;

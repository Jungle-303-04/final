import { z } from "zod";

import { commandAcceptedSchema } from "./commands-schemas";

export const resourceManifestSourceChoiceSchema = z.strictObject({
  application_id: z.string(),
  application_name: z.string(),
  repository_ref: z.string(),
  branch: z.string(),
  manifest_path: z.string(),
  environment: z.string(),
});

export const resourceManifestSourceSchema = z.strictObject({
  resource_id: z.string(),
  status: z.enum(["available", "ambiguous", "unsupported"]),
  choices: z.array(resourceManifestSourceChoiceSchema),
  selected: resourceManifestSourceChoiceSchema.nullable(),
  base_sha: z.string().nullable(),
  source_sha256: z.string().nullable(),
  content: z.string().nullable(),
  reason: z.string().nullable(),
});

export const resourceManifestPreviewSchema = z.strictObject({
  valid: z.boolean(),
  changed: z.boolean(),
  base_sha: z.string(),
  source_sha256: z.string(),
  desired_sha256: z.string(),
  diff: z.string(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
  apply_availability: z.enum(["available", "unavailable"]),
  apply_reason_codes: z.array(z.string()),
  impact: z.array(z.strictObject({
    api_version: z.string().min(1),
    kind: z.string().min(1),
    namespace: z.string().nullable(),
    name: z.string().min(1),
    selected: z.boolean(),
  })),
});

export const resourceManifestApproveSchema = z.strictObject({
  accepted: z.boolean(),
  event_id: z.string(),
  correlation_id: z.string(),
  workflow_run_id: z.string(),
  approval_id: z.string(),
  sync_state: z.literal("awaiting_pr_merge"),
});

export type ResourceManifestSourceEndpoint = z.infer<typeof resourceManifestSourceSchema>;
export type ResourceManifestPreviewEndpoint = z.infer<typeof resourceManifestPreviewSchema>;
export type ResourceManifestApproveEndpoint = z.infer<typeof resourceManifestApproveSchema>;
export const resourceManifestApplySchema = commandAcceptedSchema;
export type ResourceManifestApplyEndpoint = z.infer<typeof resourceManifestApplySchema>;

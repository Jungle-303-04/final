import { z } from "zod";

const unavailableEvidenceSchema = z.strictObject({
  status: z.literal("unavailable"),
  reason_code: z.string().min(1),
  detail: z.string().min(1),
});

export const settingsAccessProfileSchema = z.strictObject({
  workspace_id: z.string().min(1),
  user_id: z.string().min(1),
  cluster_id: z.string().min(1),
  roles: z.array(z.string().min(1)),
  authority: z.literal("opsia_rbac"),
  permissions: z.array(z.strictObject({
    permission: z.string().regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/u),
    category: z.string().min(1),
    allowed: z.boolean(),
  })),
  kubernetes_rules: unavailableEvidenceSchema,
  restricted_resource_types: unavailableEvidenceSchema,
  revision: z.string().regex(/^[0-9a-f]{64}$/u),
});

export type SettingsAccessProfileEndpoint = z.infer<typeof settingsAccessProfileSchema>;

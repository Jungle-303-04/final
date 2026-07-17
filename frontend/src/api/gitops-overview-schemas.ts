import { z } from "zod";

import {
  gitOpsClusterScopeSchema,
  gitOpsResourceRefSchema,
} from "./gitops-application-detail-schemas";

const nullableText = z.string().min(1).nullable();
const capabilitySchema = z.strictObject({
  scope: gitOpsClusterScopeSchema,
  resource: gitOpsResourceRefSchema,
  revision: z.string().min(1),
  actions: z.array(z.string().min(1)),
});

export const gitOpsOverviewRowSchema = z.strictObject({
  id: z.string().min(1),
  authority: z.enum(["registered", "controller"]),
  provider: z.enum(["internal", "argo", "flux"]),
  role: z.enum(["controller", "source"]),
  display_name: z.string().min(1),
  application_ids: z.array(z.string().min(1)),
  binding_id: nullableText,
  scope: gitOpsClusterScopeSchema,
  resource: gitOpsResourceRefSchema.nullable(),
  environment: nullableText,
  status: nullableText,
  health: nullableText,
  revision: nullableText,
  observed_at: nullableText,
  labels: z.record(z.string(), z.string()),
  capabilities: capabilitySchema.nullable(),
  partial_reason_codes: z.array(z.string().min(1)),
});

export const gitOpsOverviewSchema = z.strictObject({
  workspace_id: z.string().min(1),
  scopes: z.array(gitOpsClusterScopeSchema),
  items: z.array(gitOpsOverviewRowSchema).max(500),
  kind_counts: z.array(z.strictObject({
    api_group: z.string(),
    version: z.string(),
    kind: z.string().min(1),
    provider: z.enum(["argo", "flux"]),
    role: z.enum(["controller", "source"]),
    count: z.number().int().nonnegative(),
    completeness: z.enum(["exact", "partial"]),
  })),
  coverage: z.strictObject({
    state: z.enum(["complete", "partial", "unavailable"]),
    registered_count: z.number().int().nonnegative(),
    controller_count: z.number().int().nonnegative(),
    returned_count: z.number().int().nonnegative(),
    reason_codes: z.array(z.string().min(1)),
  }),
  observed_at: nullableText,
});

export type GitOpsOverviewEndpoint = z.infer<typeof gitOpsOverviewSchema>;

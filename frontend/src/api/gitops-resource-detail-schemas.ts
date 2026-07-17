import { z } from "zod";

import { commandAcceptedSchema } from "./commands-schemas";
import { gitOpsClusterScopeSchema, gitOpsResourceRefSchema } from "./gitops-application-detail-schemas";

const nullableText = z.string().min(1).nullable();
const actionSchema = z.enum([
  "reconcile",
  "sync_with_source",
  "suspend",
  "resume",
  "sync",
  "refresh",
]);

export const gitOpsResourceTreeSchema = z.strictObject({
  scope: gitOpsClusterScopeSchema,
  root: gitOpsResourceRefSchema,
  nodes: z.array(z.strictObject({
    id: z.string().min(1),
    resource: gitOpsResourceRefSchema,
    role: z.enum(["root", "declared", "generated", "source", "dependency"]),
    status: nullableText,
    health: nullableText,
  })).max(500),
  edges: z.array(z.strictObject({
    source: z.string().min(1),
    target: z.string().min(1),
    relationship: z.enum(["owns", "source", "depends_on"]),
  })).max(1000),
  coverage: z.strictObject({
    state: z.enum(["complete", "partial"]),
    reason_codes: z.array(z.string().min(1)),
    observed_count: z.number().int().nonnegative(),
    returned_count: z.number().int().nonnegative(),
  }),
});

const capabilitySchema = z.strictObject({
  scope: gitOpsClusterScopeSchema,
  resource: gitOpsResourceRefSchema,
  revision: z.string().min(1),
  actions: z.array(actionSchema),
});

export const gitOpsResourceInsightsSchema = z.strictObject({
  insights: z.strictObject({
    scope: gitOpsClusterScopeSchema,
    resource: gitOpsResourceRefSchema,
    resource_version: z.string().min(1),
    provider: z.enum(["argo", "flux"]),
    status: nullableText,
    health: nullableText,
    revision: nullableText,
    source: gitOpsResourceRefSchema.nullable(),
    conditions: z.array(z.strictObject({
      type: z.string().min(1),
      status: z.string().min(1),
      reason: nullableText,
      message: nullableText,
      observed_at: nullableText,
    })).max(50),
    history: z.array(z.strictObject({
      id: nullableText,
      revision: nullableText,
      deployed_at: nullableText,
      phase: nullableText,
      message: nullableText,
      initiated_by: nullableText,
    })).max(50),
    capabilities: capabilitySchema,
  }),
});

export const gitOpsResourceActionReceiptSchema = commandAcceptedSchema;

export type GitOpsResourceTreeEndpoint = z.infer<typeof gitOpsResourceTreeSchema>;
export type GitOpsResourceInsightsEndpoint = z.infer<typeof gitOpsResourceInsightsSchema>;
export type GitOpsResourceActionReceiptEndpoint = z.infer<typeof gitOpsResourceActionReceiptSchema>;

export interface GitOpsResourceActionEndpointRequest {
  cluster_id: string;
  resource: z.infer<typeof gitOpsResourceRefSchema>;
  resource_version: string;
  capability_revision: string;
  action: z.infer<typeof actionSchema>;
  confirmation: true;
  reason: string;
  refresh_mode?: "normal" | "hard";
  options?: {
    revision?: string;
    prune: boolean;
    dry_run: boolean;
    force: boolean;
    apply_only: boolean;
    sync_options: string[];
    resources: { api_group: string; kind: string; namespace: string | null; name: string }[];
  };
}

import { z } from "zod";

const unavailableEvidenceSchema = z.strictObject({
  status: z.literal("unavailable"),
  reason_code: z.string().min(1),
  detail: z.string().min(1),
});

const kubernetesSubjectSchema = z.strictObject({
  kind: z.enum(["ServiceAccount", "User", "Group"]),
  namespace: z.string(),
  name: z.string().min(1),
});

const kubernetesPolicyRuleSchema = z.strictObject({
  verbs: z.array(z.string()),
  api_groups: z.array(z.string()),
  resources: z.array(z.string()),
  resource_names: z.array(z.string()),
  non_resource_urls: z.array(z.string()),
});

const observedKubernetesRulesSchema = z.strictObject({
  status: z.literal("observed"),
  authority: z.literal("cluster_agent_service_account"),
  namespace: z.string().min(1),
  observed_at: z.string().min(1),
  subject: kubernetesSubjectSchema,
  resource_rules: z.array(kubernetesPolicyRuleSchema),
  non_resource_rules: z.array(kubernetesPolicyRuleSchema),
  truncated: z.boolean(),
});

const observedRestrictedResourceTypesSchema = z.strictObject({
  status: z.literal("observed"),
  authority: z.literal("cluster_agent_service_account"),
  namespace: z.string().min(1),
  observed_at: z.string().min(1),
  completeness: z.enum(["exact", "partial"]),
  reason_codes: z.array(z.string()),
  items: z.array(z.strictObject({
    api_group: z.string(),
    version: z.string().min(1),
    resource: z.string().min(1),
    kind: z.string().min(1),
    namespaced: z.boolean(),
    reason_code: z.literal("list_permission_not_observed"),
  })),
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
  kubernetes_rules: z.discriminatedUnion("status", [
    unavailableEvidenceSchema,
    observedKubernetesRulesSchema,
  ]),
  restricted_resource_types: z.discriminatedUnion("status", [
    unavailableEvidenceSchema,
    observedRestrictedResourceTypesSchema,
  ]),
  revision: z.string().regex(/^[0-9a-f]{64}$/u),
});

export type SettingsAccessProfileEndpoint = z.infer<typeof settingsAccessProfileSchema>;

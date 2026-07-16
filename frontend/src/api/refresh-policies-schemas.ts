import { z } from "zod";

export const refreshPolicyKeys = [
  "dashboard",
  "issues_audit",
  "applications",
  "resource_list",
  "resource_list_slow",
  "changes",
  "metrics_kubernetes",
  "metrics_prometheus",
  "metrics_pvc",
  "metrics_rightsizing",
  "gitops_rows",
  "gitops_counts",
  "helm_list",
  "helm_detail",
  "cost_summary",
  "cost_trend",
  "port_sessions",
] as const;

export const browserRefreshPolicySchema = z.strictObject({
  stale_after_seconds: z.number().positive().max(3600).nullable(),
  refresh_after_seconds: z.number().positive().max(3600),
  keep_last_success: z.literal(true),
  pause_when_hidden: z.literal(true),
  event_invalidation: z.boolean(),
  retry_after_seconds: z.number().positive().max(300).nullable(),
  retry_limit: z.number().int().min(1).max(10).nullable(),
  post_mutation_refresh_after_seconds: z.number().positive().max(60).nullable(),
}).superRefine((value, context) => {
  if ((value.retry_after_seconds === null) !== (value.retry_limit === null)) {
    context.addIssue({
      code: "custom",
      message: "retry interval and limit must be declared together",
    });
  }
});

const policiesShape = Object.fromEntries(
  refreshPolicyKeys.map((key) => [key, browserRefreshPolicySchema]),
) as {
  [Key in typeof refreshPolicyKeys[number]]: typeof browserRefreshPolicySchema;
};

export const browserRefreshPoliciesSchema = z.strictObject({
  revision: z.string().regex(/^[0-9a-f]{64}$/),
  policies: z.strictObject(policiesShape),
});

export type BrowserRefreshPoliciesEndpoint = z.infer<typeof browserRefreshPoliciesSchema>;
export type BrowserRefreshPolicyEndpoint = z.infer<typeof browserRefreshPolicySchema>;
export type RefreshPolicyKey = typeof refreshPolicyKeys[number];

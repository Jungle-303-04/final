import { z } from "zod";

const freshnessSchema = z.strictObject({
  observed_at: z.string().nullable(),
  refresh_after_seconds: z.number().int().min(1).max(300),
  completeness: z.enum(["exact", "partial", "unavailable"]),
  reason_codes: z.array(z.string()),
});

export const namespaceScopeSchema = z.strictObject({
  workspace_id: z.string().min(1),
  cluster_id: z.string().min(1),
  actives: z.array(z.string().min(1)),
  mode: z.enum(["all", "selected"]),
  accessible_namespaces: z.array(z.string().min(1)),
  accessible_namespace_count: z.number().int().nonnegative(),
  authoritative: z.literal(true),
  can_clear_namespace: z.boolean(),
  cache_scoped: z.literal(false),
  namespace_rescope: z.literal("view_filter_and_stream_invalidation"),
  revision: z.number().int().nonnegative(),
  invalidation_generation: z.number().int().nonnegative(),
  freshness: freshnessSchema,
});

export const namespaceScopeUpdateSchema = namespaceScopeSchema.extend({
  event_id: z.string().min(1),
  audit_event_id: z.string().min(1),
});

export const uiPreferencesSchema = z.strictObject({
  workspace_id: z.string().min(1),
  user_id: z.string().min(1),
  preferences: z.strictObject({
    theme: z.enum(["system", "light", "dark"]),
    locale: z.enum(["en", "ko"]),
  }),
  revision: z.number().int().nonnegative(),
  updated_at: z.string().nullable(),
});

export const uiPreferencesUpdateSchema = uiPreferencesSchema.extend({
  event_id: z.string().min(1),
  audit_event_id: z.string().min(1),
});

const clusterScopeSchema = z.strictObject({
  workspace_id: z.string().min(1),
  cluster_id: z.string().min(1),
  namespaces: z.array(z.string()),
  freshness: z.enum(["live", "stale", "partial", "disconnected"]),
});

const resourceRefSchema = z.strictObject({
  api_group: z.string(),
  version: z.string(),
  kind: z.string().min(1),
  namespace: z.string().nullable(),
  name: z.string().min(1),
  uid: z.string().min(1),
});

export const resourceIdentitySearchSchema = z.strictObject({
  scopes: z.array(clusterScopeSchema),
  hits: z.array(z.strictObject({
    id: z.string().min(1),
    cluster_id: z.string().min(1),
    resource_type: z.string().min(1),
    resource: resourceRefSchema,
    matched_fields: z.array(z.enum([
      "name",
      "kind",
      "namespace",
      "api_version",
      "resource_type",
      "uid",
    ])),
    observed_at: z.string().nullable(),
  })),
  total: z.number().int().nonnegative(),
  total_completeness: z.enum(["exact", "partial", "unavailable"]),
  snapshot: z.strictObject({
    snapshot_revision: z.number().int().nonnegative(),
    authorization_revision: z.string().min(1),
    filter_fingerprint: z.string().min(1),
    observed_at: z.string().nullable(),
    stale: z.boolean(),
    partial_reason_codes: z.array(z.string()),
  }),
});

export type NamespaceScope = z.infer<typeof namespaceScopeSchema>;
export type UiPreferencesResponse = z.infer<typeof uiPreferencesSchema>;
export type ResourceIdentitySearch = z.infer<typeof resourceIdentitySearchSchema>;

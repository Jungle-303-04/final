import { z } from "zod";

const nullableStringSchema = z.string().nullable();
const integerSchema = z.number().int();
const unknownRecordSchema = z.record(z.string(), z.unknown());
const clusterProviderSchema = z.enum(["eks", "gke", "aks", "onprem", "kind", "unknown"]);

/**
 * Runtime contract for `ClusterSummary` from
 * `src/packages/contracts/gateway/responses.py`.
 */
export const clusterSummarySchema = z.strictObject({
  workspace_id: z.string(),
  cluster_id: z.string(),
  name: z.string(),
  environment: z.string(),
  provider: clusterProviderSchema.optional(),
  status: z.string(),
  settings: unknownRecordSchema,
  connection_status: z.string(),
  last_agent_id: nullableStringSchema,
  last_agent_seen_at: nullableStringSchema,
  node_count: integerSchema,
  pod_count: integerSchema,
  incident_count: integerSchema,
  created_at: nullableStringSchema,
  updated_at: nullableStringSchema,
});

/** Runtime contract consumed by the Home cluster selector. */
export const clusterListSchema = z.strictObject({
  clusters: z.array(clusterSummarySchema),
});

/** Runtime contract for `GET /clusters/{cluster_id}`. */
export const clusterAgentStatusSchema = z.strictObject({
  workspace_id: z.string(),
  cluster_id: z.string(),
  agent_id: z.string(),
  status: z.string(),
  capabilities: z.array(z.string()),
  details: unknownRecordSchema,
  last_seen_at: nullableStringSchema,
  created_at: nullableStringSchema,
  updated_at: nullableStringSchema,
});

export const clusterResponseSchema = z.strictObject({
  cluster: clusterSummarySchema,
  agents: z.array(clusterAgentStatusSchema),
});

export type ClusterSummary = z.infer<typeof clusterSummarySchema>;
export type ClusterList = z.infer<typeof clusterListSchema>;
export type ClusterAgentStatus = z.infer<typeof clusterAgentStatusSchema>;
export type ClusterResponse = z.infer<typeof clusterResponseSchema>;

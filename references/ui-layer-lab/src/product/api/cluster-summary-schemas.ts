import { z } from "zod";

const nullableStringSchema = z.string().nullable();
const nullableNumberSchema = z.number().nullable();

export const clusterWorkloadHealthItemSchema = z.strictObject({
  name: z.string(),
  kind: z.string(),
  namespace: nullableStringSchema,
  health: z.string(),
  ready: z.string(),
  restarts: z.number().int(),
});

export const clusterWarningEventItemSchema = z.strictObject({
  namespace: nullableStringSchema,
  name: z.string(),
  reason: nullableStringSchema,
  message: nullableStringSchema,
  involved_kind: nullableStringSchema,
  involved_name: nullableStringSchema,
  count: z.number().int(),
  last_seen_at: nullableStringSchema,
});

export const clusterOpenIncidentItemSchema = z.strictObject({
  incident_id: z.string(),
  correlation_id: z.string(),
  symptom: nullableStringSchema,
  root_cause: nullableStringSchema,
  namespace: nullableStringSchema,
  resource_kind: nullableStringSchema,
  resource_name: nullableStringSchema,
  status: z.string(),
  created_at: nullableStringSchema,
});

export const clusterUsageSnapshotSchema = z.strictObject({
  sampled_at: nullableStringSchema,
  pods_running: z.number().int(),
  pods_total: z.number().int().optional(),
  nodes_ready: z.number().int(),
  nodes_total: z.number().int(),
  restart_total: z.number().int(),
  cpu_pct: nullableNumberSchema,
  mem_pct: nullableNumberSchema,
});

export const clusterSummaryDetailSchema = z.strictObject({
  cluster_id: z.string(),
  name: z.string(),
  health: z.string(),
  workloads: z.record(z.string(), z.array(clusterWorkloadHealthItemSchema)),
  warning_events: z.array(clusterWarningEventItemSchema),
  open_incidents: z.array(clusterOpenIncidentItemSchema),
  usage: clusterUsageSnapshotSchema.nullable(),
});

export const nodeSummaryItemSchema = z.strictObject({
  name: z.string(),
  ready: z.boolean(),
  health: z.string(),
  pods_running: z.number().int(),
  pods_capacity: z.number().int(),
  cpu_pct: nullableNumberSchema,
  mem_pct: nullableNumberSchema,
  restarts_recent: z.number().int(),
  conditions: z.array(z.string()),
});

export const clusterNodesSummarySchema = z.strictObject({
  cluster_id: z.string(),
  nodes: z.array(nodeSummaryItemSchema),
});

export const podSummaryItemSchema = z.strictObject({
  name: z.string(),
  namespace: z.string(),
  phase: z.string(),
  health: z.string(),
  ready: z.string(),
  restarts: z.number().int(),
  owner_kind: nullableStringSchema,
  owner_name: nullableStringSchema,
  cpu_mcores: nullableNumberSchema,
  mem_mib: nullableNumberSchema,
  incident_correlation_id: nullableStringSchema,
});

export const nodePodsSummarySchema = z.strictObject({
  cluster_id: z.string(),
  node_name: z.string(),
  pods: z.array(podSummaryItemSchema),
});

export type ClusterSummaryDetail = z.infer<typeof clusterSummaryDetailSchema>;
export type ClusterNodesSummary = z.infer<typeof clusterNodesSummarySchema>;
export type NodePodsSummary = z.infer<typeof nodePodsSummarySchema>;
export type ClusterWorkloadHealthItem = z.infer<typeof clusterWorkloadHealthItemSchema>;
export type NodeSummaryItem = z.infer<typeof nodeSummaryItemSchema>;
export type PodSummaryItem = z.infer<typeof podSummaryItemSchema>;

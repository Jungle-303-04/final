import { z } from "zod";

import {
  filterCountCompletenessSchema,
  filterResultCountsSchema,
  filterSnapshotMetaSchema,
  inventoryResourceClusterIdentitySchema,
  rfc3339TimestampSchema,
} from "./resource-filter-schemas";

const metricSchema = z.number().finite().nonnegative();
const nullableMetricSchema = metricSchema.nullable();
const backfilledNullableMetricSchema = metricSchema.nullish().transform((value) => value ?? null);
const backfilledNullableIntegerSchema = z.number().int().nonnegative().nullish()
  .transform((value) => value ?? null);

export const physicalTopologyServerSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  cpu_pct: nullableMetricSchema,
  mem_pct: nullableMetricSchema,
  cpu_mcores: backfilledNullableMetricSchema,
  mem_mib: backfilledNullableMetricSchema,
  allocatable_cpu_mcores: backfilledNullableMetricSchema,
  allocatable_mem_mib: backfilledNullableMetricSchema,
  pod_capacity: backfilledNullableIntegerSchema,
  status: z.string().min(1),
  matched_pod_count: z.number().int().nonnegative().nullable(),
  total_pod_count: z.number().int().nonnegative().nullable(),
  matched_pod_count_completeness: filterCountCompletenessSchema,
  total_pod_count_completeness: filterCountCompletenessSchema,
}).superRefine((server, context) => {
  const pairs = [
    [server.matched_pod_count, server.matched_pod_count_completeness, "matched_pod_count"],
    [server.total_pod_count, server.total_pod_count_completeness, "total_pod_count"],
  ] as const;
  pairs.forEach(([count, completeness, path]) => {
    if ((count === null) === (completeness === "unavailable")) return;
    context.addIssue({
      code: "custom",
      message: "server pod count availability must match completeness",
      path: [path],
    });
  });
  if (
    server.matched_pod_count !== null &&
    server.total_pod_count !== null &&
    server.matched_pod_count > server.total_pod_count
  ) {
    context.addIssue({
      code: "custom",
      message: "matched pod count cannot exceed total pod count",
      path: ["matched_pod_count"],
    });
  }
});

export const physicalTopologyPodSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  namespace: z.string().min(1),
  server_id: z.string().min(1).nullable(),
  usage_pct: nullableMetricSchema,
  cpu_mcores: nullableMetricSchema,
  mem_mib: nullableMetricSchema,
  cpu_request_mcores: backfilledNullableMetricSchema,
  mem_request_mib: backfilledNullableMetricSchema,
  cpu_limit_mcores: backfilledNullableMetricSchema,
  mem_limit_mib: backfilledNullableMetricSchema,
  phase: z.string().min(1),
  health: z.string().min(1),
  restarts: z.number().int().nonnegative(),
  matches_filter: z.boolean(),
});

export const physicalTopologySchema = z.strictObject({
  view: z.literal("physical"),
  cluster: inventoryResourceClusterIdentitySchema,
  cluster_projection_revision: z.number().int().nonnegative(),
  servers: z.array(physicalTopologyServerSchema),
  pods: z.array(physicalTopologyPodSchema),
  truncated: z.record(z.string(), z.number().int().positive()),
  unassigned_truncated_count: z.number().int().nonnegative(),
  counts: filterResultCountsSchema,
  projection_completeness: filterCountCompletenessSchema,
  metrics_completeness: filterCountCompletenessSchema,
  metrics_observed_at: rfc3339TimestampSchema.nullable(),
  partial_reason_codes: z.array(z.string()),
  snapshot: filterSnapshotMetaSchema,
}).superRefine((topology, context) => {
  const serverIds = new Set<string>();
  topology.servers.forEach((server, index) => {
    if (serverIds.has(server.id)) {
      context.addIssue({
        code: "custom",
        message: "physical topology server ids must be unique",
        path: ["servers", index, "id"],
      });
    }
    serverIds.add(server.id);
  });

  const podIds = new Set<string>();
  const podsByServer = new Map<string, number>();
  topology.pods.forEach((pod, index) => {
    if (podIds.has(pod.id)) {
      context.addIssue({
        code: "custom",
        message: "physical topology pod ids must be unique",
        path: ["pods", index, "id"],
      });
    }
    podIds.add(pod.id);
    if (pod.server_id === null) return;
    if (!serverIds.has(pod.server_id)) {
      context.addIssue({
        code: "custom",
        message: "physical topology pod server_id must reference a returned server",
        path: ["pods", index, "server_id"],
      });
      return;
    }
    const count = (podsByServer.get(pod.server_id) ?? 0) + 1;
    podsByServer.set(pod.server_id, count);
    if (count > 12) {
      context.addIssue({
        code: "custom",
        message: "physical topology returns at most 12 pods per server",
        path: ["pods", index],
      });
    }
  });

  Object.keys(topology.truncated).forEach((serverId) => {
    if (serverIds.has(serverId)) return;
    context.addIssue({
      code: "custom",
      message: "physical topology truncation keys must reference a returned server",
      path: ["truncated", serverId],
    });
  });
});

export type PhysicalTopologyEndpoint = z.infer<typeof physicalTopologySchema>;
export type PhysicalTopologyEndpointPod = z.infer<typeof physicalTopologyPodSchema>;
export type PhysicalTopologyEndpointServer = z.infer<typeof physicalTopologyServerSchema>;

import { z } from "zod";

const safeText = z.string().min(1);

export const logStreamConnectedSchema = z.strictObject({
  type: z.literal("connected"),
  stream_id: safeText,
  containers: z.array(safeText).max(1_000),
});

export const logStreamLineSchema = z.strictObject({
  type: z.literal("log"),
  id: safeText,
  observed_at: z.string().datetime({ offset: true }),
  pod: safeText,
  container: z.string().min(1),
  line: z.string().max(4096),
  line_truncated: z.boolean(),
});

export const logStreamPodMembershipSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("pod_added"), pod: safeText }),
  z.strictObject({ type: z.literal("pod_removed"), pod: safeText }),
]);

export const logStreamEndSchema = z.strictObject({
  type: z.literal("end"),
  reason: safeText,
  diagnostic: z.strictObject({
    code: z.enum(["no_matching_pods", "no_log_lines"]),
  }).nullable(),
});

export const logStreamErrorSchema = z.strictObject({
  type: z.literal("error"),
  code: safeText,
  retryable: z.boolean(),
});

export const logStreamEventSchema = z.discriminatedUnion("type", [
  logStreamConnectedSchema,
  logStreamLineSchema,
  ...logStreamPodMembershipSchema.options,
  logStreamEndSchema,
  logStreamErrorSchema,
]);

export type LogStreamEventEndpoint = z.infer<typeof logStreamEventSchema>;

const resourceRefSchema = z.strictObject({
  api_group: z.string(),
  version: z.string(),
  kind: safeText,
  namespace: z.string().nullable(),
  name: safeText,
  uid: safeText,
});

export const scheduledWorkloadRunCatalogSchema = z.strictObject({
  scope: z.strictObject({
    workspace_id: safeText,
    cluster_id: safeText,
    namespaces: z.array(safeText),
    freshness: z.enum(["live", "stale", "partial", "disconnected"]),
  }),
  owner: resourceRefSchema,
  runs: z.array(z.strictObject({
    run_key: safeText,
    resource: resourceRefSchema,
    phase: z.enum(["pending", "running", "succeeded", "failed", "unknown"]),
    active: z.boolean(),
    scheduled_at: z.string().datetime({ offset: true }).nullable(),
    started_at: z.string().datetime({ offset: true }).nullable(),
    finished_at: z.string().datetime({ offset: true }).nullable(),
    desired: z.number().int().nonnegative().nullable(),
    succeeded: z.number().int().nonnegative().nullable(),
    failed: z.number().int().nonnegative().nullable(),
    pod_total: z.number().int().nonnegative(),
    pod_succeeded: z.number().int().nonnegative(),
    pod_failed: z.number().int().nonnegative(),
    pod_running: z.number().int().nonnegative(),
    next_step: z.enum(["logs", "timeline"]).nullable(),
    observed_at: z.string().datetime({ offset: true }).nullable(),
  })),
  lifecycle: z.array(z.strictObject({
    event_id: safeText,
    run_key: safeText,
    resource: resourceRefSchema,
    stage: z.enum(["scheduled", "started", "finished"]),
    occurred_at: z.string().datetime({ offset: true }),
    event_type: z.enum(["normal", "warning"]),
    reason: safeText,
  })),
  default_run_key: z.string().nullable(),
  complete: z.boolean(),
  reason_codes: z.array(safeText),
});

export type ScheduledWorkloadRunCatalogEndpoint = z.infer<
  typeof scheduledWorkloadRunCatalogSchema
>;

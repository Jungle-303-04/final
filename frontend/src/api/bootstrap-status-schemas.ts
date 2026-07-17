import { z } from "zod";

const availabilitySchema = z.enum(["available", "partial", "unavailable"]);
const reasonCodesSchema = z.array(z.string()).max(16);
const timestampSchema = z.string().min(1);

const runtimeProcessSchema = z.strictObject({
  python_version: z.string().min(1).max(64),
  python_implementation: z.string().min(1).max(64),
  process_id: z.number().int().min(1),
  cpu_count: z.number().int().min(1).nullable(),
  thread_count: z.number().int().min(1),
  uptime_seconds: z.number().nonnegative(),
});

const eventPipelineSchema = z.strictObject({
  availability: availabilitySchema,
  open_dead_letters: z.number().int().nonnegative().nullable(),
  outbox_pending: z.number().int().nonnegative().nullable(),
  processing_statuses: z.array(z.strictObject({
    status: z.string().min(1).max(120),
    count: z.number().int().nonnegative(),
  })).max(32),
  consumer_lag: z.array(z.strictObject({
    consumer: z.string().min(1).max(253),
    subject: z.string().min(1).max(512),
    pending: z.number().int().nonnegative(),
    ack_pending: z.number().int().nonnegative(),
    redelivered: z.number().int().nonnegative(),
  })).max(50),
  reason_codes: reasonCodesSchema,
});

const timelineSchema = z.strictObject({
  availability: availabilitySchema,
  event_count: z.number().int().nonnegative().nullable(),
  oldest_occurred_at: timestampSchema.nullable(),
  newest_occurred_at: timestampSchema.nullable(),
  high_water_sequence: z.number().int().nonnegative().nullable(),
  retained_from_sequence: z.number().int().min(1).nullable(),
  reason_codes: reasonCodesSchema,
});

const agentCollectionSchema = z.strictObject({
  availability: availabilitySchema,
  items: z.array(z.strictObject({
    cluster_id: z.string().min(1).max(253),
    name: z.string().min(1).max(253),
    environment: z.string().max(120),
    registration_status: z.string().min(1).max(120),
    connection_status: z.enum(["online", "stale", "never_connected"]),
    agent_id: z.string().min(1).max(253).nullable(),
    agent_status: z.string().min(1).max(120).nullable(),
    last_seen_at: timestampSchema.nullable(),
    capabilities: z.array(z.string()).max(64),
    latest_inventory: z.strictObject({
      status: z.string().min(1).max(120),
      source: z.string().min(1).max(120),
      collected_at: timestampSchema,
      resource_count: z.number().int().nonnegative(),
    }).nullable(),
  })).max(50),
  reason_codes: reasonCodesSchema,
});

export const runtimeDiagnosticsSchema = z.strictObject({
  observed_at: timestampSchema,
  completeness: z.enum(["complete", "partial"]),
  runtime: runtimeProcessSchema,
  event_pipeline: eventPipelineSchema,
  timeline: timelineSchema,
  agent_collection: agentCollectionSchema,
  reason_codes: reasonCodesSchema,
});

export const versionCheckSchema = z.strictObject({
  availability: availabilitySchema,
  current_version: z.string().min(1).max(64),
  latest_version: z.string().min(1).max(64).nullable(),
  update_available: z.boolean().nullable(),
  release_url: z.string().max(2048).nullable(),
  release_notes: z.string().max(2000).nullable(),
  observed_at: timestampSchema,
  reason_codes: reasonCodesSchema,
});

export type RuntimeDiagnosticsEndpoint = z.infer<typeof runtimeDiagnosticsSchema>;
export type VersionCheckEndpoint = z.infer<typeof versionCheckSchema>;

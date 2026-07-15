import { z } from "zod";

const nonEmptyString = z.string().min(1);
const nonNegativeInteger = z.number().int().nonnegative();
const timestampMilliseconds = nonNegativeInteger.max(8_640_000_000_000_000);
const timelineSourceModeSchema = z.enum(["retained", "local"]);

/** Server-owned source and query constraints shared by bootstrap and snapshots. */
export const timelineCapabilityDescriptorSchema = z.strictObject({
  selected_source_mode: timelineSourceModeSchema,
  available_source_modes: z.array(timelineSourceModeSchema).min(1),
  max_retained_range_ms: z.number().int().min(1_000).max(Number.MAX_SAFE_INTEGER),
  namespace_filter_policy: z.enum(["not_required", "required"]),
}).superRefine((descriptor, context) => {
  const modes = new Set(descriptor.available_source_modes);
  if (modes.size !== descriptor.available_source_modes.length) {
    context.addIssue({
      code: "custom",
      message: "timeline capability source modes must be unique",
      path: ["available_source_modes"],
    });
  }
  if (!modes.has(descriptor.selected_source_mode)) {
    context.addIssue({
      code: "custom",
      message: "timeline capability selected source mode must be available",
      path: ["selected_source_mode"],
    });
  }
});

export const timelineScopeSchema = z.strictObject({
  workspace_id: nonEmptyString,
  cluster_id: nonEmptyString,
  namespaces: z.array(nonEmptyString).default([]),
  freshness: z.enum(["live", "stale", "partial", "disconnected"]).default("live"),
});

export const timelineResourceRefSchema = z.strictObject({
  api_group: z.string().default(""),
  version: z.string().default(""),
  kind: nonEmptyString,
  namespace: z.string().nullable().default(null),
  name: nonEmptyString,
  uid: nonEmptyString,
});

const timelineResourceSubjectSchema = z.strictObject({
  kind: z.literal("resource"),
  resource: timelineResourceRefSchema,
});

const timelineInventoryLocatorSubjectSchema = z.strictObject({
  kind: z.literal("inventory_locator"),
  inventory_key: nonEmptyString,
  api_group: z.string().default(""),
  version: z.string().default(""),
  resource_kind: nonEmptyString,
  namespace: z.string().nullable().default(null),
  name: nonEmptyString,
});

const timelineIncidentSubjectSchema = z.strictObject({
  kind: z.literal("incident"),
  incident_id: nonEmptyString,
  correlation_id: nonEmptyString.nullable().default(null),
});

const timelineApplicationWorkflowSubjectSchema = z.strictObject({
  kind: z.literal("application_workflow"),
  application_id: nonEmptyString,
  binding_id: nonEmptyString,
  workflow_run_id: nonEmptyString,
});

export const timelineSubjectSchema = z.discriminatedUnion("kind", [
  timelineResourceSubjectSchema,
  timelineInventoryLocatorSubjectSchema,
  timelineIncidentSubjectSchema,
  timelineApplicationWorkflowSubjectSchema,
]);

export const timelineEventSchema = z.strictObject({
  event_id: nonEmptyString,
  source: z.enum([
    "inventory",
    "incident",
    "application_workflow",
    "kubernetes_event",
    "gitops",
  ]),
  source_key: nonEmptyString,
  native_id: nonEmptyString,
  activity: z.enum(["change", "k8s_event", "warning", "unhealthy"]),
  occurred_at: z.string().datetime({ offset: true }),
  scope: timelineScopeSchema,
  subject: timelineSubjectSchema,
  resource: timelineResourceRefSchema.nullable().default(null),
  event_type: z.enum([
    "add",
    "update",
    "delete",
    "k8s_event",
    "incident",
    "deployment",
    "gitops_change",
  ]),
  severity: z.enum(["info", "warning", "critical", "unknown"]),
  title: nonEmptyString.max(1_000),
  owner: timelineResourceRefSchema.nullable().default(null),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).superRefine((event, context) => {
  if (event.subject.kind === "resource") {
    if (event.resource === null) {
      context.addIssue({
        code: "custom",
        message: "resource subject requires an exact resource",
        path: ["resource"],
      });
    } else if (JSON.stringify(event.resource) !== JSON.stringify(event.subject.resource)) {
      context.addIssue({
        code: "custom",
        message: "resource subject must match its resource relation",
        path: ["resource"],
      });
    }
  }
  if (event.subject.kind === "inventory_locator" && event.resource !== null) {
    context.addIssue({
      code: "custom",
      message: "inventory locator must not impersonate a resource",
      path: ["resource"],
    });
  }
  if (
    (event.source === "application_workflow" || event.source === "gitops")
    && event.subject.kind !== "application_workflow"
  ) {
    context.addIssue({
      code: "custom",
      message: "application source requires an application workflow subject",
      path: ["subject"],
    });
  }
});

export const timelineCursorSchema = z.strictObject({
  token: nonEmptyString.refine(
    (value) => value === value.trim() && !/\s/u.test(value),
    "timeline cursor must be opaque",
  ),
});

export const timelineRealtimePolicySchema = z.strictObject({
  max_batch_events: z.number().int().min(1).max(10_000),
  max_frames_per_second: z.number().int().min(1).max(60),
  retention_seconds: z.number().int().min(1).max(31_536_000),
  resume: z.literal("cursor"),
  hidden_tab: z.literal("coalesce"),
  reconnect: z.strictObject({
    min_delay_ms: z.number().int().min(100).max(60_000),
    max_delay_ms: z.number().int().min(100).max(300_000),
    strategy: z.literal("full_jitter_exponential"),
  }).refine((policy) => policy.min_delay_ms <= policy.max_delay_ms, {
    message: "timeline reconnect minimum must not exceed maximum",
  }),
  live_session: z.strictObject({
    max_age_ms: z.number().int().min(1_000).max(300_000),
    strategy: z.literal("replace_with_snapshot"),
  }),
});

export const timelineWindowSchema = z.strictObject({
  from_ms: nonNegativeInteger,
  to_ms: z.number().int().positive(),
}).refine((window) => window.from_ms < window.to_ms, {
  message: "timeline window must have positive width",
});

export const timelineFiltersSchema = z.strictObject({
  activity: z.array(z.enum(["change", "k8s_event", "warning", "unhealthy"])).default([]),
  kinds: z.array(z.string()).default([]),
  include_deleted: z.boolean().default(true),
  pinned_only: z.boolean().default(false),
  query: z.string().max(1_000).default(""),
});

export const timelineQuerySchema = z.strictObject({
  scopes: z.array(timelineScopeSchema).min(1).max(100),
  window: timelineWindowSchema,
  filters: timelineFiltersSchema,
  mode: z.enum(["live", "frozen"]),
  grouping: z.enum(["app", "owner", "flat"]),
  sort: z.enum(["importance", "recent", "name"]),
});

export const timelineSnapshotRequestSchema = z.strictObject({
  query: timelineQuerySchema,
});

export const timelineStreamRequestSchema = z.strictObject({
  query: timelineQuerySchema,
  after: timelineCursorSchema,
});

export const timelineCoverageSchema = z.strictObject({
  scope: timelineScopeSchema,
  source: z.enum([
    "inventory",
    "incident",
    "application_workflow",
    "kubernetes_event",
    "gitops",
  ]),
  from_ms: timestampMilliseconds,
  to_ms: timestampMilliseconds.positive(),
  reason: z.enum(["collection_gap", "retention_boundary", "partial_scope"]),
}).refine((coverage) => coverage.from_ms < coverage.to_ms, {
  message: "timeline coverage must have positive width",
});

const snapshotFrameSchema = z.strictObject({
  kind: z.literal("snapshot"),
  cursor: timelineCursorSchema,
  scopes: z.array(timelineScopeSchema).min(1),
  policy: timelineRealtimePolicySchema,
  capabilities: timelineCapabilityDescriptorSchema,
  events: z.array(timelineEventSchema).default([]),
  coverage: z.array(timelineCoverageSchema).default([]),
});

const eventFrameSchema = z.strictObject({
  kind: z.literal("event"),
  cursor: timelineCursorSchema,
  event: timelineEventSchema,
});

const coverageFrameSchema = z.strictObject({
  kind: z.literal("coverage"),
  cursor: timelineCursorSchema,
  coverage: z.array(timelineCoverageSchema).min(1),
});

const resyncFrameSchema = z.strictObject({
  kind: z.literal("resync_required"),
  cursor: timelineCursorSchema,
  reason: nonEmptyString.max(500),
});

const endFrameSchema = z.strictObject({
  kind: z.literal("end"),
  cursor: timelineCursorSchema,
});

const errorFrameSchema = z.strictObject({
  kind: z.literal("error"),
  cursor: timelineCursorSchema,
  reason: nonEmptyString.max(500),
});

export const timelineStreamFrameSchema = z.discriminatedUnion("kind", [
  snapshotFrameSchema,
  eventFrameSchema,
  coverageFrameSchema,
  resyncFrameSchema,
  endFrameSchema,
  errorFrameSchema,
]);

export type TimelineEndpointScope = z.infer<typeof timelineScopeSchema>;
export type TimelineEndpointCapabilityDescriptor = z.infer<typeof timelineCapabilityDescriptorSchema>;
export type TimelineEndpointCursor = z.infer<typeof timelineCursorSchema>;
export type TimelineEndpointEvent = z.infer<typeof timelineEventSchema>;
export type TimelineEndpointCoverage = z.infer<typeof timelineCoverageSchema>;
export type TimelineEndpointRealtimePolicy = z.infer<typeof timelineRealtimePolicySchema>;
export type TimelineEndpointStreamFrame = z.infer<typeof timelineStreamFrameSchema>;
export type TimelineEndpointQuery = z.infer<typeof timelineQuerySchema>;
export type TimelineSnapshotRequest = z.output<typeof timelineSnapshotRequestSchema>;
export type TimelineStreamRequest = z.output<typeof timelineStreamRequestSchema>;

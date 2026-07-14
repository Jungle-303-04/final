import { z } from "zod";

import type { PhysicalTopologyRealtimeConnectionStatus } from "../../features/resources/physicalTopologyRealtimeContract";

const optionalMetricSchema = z.number().finite().nonnegative().nullable().optional();
const liveMetricsMetadataSchema = z.strictObject({
  source: z.enum([
    "kubelet_stats_summary",
    "metrics_server_fallback",
    "mixed",
    "unavailable",
  ]),
  actual_interval_seconds: z.number().finite().nonnegative().nullable(),
  degraded_reason: z.string().min(1).nullable(),
});
const liveSummaryMetricsSchema = z.object({
  metrics_metadata: liveMetricsMetadataSchema.nullable().optional(),
}).passthrough();
const realtimeEnvelopeSchema = z.object({ type: z.string().min(1) }).passthrough();
const liveSummaryMessageSchema = z.object({
  type: z.literal("live.summary"),
  cluster_id: z.string().min(1),
  summary: liveSummaryMetricsSchema,
}).passthrough();
const snapshotMessageSchema = z.object({
  type: z.literal("snapshot"),
  state: z.record(z.string(), z.unknown()),
}).passthrough();
const resourceDeltaMessageSchema = z.object({
  type: z.literal("resource.delta"),
  op: z.enum(["replace", "remove"]),
  key: z.string().min(1),
  value: z.unknown().nullable(),
}).passthrough();
const livePodValueSchema = z.object({
  resource_type: z.literal("pod").optional(),
  kind: z.literal("Pod").optional(),
  name: z.string().min(1).optional(),
  namespace: z.string().min(1).optional(),
  phase: z.string().min(1).optional(),
  health: z.string().min(1).optional(),
  restarts: z.number().int().nonnegative().optional(),
  cpu_mcores: optionalMetricSchema,
  mem_mib: optionalMetricSchema,
  cpu_request_pct: optionalMetricSchema,
  mem_request_pct: optionalMetricSchema,
  observed_at: z.string().min(1).nullable().optional(),
  metrics_metadata: liveMetricsMetadataSchema.nullable().optional(),
}).passthrough();

export type PhysicalTopologyLiveStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export interface PhysicalTopologyLiveState {
  status: PhysicalTopologyLiveStatus;
  actualIntervalSeconds: number | null;
  degradedReason: string | null;
  source: string | null;
  updatedAt: number;
}

export interface LivePodMeasurement {
  namespace: string;
  name: string;
  usagePercent?: number | null;
  cpuMillicores?: number | null;
  memoryMebibytes?: number | null;
  phase?: string;
  health?: string;
  restartCount?: number;
  observedAt?: string | null;
}

export interface RealtimeOverlay {
  scope: string | null;
  pods: Record<string, LivePodMeasurement>;
  live: PhysicalTopologyLiveState;
}

const IDLE_LIVE_STATE: PhysicalTopologyLiveState = {
  status: "idle",
  actualIntervalSeconds: null,
  degradedReason: null,
  source: null,
  updatedAt: 0,
};

export function reducePhysicalTopologyRealtimeOverlay(
  current: RealtimeOverlay,
  message: unknown,
  clusterId: string,
): RealtimeOverlay {
  const envelope = realtimeEnvelopeSchema.safeParse(message);
  if (!envelope.success) return current;
  if (envelope.data.type === "live.summary") {
    const summaryMessage = liveSummaryMessageSchema.safeParse(message);
    if (!summaryMessage.success || summaryMessage.data.cluster_id !== clusterId) return current;
    return withMetadata(current, summaryMessage.data.summary.metrics_metadata, false);
  }
  if (envelope.data.type === "snapshot") {
    const snapshotMessage = snapshotMessageSchema.safeParse(message);
    if (!snapshotMessage.success) return current;
    const next = createRealtimeOverlay(current.scope, current.live.status);
    const resources = objectValue(snapshotMessage.data.state.resources);
    for (const [key, value] of Object.entries(resources)) {
      const measurement = livePodMeasurement(key, value, clusterId);
      if (measurement === null) continue;
      next.pods[podIdentity(measurement.namespace, measurement.name)] = measurement;
      applyValueMetadata(next.live, value, true);
    }
    const clusters = objectValue(snapshotMessage.data.state.clusters);
    const summary = liveSummaryMetricsSchema.safeParse(clusters[clusterId]);
    next.live.updatedAt = Date.now();
    return summary.success
      ? withMetadata(next, summary.data.metrics_metadata, true)
      : next;
  }
  if (envelope.data.type !== "resource.delta") return current;
  const delta = resourceDeltaMessageSchema.safeParse(message);
  if (!delta.success) return current;
  const identity = resourceDeltaIdentity(delta.data.key, clusterId);
  if (identity === null) return current;
  const pods = { ...current.pods };
  if (delta.data.op === "remove") {
    delete pods[podIdentity(identity.namespace, identity.name)];
    return { ...current, pods, live: { ...current.live, updatedAt: Date.now() } };
  }
  const measurement = livePodMeasurement(delta.data.key, delta.data.value, clusterId);
  if (measurement === null) return current;
  pods[podIdentity(measurement.namespace, measurement.name)] = measurement;
  const next = { ...current, pods, live: { ...current.live, updatedAt: Date.now() } };
  return withValueMetadata(next, delta.data.value, false);
}

function livePodMeasurement(
  key: string,
  value: unknown,
  clusterId: string,
): LivePodMeasurement | null {
  const identity = resourceDeltaIdentity(key, clusterId);
  if (identity === null) return null;
  const parsed = livePodValueSchema.safeParse(value);
  if (!parsed.success) return null;
  if (
    (parsed.data.namespace !== undefined && parsed.data.namespace !== identity.namespace) ||
    (parsed.data.name !== undefined && parsed.data.name !== identity.name)
  ) return null;
  const usagePresent = "cpu_request_pct" in parsed.data || "mem_request_pct" in parsed.data;
  const usageValues = [parsed.data.cpu_request_pct, parsed.data.mem_request_pct]
    .filter((candidate): candidate is number => typeof candidate === "number");
  return {
    namespace: identity.namespace,
    name: identity.name,
    ...(usagePresent
      ? { usagePercent: usageValues.length > 0 ? Math.max(...usageValues) : null }
      : {}),
    ...(hasOwn(parsed.data, "cpu_mcores")
      ? { cpuMillicores: parsed.data.cpu_mcores ?? null }
      : {}),
    ...(hasOwn(parsed.data, "mem_mib")
      ? { memoryMebibytes: parsed.data.mem_mib ?? null }
      : {}),
    ...(parsed.data.phase === undefined ? {} : { phase: parsed.data.phase }),
    ...(parsed.data.health === undefined ? {} : { health: parsed.data.health }),
    ...(parsed.data.restarts === undefined ? {} : { restartCount: parsed.data.restarts }),
    ...(parsed.data.observed_at === undefined ? {} : { observedAt: parsed.data.observed_at }),
  };
}

function resourceDeltaIdentity(
  key: string,
  clusterId: string,
): { namespace: string; name: string } | null {
  const [cluster, namespace, kind, name, ...extra] = key.split("/");
  if (
    extra.length > 0 ||
    cluster !== clusterId ||
    kind?.toLocaleLowerCase() !== "pod" ||
    !namespace ||
    !name
  ) return null;
  return { namespace, name };
}

function withValueMetadata(
  current: RealtimeOverlay,
  value: unknown,
  authoritative: boolean,
): RealtimeOverlay {
  const parsed = livePodValueSchema.safeParse(value);
  return parsed.success
    ? withMetadata(current, parsed.data.metrics_metadata, authoritative)
    : current;
}

function applyValueMetadata(
  current: PhysicalTopologyLiveState,
  value: unknown,
  authoritative: boolean,
): void {
  const parsed = livePodValueSchema.safeParse(value);
  if (!parsed.success || parsed.data.metrics_metadata === undefined) return;
  Object.assign(
    current,
    liveStateWithMetadata(current, parsed.data.metrics_metadata, authoritative),
  );
}

function withMetadata(
  current: RealtimeOverlay,
  metadata: z.infer<typeof liveMetricsMetadataSchema> | null | undefined,
  authoritative: boolean,
): RealtimeOverlay {
  return {
    ...current,
    live: liveStateWithMetadata(current.live, metadata, authoritative),
  };
}

function liveStateWithMetadata(
  current: PhysicalTopologyLiveState,
  metadata: z.infer<typeof liveMetricsMetadataSchema> | null | undefined,
  authoritative: boolean,
): PhysicalTopologyLiveState {
  if (metadata === undefined) return current;
  if (metadata === null) {
    return authoritative
      ? { ...current, actualIntervalSeconds: null, degradedReason: null, source: null }
      : current;
  }
  return {
    ...current,
    actualIntervalSeconds: metadata.actual_interval_seconds,
    degradedReason: authoritative || metadata.degraded_reason !== null
      ? metadata.degraded_reason
      : current.degradedReason,
    source: metadata.source,
  };
}

export function toPhysicalTopologyLiveStatus(
  status: PhysicalTopologyRealtimeConnectionStatus,
): PhysicalTopologyLiveStatus | null {
  if (status === "connecting") return "connecting";
  if (status === "connected") return "connected";
  if (status === "reconnecting") return "reconnecting";
  if (status === "disconnected") return "disconnected";
  return null;
}

export function createRealtimeOverlay(
  scope: string | null,
  status: PhysicalTopologyLiveStatus = "idle",
): RealtimeOverlay {
  return { scope, pods: {}, live: { ...IDLE_LIVE_STATE, status } };
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function podIdentity(namespace: string, name: string): string {
  return `${namespace}/${name}`;
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

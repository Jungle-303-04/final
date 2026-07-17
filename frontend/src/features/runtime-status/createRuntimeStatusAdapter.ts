import {
  RuntimeStatusPortFailure,
  type RuntimeDiagnostics,
  type RuntimeStatusFailureCode,
  type RuntimeStatusPort,
  type VersionCheck,
} from "./runtimeStatusContract";
import type {
  RuntimeDiagnosticsEndpoint,
  RuntimeStatusEndpointDependencies,
  VersionCheckEndpoint,
} from "./runtimeStatusEndpointContract";

export function createRuntimeStatusAdapter(
  endpoints: RuntimeStatusEndpointDependencies,
): RuntimeStatusPort {
  return {
    loadDiagnostics: (signal) => withPortFailure(async () =>
      toRuntimeDiagnostics(await endpoints.getRuntimeDiagnostics(signal))),
    checkVersion: (signal) => withPortFailure(async () =>
      toVersionCheck(await endpoints.getVersionCheck(signal))),
  };
}

function toRuntimeDiagnostics(value: RuntimeDiagnosticsEndpoint): RuntimeDiagnostics {
  return {
    observedAt: value.observed_at,
    completeness: value.completeness,
    runtime: {
      pythonVersion: value.runtime.python_version,
      pythonImplementation: value.runtime.python_implementation,
      processId: value.runtime.process_id,
      cpuCount: value.runtime.cpu_count,
      threadCount: value.runtime.thread_count,
      uptimeSeconds: value.runtime.uptime_seconds,
    },
    eventPipeline: {
      availability: value.event_pipeline.availability,
      openDeadLetters: value.event_pipeline.open_dead_letters,
      outboxPending: value.event_pipeline.outbox_pending,
      processingStatuses: value.event_pipeline.processing_statuses.map((status) => ({ ...status })),
      consumerLag: value.event_pipeline.consumer_lag.map((lag) => ({
        consumer: lag.consumer,
        subject: lag.subject,
        pending: lag.pending,
        ackPending: lag.ack_pending,
        redelivered: lag.redelivered,
      })),
      reasonCodes: [...value.event_pipeline.reason_codes],
    },
    timeline: {
      availability: value.timeline.availability,
      eventCount: value.timeline.event_count,
      oldestOccurredAt: value.timeline.oldest_occurred_at,
      newestOccurredAt: value.timeline.newest_occurred_at,
      highWaterSequence: value.timeline.high_water_sequence,
      retainedFromSequence: value.timeline.retained_from_sequence,
      reasonCodes: [...value.timeline.reason_codes],
    },
    agentCollection: {
      availability: value.agent_collection.availability,
      items: value.agent_collection.items.map((item) => ({
        clusterId: item.cluster_id,
        name: item.name,
        environment: item.environment,
        registrationStatus: item.registration_status,
        connectionStatus: item.connection_status,
        agentId: item.agent_id,
        agentStatus: item.agent_status,
        lastSeenAt: item.last_seen_at,
        capabilities: [...item.capabilities],
        latestInventory: item.latest_inventory === null ? null : {
          status: item.latest_inventory.status,
          source: item.latest_inventory.source,
          collectedAt: item.latest_inventory.collected_at,
          resourceCount: item.latest_inventory.resource_count,
        },
      })),
      reasonCodes: [...value.agent_collection.reason_codes],
    },
    reasonCodes: [...value.reason_codes],
  };
}

function toVersionCheck(value: VersionCheckEndpoint): VersionCheck {
  return {
    availability: value.availability,
    currentVersion: value.current_version,
    latestVersion: value.latest_version,
    updateAvailable: value.update_available,
    releaseUrl: value.release_url,
    releaseNotes: value.release_notes,
    observedAt: value.observed_at,
    reasonCodes: [...value.reason_codes],
  };
}

async function withPortFailure<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isAbortError(error) || error instanceof RuntimeStatusPortFailure) throw error;
    throw toPortFailure(error);
  }
}

function toPortFailure(error: unknown): RuntimeStatusPortFailure {
  const record = typeof error === "object" && error !== null && !Array.isArray(error)
    ? error as Record<string, unknown>
    : null;
  const kinds: Record<string, RuntimeStatusFailureCode> = {
    unauthorized: "unauthorized",
    forbidden: "forbidden",
    "invalid-payload": "invalid-response",
    network: "offline",
    "rate-limited": "rate-limited",
  };
  const kind = typeof record?.kind === "string" ? record.kind : "";
  return new RuntimeStatusPortFailure(kinds[kind] ?? "error");
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

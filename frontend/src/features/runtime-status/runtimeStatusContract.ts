export type RuntimeStatusAvailability = "available" | "partial" | "unavailable";

export interface RuntimeDiagnostics {
  observedAt: string;
  completeness: "complete" | "partial";
  runtime: {
    pythonVersion: string;
    pythonImplementation: string;
    processId: number;
    cpuCount: number | null;
    threadCount: number;
    uptimeSeconds: number;
  };
  eventPipeline: {
    availability: RuntimeStatusAvailability;
    openDeadLetters: number | null;
    outboxPending: number | null;
    processingStatuses: ReadonlyArray<{ status: string; count: number }>;
    consumerLag: ReadonlyArray<{
      consumer: string;
      subject: string;
      pending: number;
      ackPending: number;
      redelivered: number;
    }>;
    reasonCodes: readonly string[];
  };
  timeline: {
    availability: RuntimeStatusAvailability;
    eventCount: number | null;
    oldestOccurredAt: string | null;
    newestOccurredAt: string | null;
    highWaterSequence: number | null;
    retainedFromSequence: number | null;
    reasonCodes: readonly string[];
  };
  agentCollection: {
    availability: RuntimeStatusAvailability;
    items: ReadonlyArray<{
      clusterId: string;
      name: string;
      environment: string;
      registrationStatus: string;
      connectionStatus: "online" | "stale" | "never_connected";
      agentId: string | null;
      agentStatus: string | null;
      lastSeenAt: string | null;
      capabilities: readonly string[];
      latestInventory: {
        status: string;
        source: string;
        collectedAt: string;
        resourceCount: number;
      } | null;
    }>;
    reasonCodes: readonly string[];
  };
  reasonCodes: readonly string[];
}

export interface VersionCheck {
  availability: RuntimeStatusAvailability;
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean | null;
  releaseUrl: string | null;
  releaseNotes: string | null;
  observedAt: string;
  reasonCodes: readonly string[];
}

export type RuntimeStatusFailureCode =
  | "unauthorized"
  | "forbidden"
  | "invalid-response"
  | "offline"
  | "rate-limited"
  | "error";

export class RuntimeStatusPortFailure extends Error {
  readonly code: RuntimeStatusFailureCode;

  constructor(code: RuntimeStatusFailureCode) {
    super(`Runtime status port failed: ${code}`);
    this.name = "RuntimeStatusPortFailure";
    this.code = code;
  }
}

export interface RuntimeStatusPort {
  loadDiagnostics(signal?: AbortSignal): Promise<RuntimeDiagnostics>;
  checkVersion(signal?: AbortSignal): Promise<VersionCheck>;
}

const unavailable = () => Promise.reject(new RuntimeStatusPortFailure("error"));

export const EMPTY_RUNTIME_STATUS_PORT: RuntimeStatusPort = {
  loadDiagnostics: unavailable,
  checkVersion: unavailable,
};

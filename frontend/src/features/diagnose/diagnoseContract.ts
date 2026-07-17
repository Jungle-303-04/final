export type DiagnoseRunStatus =
  | "queued"
  | "running"
  | "awaiting_confirmation"
  | "completed"
  | "failed"
  | "stopped"
  | "stale"
  | "unavailable";

export type DiagnoseEventKind =
  | "phase"
  | "turn"
  | "step"
  | "thinking"
  | "verdict"
  | "command.proposal"
  | "command.receipt"
  | "operation"
  | "error"
  | "closed";

export interface DiagnoseResourceTarget {
  clusterId: string;
  resourceType: string;
  apiGroup: string;
  apiVersion: string;
  kind: string;
  namespace: string | null;
  name: string;
  uid: string;
}

export interface DiagnoseRun {
  runId: string;
  target: DiagnoseResourceTarget;
  status: DiagnoseRunStatus;
  statusReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DiagnoseEvent {
  runId: string;
  sequence: number;
  kind: DiagnoseEventKind;
  payload: Readonly<Record<string, unknown>>;
  occurredAt: string;
}

export interface DiagnoseCapabilities {
  enabled: boolean;
  agent: {
    id: string;
    isolated: boolean;
    model: string | null;
    effort: "minimal" | "low" | "medium" | "high";
  };
  label: string;
  disclosureRevision: string;
  consented: boolean;
  reasonCodes: readonly string[];
}

export interface DiagnoseRunList {
  runs: DiagnoseRun[];
  complete: boolean;
  historyStatus: "available" | "degraded";
  reasonCodes: readonly string[];
}

export interface DiagnoseLaunchResult {
  run: DiagnoseRun;
  created: boolean;
  deduplicated: boolean;
}

export interface DiagnosePort {
  getCapabilities(signal?: AbortSignal): Promise<DiagnoseCapabilities>;
  grantBrowserConsent(
    workspaceId: string,
    clusterId: string,
    capabilities: DiagnoseCapabilities,
    signal?: AbortSignal,
  ): Promise<void>;
  startResourceRun(
    target: DiagnoseResourceTarget,
    capabilities: DiagnoseCapabilities,
    signal?: AbortSignal,
  ): Promise<DiagnoseLaunchResult>;
  listRuns(limit?: number, signal?: AbortSignal): Promise<DiagnoseRunList>;
  addTurn(runId: string, question: string, signal?: AbortSignal): Promise<DiagnoseRun>;
  stopRun(runId: string, signal?: AbortSignal): Promise<DiagnoseRun>;
  clearFinished(signal?: AbortSignal): Promise<number>;
  subscribeEvents(
    runId: string,
    options?: { afterSequence?: number; signal?: AbortSignal },
  ): AsyncIterable<DiagnoseEvent>;
}

export const EMPTY_DIAGNOSE_PORT: DiagnosePort = {
  getCapabilities: async () => ({
    enabled: false,
    agent: { id: "unavailable", isolated: true, model: null, effort: "medium" },
    label: "AI",
    disclosureRevision: "unavailable",
    consented: false,
    reasonCodes: ["unavailable"],
  }),
  grantBrowserConsent: async () => {
    throw new Error("Diagnose is unavailable");
  },
  startResourceRun: async () => {
    throw new Error("Diagnose is unavailable");
  },
  listRuns: async () => ({
    runs: [],
    complete: true,
    historyStatus: "available",
    reasonCodes: [],
  }),
  addTurn: async () => {
    throw new Error("Diagnose is unavailable");
  },
  stopRun: async () => {
    throw new Error("Diagnose is unavailable");
  },
  clearFinished: async () => 0,
  async *subscribeEvents() {
    yield* [] as DiagnoseEvent[];
  },
};

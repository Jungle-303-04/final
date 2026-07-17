export interface DiagnoseAgentEndpoint {
  agent_id: string;
  isolated: boolean;
  model?: string | null;
  effort: "minimal" | "low" | "medium" | "high";
}

export interface DiagnoseRunEndpoint {
  run_id: string;
  target: {
    scope: {
      workspace_id: string;
      cluster_id: string;
      namespaces: readonly string[];
      freshness: "live" | "stale" | "partial" | "disconnected";
    };
    resource: {
      api_group: string;
      version: string;
      kind: string;
      namespace: string | null;
      name: string;
      uid: string;
    };
  };
  agent: DiagnoseAgentEndpoint;
  requested_by: string;
  status:
    | "queued"
    | "running"
    | "awaiting_confirmation"
    | "completed"
    | "failed"
    | "stopped"
    | "stale"
    | "unavailable";
  target_key: string;
  deduplication_key: string;
  status_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DiagnoseCapabilitiesEndpoint {
  enabled: boolean;
  agent: DiagnoseAgentEndpoint;
  label: string;
  disclosure_revision: string;
  consented: boolean;
  reason_codes: readonly string[];
}

export interface DiagnoseEventEndpoint {
  run_id: string;
  sequence: number;
  kind:
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
  payload: Record<string, unknown>;
  occurred_at: string;
}

export interface DiagnoseEndpointDependencies {
  getDiagnoseCapabilities(signal?: AbortSignal): Promise<DiagnoseCapabilitiesEndpoint>;
  grantDiagnoseConsent(payload: unknown, signal?: AbortSignal): Promise<unknown>;
  createDiagnoseRun(
    payload: unknown,
    signal?: AbortSignal,
  ): Promise<{ run: DiagnoseRunEndpoint; created: boolean; deduplicated: boolean }>;
  listDiagnoseRuns(
    limit?: number,
    signal?: AbortSignal,
  ): Promise<{
    runs: readonly DiagnoseRunEndpoint[];
    complete: boolean;
    history_status: "available" | "degraded";
    reason_codes: readonly string[];
  }>;
  addDiagnoseTurn(
    runId: string,
    question: string,
    signal?: AbortSignal,
  ): Promise<DiagnoseRunEndpoint>;
  stopDiagnoseRun(runId: string, signal?: AbortSignal): Promise<DiagnoseRunEndpoint>;
  clearDiagnoseHistory(signal?: AbortSignal): Promise<{ deleted_runs: number }>;
  subscribeDiagnoseEvents(
    runId: string,
    options?: { afterSequence?: number; signal?: AbortSignal },
  ): AsyncIterable<DiagnoseEventEndpoint>;
}

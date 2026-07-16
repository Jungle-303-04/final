export type RuntimeStatusAvailability = "available" | "partial" | "unavailable";

export interface RuntimeDiagnosticsEndpoint {
  observed_at: string;
  completeness: "complete" | "partial";
  runtime: {
    python_version: string;
    python_implementation: string;
    process_id: number;
    cpu_count: number | null;
    thread_count: number;
    uptime_seconds: number;
  };
  event_pipeline: {
    availability: RuntimeStatusAvailability;
    open_dead_letters: number | null;
    outbox_pending: number | null;
    processing_statuses: Array<{ status: string; count: number }>;
    consumer_lag: Array<{
      consumer: string;
      subject: string;
      pending: number;
      ack_pending: number;
      redelivered: number;
    }>;
    reason_codes: string[];
  };
  timeline: {
    availability: RuntimeStatusAvailability;
    event_count: number | null;
    oldest_occurred_at: string | null;
    newest_occurred_at: string | null;
    high_water_sequence: number | null;
    retained_from_sequence: number | null;
    reason_codes: string[];
  };
  agent_collection: {
    availability: RuntimeStatusAvailability;
    items: Array<{
      cluster_id: string;
      name: string;
      environment: string;
      registration_status: string;
      connection_status: "online" | "stale" | "never_connected";
      agent_id: string | null;
      agent_status: string | null;
      last_seen_at: string | null;
      capabilities: string[];
      latest_inventory: {
        status: string;
        source: string;
        collected_at: string;
        resource_count: number;
      } | null;
    }>;
    reason_codes: string[];
  };
  reason_codes: string[];
}

export interface VersionCheckEndpoint {
  availability: RuntimeStatusAvailability;
  current_version: string;
  latest_version: string | null;
  update_available: boolean | null;
  release_url: string | null;
  release_notes: string | null;
  observed_at: string;
  reason_codes: string[];
}

export interface RuntimeStatusEndpointDependencies {
  getRuntimeDiagnostics(signal?: AbortSignal): Promise<RuntimeDiagnosticsEndpoint>;
  getVersionCheck(signal?: AbortSignal): Promise<VersionCheckEndpoint>;
}

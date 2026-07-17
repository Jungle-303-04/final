export type LogStreamEndpointEvent =
  | { type: "connected"; stream_id: string; containers: string[] }
  | {
      type: "log";
      id: string;
      observed_at: string;
      pod: string;
      container: string;
      line: string;
      line_truncated: boolean;
    }
  | { type: "pod_added"; pod: string }
  | { type: "pod_removed"; pod: string }
  | {
      type: "end";
      reason: string;
      diagnostic: {
        code: "no_matching_pods" | "no_log_lines";
      } | null;
    }
  | { type: "error"; code: string; retryable: boolean };

export type WorkloadLogStreamKind = "deployments" | "statefulsets" | "daemonsets";

export interface LogStreamEndpointHandlers {
  onEvent: (event: LogStreamEndpointEvent) => void;
  onFailure: (error: unknown) => void;
}

export interface LogStreamEndpointDependencies {
  openPodLogStream(
    clusterId: string,
    namespace: string,
    name: string,
    container: string | null,
    handlers: LogStreamEndpointHandlers,
  ): () => void;
  openWorkloadLogStream(
    clusterId: string,
    kind: WorkloadLogStreamKind,
    namespace: string,
    name: string,
    handlers: LogStreamEndpointHandlers,
  ): () => void;
  openScheduledWorkloadRunLogStream(
    clusterId: string,
    kind: string,
    namespace: string,
    name: string,
    runKey: string,
    handlers: LogStreamEndpointHandlers,
  ): () => void;
}

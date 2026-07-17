export type LogStreamTarget =
  | {
      type: "pod";
      clusterId: string;
      namespace: string;
      name: string;
      container: string | null;
    }
  | {
      type: "workload";
      clusterId: string;
      kind: "deployments" | "statefulsets" | "daemonsets";
      namespace: string;
      name: string;
    }
  | {
      type: "scheduled-run";
      clusterId: string;
      kind: string;
      namespace: string;
      name: string;
      runKey: string;
    };

export type LogStreamEvent =
  | { type: "connected"; streamId: string; containers: readonly string[] }
  | {
      type: "log";
      id: string;
      observedAt: string;
      pod: string;
      container: string;
      line: string;
      lineTruncated: boolean;
    }
  | { type: "pod-added"; pod: string }
  | { type: "pod-removed"; pod: string }
  | {
      type: "end";
      reason: string;
      diagnostic: LogStreamDiagnostic | null;
    }
  | { type: "error"; code: string; retryable: boolean };

export type LogStreamFailureCode =
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "offline"
  | "invalid-request"
  | "rate-limited"
  | "unavailable"
  | "invalid-response"
  | "error";

export interface LogStreamDiagnostic {
  code: "no_matching_pods" | "no_log_lines";
}

export class LogStreamFailure extends Error {
  constructor(readonly code: LogStreamFailureCode) {
    super(`Log stream failed: ${code}`);
    this.name = "LogStreamFailure";
  }
}

export interface LogStreamHandlers {
  onEvent: (event: LogStreamEvent) => void;
  onFailure: (failure: LogStreamFailure) => void;
}

export interface LogStreamPort {
  open(target: LogStreamTarget, handlers: LogStreamHandlers): () => void;
}

export const EMPTY_LOG_STREAM_PORT: LogStreamPort = {
  open: (_target, handlers) => {
    queueMicrotask(() => handlers.onFailure(new LogStreamFailure("unavailable")));
    return () => undefined;
  },
};

export function logStreamTargetKey(target: LogStreamTarget): string {
  if (target.type === "pod") {
    return ["pod", target.clusterId, target.namespace, target.name, target.container ?? ""].join(":");
  }
  if (target.type === "scheduled-run") {
    return ["scheduled-run", target.clusterId, target.kind, target.namespace, target.name, target.runKey].join(":");
  }
  return ["workload", target.clusterId, target.kind, target.namespace, target.name].join(":");
}

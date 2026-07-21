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
    };

export type LogStreamEvent =
  | { type: "connected"; streamId: string }
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
  | { type: "end"; reason: string }
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
  return target.type === "pod"
    ? ["pod", target.clusterId, target.namespace, target.name, target.container ?? ""].join(":")
    : ["workload", target.clusterId, target.kind, target.namespace, target.name].join(":");
}

import {
  LogStreamFailure,
  type LogStreamEvent,
  type LogStreamFailureCode,
  type LogStreamPort,
} from "./logStreamContract";
import type {
  LogStreamEndpointDependencies,
  LogStreamEndpointEvent,
} from "./logStreamEndpointContract";

export function createLogStreamAdapter(
  endpoints: LogStreamEndpointDependencies,
): LogStreamPort {
  return {
    open(target, handlers) {
      const endpointHandlers = {
        onEvent: (event: LogStreamEndpointEvent) => handlers.onEvent(toEvent(event)),
        onFailure: (error: unknown) => handlers.onFailure(toFailure(error)),
      };
      if (target.type === "pod") {
        return endpoints.openPodLogStream(
            target.clusterId,
            target.namespace,
            target.name,
            target.container,
            endpointHandlers,
          );
      }
      if (target.type === "scheduled-run") {
        return endpoints.openScheduledWorkloadRunLogStream(
          target.clusterId,
          target.kind,
          target.namespace,
          target.name,
          target.runKey,
          endpointHandlers,
        );
      }
      return endpoints.openWorkloadLogStream(
            target.clusterId,
            target.kind,
            target.namespace,
            target.name,
            endpointHandlers,
          );
    },
  };
}

function toEvent(event: LogStreamEndpointEvent): LogStreamEvent {
  if (event.type === "connected") {
    return {
      type: "connected",
      streamId: required(event.stream_id),
      containers: [...event.containers],
    };
  }
  if (event.type === "log") {
    return {
      type: "log",
      id: required(event.id),
      observedAt: required(event.observed_at),
      pod: required(event.pod),
      container: required(event.container),
      line: event.line,
      lineTruncated: event.line_truncated,
    };
  }
  if (event.type === "pod_added" || event.type === "pod_removed") {
    return {
      type: event.type === "pod_added" ? "pod-added" : "pod-removed",
      pod: required(event.pod),
    };
  }
  if (event.type === "end") {
    return {
      type: "end",
      reason: required(event.reason),
      diagnostic: event.diagnostic === null ? null : {
        code: event.diagnostic.code,
        recovery: event.diagnostic.recovery === null ? null : {
          kind: "copy-command",
          command: required(event.diagnostic.recovery.command),
          clusterId: required(event.diagnostic.recovery.cluster_id),
          readOnly: event.diagnostic.recovery.read_only,
        },
      },
    };
  }
  return {
    type: "error",
    code: required(event.code),
    retryable: event.retryable,
  };
}

function toFailure(error: unknown): LogStreamFailure {
  if (error instanceof LogStreamFailure) return error;
  const kind = transportString(error, "kind");
  const status = transportNumber(error, "status");
  const byKind: Record<string, LogStreamFailureCode> = {
    unauthorized: "unauthorized",
    forbidden: "forbidden",
    "not-found": "not-found",
    network: "offline",
    "invalid-request": "invalid-request",
    "rate-limited": "rate-limited",
    "invalid-payload": "invalid-response",
  };
  const byStatus: Record<number, LogStreamFailureCode> = {
    401: "unauthorized",
    403: "forbidden",
    404: "not-found",
    422: "invalid-request",
    429: "rate-limited",
    503: "unavailable",
  };
  return new LogStreamFailure(byKind[kind ?? ""] ?? byStatus[status ?? -1] ?? "error");
}

function required(value: string | undefined): string {
  if (!value) throw new LogStreamFailure("invalid-response");
  return value;
}

function transportString(error: unknown, key: string): string | null {
  if (typeof error !== "object" || error === null || !(key in error)) return null;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function transportNumber(error: unknown, key: string): number | null {
  if (typeof error !== "object" || error === null || !(key in error)) return null;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

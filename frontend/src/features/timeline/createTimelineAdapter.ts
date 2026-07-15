import type { ClusterScope, ResourceRef } from "../../shared/parity/referenceParity";
import {
  TimelineFailure,
  type TimelineCoverage,
  type TimelineCursor,
  type TimelineEvent,
  type TimelinePort,
  type TimelineQuery,
  type TimelineRealtimePolicy,
  type TimelineReadSession,
  type TimelineSnapshot,
  type TimelineStreamFrame,
  type TimelineSubject,
  type TimelineWindow,
} from "./timelineContract";
import type {
  TimelineEndpointCoverage,
  TimelineEndpointDependencies,
  TimelineEndpointEvent,
  TimelineEndpointQuery,
  TimelineEndpointResourceRef,
  TimelineEndpointScope,
  TimelineEndpointStreamFrame,
  TimelineEndpointSubject,
} from "./timelineEndpointContract";

const ACTIVITY_BY_URL_KEY = {
  changes: "change",
  k8s_events: "k8s_event",
  unhealthy: "unhealthy",
  warnings: "warning",
} as const;

export interface TimelineAdapterDependencies extends TimelineEndpointDependencies {
  now?: () => number;
  random?: () => number;
}

export function createTimelineAdapter(dependencies: TimelineAdapterDependencies): TimelinePort {
  const now = dependencies.now ?? Date.now;
  const random = dependencies.random ?? Math.random;
  return {
    capabilities: {
      sourceMode: "retained",
      maxRangeDays: null,
      requiresNamespaceFilter: false,
    },
    async readTimeline(query, signal) {
      try {
        const request = createTimelineEndpointQuery(query, resolveTimelineWindow(query, now));
        const value = await dependencies.getTimelineSnapshot({ query: request }, signal);
        if (value.snapshot.cursor.token !== value.end.cursor.token) {
          throw new TimelineFailure("invalid-response");
        }
        return toTimelineSnapshot(query, request.window, value);
      } catch (error) {
        if (isAbortError(error) || error instanceof TimelineFailure) throw error;
        throw toTimelineFailure(error);
      }
    },
    async *subscribeTimeline(session, subscription) {
      const query = createTimelineEndpointQuery(session.query, session.window);
      const { onLifecycle, signal } = subscription ?? {};
      let cursor = session.cursor;
      let attempt = 0;
      while (!signal?.aborted) {
        if (attempt === 0) onLifecycle?.({ state: "connecting" });
        try {
          let terminal = false;
          for await (const endpointFrame of dependencies.subscribeTimelineEvents({
            query,
            after: cursor,
          }, {
            signal,
            onLifecycle: (lifecycle) => {
              if (lifecycle.state === "connected") onLifecycle?.(lifecycle);
            },
          })) {
            const frame = toTimelineStreamFrame(endpointFrame);
            cursor = frame.cursor;
            yield frame;
            if (frame.kind === "resync_required" || frame.kind === "error") {
              terminal = true;
              break;
            }
          }
          if (terminal || signal?.aborted) {
            onLifecycle?.({ state: "closed" });
            return;
          }
          throw new TimelineStreamInterruptedError();
        } catch (error) {
          if (isAbortError(error)) return;
          if (!isTransientTimelineStreamError(error)) {
            onLifecycle?.({ state: "failed", failure: streamFailureFor(error) });
            throw error instanceof TimelineFailure ? error : toTimelineFailure(error);
          }
          attempt += 1;
          const retryAfterMs = reconnectDelayMs(session.policy, attempt, error, random);
          onLifecycle?.({ state: "reconnecting", attempt, retryAfterMs });
          await waitForReconnect(retryAfterMs, signal);
        }
      }
    },
  };
}

/** Maps URL-level activity keys once, then preserves every other filter verbatim. */
export function createTimelineEndpointQuery(
  query: TimelineQuery,
  window: TimelineWindow,
): TimelineEndpointQuery {
  const scopes = canonicalScopes(query.scopes);
  if (scopes.length === 0) throw new TimelineFailure("invalid-request");
  if (new Set(scopes.map((scope) => scope.workspace_id)).size !== 1) {
    throw new TimelineFailure("invalid-request");
  }
  assertWindow(window);
  return {
    scopes,
    window: { from_ms: window.fromMs, to_ms: window.toMs },
    filters: {
      activity: query.filters.activity.map((activity) => ACTIVITY_BY_URL_KEY[activity]),
      kinds: [...query.filters.kinds],
      include_deleted: query.filters.showDeleted,
      pinned_only: query.filters.pinnedOnly,
      query: query.filters.search,
    },
    grouping: query.filters.grouping,
    sort: query.filters.sort,
  };
}

/** A live URL is still a finite server request; `all` never becomes an unbounded read. */
export function resolveTimelineWindow(query: TimelineQuery, now: () => number): TimelineWindow {
  if (query.mode.kind === "frozen") {
    const window = { fromMs: query.mode.fromMs, toMs: query.mode.toMs };
    assertWindow(window);
    return window;
  }
  const toMs = now();
  const widthMs = query.mode.widthMs;
  if (!Number.isSafeInteger(toMs) || !Number.isSafeInteger(widthMs) || widthMs <= 0) {
    throw new TimelineFailure("invalid-request");
  }
  const fromMs = toMs - widthMs;
  const window = { fromMs, toMs };
  assertWindow(window);
  return window;
}

function toTimelineSnapshot(
  query: TimelineQuery,
  window: { from_ms: number; to_ms: number },
  endpoint: Awaited<ReturnType<TimelineEndpointDependencies["getTimelineSnapshot"]>>,
): TimelineSnapshot {
  const policy = toRealtimePolicy(endpoint.snapshot.policy);
  const session: TimelineReadSession = {
    query,
    window: { fromMs: window.from_ms, toMs: window.to_ms },
    cursor: toCursor(endpoint.snapshot.cursor),
    policy,
  };
  return {
    session,
    scopes: endpoint.snapshot.scopes.map(toScope),
    policy,
    events: endpoint.snapshot.events.map(toEvent),
    coverage: endpoint.snapshot.coverage.map(toCoverage),
  };
}

function toTimelineStreamFrame(frame: TimelineEndpointStreamFrame): TimelineStreamFrame {
  switch (frame.kind) {
    case "event":
      return { kind: "event", cursor: toCursor(frame.cursor), event: toEvent(frame.event) };
    case "coverage":
      return {
        kind: "coverage",
        cursor: toCursor(frame.cursor),
        coverage: frame.coverage.map(toCoverage),
      };
    case "resync_required":
      return { kind: "resync_required", cursor: toCursor(frame.cursor), reason: frame.reason };
    case "error":
      return { kind: "error", cursor: toCursor(frame.cursor), reason: frame.reason };
  }
}

function canonicalScopes(scopes: readonly ClusterScope[]): TimelineEndpointScope[] {
  const byKey = new Map<string, TimelineEndpointScope>();
  for (const scope of scopes) {
    const workspaceId = scope.workspaceId.trim();
    const clusterId = scope.clusterId.trim();
    if (!workspaceId || !clusterId) throw new TimelineFailure("invalid-request");
    const namespaces = [...new Set((scope.namespaces ?? []).map((value) => value.trim()).filter(Boolean))]
      .sort();
    const canonical: TimelineEndpointScope = {
      workspace_id: workspaceId,
      cluster_id: clusterId,
      namespaces,
      freshness: scope.freshness,
    };
    byKey.set(`${workspaceId}\u0000${clusterId}\u0000${namespaces.join("\u0000")}`, canonical);
  }
  return [...byKey.values()].sort((left, right) => (
    left.cluster_id.localeCompare(right.cluster_id) || left.namespaces.join("\u0000").localeCompare(right.namespaces.join("\u0000"))
  ));
}

function assertWindow(window: TimelineWindow): void {
  if (
    !Number.isSafeInteger(window.fromMs)
    || !Number.isSafeInteger(window.toMs)
    || window.fromMs < 0
    || window.toMs <= window.fromMs
  ) {
    throw new TimelineFailure("invalid-request");
  }
}

function toScope(scope: TimelineEndpointScope): ClusterScope {
  return {
    workspaceId: scope.workspace_id,
    clusterId: scope.cluster_id,
    namespaces: [...scope.namespaces],
    freshness: scope.freshness,
  };
}

function toResourceRef(resource: TimelineEndpointResourceRef): ResourceRef {
  return {
    apiGroup: resource.api_group || undefined,
    version: resource.version || undefined,
    kind: resource.kind,
    namespace: resource.namespace,
    name: resource.name,
    uid: resource.uid,
  };
}

function toSubject(subject: TimelineEndpointSubject): TimelineSubject {
  switch (subject.kind) {
    case "resource":
      return { kind: "resource", resource: toResourceRef(subject.resource) };
    case "inventory_locator":
      return {
        kind: "inventory_locator",
        inventoryKey: subject.inventory_key,
        apiGroup: subject.api_group,
        version: subject.version,
        resourceKind: subject.resource_kind,
        namespace: subject.namespace,
        name: subject.name,
      };
    case "incident":
      return {
        kind: "incident",
        incidentId: subject.incident_id,
        correlationId: subject.correlation_id,
      };
    case "application_workflow":
      return {
        kind: "application_workflow",
        applicationId: subject.application_id,
        bindingId: subject.binding_id,
        workflowRunId: subject.workflow_run_id,
      };
  }
}

function toEvent(event: TimelineEndpointEvent): TimelineEvent {
  return {
    id: event.event_id,
    source: event.source,
    sourceKey: event.source_key,
    nativeId: event.native_id,
    activity: event.activity,
    occurredAt: event.occurred_at,
    scope: toScope(event.scope),
    subject: toSubject(event.subject),
    resource: event.resource === null ? null : toResourceRef(event.resource),
    type: event.event_type,
    severity: event.severity,
    title: event.title,
    owner: event.owner === null ? null : toResourceRef(event.owner),
    metadata: event.metadata,
  };
}

function toCoverage(coverage: TimelineEndpointCoverage): TimelineCoverage {
  return {
    scope: toScope(coverage.scope),
    source: coverage.source,
    fromMs: coverage.from_ms,
    toMs: coverage.to_ms,
    reason: coverage.reason,
  };
}

function toRealtimePolicy(policy: {
  max_batch_events: number;
  max_frames_per_second: number;
  retention_seconds: number;
  resume: "cursor";
  hidden_tab: "coalesce";
  reconnect: { min_delay_ms: number; max_delay_ms: number; strategy: "full_jitter_exponential" };
}): TimelineRealtimePolicy {
  return {
    maxBatchEvents: policy.max_batch_events,
    maxFramesPerSecond: policy.max_frames_per_second,
    retentionSeconds: policy.retention_seconds,
    resume: policy.resume,
    hiddenTab: policy.hidden_tab,
    reconnect: {
      minDelayMs: policy.reconnect.min_delay_ms,
      maxDelayMs: policy.reconnect.max_delay_ms,
      strategy: policy.reconnect.strategy,
    },
  };
}

function toCursor(cursor: { token: string }): TimelineCursor {
  return { token: cursor.token };
}

function toTimelineFailure(error: unknown): TimelineFailure {
  const kind = fieldString(error, "kind");
  const status = fieldNumber(error, "status");
  const code: TimelineFailure["code"] = status === 503
    ? "unavailable"
    : kind === "forbidden" || kind === "unauthorized" || status === 403 || status === 401
      ? "forbidden"
      : kind === "network"
        ? "offline"
        : kind === "invalid-request" || kind === "invalid-payload" || status === 422
          ? "invalid-response"
          : "unknown";
  return new TimelineFailure(code, fieldString(error, "detail"));
}

function fieldString(value: unknown, field: string): string | null {
  if (typeof value !== "object" || value === null || !(field in value)) return null;
  const candidate = (value as Record<string, unknown>)[field];
  return typeof candidate === "string" ? candidate : null;
}

function fieldNumber(value: unknown, field: string): number | null {
  if (typeof value !== "object" || value === null || !(field in value)) return null;
  const candidate = (value as Record<string, unknown>)[field];
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error
    && error.name === "AbortError";
}

class TimelineStreamInterruptedError extends Error {
  constructor() {
    super("Timeline stream closed before a terminal frame.");
    this.name = "TimelineStreamInterruptedError";
  }
}

function isTransientTimelineStreamError(error: unknown): boolean {
  if (error instanceof TimelineStreamInterruptedError) return true;
  if (error instanceof TimelineFailure) {
    return error.code === "offline" || error.code === "unavailable" || error.code === "unknown";
  }
  const kind = fieldString(error, "kind");
  const status = fieldNumber(error, "status");
  return kind === null || kind === "network" || status === 503 || status === 429 || kind === "rate-limited";
}

function streamFailureFor(error: unknown): "forbidden" | "invalid" | "unavailable" {
  if (error instanceof TimelineFailure && error.code === "forbidden") return "forbidden";
  const kind = fieldString(error, "kind");
  const status = fieldNumber(error, "status");
  if (kind === "forbidden" || kind === "unauthorized" || status === 401 || status === 403) {
    return "forbidden";
  }
  if (kind === "invalid-request" || kind === "invalid-payload" || status === 404 || status === 422) {
    return "invalid";
  }
  return "unavailable";
}

function reconnectDelayMs(
  policy: TimelineRealtimePolicy,
  attempt: number,
  error: unknown,
  random: () => number,
): number {
  const retryAfterMs = retryAfterDelayMilliseconds(error);
  if (retryAfterMs !== null) return retryAfterMs;
  let cap = policy.reconnect.minDelayMs;
  for (let currentAttempt = 1; currentAttempt < attempt && cap < policy.reconnect.maxDelayMs; currentAttempt += 1) {
    cap = Math.min(policy.reconnect.maxDelayMs, cap * 2);
  }
  const sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
    throw new TimelineFailure("invalid-response");
  }
  return policy.reconnect.minDelayMs + Math.floor(
    sample * (cap - policy.reconnect.minDelayMs + 1),
  );
}

function retryAfterDelayMilliseconds(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("retryAfter" in error)) return null;
  const retryAfter = (error as Record<string, unknown>).retryAfter;
  if (retryAfter === null || retryAfter === undefined) return null;
  if (
    typeof retryAfter !== "number"
    || !Number.isSafeInteger(retryAfter)
    || retryAfter < 0
    || !Number.isSafeInteger(retryAfter * 1_000)
  ) {
    throw new TimelineFailure("invalid-response");
  }
  return retryAfter * 1_000;
}

async function waitForReconnect(delayMs: number, signal: AbortSignal | undefined): Promise<void> {
  await new Promise<void>((resolve) => {
    const complete = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", complete);
      resolve();
    };
    const timer = setTimeout(complete, delayMs);
    signal?.addEventListener("abort", complete, { once: true });
  });
}

import type { ClusterScope, ResourceRef } from "../../shared/parity/referenceParity";
import {
  TimelineFailure,
  timelineActivitiesFromUrlKeys,
  type TimelineCapabilities,
  type TimelineCoverage,
  type TimelineCoverageSourceAvailability,
  type TimelineCursor,
  type TimelineEvent,
  type TimelinePort,
  type TimelineOverview,
  type TimelinePin,
  type TimelinePinMutation,
  type TimelinePinSet,
  type TimelinePinTarget,
  type TimelinePinUpsert,
  type TimelineQuery,
  type TimelineRealtimePolicy,
  type TimelineReadSession,
  type TimelineQueryBounds,
  type TimelineSnapshot,
  type TimelineStreamFrame,
  type TimelineSubject,
  type TimelineWindow,
} from "./timelineContract";
import type {
  TimelineEndpointCapabilityDescriptor,
  TimelineEndpointCoverage,
  TimelineEndpointDependencies,
  TimelineEndpointEvent,
  TimelineEndpointOverview,
  TimelineEndpointPinMutation,
  TimelineEndpointPinSet,
  TimelineEndpointPinTarget,
  TimelineEndpointPinUpsert,
  TimelineEndpointQuery,
  TimelineEndpointResourceRef,
  TimelineEndpointScope,
  TimelineEndpointStreamFrame,
  TimelineEndpointSubject,
} from "./timelineEndpointContract";

const SESSION_CAPABILITY_CACHE_KEY = "session";

export interface TimelineAdapterDependencies extends TimelineEndpointDependencies {
  random?: () => number;
}

export function createTimelineAdapter(dependencies: TimelineAdapterDependencies): TimelinePort {
  const random = dependencies.random ?? Math.random;
  let capabilities: TimelineCapabilities | null = null;
  let activeCapabilityCacheKey: string | null = null;
  const capabilitiesByWorkspace = new Map<string, TimelineCapabilities>();
  const capabilityRequestsByWorkspace = new Map<string, Promise<TimelineCapabilities>>();
  return {
    get capabilities() {
      if (capabilities === null) {
        throw new TimelineFailure("invalid-response", "Timeline capabilities have not been bootstrapped.");
      }
      return capabilities;
    },
    readCapabilities(signal, workspaceCacheKey) {
      return loadCapabilities(signal, workspaceCacheKey);
    },
    async readTimeline(query, signal) {
      try {
        const preflightCapabilities = await loadCapabilities(
          signal,
          timelineWorkspaceCacheKey(query),
        );
        const request = createTimelineEndpointQuery(query, resolveTimelineWindow(query, preflightCapabilities.queryBounds));
        assertControlSelection(preflightCapabilities, request);
        const value = await dependencies.getTimelineSnapshot({ query: request }, signal);
        if (value.snapshot.cursor.token !== value.end.cursor.token) {
          throw new TimelineFailure("invalid-response");
        }
        assertMatchingCapabilityDescriptors(
          preflightCapabilities,
          toTimelineCapabilityDescriptor(value.snapshot.capabilities),
        );
        return toTimelineSnapshot(query, request.window, value);
      } catch (error) {
        if (isAbortError(error) || error instanceof TimelineFailure) throw error;
        throw toTimelineFailure(error);
      }
    },
    async readTimelineOverview(query, signal) {
      try {
        const preflightCapabilities = await loadCapabilities(
          signal,
          timelineWorkspaceCacheKey(query),
        );
        const request = createTimelineEndpointQuery(query, resolveTimelineWindow(query, preflightCapabilities.queryBounds));
        assertControlSelection(preflightCapabilities, request);
        const overview = await dependencies.getTimelineOverview({ query: request }, signal);
        return toTimelineOverview(overview);
      } catch (error) {
        if (isAbortError(error) || error instanceof TimelineFailure) throw error;
        throw toTimelineFailure(error);
      }
    },
    async readTimelinePins(signal, workspaceCacheKey) {
      try {
        const preflightCapabilities = await loadCapabilities(signal, workspaceCacheKey);
        assertPinsAvailable(preflightCapabilities);
        return toTimelinePinSet(await dependencies.getTimelinePins(signal));
      } catch (error) {
        if (isAbortError(error) || error instanceof TimelineFailure) throw error;
        throw toTimelineFailure(error);
      }
    },
    async upsertTimelinePin(input, signal, workspaceCacheKey) {
      try {
        const preflightCapabilities = await loadCapabilities(signal, workspaceCacheKey);
        assertPinsAvailable(preflightCapabilities);
        return toTimelinePinMutation(await dependencies.upsertTimelinePin(
          toTimelineEndpointPinUpsert(input),
          signal,
        ));
      } catch (error) {
        if (isAbortError(error) || error instanceof TimelineFailure) throw error;
        throw toTimelineFailure(error);
      }
    },
    async removeTimelinePin(pinId, expectedRevision, signal, workspaceCacheKey) {
      try {
        const preflightCapabilities = await loadCapabilities(signal, workspaceCacheKey);
        assertPinsAvailable(preflightCapabilities);
        assertTimelinePinId(pinId);
        assertPinExpectedRevision(expectedRevision);
        return toTimelinePinMutation(await dependencies.removeTimelinePin(
          pinId,
          expectedRevision,
          signal,
        ));
      } catch (error) {
        if (isAbortError(error) || error instanceof TimelineFailure) throw error;
        throw toTimelineFailure(error);
      }
    },
    async *subscribeTimeline(session, subscription) {
      const query = createTimelineEndpointQuery(session.query, session.window);
      const streamCapabilities = capabilitiesByWorkspace.get(timelineWorkspaceCacheKey(session.query))
        ?? capabilities;
      if (streamCapabilities === null) {
        throw new TimelineFailure(
          "invalid-response",
          "Timeline stream requires a preflight capability descriptor.",
        );
      }
      assertControlSelection(streamCapabilities, query);
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

  async function loadCapabilities(
    signal?: AbortSignal,
    workspaceCacheKey?: string,
  ): Promise<TimelineCapabilities> {
    const cacheKey = workspaceCacheKey === undefined
      ? activeCapabilityCacheKey ?? SESSION_CAPABILITY_CACHE_KEY
      : `workspace:${workspaceCacheKey}`;
    const cached = capabilitiesByWorkspace.get(cacheKey);
    if (cached !== undefined) {
      capabilities = cached;
      activeCapabilityCacheKey = cacheKey;
      return cached;
    }
    const request = capabilityRequestsByWorkspace.get(cacheKey)
      ?? dependencies.getTimelineCapabilities(signal)
      .then(toTimelineCapabilityDescriptor);
    capabilityRequestsByWorkspace.set(cacheKey, request);
    try {
      const resolved = await request;
      capabilities = resolved;
      activeCapabilityCacheKey = cacheKey;
      capabilitiesByWorkspace.set(cacheKey, resolved);
      return resolved;
    } catch (error) {
      if (isAbortError(error) || error instanceof TimelineFailure) throw error;
      throw toTimelineFailure(error);
    } finally {
      if (capabilityRequestsByWorkspace.get(cacheKey) === request) {
        capabilityRequestsByWorkspace.delete(cacheKey);
      }
    }
  }
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
    mode: query.mode.kind,
    filters: {
      activity: [...new Set(timelineActivitiesFromUrlKeys(query.filters.activity))].sort(),
      kinds: [...query.filters.kinds],
      include_deleted: query.filters.showDeleted,
      pinned_only: query.filters.pinnedOnly,
      query: query.filters.search,
    },
    grouping: query.filters.grouping,
    sort: query.filters.sort,
    view: query.control.view,
    range_id: query.control.rangeId,
    lens_zoom_rung: query.control.lensZoomRung,
  };
}

/** A live URL is still a finite server request; `all` never becomes an unbounded read. */
export function resolveTimelineWindow(query: TimelineQuery, bounds: TimelineQueryBounds): TimelineWindow {
  if (query.mode.kind === "frozen") {
    const window = { fromMs: query.mode.fromMs, toMs: query.mode.toMs };
    assertWindow(window);
    return window;
  }
  const toMs = bounds.serverNowMs;
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
    pinSetRevision: endpoint.snapshot.pin_set_revision,
  };
}

function toTimelineCapabilityDescriptor(
  descriptor: TimelineEndpointCapabilityDescriptor,
): TimelineCapabilities {
  return {
    selectedSourceMode: descriptor.selected_source_mode,
    availableSourceModes: [...descriptor.available_source_modes],
    maxRetainedRangeMs: descriptor.max_retained_range_ms,
    queryBounds: toTimelineQueryBounds(descriptor.query_bounds),
    namespaceFilterPolicy: descriptor.namespace_filter_policy,
    controlSurface: {
      views: descriptor.control_surface.views.map(toTimelineControlOption),
      groupings: descriptor.control_surface.groupings.map(toTimelineControlOption),
      sorts: descriptor.control_surface.sorts.map(toTimelineControlOption),
      activity: descriptor.control_surface.activity.map((option) => ({
        ...toTimelineControlOption(option),
        activity: [...option.activity],
        problemsActivity: [...option.problems_activity],
      })),
      deleted: { ...descriptor.control_surface.deleted },
      kinds: {
        key: descriptor.control_surface.kinds.key,
        label: descriptor.control_surface.kinds.label,
        selection: descriptor.control_surface.kinds.selection,
        emptySelection: descriptor.control_surface.kinds.empty_selection,
      },
      timeRanges: descriptor.control_surface.time_ranges.map((option) => ({
        ...toTimelineControlOption(option),
        durationMs: option.duration_ms,
      })),
      defaultTimeRangeId: descriptor.control_surface.default_time_range_id,
      customTimeRangeId: descriptor.control_surface.custom_time_range_id,
      lensZoomRungs: descriptor.control_surface.lens_zoom_rungs.map((option) => ({
        ...toTimelineControlOption(option),
        durationMs: option.duration_ms,
      })),
      defaultLensZoomRung: descriptor.control_surface.default_lens_zoom_rung,
      legend: {
        key: descriptor.control_surface.legend.key,
        label: descriptor.control_surface.legend.label,
        availability: descriptor.control_surface.legend.availability,
        items: descriptor.control_surface.legend.items.map(toTimelineControlOption),
      },
      pins: toTimelinePinsControl(descriptor.control_surface.pins),
    },
  };
}

function toTimelinePinsControl(
  pins: TimelineEndpointCapabilityDescriptor["control_surface"]["pins"],
): TimelineCapabilities["controlSurface"]["pins"] {
  if (pins.availability === "available") {
    return {
      key: pins.key,
      label: pins.label,
      availability: pins.availability,
      storage: pins.storage,
      revision: pins.revision,
      subjectKinds: [...pins.subject_kinds] as ["resource", "application"],
    };
  }
  return {
    key: pins.key,
    label: pins.label,
    availability: pins.availability,
    storage: pins.storage,
    revision: pins.revision,
    subjectKinds: [],
  };
}

function toTimelineControlOption(option: {
  id: string;
  label: string;
  description: string | null;
}) {
  return {
    id: option.id,
    label: option.label,
    description: option.description,
  };
}

function timelineWorkspaceCacheKey(query: TimelineQuery): string {
  return query.scopes[0]?.workspaceId ?? SESSION_CAPABILITY_CACHE_KEY;
}

function assertMatchingCapabilityDescriptors(
  preflight: TimelineCapabilities,
  snapshot: TimelineCapabilities,
): void {
  if (
    preflight.selectedSourceMode !== snapshot.selectedSourceMode
    || preflight.maxRetainedRangeMs !== snapshot.maxRetainedRangeMs
    || !strictValueEqual(preflight.queryBounds, snapshot.queryBounds)
    || preflight.namespaceFilterPolicy !== snapshot.namespaceFilterPolicy
    || preflight.availableSourceModes.length !== snapshot.availableSourceModes.length
    || preflight.availableSourceModes.some((mode, index) => mode !== snapshot.availableSourceModes[index])
    || !strictValueEqual(preflight.controlSurface, snapshot.controlSurface)
  ) {
    throw new TimelineFailure("invalid-response", "Timeline snapshot capabilities disagreed with bootstrap.");
  }
}

function assertControlSelection(
  capabilities: TimelineCapabilities,
  query: TimelineEndpointQuery,
): void {
  const controls = capabilities.controlSurface;
  if (
    !hasControlId(controls.views, query.view)
    || !hasControlId(controls.groupings, query.grouping)
    || !hasControlId(controls.sorts, query.sort)
    || !hasControlId(controls.lensZoomRungs, query.lens_zoom_rung)
    || (query.range_id !== controls.customTimeRangeId && !hasControlId(controls.timeRanges, query.range_id))
    || (query.filters.pinned_only && controls.pins.availability !== "available")
  ) {
    throw new TimelineFailure("invalid-request", "Timeline control selection is unavailable.");
  }
  const activity = query.filters.activity;
  const hasActivityProjection = controls.activity.some((option) => (
    strictValueEqual(option.activity, activity) || strictValueEqual(option.problemsActivity, activity)
  ));
  if (!hasActivityProjection) {
    throw new TimelineFailure("invalid-request", "Timeline activity selection is unavailable.");
  }
}

function assertPinsAvailable(capabilities: TimelineCapabilities): void {
  if (capabilities.controlSurface.pins.availability !== "available") {
    throw new TimelineFailure("invalid-request", "Timeline pins are unavailable.");
  }
}

function hasControlId(options: readonly { id: string }[], id: string): boolean {
  return options.some((option) => option.id === id);
}

/** Structural equality intentionally preserves array order for server control catalogs. */
function strictValueEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((item, index) => strictValueEqual(item, right[index]));
  }
  if (typeof left !== "object") return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key) => Object.prototype.hasOwnProperty.call(rightRecord, key)
      && strictValueEqual(leftRecord[key], rightRecord[key]));
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

function toTimelineOverview(overview: TimelineEndpointOverview): TimelineOverview {
  return {
    window: { fromMs: overview.window.from_ms, toMs: overview.window.to_ms },
    queryBounds: toTimelineQueryBounds(overview.query_bounds),
    bucketWidthMs: overview.bucket_width_ms,
    buckets: overview.buckets.map((bucket) => ({
      fromMs: bucket.from_ms,
      toMs: bucket.to_ms,
      eventCount: bucket.event_count,
      problemCount: bucket.problem_count,
    })),
    coverage: overview.coverage.map(toCoverage),
    coverageSources: overview.coverage_sources.map(toCoverageSourceAvailability),
    facets: {
      activity: overview.facets.activity.map((facet) => ({
        activity: facet.activity,
        count: facet.count,
      })),
      kinds: overview.facets.kinds.map((facet) => ({ kind: facet.kind, count: facet.count })),
    },
    newEvidenceCount: overview.new_evidence_count,
    pinSetRevision: overview.pin_set_revision,
  };
}

function toTimelineQueryBounds(bounds: TimelineEndpointCapabilityDescriptor["query_bounds"]) {
  return {
    serverNowMs: bounds.server_now_ms,
    earliestQueryableMs: bounds.earliest_queryable_ms,
    maxWindowMs: bounds.max_window_ms,
  };
}

function toTimelinePinSet(pinSet: TimelineEndpointPinSet): TimelinePinSet {
  return {
    revision: pinSet.revision,
    pins: pinSet.pins.map(toTimelinePin),
  };
}

function toTimelinePinMutation(mutation: TimelineEndpointPinMutation): TimelinePinMutation {
  return { action: mutation.action, pinSet: toTimelinePinSet(mutation.pin_set) };
}

function toTimelinePin(pin: TimelineEndpointPinSet["pins"][number]): TimelinePin {
  return {
    pinId: pin.pin_id,
    subject: pin.subject.kind === "resource"
      ? {
        kind: "resource",
        scope: toScope(pin.subject.scope),
        resource: toResourceRef(pin.subject.resource),
      }
      : {
        kind: "application",
        applicationId: pin.subject.application_id,
        snapshot: {
          name: pin.subject.snapshot.name,
          repositoryId: pin.subject.snapshot.repository_id,
          manifestPath: pin.subject.snapshot.manifest_path,
        },
      },
    createdAt: pin.created_at,
  };
}

function toTimelineEndpointPinUpsert(input: TimelinePinUpsert): TimelineEndpointPinUpsert {
  assertPinExpectedRevision(input.expectedRevision);
  return {
    expected_revision: input.expectedRevision,
    target: toTimelineEndpointPinTarget(input.target),
  };
}

function toTimelineEndpointPinTarget(target: TimelinePinTarget): TimelineEndpointPinTarget {
  if (target.kind === "application") {
    const applicationId = target.applicationId.trim();
    if (!applicationId || applicationId.length > 512) {
      throw new TimelineFailure("invalid-request", "Timeline application pin target is invalid.");
    }
    return { kind: "application", application_id: applicationId };
  }
  const [scope] = canonicalScopes([target.scope]);
  if (scope === undefined) throw new TimelineFailure("invalid-request");
  return {
    kind: "resource",
    scope,
    resource: toTimelineEndpointResourceRef(target.resource),
  };
}

function toTimelineEndpointResourceRef(resource: ResourceRef): TimelineEndpointResourceRef {
  const kind = resource.kind.trim();
  const name = resource.name.trim();
  const uid = resource.uid.trim();
  if (!kind || !name || !uid) {
    throw new TimelineFailure("invalid-request", "Timeline resource pin target is invalid.");
  }
  return {
    api_group: resource.apiGroup?.trim() ?? "",
    version: resource.version?.trim() ?? "",
    kind,
    namespace: resource.namespace === null ? null : resource.namespace.trim(),
    name,
    uid,
  };
}

function assertTimelinePinId(pinId: string): void {
  if (!pinId.trim() || pinId.length > 128) {
    throw new TimelineFailure("invalid-request", "Timeline pin identity is invalid.");
  }
}

function assertPinExpectedRevision(expectedRevision: number): void {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new TimelineFailure("invalid-request", "Timeline pin revision is invalid.");
  }
}

function toCoverageSourceAvailability(
  coverage: TimelineEndpointOverview["coverage_sources"][number],
): TimelineCoverageSourceAvailability {
  return { source: coverage.source, availability: coverage.availability };
}

function toRealtimePolicy(policy: {
  max_batch_events: number;
  max_frames_per_second: number;
  retention_seconds: number;
  resume: "cursor";
  hidden_tab: "coalesce";
  reconnect: { min_delay_ms: number; max_delay_ms: number; strategy: "full_jitter_exponential" };
  live_session: { max_age_ms: number; strategy: "replace_with_snapshot" };
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
    liveSession: {
      maxAgeMs: policy.live_session.max_age_ms,
      strategy: policy.live_session.strategy,
    },
  };
}

function toCursor(cursor: { token: string }): TimelineCursor {
  return { token: cursor.token };
}

function toTimelineFailure(error: unknown): TimelineFailure {
  const kind = fieldString(error, "kind");
  const status = fieldNumber(error, "status");
  const code: TimelineFailure["code"] = status === 409
    ? "conflict"
    : status === 503
    ? "unavailable"
    : kind === "forbidden" || kind === "unauthorized" || kind === "not-found"
      || status === 404 || status === 403 || status === 401
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

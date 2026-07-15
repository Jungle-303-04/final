// @vitest-environment jsdom

import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthSessionGateProvider } from "../../features/auth/AuthSessionGate";
import { ClusterScopeProvider } from "../../features/cluster-scope/ClusterScopeProvider";
import type { ClusterScopePort } from "../../features/cluster-scope/clusterScopeContract";
import { UnifiedFilterProvider, useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type { HomeClusterChoice } from "../../features/home/homeContract";
import {
  TimelineFailure,
  type TimelineCapabilities,
  type TimelinePort,
  type TimelineQuery,
  type TimelineSnapshot,
  type TimelineStreamFrame,
} from "../../features/timeline/timelineContract";
import { I18nProvider } from "../../shared/i18n";
import { createTimelineSurface, TimelineCapabilityGate } from "./createTimelineSurface";

afterEach(cleanup);

describe("Timeline capability route gate", () => {
  it("waits for scope resolution and preserves the descriptor through a cluster switch", async () => {
    const choices = deferred<{ completeness: "unknown"; clusters: HomeClusterChoice[] }>();
    const readCapabilities = vi.fn(async () => CAPABILITIES);
    const port = timelinePort({ readCapabilities });
    renderTimelineRoute(port, { listClusterChoices: vi.fn(() => choices.promise) });

    expect(readCapabilities).not.toHaveBeenCalled();
    choices.resolve(clusterCollection());

    expect(await screen.findByRole("heading", { name: "Timeline" })).toBeTruthy();
    await waitFor(() => expect(readCapabilities).toHaveBeenCalledTimes(1));
    expect(readCapabilities).toHaveBeenCalledWith(expect.any(AbortSignal), "workspace-a");

    fireEvent.click(screen.getByRole("button", { name: "switch to cluster-b" }));
    await waitFor(() => expect(port.readTimeline).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scopes: [expect.objectContaining({ clusterId: "cluster-b" })],
      }),
      expect.any(AbortSignal),
    ));
    expect(readCapabilities).toHaveBeenCalledTimes(1);
  });

  it("fails closed when an injected port has no capability reader", async () => {
    const port = timelinePort();
    delete port.readCapabilities;
    renderTimelineRoute(port);

    expect(await screen.findByRole("heading", {
      name: "Unable to read the verified response",
    })).toBeTruthy();
    expect(screen.getByText("invalid-response")).toBeTruthy();
    expect(port.readTimeline).not.toHaveBeenCalled();
  });

  it("fails closed when an injected capability projection differs from preflight", async () => {
    const port = timelinePort({
      capabilities: { ...CAPABILITIES, maxRetainedRangeMs: CAPABILITIES.maxRetainedRangeMs + 1 },
    });
    renderTimelineRoute(port);

    expect(await screen.findByRole("heading", {
      name: "Unable to read the verified response",
    })).toBeTruthy();
    expect(screen.getByText("invalid-response")).toBeTruthy();
    expect(port.readTimeline).not.toHaveBeenCalled();
  });

  it.each([
    ["forbidden", new TimelineFailure("forbidden"), "You cannot access this scope", false, "forbidden"],
    ["offline", new TimelineFailure("offline"), "Unable to reach the control plane", true, "network"],
    ["invalid response", new TimelineFailure("invalid-response"), "Unable to read the verified response", true, "invalid-response"],
    ["server", new TimelineFailure("unavailable"), "Unable to read the verified response", true, "server"],
  ] as const)("renders the %s capability failure with its explicit product state", async (
    _label,
    failure,
    heading,
    canRetry,
    issue,
  ) => {
    renderTimelineRoute(timelinePort({
      readCapabilities: vi.fn().mockRejectedValue(failure),
    }));

    expect(await screen.findByRole("heading", { name: heading })).toBeTruthy();
    expect(screen.getByText(issue)).toBeTruthy();
    if (canRetry) expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    else expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("retries a failed capability preflight as a fresh request", async () => {
    const readCapabilities = vi.fn()
      .mockRejectedValueOnce(new TimelineFailure("offline"))
      .mockResolvedValueOnce(CAPABILITIES);
    renderTimelineRoute(timelinePort({ readCapabilities }));

    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("heading", { name: "Timeline" })).toBeTruthy();
    expect(readCapabilities).toHaveBeenCalledTimes(2);
  });

  it("renders the route in StrictMode after its scope resolves", async () => {
    const readCapabilities = vi.fn().mockResolvedValue(CAPABILITIES);
    renderTimelineRoute(timelinePort({ readCapabilities }), undefined, true);

    expect(await screen.findByRole("heading", { name: "Timeline" })).toBeTruthy();
    expect(readCapabilities).toHaveBeenCalledTimes(1);
    expect(readCapabilities).toHaveBeenLastCalledWith(expect.any(AbortSignal), "workspace-a");
  });

  it("re-arms the capability request during StrictMode setup cleanup setup", async () => {
    const readCapabilities = vi.fn().mockResolvedValue(CAPABILITIES);
    renderTimelineCapabilityGate(timelinePort({ readCapabilities }), true);

    expect(await screen.findByText("capability-ready")).toBeTruthy();
    await waitFor(() => expect(readCapabilities).toHaveBeenCalledTimes(2));
    const firstSignal = readCapabilities.mock.calls[0]?.[0] as AbortSignal;
    expect(firstSignal.aborted).toBe(true);
    expect(readCapabilities).toHaveBeenLastCalledWith(expect.any(AbortSignal), "workspace-a");
  });

  it("ignores a cancelled StrictMode preflight after the replacement request resolves", async () => {
    const first = deferred<TimelineCapabilities>();
    const second = deferred<TimelineCapabilities>();
    const readCapabilities = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    renderTimelineCapabilityGate(timelinePort({ readCapabilities }), true);

    await waitFor(() => expect(readCapabilities).toHaveBeenCalledTimes(2));
    second.resolve(CAPABILITIES);
    expect(await screen.findByText("capability-ready")).toBeTruthy();
    first.reject(new TimelineFailure("invalid-response"));
    await Promise.resolve();
    expect(screen.getByText("capability-ready")).toBeTruthy();
  });

  it("shows a StrictMode capability error and retries with a fresh active request", async () => {
    const readCapabilities = vi.fn()
      .mockRejectedValueOnce(new TimelineFailure("offline"))
      .mockRejectedValueOnce(new TimelineFailure("offline"))
      .mockResolvedValueOnce(CAPABILITIES);
    renderTimelineCapabilityGate(timelinePort({ readCapabilities }), true);

    expect(await screen.findByRole("heading", { name: "Unable to reach the control plane" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("capability-ready")).toBeTruthy();
    expect(readCapabilities).toHaveBeenCalledTimes(3);
  });

  it("cancels an active capability request when the gate actually unmounts", async () => {
    const pending = deferred<TimelineCapabilities>();
    const readCapabilities = vi.fn().mockReturnValue(pending.promise);
    const view = renderTimelineCapabilityGate(timelinePort({ readCapabilities }));

    await waitFor(() => expect(readCapabilities).toHaveBeenCalledTimes(1));
    const signal = readCapabilities.mock.calls[0]?.[0] as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(true);

    pending.resolve(CAPABILITIES);
    await Promise.resolve();
  });
});

const CAPABILITIES: TimelineCapabilities = {
  selectedSourceMode: "retained",
  availableSourceModes: ["retained"],
  maxRetainedRangeMs: 91_337,
  queryBounds: { serverNowMs: 2_000, earliestQueryableMs: 1_000, maxWindowMs: 91_337 },
  namespaceFilterPolicy: "not_required",
  controlSurface: timelineControlSurface(),
};

function renderTimelineRoute(
  port: TimelinePort,
  clusterScopePort: ClusterScopePort = { listClusterChoices: async () => clusterCollection() },
  strictMode = false,
) {
  const TimelineRoute = createTimelineSurface(port);
  const tree = (
    <I18nProvider navigatorLanguage="en-US" storage={null}>
      <MemoryRouter initialEntries={["/timeline?clusters=cluster-a"]}>
        <AuthSessionGateProvider reportUnauthorized={() => undefined}>
          <UnifiedFilterProvider>
            <ClusterScopeProvider authorityKey="workspace-a:user-a" port={clusterScopePort}>
              <TimelineRoute />
              <ScopeSwitch />
            </ClusterScopeProvider>
          </UnifiedFilterProvider>
        </AuthSessionGateProvider>
      </MemoryRouter>
    </I18nProvider>
  );
  return render(strictMode ? <StrictMode>{tree}</StrictMode> : tree);
}

function renderTimelineCapabilityGate(port: TimelinePort, strictMode = false) {
  const tree = (
    <I18nProvider navigatorLanguage="en-US" storage={null}>
      <TimelineCapabilityGate
        enabled
        port={port}
        scopeContent={<span>scope-pending</span>}
        workspaceCacheKey="workspace-a"
      >
        <span>capability-ready</span>
      </TimelineCapabilityGate>
    </I18nProvider>
  );
  return render(strictMode ? <StrictMode>{tree}</StrictMode> : tree);
}

function ScopeSwitch() {
  const filter = useUnifiedFilter();
  return (
    <button
      onClick={() => filter.updateFilters((current) => ({
        ...current,
        common: { ...current.common, clusters: ["cluster-b"] },
      }), "chip-add")}
      type="button"
    >
      switch to cluster-b
    </button>
  );
}

function timelinePort(overrides: Partial<TimelinePort> = {}): TimelinePort {
  return {
    capabilities: CAPABILITIES,
    readCapabilities: vi.fn(async () => CAPABILITIES),
    readTimeline: vi.fn(async (query: TimelineQuery) => snapshot(query)),
    readTimelineOverview: vi.fn(async () => timelineOverview()),
    readTimelinePins: vi.fn(async () => timelinePinSet()),
    upsertTimelinePin: vi.fn(async () => timelinePinMutation()),
    removeTimelinePin: vi.fn(async () => timelinePinMutation()),
    subscribeTimeline: idleStream,
    ...overrides,
  };
}

function timelineControlSurface() {
  return {
    views: [controlOption("list", "List"), controlOption("swimlane", "Swimlane")],
    groupings: [controlOption("app", "Application"), controlOption("owner", "Owner"), controlOption("flat", "None")],
    sorts: [controlOption("importance", "Importance"), controlOption("recent", "Recent"), controlOption("name", "Name")],
    activity: [{ ...controlOption("all", "All"), activity: [], problemsActivity: [] }],
    deleted: { key: "include_deleted", label: "Show deleted", default: true },
    kinds: { key: "kinds", label: "Kinds", selection: "multi" as const, emptySelection: "all" as const },
    timeRanges: [{ ...controlOption("1h", "1h"), durationMs: 3_600_000 }],
    defaultTimeRangeId: "1h",
    customTimeRangeId: "custom" as const,
    lensZoomRungs: [{ ...controlOption("1h", "1h"), durationMs: 3_600_000 }],
    defaultLensZoomRung: "1h",
    legend: {
      key: "legend" as const,
      label: "Legend",
      availability: "available" as const,
      items: [controlOption("change", "Changes")],
    },
    pins: {
      key: "pins" as const,
      label: "Pinned lanes",
      availability: "available" as const,
      storage: "server" as const,
      revision: "pin_set" as const,
      subjectKinds: ["resource", "application"] as ["resource", "application"],
    },
  };
}

function controlOption(id: string, label: string) {
  return { id, label, description: null };
}

function timelineOverview() {
  return {
    window: { fromMs: 1_000, toMs: 2_000 },
    queryBounds: { serverNowMs: 2_000, earliestQueryableMs: 1_000, maxWindowMs: 91_337 },
    bucketWidthMs: 1_000,
    buckets: [{ fromMs: 1_000, toMs: 2_000, eventCount: 0, problemCount: 0 }],
    coverage: [],
    coverageSources: [{ source: "inventory" as const, availability: "observed" as const }],
    facets: { activity: [], kinds: [] },
    newEvidenceCount: null,
    pinSetRevision: null,
  };
}

function timelinePinSet() {
  return { revision: 0, pins: [] };
}

function timelinePinMutation() {
  return { action: "unchanged" as const, pinSet: timelinePinSet() };
}

function clusterCollection(): { completeness: "unknown"; clusters: HomeClusterChoice[] } {
  return {
    completeness: "unknown",
    clusters: [
      cluster("cluster-a", "online"),
      cluster("cluster-b", "stale"),
    ],
  };
}

function cluster(
  id: string,
  connectionState: HomeClusterChoice["connectionState"],
): HomeClusterChoice {
  return {
    id,
    workspaceId: "workspace-a",
    name: id,
    environment: "production",
    provider: "unknown",
    connectionStage: null,
    registrationState: "active",
    connectionState,
    lastObservedAt: "2026-07-15T00:00:00.000Z",
    nodeCount: 1,
    podCount: 1,
    incidentCount: 0,
  };
}

function snapshot(query: TimelineQuery): TimelineSnapshot {
  const policy = {
    maxBatchEvents: 100,
    maxFramesPerSecond: 60,
    retentionSeconds: 86_400,
    resume: "cursor" as const,
    hiddenTab: "coalesce" as const,
    reconnect: {
      minDelayMs: 100,
      maxDelayMs: 200,
      strategy: "full_jitter_exponential" as const,
    },
    liveSession: {
      maxAgeMs: 30_000,
      strategy: "replace_with_snapshot" as const,
    },
  };
  const window = query.mode.kind === "frozen"
    ? { fromMs: query.mode.fromMs, toMs: query.mode.toMs }
    : { fromMs: 1_000, toMs: 2_000 };
  return {
    session: {
      query,
      window,
      cursor: { token: "opaque.snapshot" },
      policy,
    },
    scopes: query.scopes,
    policy,
    events: [],
    coverage: [],
    pinSetRevision: null,
  };
}

async function* idleStream(
  _session: TimelineSnapshot["session"],
  subscription?: Parameters<TimelinePort["subscribeTimeline"]>[1],
): AsyncIterable<TimelineStreamFrame> {
  subscription?.onLifecycle?.({ state: "connected" });
  await new Promise<void>((resolve) => {
    subscription?.signal?.addEventListener("abort", () => resolve(), { once: true });
  });
  yield* [] as TimelineStreamFrame[];
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, reject, resolve };
}

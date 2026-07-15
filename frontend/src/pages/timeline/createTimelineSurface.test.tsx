// @vitest-environment jsdom

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
import { createTimelineSurface } from "./createTimelineSurface";

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
    expect(readCapabilities).toHaveBeenCalledWith(undefined, "workspace-a");

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
});

const CAPABILITIES: TimelineCapabilities = {
  selectedSourceMode: "retained",
  availableSourceModes: ["retained"],
  maxRetainedRangeMs: 91_337,
  namespaceFilterPolicy: "not_required",
};

function renderTimelineRoute(
  port: TimelinePort,
  clusterScopePort: ClusterScopePort = { listClusterChoices: async () => clusterCollection() },
) {
  const TimelineRoute = createTimelineSurface(port);
  return render(
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
    </I18nProvider>,
  );
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
    subscribeTimeline: idleStream,
    ...overrides,
  };
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

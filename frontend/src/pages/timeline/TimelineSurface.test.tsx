// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TimelineFailure,
  type TimelineEvent,
  type TimelinePort,
  type TimelineSnapshot,
  type TimelineStreamFrame,
} from "../../features/timeline/timelineContract";
import type { ClusterScope } from "../../shared/parity/referenceParity";
import { I18nProvider } from "../../shared/i18n";
import { TimelineSurface } from "./TimelineSurface";

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => (
    setTimeout(() => callback(Date.now()), 0) as unknown as number
  ));
  vi.stubGlobal("cancelAnimationFrame", (frame: number) => clearTimeout(frame));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TimelineSurface", () => {
  it("rehydrates URL state and renders an actual retained event list", async () => {
    const user = userEvent.setup();
    const port = timelinePort();
    const { router } = renderTimeline(port, "/timeline?foreign=keep&q=first&view=list", "en-US");

    expect(await screen.findByText("Deployment checkout changed")).toBeTruthy();
    expect(screen.getByText("Inventory")).toBeTruthy();
    expect(screen.getByText("Updated")).toBeTruthy();
    expect(screen.getByText("Warning")).toBeTruthy();
    expect((screen.getByRole("searchbox", { name: "Timeline search" }) as HTMLInputElement).value).toBe("first");
    expect(screen.getByRole("radio", { name: "List" }).getAttribute("aria-checked")).toBe("true");

    await user.clear(screen.getByRole("searchbox", { name: "Timeline search" }));
    await user.type(screen.getByRole("searchbox", { name: "Timeline search" }), "second");
    await waitFor(() => {
      const search = new URLSearchParams(router.state.location.search);
      expect(search.get("foreign")).toBe("keep");
      expect(search.get("q")).toBe("second");
      expect(search.get("view")).toBe("list");
    });

    await act(async () => {
      await router.navigate("/timeline?foreign=keep&q=restored&view=swimlane");
    });
    expect((screen.getByRole("searchbox", { name: "Timeline search" }) as HTMLInputElement).value).toBe("restored");
    expect(screen.getByRole("radio", { name: "Swimlane" }).getAttribute("aria-checked")).toBe("true");
    expect(port.readTimeline).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scopes: TIMELINE_SCOPES,
        filters: expect.objectContaining({ search: "restored" }),
      }),
      expect.any(AbortSignal),
    );
  });

  it("supports roving radio focus and Arrow/Home/End view changes", async () => {
    const user = userEvent.setup();
    const { router } = renderTimeline(timelinePort(), "/timeline?view=list", "en-US");
    const list = await screen.findByRole("radio", { name: "List" });
    list.focus();

    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Swimlane" }));
    expect(new URLSearchParams(router.state.location.search).get("view")).toBeNull();

    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "List" }));
    expect(new URLSearchParams(router.state.location.search).get("view")).toBe("list");

    await user.keyboard("{End}");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Swimlane" }));
    expect(new URLSearchParams(router.state.location.search).get("view")).toBeNull();
  });

  it("distinguishes an empty retained snapshot from coverage and snapshot failures", async () => {
    const empty = timelinePort({ readTimeline: vi.fn().mockResolvedValue(snapshot({ events: [] })) });
    const { unmount } = renderTimeline(empty, "/timeline", "en-US");
    expect(await screen.findByText("No timeline events match this scope.")).toBeTruthy();
    unmount();

    const covered = timelinePort({
      readTimeline: vi.fn().mockResolvedValue(snapshot({
        events: [],
        coverage: [{
          scope: TIMELINE_SCOPES[0]!,
          source: "inventory",
          fromMs: 1_000,
          toMs: 2_000,
          reason: "collection_gap",
        }],
      })),
    });
    const coveredView = renderTimeline(covered, "/timeline", "en-US");
    expect(await screen.findByText("Some timeline history has a collection or retention gap.")).toBeTruthy();
    expect(screen.getByText("No timeline events match this scope.")).toBeTruthy();
    coveredView.unmount();

    renderTimeline(timelinePort({
      readTimeline: vi.fn().mockRejectedValue(new TimelineFailure("offline")),
    }), "/timeline", "en-US");
    expect((await screen.findByRole("alert")).textContent).toContain("Timeline data is unavailable.");
  });

  it("retries a snapshot failure and resynchronizes after a server resync frame", async () => {
    const user = userEvent.setup();
    const retried = vi
      .fn()
      .mockRejectedValueOnce(new TimelineFailure("offline"))
      .mockResolvedValueOnce(snapshot({ events: [event()] }));
    renderTimeline(timelinePort({ readTimeline: retried }), "/timeline", "en-US");

    await user.click(await screen.findByRole("button", { name: "Retry timeline" }));
    expect(await screen.findByText("Deployment checkout changed")).toBeTruthy();
    expect(retried).toHaveBeenCalledTimes(2);

    cleanup();
    const resynced = vi
      .fn()
      .mockResolvedValueOnce(snapshot({ events: [event()] }))
      .mockResolvedValueOnce(snapshot({ events: [] }));
    let sentResync = false;
    const resyncPort = timelinePort({
      readTimeline: resynced,
      subscribeTimeline: async function* (_session, subscription) {
        subscription?.onLifecycle?.({ state: "connected" });
        if (sentResync) {
          await new Promise<void>((resolve) => {
            subscription?.signal?.addEventListener("abort", () => resolve(), { once: true });
          });
          return;
        }
        sentResync = true;
        yield { kind: "resync_required", cursor: { token: "opaque.resync" }, reason: "retention_boundary" };
      },
    });
    renderTimeline(resyncPort, "/timeline", "en-US");

    expect(await screen.findByText("Deployment checkout changed")).toBeTruthy();
    await waitFor(() => expect(resynced).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("No timeline events match this scope.")).toBeTruthy();
  });

  it("keeps the retained list mounted while a live session rotates or its replacement fails", async () => {
    vi.useFakeTimers();
    const replacement = deferred<TimelineSnapshot>();
    const readTimeline = vi.fn()
      .mockResolvedValueOnce(liveSnapshot(1_500))
      .mockReturnValueOnce(replacement.promise)
      .mockResolvedValueOnce(liveSnapshot(1_500));
    renderTimeline(timelinePort({ readTimeline }), "/timeline", "en-US");

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("Deployment checkout changed")).toBeTruthy();
    expect(readTimeline).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_499);
    });
    expect(readTimeline).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(readTimeline).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Deployment checkout changed")).toBeTruthy();
    expect(screen.queryByText("Loading timeline…")).toBeNull();
    expect(screen.getByText("Resynchronizing retained timeline data…")).toBeTruthy();

    await act(async () => {
      replacement.reject(new TimelineFailure("offline"));
      await Promise.resolve();
    });
    expect(screen.getByText("Deployment checkout changed")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Timeline data is unavailable.");

    await act(async () => {
      screen.getByRole("button", { name: "Retry timeline" }).click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(readTimeline).toHaveBeenCalledTimes(3);
    expect(screen.getByText("Deployment checkout changed")).toBeTruthy();
  });

  it.each([
    {
      navigatorLanguage: "en-US",
      title: "Timeline",
      search: "Timeline search",
      list: "List",
      swimlane: "Swimlane",
      empty: "No timeline events match this scope.",
    },
    {
      navigatorLanguage: "ko-KR",
      title: "타임라인",
      search: "타임라인 검색",
      list: "목록",
      swimlane: "스윔레인",
      empty: "이 범위에 일치하는 타임라인 이벤트가 없습니다.",
    },
  ])("uses typed catalog copy for $navigatorLanguage", async (copy) => {
    const user = userEvent.setup();
    const { router } = renderTimeline(
      timelinePort({ readTimeline: vi.fn().mockResolvedValue(snapshot({ events: [] })) }),
      "/timeline",
      copy.navigatorLanguage,
    );

    expect(await screen.findByRole("heading", { name: copy.title })).toBeTruthy();
    expect(await screen.findByText(copy.empty)).toBeTruthy();
    expect(screen.getByRole("radio", { name: copy.list })).toBeTruthy();
    expect(screen.getByRole("radio", { name: copy.swimlane })).toBeTruthy();
    await user.type(screen.getByRole("searchbox", { name: copy.search }), "scope-check");
    await waitFor(() => {
      expect(new URLSearchParams(router.state.location.search).get("q")).toBe("scope-check");
    });
  });
});

function timelinePort(overrides: Partial<TimelinePort> = {}): TimelinePort {
  return {
    capabilities: {
      sourceMode: "retained",
      maxRangeDays: 7,
      requiresNamespaceFilter: false,
    },
    readTimeline: vi.fn().mockResolvedValue(snapshot({ events: [event()] })),
    subscribeTimeline: idleStream,
    ...overrides,
  };
}

function snapshot(overrides: Partial<Omit<TimelineSnapshot, "session">> = {}): TimelineSnapshot {
  const session = {
    query: {
      scopes: TIMELINE_SCOPES,
      mode: { kind: "frozen" as const, fromMs: 1_000, toMs: 2_000 },
      filters: {
        activity: [],
        kinds: [],
        showDeleted: true,
        pinnedOnly: false,
        search: "",
        grouping: "app" as const,
        sort: "importance" as const,
        selectedEventId: null,
      },
    },
    window: { fromMs: 1_000, toMs: 2_000 },
    cursor: { token: "opaque.snapshot" },
    policy: {
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
    },
  };
  return {
    session,
    scopes: TIMELINE_SCOPES,
    policy: session.policy,
    events: [event()],
    coverage: [],
    ...overrides,
  };
}

function liveSnapshot(maxAgeMs: number): TimelineSnapshot {
  const retained = snapshot();
  const policy = {
    ...retained.policy,
    liveSession: {
      ...retained.policy.liveSession,
      maxAgeMs,
    },
  };
  return {
    ...retained,
    policy,
    session: {
      ...retained.session,
      policy,
      query: {
        ...retained.session.query,
        mode: { kind: "live", widthMs: 60_000 },
      },
    },
  };
}

function deferred<T>() {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, reject, resolve };
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

function event(): TimelineEvent {
  const resource = {
    apiGroup: "apps",
    version: "v1",
    kind: "Deployment",
    namespace: "payments",
    name: "checkout",
    uid: "deployment-uid",
  };
  return {
    id: "event-1",
    source: "inventory",
    sourceKey: "inventory:event-1",
    nativeId: "event-1",
    activity: "change",
    occurredAt: "2026-07-15T00:00:00Z",
    scope: TIMELINE_SCOPES[0]!,
    subject: { kind: "resource", resource },
    resource,
    type: "update",
    severity: "warning",
    title: "Deployment checkout changed",
    owner: null,
    metadata: {},
  };
}

const TIMELINE_SCOPES: readonly ClusterScope[] = [{
  workspaceId: "workspace-1",
  clusterId: "cluster-1",
  namespaces: ["shop"],
  freshness: "live",
}];

function renderTimeline(
  port: TimelinePort,
  initialEntry = "/timeline",
  navigatorLanguage = "en-US",
) {
  const router = createMemoryRouter([{
    path: "/timeline",
    element: (
      <>
        <I18nProvider navigatorLanguage={navigatorLanguage} storage={null}>
          <TimelineSurface port={port} scopes={TIMELINE_SCOPES} />
        </I18nProvider>
        <LocationProbe />
      </>
    ),
  }], { initialEntries: [initialEntry] });

  return { ...render(<RouterProvider router={router} />), router };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

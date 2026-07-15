// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TimelineFailure,
  type TimelineCoverage,
  type TimelineEvent,
  type TimelinePort,
  type TimelineSnapshot,
  type TimelineStreamFrame,
} from "../../features/timeline/timelineContract";
import type { ClusterScope } from "../../shared/parity/referenceParity";
import { I18nProvider } from "../../shared/i18n";
import { TimelineSurface } from "./TimelineSurface";

let nextAnimationFrame = 0;
let pendingAnimationFrames = new Map<number, FrameRequestCallback>();

beforeEach(() => {
  nextAnimationFrame = 0;
  pendingAnimationFrames = new Map();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const frame = ++nextAnimationFrame;
    pendingAnimationFrames.set(frame, callback);
    queueMicrotask(() => {
      const pending = pendingAnimationFrames.get(frame);
      if (pending === undefined) return;
      pendingAnimationFrames.delete(frame);
      pending(0);
    });
    return frame;
  });
  vi.stubGlobal("cancelAnimationFrame", (frame: number) => {
    pendingAnimationFrames.delete(frame);
  });
});

afterEach(() => {
  cleanup();
  pendingAnimationFrames.clear();
  document.documentElement.classList.remove("dark");
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TimelineSurface", () => {
  it("rehydrates URL state and renders an actual retained event list", async () => {
    const user = userEvent.setup();
    const port = timelinePort();
    const { router } = renderTimeline(port, "/timeline?foreign=keep&q=first&view=list", "en-US");

    expect(await screen.findByText("Deployment checkout changed")).toBeTruthy();
    expect(screen.getAllByText("Inventory").length).toBeGreaterThan(0);
    expect(screen.getByText("Updated")).toBeTruthy();
    expect(screen.getByText("Warning")).toBeTruthy();
    expect((screen.getByRole("searchbox", { name: "Timeline search" }) as HTMLInputElement).value).toBe("first");
    expect(screen.getByRole("radio", { name: "List" })).toHaveProperty("checked", true);

    await user.clear(screen.getByRole("searchbox", { name: "Timeline search" }));
    await user.type(screen.getByRole("searchbox", { name: "Timeline search" }), "second");
    await waitFor(() => {
      const search = new URLSearchParams(router.state.location.search);
      expect(search.get("foreign")).toBe("keep");
      expect(search.get("q")).toBe("second");
      expect(search.get("view")).toBeNull();
    });

    await act(async () => {
      await router.navigate("/timeline?foreign=keep&q=restored&view=swimlane");
    });
    expect((screen.getByRole("searchbox", { name: "Timeline search" }) as HTMLInputElement).value).toBe("restored");
    expect(screen.getByRole("radio", { name: "Swimlane" })).toHaveProperty("checked", true);
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
    expect(new URLSearchParams(router.state.location.search).get("view")).toBe("swimlane");

    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "List" }));
    expect(new URLSearchParams(router.state.location.search).get("view")).toBeNull();

    await user.keyboard("{End}");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Swimlane" }));
    expect(new URLSearchParams(router.state.location.search).get("view")).toBe("swimlane");
  });

  it("distinguishes quiet, filtered, coverage-aware, and snapshot failure states", async () => {
    const empty = timelinePort({ readTimeline: vi.fn().mockResolvedValue(snapshot({ events: [] })) });
    const { unmount } = renderTimeline(empty, "/timeline", "en-US");
    expect(await screen.findByText("No timeline facts are available for this scope.")).toBeTruthy();
    unmount();

    const filteredSnapshot = snapshot({ events: [] });
    const filtered = {
      ...filteredSnapshot,
      session: {
        ...filteredSnapshot.session,
        query: {
          ...filteredSnapshot.session.query,
          filters: { ...filteredSnapshot.session.query.filters, search: "checkout" },
        },
      },
    };
    const filteredView = renderTimeline(timelinePort({
      readTimeline: vi.fn().mockResolvedValue(filtered),
    }), "/timeline?q=checkout", "en-US");
    expect(await screen.findByText("No timeline facts match the active filters.")).toBeTruthy();
    filteredView.unmount();

    const covered = timelinePort({
      readTimeline: vi.fn().mockResolvedValue(snapshot({
        events: [],
        coverage: [coverage()],
      })),
    });
    const coveredView = renderTimeline(covered, "/timeline", "en-US");
    const notice = await screen.findByRole("region", { name: "Timeline coverage gaps" });
    expect(notice.getAttribute("aria-live")).toBe("polite");
    expect(notice.closest('[data-slot="product-floating-action-avoidance"]')).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Historical collection gaps" })).toBeTruthy();
    expect(notice.textContent).toContain("Kubernetes event");
    expect(notice.textContent).toContain("Collection gap");
    expect(notice.textContent).toContain("workspace-1");
    expect(notice.textContent).toContain("cluster-1");
    expect(notice.textContent).toContain("shop");
    expect(notice.querySelector("[data-coverage-from='1000'][data-coverage-to='2000']")).not.toBeNull();
    expect(screen.getByText("No timeline facts were returned; the intervals above have known collection gaps.")).toBeTruthy();
    coveredView.unmount();

    renderTimeline(timelinePort({
      readTimeline: vi.fn().mockRejectedValue(new TimelineFailure("offline")),
    }), "/timeline", "en-US");
    expect((await screen.findByRole("alert")).textContent).toContain("Timeline data is unavailable.");
  });

  it("merges a live server coverage delta without stopping the stream", async () => {
    document.documentElement.classList.add("dark");
    renderTimeline(timelinePort({
      readTimeline: vi.fn().mockResolvedValue(snapshot({ events: [] })),
      subscribeTimeline: async function* (_session, subscription) {
        subscription?.onLifecycle?.({ state: "connected" });
        yield { kind: "coverage", cursor: { token: "opaque.coverage" }, coverage: [coverage()] };
        await new Promise<void>((resolve) => {
          subscription?.signal?.addEventListener("abort", () => resolve(), { once: true });
        });
      },
    }), "/timeline", "en-US");

    const notice = await screen.findByRole("region", { name: "Timeline coverage gaps" });
    expect(screen.getByText("Live updates connected.")).toBeTruthy();
    expect(notice.className).toContain("dark:border-amber-400/40");
    expect(notice.className).not.toContain("animate-");
    const item = notice.querySelector<HTMLElement>("[data-timeline-coverage]");
    expect(item?.className).toContain("min-w-0");
    expect(item?.className).toContain("break-words");
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
    expect(await screen.findByText("No timeline facts are available for this scope.")).toBeTruthy();
  });

  it("keeps the retained list mounted while a live session rotates or its replacement fails", async () => {
    const user = userEvent.setup();
    const replacement = deferred<TimelineSnapshot>();
    const readTimeline = vi.fn()
      .mockResolvedValueOnce(liveSnapshot(1))
      .mockReturnValueOnce(replacement.promise)
      .mockResolvedValueOnce(liveSnapshot(30_000));
    renderTimeline(timelinePort({ readTimeline }), "/timeline", "en-US");

    expect(await screen.findByText("Deployment checkout changed")).toBeTruthy();
    expect(readTimeline).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(readTimeline).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Deployment checkout changed")).toBeTruthy();
    expect(screen.queryByText("Loading timeline…")).toBeNull();
    expect(screen.getByText("Resynchronizing retained timeline data…")).toBeTruthy();

    replacement.reject(new TimelineFailure("offline"));
    expect((await screen.findByRole("alert")).textContent).toContain("Timeline data is unavailable.");
    expect(screen.getByText("Deployment checkout changed")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Retry timeline" }));
    await waitFor(() => expect(readTimeline).toHaveBeenCalledTimes(3));
    expect(screen.getByText("Deployment checkout changed")).toBeTruthy();
  });

  it("opens a deep-linked real event drawer, supports Arrow navigation, and restores focus after Escape", async () => {
    const user = userEvent.setup();
    const first = event({
      id: "event-shared",
      nativeId: "native-first",
      sourceKey: "inventory:event-first",
      title: "Checkout deployment changed",
    });
    const second = event({
      id: "event-shared",
      nativeId: "native-second",
      occurredAt: "2026-07-15T00:01:00Z",
      sourceKey: "inventory:event-second",
      title: "Checkout deployment recovered",
    });
    const { router } = renderTimeline(
      timelinePort({ readTimeline: vi.fn().mockResolvedValue(snapshot({ events: [first, second] })) }),
      "/timeline?foreign=keep&view=list&from=1000&to=2000&grouping=owner&sort=name&q=checkout&event=inventory%3Aevent-first",
      "en-US",
    );

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("inventory:event-first")).toBeTruthy();
    expect(screen.getByText("native-first")).toBeTruthy();
    expect([...document.querySelectorAll<HTMLElement>("[data-selected=true]")]
      .map((control) => control.dataset.eventKey)).toEqual(["inventory:event-first"]);

    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(screen.getByText("inventory:event-second")).toBeTruthy());
    const navigated = new URLSearchParams(router.state.location.search);
    expect(navigated.get("event")).toBe("inventory:event-second");
    expect(navigated.get("foreign")).toBe("keep");
    expect(navigated.get("from")).toBe("1000");
    expect(navigated.get("to")).toBe("2000");
    expect(navigated.get("grouping")).toBe("owner");
    expect(navigated.get("sort")).toBe("name");
    expect(navigated.get("q")).toBe("checkout");
    expect([...document.querySelectorAll<HTMLElement>("[data-selected=true]")]
      .map((control) => control.dataset.eventKey)).toEqual(["inventory:event-second"]);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const selected = screen.getByRole("button", { name: "Checkout deployment recovered" });
    expect(document.activeElement).toBe(selected);

    await act(async () => {
      await router.navigate("/timeline?foreign=keep&view=swimlane&from=1000&to=2000&grouping=owner&sort=name&q=checkout&event=inventory%3Aevent-second");
    });
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("inventory:event-second")).toBeTruthy();
    expect(document.querySelector("[data-timeline-marker][data-event-key='inventory:event-second']")).not.toBeNull();
  });

  it("renders a time-positioned swimlane and applies URL grouping and sort without fixture-only view data", async () => {
    const checkoutOwner = {
      apiGroup: "apps",
      version: "v1",
      kind: "Deployment",
      namespace: "payments",
      name: "checkout",
      uid: "checkout-owner",
    };
    const paymentsOwner = { ...checkoutOwner, name: "payments", uid: "payments-owner" };
    const events = [
      event({
        id: "event-z",
        nativeId: "native-z",
        occurredAt: "2026-07-15T00:02:00Z",
        owner: checkoutOwner,
        sourceKey: "inventory:event-z",
        title: "Zebra update",
      }),
      event({
        id: "event-a",
        nativeId: "native-a",
        occurredAt: "2026-07-15T00:00:00Z",
        owner: paymentsOwner,
        sourceKey: "inventory:event-a",
        title: "Alpha update",
      }),
    ];
    const port = timelinePort({ readTimeline: vi.fn().mockResolvedValue(snapshot({ events })) });
    const { unmount } = renderTimeline(port, "/timeline?view=list&grouping=owner&sort=name", "en-US");

    await screen.findByText("Alpha update");
    expect([...document.querySelectorAll<HTMLElement>("[data-timeline-event-control]")]
      .map((control) => control.dataset.eventId)).toEqual(["event-a", "event-z"]);
    unmount();

    renderTimeline(port, "/timeline?view=swimlane&grouping=owner&sort=name", "en-US");
    const swimlane = await screen.findByRole("region", { name: "Timeline swimlane" });
    expect(swimlane.dataset.timelineGrouping).toBe("owner");
    expect(swimlane.dataset.timelineSort).toBe("name");
    expect([...swimlane.querySelectorAll<HTMLElement>("[data-timeline-marker]")]
      .map((marker) => marker.dataset.timelineTime)).toEqual([
        "2026-07-15T00:00:00Z",
        "2026-07-15T00:02:00Z",
      ]);
    expect([...swimlane.querySelectorAll<HTMLElement>("[data-timeline-marker]")]
      .every((marker) => marker.className.includes("size-6"))).toBe(true);
    expect(swimlane.querySelectorAll("[data-timeline-lane]")).toHaveLength(2);
  });

  it("exposes overflowed swimlane events through named horizontal controls and keyboard focus", async () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(200);
    renderTimeline(timelinePort(), "/timeline?view=swimlane", "en-US");

    expect(await screen.findByText("More timeline events are available to the right.")).toBeTruthy();
    const axis = document.querySelector<HTMLElement>('[data-slot="timeline-axis-scroll"]');
    expect(axis?.tabIndex).toBe(0);
    expect(screen.getByRole("button", { name: "Show earlier timeline events" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Show later timeline events" })).toHaveProperty("disabled", false);
  });

  it("shows a shared reduced-motion-safe state dot while reconnecting", async () => {
    renderTimeline(timelinePort({
      subscribeTimeline: async function* (_session, subscription) {
        subscription?.onLifecycle?.({ state: "reconnecting", attempt: 1, retryAfterMs: 100 });
        await new Promise<void>((resolve) => {
          subscription?.signal?.addEventListener("abort", () => resolve(), { once: true });
        });
        yield* [] as TimelineStreamFrame[];
      },
    }), "/timeline", "en-US");

    expect(await screen.findByText("Reconnecting to live updates…")).toBeTruthy();
    const dot = document.querySelector<HTMLElement>('[data-slot="live-status-dot"]');
    expect(dot?.getAttribute("data-state")).toBe("reconnecting");
    expect(dot?.className).toContain("motion-reduce:transition-none");
    expect(dot?.className).not.toContain("animate-pulse");
  });

  it.each([320, 768, 1440])("keeps timeline event controls reachable at %ipx", async (width) => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    renderTimeline(timelinePort(), "/timeline?view=list", "en-US");

    const control = await screen.findByRole("button", { name: "Deployment checkout changed" });
    expect(control.className).toContain("motion-reduce:transition-none");
    expect(control.closest("li")?.className).toContain("min-w-0");
  });

  it.each([
    {
      navigatorLanguage: "en-US",
      title: "Timeline",
      search: "Timeline search",
      list: "List",
      swimlane: "Swimlane",
      empty: "No timeline facts are available for this scope.",
    },
    {
      navigatorLanguage: "ko-KR",
      title: "타임라인",
      search: "타임라인 검색",
      // Capability labels are server-owned and intentionally do not change
      // with the local catalog.
      list: "List",
      swimlane: "Swimlane",
      empty: "이 범위에 사용할 수 있는 타임라인 사실이 없습니다.",
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

  it("maps descriptor controls and overview facets to URL state with search keyboard shortcuts", async () => {
    const user = userEvent.setup();
    const port = timelinePort();
    const { router } = renderTimeline(port, "/timeline", "en-US");
    const search = await screen.findByRole("searchbox", { name: "Timeline search" });

    await user.keyboard("/");
    expect(document.activeElement).toBe(search);
    await user.type(search, "checkout");
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(document.activeElement).toBe(search);
      expect(new URLSearchParams(router.state.location.search).get("q")).toBeNull();
    });

    await user.selectOptions(screen.getByRole("combobox", { name: "Activity" }), "changes");
    await waitFor(() => expect(new URLSearchParams(router.state.location.search).get("activity")).toBe("changes"));
    expect(port.readTimeline).toHaveBeenLastCalledWith(
      expect.objectContaining({ filters: expect.objectContaining({ activity: ["changes"] }) }),
      expect.any(AbortSignal),
    );

    await user.click(screen.getByRole("checkbox", { name: "Show deleted" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Group by" }), "owner");
    await user.selectOptions(screen.getByRole("combobox", { name: "Sort by" }), "name");
    await user.click(screen.getByText("Kinds"));
    await user.click(await screen.findByRole("checkbox", { name: /Deployment/ }));
    await user.click(screen.getByRole("radio", { name: "Swimlane" }));
    await waitFor(() => {
      const params = new URLSearchParams(router.state.location.search);
      expect(params.get("deleted")).toBe("0");
      expect(params.get("grouping")).toBe("owner");
      expect(params.get("sort")).toBe("name");
      expect(params.get("kinds")).toBe("Deployment");
      expect(params.get("view")).toBe("swimlane");
    });
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.queryByText(/Pinned lanes/i)).toBeNull();
  });

  it("restores an exact frozen deep-link lens without restarting the snapshot or stream", async () => {
    const baseSnapshot = lensSnapshot();
    const readTimeline = vi.fn(async (query) => ({
      ...baseSnapshot,
      session: { ...baseSnapshot.session, query },
    }));
    const subscribeTimeline = vi.fn(idleStream);
    const { router } = renderTimeline(
      timelinePort({ readTimeline, subscribeTimeline }),
      "/timeline?from=1000&to=2000&lensFrom=1800&lensTo=2000",
      "en-US",
    );

    expect(await screen.findByText("Late event")).toBeTruthy();
    expect(screen.queryByText("Early event")).toBeNull();
    expect(readTimeline).toHaveBeenCalledTimes(1);
    expect(subscribeTimeline).toHaveBeenCalledTimes(1);
    const initial = new URLSearchParams(router.state.location.search);
    expect(initial.get("from")).toBe("1000");
    expect(initial.get("to")).toBe("2000");
    expect(initial.get("lensFrom")).toBe("1800");
    expect(initial.get("lensTo")).toBe("2000");

    await act(async () => {
      await router.navigate("/timeline?from=1000&to=2000&lensFrom=1200&lensTo=1300");
    });
    expect(await screen.findByText("Early event")).toBeTruthy();
    expect(screen.queryByText("Late event")).toBeNull();
    expect(readTimeline).toHaveBeenCalledTimes(1);
    expect(subscribeTimeline).toHaveBeenCalledTimes(1);
  });

  it("rejects future and out-of-retention custom bounds before issuing a snapshot", async () => {
    const user = userEvent.setup();
    const fromMs = Date.parse("2026-07-15T11:50");
    const toMs = Date.parse("2026-07-15T12:00");
    const boundedOverview = {
      ...timelineOverview(),
      window: { fromMs, toMs },
      queryBounds: { serverNowMs: toMs, earliestQueryableMs: fromMs, maxWindowMs: toMs - fromMs },
    };
    const baseSnapshot = lensSnapshot();
    const boundedSnapshot = {
      ...baseSnapshot,
      session: { ...baseSnapshot.session, window: { fromMs, toMs } },
    };
    const readTimeline = vi.fn(async (query) => ({
      ...boundedSnapshot,
      session: { ...boundedSnapshot.session, query },
    }));
    const port = timelinePort({
      capabilities: { ...timelinePort().capabilities, maxRetainedRangeMs: toMs - fromMs },
      readTimeline,
      readTimelineOverview: vi.fn().mockResolvedValue(boundedOverview),
    });
    const { router } = renderTimeline(port, "/timeline", "en-US");

    await screen.findByRole("slider", { name: "Retained timeline strip" });
    await user.click(screen.getByText("Custom range"));
    const from = screen.getByLabelText("From") as HTMLInputElement;
    const to = screen.getByLabelText("To") as HTMLInputElement;
    const snapshotRequests = readTimeline.mock.calls.length;
    expect(from.min).toBe("2026-07-15T11:50");
    expect(to.max).toBe("2026-07-15T12:00");

    fireEvent.change(to, { target: { value: "2026-07-16T12:00" } });
    await user.click(screen.getByRole("button", { name: "Apply range" }));
    expect(screen.getByRole("alert").textContent).toContain("current timeline boundary");
    expect(readTimeline).toHaveBeenCalledTimes(snapshotRequests);

    fireEvent.change(from, { target: { value: "2026-07-15T10:00" } });
    fireEvent.change(to, { target: { value: "2026-07-15T12:00" } });
    await user.click(screen.getByRole("button", { name: "Apply range" }));
    expect(screen.getByRole("alert").textContent).toContain("server-retained timeline boundary");
    expect(readTimeline).toHaveBeenCalledTimes(snapshotRequests);

    fireEvent.change(from, { target: { value: from.min } });
    fireEvent.change(to, { target: { value: to.max } });
    await user.click(screen.getByRole("button", { name: "Apply range" }));
    await waitFor(() => expect(readTimeline).toHaveBeenCalledTimes(snapshotRequests + 1));
    expect(readTimeline).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: { kind: "frozen", fromMs, toMs } }),
      expect.any(AbortSignal),
    );
    expect(document.querySelector<HTMLDetailsElement>("[data-slot='timeline-custom-range']")?.open).toBe(false);
    const params = new URLSearchParams(router.state.location.search);
    expect(params.get("from")).toBe(String(fromMs));
    expect(params.get("to")).toBe(String(toMs));
  });

  it("returns to live with the frozen selection span and local lens width intact", async () => {
    const user = userEvent.setup();
    const controls = timelineControlSurface();
    const controlSurface = {
      ...controls,
      timeRanges: [{ ...controlOption("range-default", "Default range"), durationMs: 600 }],
      defaultTimeRangeId: "range-default",
    };
    const baseSnapshot = lensSnapshot();
    const readTimeline = vi.fn(async (query) => ({
      ...baseSnapshot,
      session: { ...baseSnapshot.session, query },
    }));
    const { router } = renderTimeline(
      timelinePort({
        capabilities: { ...timelinePort().capabilities, controlSurface },
        readTimeline,
      }),
      "/timeline?from=1000&to=2000&lensFrom=1200&lensTo=1400",
      "en-US",
    );

    expect(await screen.findByText("Early event")).toBeTruthy();
    expect(screen.queryByText("Late event")).toBeNull();
    const initialRequests = readTimeline.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "Go live" }));
    await waitFor(() => expect(readTimeline).toHaveBeenCalledTimes(initialRequests + 1));
    expect(readTimeline).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mode: { kind: "live", widthMs: 1_000 },
        control: expect.objectContaining({ rangeId: "custom" }),
      }),
      expect.any(AbortSignal),
    );
    await waitFor(() => {
      const params = new URLSearchParams(router.state.location.search);
      expect(params.get("window")).toBe("1000");
      expect(params.get("range")).toBe("custom");
      expect(params.get("lensWidth")).toBe("200");
      expect(params.get("lensFrom")).toBeNull();
      expect(params.get("lensTo")).toBeNull();
    });
    expect(screen.getByText("Late event")).toBeTruthy();
    expect(screen.queryByText("Early event")).toBeNull();
  });

  it("keeps pan, keyboard, and zoom inside the visible lens, then resets it when the selected range changes", async () => {
    const user = userEvent.setup();
    const controls = timelineControlSurface();
    const controlSurface = {
      ...controls,
      timeRanges: [
        { ...controlOption("range-default", "Default range"), durationMs: 1_000 },
        { ...controlOption("range-wide", "Wide range"), durationMs: 1_800 },
      ],
      defaultTimeRangeId: "range-default",
      lensZoomRungs: [
        { ...controlOption("lens-near", "Near lens"), durationMs: 100 },
        { ...controlOption("lens-wide", "Wide lens"), durationMs: 1_000 },
      ],
      defaultLensZoomRung: "lens-wide",
    };
    const baseSnapshot = lensSnapshot();
    const readTimeline = vi.fn(async (query) => ({
      ...baseSnapshot,
      session: { ...baseSnapshot.session, query },
    }));
    const subscribeTimeline = vi.fn(idleStream);
    const port = timelinePort({
      capabilities: { ...timelinePort().capabilities, controlSurface },
      readTimeline,
      subscribeTimeline,
    });
    const { router } = renderTimeline(
      port,
      "/timeline?zoom=lens-wide&lensFrom=1800&lensTo=2000",
      "en-US",
    );

    expect(await screen.findByText("Late event")).toBeTruthy();
    expect(screen.queryByText("Early event")).toBeNull();
    const snapshotRequests = readTimeline.mock.calls.length;
    const streamSessions = subscribeTimeline.mock.calls.length;

    await user.selectOptions(screen.getByRole("combobox", { name: "Lens zoom" }), "lens-near");
    await waitFor(() => {
      const params = new URLSearchParams(router.state.location.search);
      expect(params.get("zoom")).toBe("lens-near");
      expect(params.get("lensFrom")).toBe("1850");
      expect(params.get("lensTo")).toBe("1950");
    });
    expect(readTimeline).toHaveBeenCalledTimes(snapshotRequests);
    expect(subscribeTimeline).toHaveBeenCalledTimes(streamSessions);
    expect(screen.queryByText("Early event")).toBeNull();
    expect(screen.getByText("Late event")).toBeTruthy();

    const axis = screen.getByRole("slider", { name: "Retained timeline strip" });
    Object.defineProperty(axis, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, width: 100 }),
    });
    fireEvent.pointerDown(axis, { clientX: 0, pointerId: 7 });
    fireEvent.pointerMove(axis, { clientX: 20, pointerId: 7 });
    fireEvent.pointerUp(axis, { clientX: 20, pointerId: 7 });
    await waitFor(() => {
      const params = new URLSearchParams(router.state.location.search);
      expect(params.get("lensFrom")).toBe("1200");
      expect(params.get("lensTo")).toBe("1300");
    });
    expect(screen.getByText("Early event")).toBeTruthy();
    expect(readTimeline).toHaveBeenCalledTimes(snapshotRequests);
    expect(subscribeTimeline).toHaveBeenCalledTimes(streamSessions);

    axis.focus();
    await user.keyboard("{PageDown}");
    await waitFor(() => {
      const params = new URLSearchParams(router.state.location.search);
      expect(params.get("lensFrom")).toBe("1300");
      expect(params.get("lensTo")).toBe("1400");
    });
    expect(readTimeline).toHaveBeenCalledTimes(snapshotRequests);
    expect(subscribeTimeline).toHaveBeenCalledTimes(streamSessions);

    await user.click(screen.getByRole("button", { name: "Wide range" }));
    await waitFor(() => expect(readTimeline).toHaveBeenCalledTimes(snapshotRequests + 1));
    expect(readTimeline).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mode: { kind: "live", widthMs: 1_800 },
        control: expect.objectContaining({ rangeId: "range-wide", lensZoomRung: "lens-near" }),
      }),
      expect.any(AbortSignal),
    );
    await waitFor(() => {
      const params = new URLSearchParams(router.state.location.search);
      expect(params.get("window")).toBe("1800");
      expect(params.get("range")).toBe("range-wide");
      expect(params.get("lensFrom")).toBeNull();
      expect(params.get("lensTo")).toBeNull();
    });
    expect(screen.getByText("Early event")).toBeTruthy();
    expect(screen.getByText("Late event")).toBeTruthy();

    await act(async () => { await router.navigate(-1); });
    await waitFor(() => {
      expect(new URLSearchParams(router.state.location.search).get("window")).toBeNull();
      expect(readTimeline).toHaveBeenCalledTimes(snapshotRequests + 2);
      expect(readTimeline).toHaveBeenLastCalledWith(
        expect.objectContaining({
          mode: { kind: "live", widthMs: 1_000 },
          control: expect.objectContaining({ rangeId: "range-default", lensZoomRung: "lens-near" }),
        }),
        expect.any(AbortSignal),
      );
    });
    await act(async () => { await router.navigate(1); });
    await waitFor(() => {
      expect(new URLSearchParams(router.state.location.search).get("window")).toBe("1800");
      expect(readTimeline).toHaveBeenCalledTimes(snapshotRequests + 3);
      expect(readTimeline).toHaveBeenLastCalledWith(
        expect.objectContaining({
          mode: { kind: "live", widthMs: 1_800 },
          control: expect.objectContaining({ rangeId: "range-wide", lensZoomRung: "lens-near" }),
        }),
        expect.any(AbortSignal),
      );
    });
  });

  it("normalizes unavailable URL controls before either Timeline request and omits their UI", async () => {
    const controls = timelineControlSurface();
    const port = timelinePort({
      capabilities: {
        selectedSourceMode: "retained",
        availableSourceModes: ["retained"],
        maxRetainedRangeMs: 604_800_000,
        queryBounds: { serverNowMs: 2_000, earliestQueryableMs: 0, maxWindowMs: 604_800_000 },
        namespaceFilterPolicy: "not_required",
        controlSurface: {
          ...controls,
          views: [controls.views[0]!],
          groupings: [controls.groupings[0]!],
          sorts: [controls.sorts[0]!],
          activity: [controls.activity[0]!],
        },
      },
    });
    const { router } = renderTimeline(
      port,
      "/timeline?foreign=keep&view=swimlane&activity=changes&grouping=owner&sort=name&pinnedOnly=1",
      "en-US",
    );

    await screen.findByText("Deployment checkout changed");
    await waitFor(() => {
      const params = new URLSearchParams(router.state.location.search);
      expect(params.get("foreign")).toBe("keep");
      expect(params.get("view")).toBeNull();
      expect(params.get("activity")).toBeNull();
      expect(params.get("grouping")).toBeNull();
      expect(params.get("sort")).toBeNull();
      expect(params.get("pinnedOnly")).toBeNull();
    });
    expect(screen.getByRole("radio", { name: "List" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "Swimlane" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Owner" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Recent" })).toBeNull();
    expect(port.readTimeline).toHaveBeenLastCalledWith(
      expect.objectContaining({
        control: expect.objectContaining({ view: "list" }),
        filters: expect.objectContaining({
          activity: [],
          grouping: "app",
          sort: "importance",
          pinnedOnly: false,
        }),
      }),
      expect.any(AbortSignal),
    );
  });

  it("shows server coverage availability and never substitutes a zero count when overview fails", async () => {
    const user = userEvent.setup();
    const unavailableCoverage = timelinePort({
      readTimelineOverview: vi.fn().mockResolvedValue({
        ...timelineOverview(),
        coverageSources: [{ source: "gitops" as const, availability: "unavailable" as const }],
      }),
    });
    const first = renderTimeline(unavailableCoverage, "/timeline", "en-US");
    await screen.findByText("Deployment checkout changed");
    await user.click(screen.getByText("Legend"));
    expect(await screen.findByText("Unavailable")).toBeTruthy();
    first.unmount();

    renderTimeline(timelinePort({
      readTimelineOverview: vi.fn().mockRejectedValue(new TimelineFailure("offline")),
    }), "/timeline", "en-US");
    await screen.findByText("Deployment checkout changed");
    await user.click(screen.getByText("Kinds"));
    expect(await screen.findByText("Available filters are currently unavailable.")).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /Deployment/ })).toBeNull();
  });

  it("keeps an unbroken kind facet named and viewport-contained at 320px", async () => {
    const user = userEvent.setup();
    const longKind = "AcmePlatformWorkloadDeploymentConfiguration";
    const originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 320 });
    try {
      renderTimeline(timelinePort({
        readTimelineOverview: vi.fn().mockResolvedValue({
          ...timelineOverview(),
          facets: { activity: [], kinds: [{ kind: longKind, count: 1 }] },
        }),
      }), "/timeline", "en-US");

      await screen.findByText("Deployment checkout changed");
      await user.click(screen.getByText("Kinds"));
      const checkbox = await screen.findByRole("checkbox", { name: longKind });
      const label = checkbox.closest("label")?.querySelector<HTMLElement>("[data-slot='timeline-kind-label']");
      const popover = checkbox.closest<HTMLElement>("[data-slot='timeline-kind-popover']");

      expect(label?.textContent).toContain(longKind);
      expect(label?.className).toContain("min-w-0");
      expect(label?.className).toContain("[overflow-wrap:anywhere]");
      expect(popover?.className).toContain("w-[min(24rem,calc(100vw-2rem))]");
      expect(popover?.className).toContain("max-w-[calc(100vw-2rem)]");
      expect(popover?.className).toContain("overflow-x-hidden");
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalInnerWidth });
    }
  });

  it("accepts a shared reverse-order activity URL and keeps its semantic selection through history", async () => {
    const port = timelinePort();
    const { router } = renderTimeline(port, "/timeline?activity=warnings,unhealthy", "en-US");

    await waitFor(() => {
      expect(new URLSearchParams(router.state.location.search).get("activity")).toBe("unhealthy,warnings");
      expect(port.readTimeline).toHaveBeenLastCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({ activity: ["unhealthy", "warnings"] }),
        }),
        expect.any(AbortSignal),
      );
    });
    expect(screen.getByRole("checkbox", { name: "Problems only" })).toHaveProperty("checked", true);

    await act(async () => { await router.navigate("/timeline?activity=changes"); });
    await waitFor(() => expect(new URLSearchParams(router.state.location.search).get("activity")).toBe("changes"));
    await act(async () => { await router.navigate("/timeline?activity=warnings,unhealthy"); });
    await waitFor(() => expect(new URLSearchParams(router.state.location.search).get("activity")).toBe("unhealthy,warnings"));

    await act(async () => { await router.navigate(-1); });
    await waitFor(() => expect(new URLSearchParams(router.state.location.search).get("activity")).toBe("changes"));
    await act(async () => { await router.navigate(1); });
    await waitFor(() => {
      expect(new URLSearchParams(router.state.location.search).get("activity")).toBe("unhealthy,warnings");
      expect(port.readTimeline).toHaveBeenLastCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({ activity: ["unhealthy", "warnings"] }),
        }),
        expect.any(AbortSignal),
      );
    });
  });

  it("preserves raw kind filters during loading, failure, and back-forward navigation", async () => {
    const overview = deferred<ReturnType<typeof timelineOverview>>();
    const readTimeline = vi.fn().mockResolvedValue(snapshot());
    const readTimelineOverview = vi.fn().mockReturnValue(overview.promise);
    const port = timelinePort({ readTimeline, readTimelineOverview });
    const { router } = renderTimeline(port, "/timeline?kinds=Deployment", "en-US");

    await waitFor(() => expect(readTimeline).toHaveBeenLastCalledWith(
      expect.objectContaining({ filters: expect.objectContaining({ kinds: ["Deployment"] }) }),
      expect.any(AbortSignal),
    ));
    expect(readTimelineOverview).toHaveBeenCalledWith(
      expect.objectContaining({ filters: expect.objectContaining({ kinds: [] }) }),
      expect.any(AbortSignal),
    );

    await act(async () => { await router.navigate("/timeline?kinds=Pod"); });
    await waitFor(() => expect(readTimeline).toHaveBeenLastCalledWith(
      expect.objectContaining({ filters: expect.objectContaining({ kinds: ["Pod"] }) }),
      expect.any(AbortSignal),
    ));
    expect(readTimelineOverview).toHaveBeenCalledTimes(1);

    await act(async () => { await router.navigate(-1); });
    await waitFor(() => expect(readTimeline).toHaveBeenLastCalledWith(
      expect.objectContaining({ filters: expect.objectContaining({ kinds: ["Deployment"] }) }),
      expect.any(AbortSignal),
    ));
    await act(async () => { await router.navigate(1); });
    await waitFor(() => expect(readTimeline).toHaveBeenLastCalledWith(
      expect.objectContaining({ filters: expect.objectContaining({ kinds: ["Pod"] }) }),
      expect.any(AbortSignal),
    ));
    expect(readTimeline.mock.calls.every(([query]) => query.filters.kinds.length > 0)).toBe(true);
  });

  it("keeps a kind filter when its overview request fails and removes unsupported kinds only after a successful facet response", async () => {
    const user = userEvent.setup();
    const failurePort = timelinePort({
      readTimelineOverview: vi.fn().mockRejectedValue(new TimelineFailure("offline")),
    });
    const failed = renderTimeline(failurePort, "/timeline?kinds=Pod", "en-US");
    await waitFor(() => expect(failurePort.readTimeline).toHaveBeenLastCalledWith(
      expect.objectContaining({ filters: expect.objectContaining({ kinds: ["Pod"] }) }),
      expect.any(AbortSignal),
    ));
    await user.click(screen.getByText("Kinds"));
    expect(await screen.findByText("Available filters are currently unavailable.")).toBeTruthy();
    failed.unmount();

    const successReadTimeline = vi.fn().mockResolvedValue(snapshot());
    const successPort = timelinePort({ readTimeline: successReadTimeline });
    const { router } = renderTimeline(successPort, "/timeline?kinds=UnsupportedKind", "en-US");
    await waitFor(() => {
      expect(successReadTimeline.mock.calls.some(([query]) => (
        query.filters.kinds[0] === "UnsupportedKind"
      ))).toBe(true);
      expect(new URLSearchParams(router.state.location.search).get("kinds")).toBeNull();
    });
    expect(successPort.readTimeline).toHaveBeenLastCalledWith(
      expect.objectContaining({ filters: expect.objectContaining({ kinds: [] }) }),
      expect.any(AbortSignal),
    );
  });
});

function timelinePort(overrides: Partial<TimelinePort> = {}): TimelinePort {
  return {
    capabilities: {
      selectedSourceMode: "retained",
      availableSourceModes: ["retained"],
      maxRetainedRangeMs: 604_800_000,
      queryBounds: { serverNowMs: 2_000, earliestQueryableMs: 0, maxWindowMs: 604_800_000 },
      namespaceFilterPolicy: "not_required",
      controlSurface: timelineControlSurface(),
    },
    readTimeline: vi.fn().mockResolvedValue(snapshot({ events: [event()] })),
    readTimelineOverview: vi.fn().mockResolvedValue(timelineOverview()),
    readTimelinePins: vi.fn().mockResolvedValue(timelinePinSet()),
    upsertTimelinePin: vi.fn().mockResolvedValue(timelinePinMutation()),
    removeTimelinePin: vi.fn().mockResolvedValue(timelinePinMutation()),
    subscribeTimeline: idleStream,
    ...overrides,
  };
}

function snapshot(overrides: Partial<Omit<TimelineSnapshot, "session">> = {}): TimelineSnapshot {
  const session = {
    query: {
      scopes: TIMELINE_SCOPES,
      mode: { kind: "frozen" as const, fromMs: 1_000, toMs: 2_000 },
      control: { view: "swimlane" as const, rangeId: "custom", lensZoomRung: "1h" },
      filters: {
        activity: [],
        kinds: [],
        showDeleted: true,
        pinnedOnly: false,
        search: "",
        grouping: "app" as const,
        sort: "importance" as const,
        selectedEventKey: null,
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
    pinSetRevision: overrides.pinSetRevision ?? null,
  };
}

function lensSnapshot(): TimelineSnapshot {
  const retained = snapshot({
    events: [
      event({ id: "early", sourceKey: "inventory:early", title: "Early event", occurredAt: "1970-01-01T00:00:01.200Z" }),
      event({ id: "late", sourceKey: "inventory:late", title: "Late event", occurredAt: "1970-01-01T00:00:01.900Z" }),
    ],
  });
  return {
    ...retained,
    session: {
      ...retained.session,
      window: { fromMs: 1_000, toMs: 2_000 },
      query: {
        ...retained.session.query,
        mode: { kind: "live", widthMs: 1_000 },
        control: { ...retained.session.query.control, rangeId: "range-default", lensZoomRung: "lens-wide" },
      },
    },
  };
}

function timelineControlSurface() {
  return {
    views: [controlOption("list", "List"), controlOption("swimlane", "Swimlane")],
    groupings: [controlOption("app", "Application"), controlOption("owner", "Owner"), controlOption("flat", "None")],
    sorts: [controlOption("importance", "Importance"), controlOption("recent", "Recent"), controlOption("name", "Name")],
    activity: [
      { ...controlOption("all", "All"), activity: [], problemsActivity: ["unhealthy", "warning"] as const },
      { ...controlOption("changes", "Changes"), activity: ["change"] as const, problemsActivity: [] },
    ],
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
    queryBounds: { serverNowMs: 2_000, earliestQueryableMs: 0, maxWindowMs: 604_800_000 },
    bucketWidthMs: 1_000,
    buckets: [{ fromMs: 1_000, toMs: 2_000, eventCount: 0, problemCount: 0 }],
    coverage: [],
    coverageSources: [{ source: "inventory" as const, availability: "observed" as const }],
    facets: {
      activity: [{ activity: "change" as const, count: 1 }],
      kinds: [{ kind: "Deployment", count: 1 }, { kind: "Pod", count: 0 }],
    },
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

function event(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
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
    ...overrides,
  };
}

function coverage(overrides: Partial<TimelineCoverage> = {}): TimelineCoverage {
  return {
    scope: TIMELINE_SCOPES[0]!,
    source: "kubernetes_event",
    fromMs: 1_000,
    toMs: 2_000,
    reason: "collection_gap",
    ...overrides,
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

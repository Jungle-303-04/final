// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimelineFailure, type TimelinePort } from "../../features/timeline/timelineContract";
import type { ClusterScope } from "../../shared/parity/referenceParity";
import { I18nProvider } from "../../shared/i18n";
import { TimelineSurface } from "./TimelineSurface";

afterEach(cleanup);

describe("TimelineSurface", () => {
  it("rehydrates URL state after history navigation and writes search without an API path", async () => {
    const user = userEvent.setup();
    const port = timelinePort();
    const { router } = renderTimeline(port, "/timeline?foreign=keep&q=first&view=list", "en-US");

    expect((await screen.findByText(/1 event is available/u)).textContent).toContain("1 event");
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

    await act(async () => {
      await router.navigate(-1);
    });
    expect((screen.getByRole("searchbox", { name: "Timeline search" }) as HTMLInputElement).value).toBe("second");
    expect(screen.getByRole("radio", { name: "List" }).getAttribute("aria-checked")).toBe("true");

    await act(async () => {
      await router.navigate(1);
    });
    expect((screen.getByRole("searchbox", { name: "Timeline search" }) as HTMLInputElement).value).toBe("restored");
    expect(screen.getByRole("radio", { name: "Swimlane" }).getAttribute("aria-checked")).toBe("true");
  });

  it("normalizes an oversized retained range and renders an honest empty state", async () => {
    const tenDays = 24 * 60 * 60 * 1000 * 10;
    const { router } = renderTimeline(
      timelinePort({ readTimeline: vi.fn().mockResolvedValue({ eventCount: 0 }) }),
      `/timeline?from=1&to=${tenDays}`,
      "en-US",
    );

    expect(await screen.findByText("No timeline events match this scope.")).toBeTruthy();
    await waitFor(() => {
      expect(router.state.location.search).toContain(`from=${tenDays - (24 * 60 * 60 * 1000 * 7)}`);
      expect(router.state.location.search).toContain(`to=${tenDays}`);
    });
  });

  it("renders a retryable error state and retains the port as the only data source", async () => {
    const user = userEvent.setup();
    const readTimeline = vi
      .fn()
      .mockRejectedValueOnce(new TimelineFailure("offline"))
      .mockResolvedValueOnce({ eventCount: 2 });
    renderTimeline(timelinePort({ readTimeline }), "/timeline", "en-US");

    expect((await screen.findByRole("alert")).textContent).toContain("Timeline data is unavailable.");
    await user.click(screen.getByRole("button", { name: "Retry timeline" }));

    expect((await screen.findByText(/2 events are available/u)).textContent).toContain("2 events");
    expect(readTimeline).toHaveBeenCalledTimes(2);
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
  ])("uses typed catalog copy and retains URL behavior for $navigatorLanguage", async (copy) => {
    const user = userEvent.setup();
    const { router } = renderTimeline(
      timelinePort({ readTimeline: vi.fn().mockResolvedValue({ eventCount: 0 }) }),
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
    readTimeline: vi.fn().mockResolvedValue({ eventCount: 1 }),
    ...overrides,
  };
}

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

const TIMELINE_SCOPES: readonly ClusterScope[] = [{
  workspaceId: "workspace-1",
  clusterId: "cluster-1",
  namespaces: ["shop"],
  freshness: "live",
}];

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

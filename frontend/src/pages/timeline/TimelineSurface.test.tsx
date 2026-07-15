// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimelineFailure, type TimelinePort } from "../../features/timeline/timelineContract";
import { TimelineSurface } from "./TimelineSurface";

afterEach(cleanup);

describe("TimelineSurface", () => {
  it("rehydrates URL state after history navigation and writes search without an API path", async () => {
    const user = userEvent.setup();
    const port = timelinePort();
    const { router } = renderTimeline(port, "/timeline?foreign=keep&q=first&view=list");

    expect((await screen.findByText(/1 event are available/u)).textContent).toContain("1 event");
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
    renderTimeline(timelinePort({ readTimeline }));

    expect((await screen.findByRole("alert")).textContent).toContain("Timeline data is unavailable.");
    await user.click(screen.getByRole("button", { name: "Retry timeline" }));

    expect((await screen.findByText(/2 events are available/u)).textContent).toContain("2 events");
    expect(readTimeline).toHaveBeenCalledTimes(2);
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

function renderTimeline(port: TimelinePort, initialEntry = "/timeline") {
  const router = createMemoryRouter([{
    path: "/timeline",
    element: (
      <>
        <TimelineSurface
          port={port}
          scope={{
            workspaceId: "workspace-1",
            clusterIds: ["cluster-1"],
            namespaces: ["shop"],
            freshness: "live",
          }}
        />
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

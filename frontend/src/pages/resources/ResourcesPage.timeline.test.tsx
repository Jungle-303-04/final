// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LOG_STREAM_PORT } from "../../features/log-stream/logStreamContract";
import {
  renderResources,
  resourcesActionsPort,
  resourcesCapabilitiesPort,
  resourcesChangeTimelinePort,
  resourcesClusterPort,
  resourcesFilterPort,
  resourcesMetricHistoryPort,
  resourcesPhysicalTopologyPort,
  resourcesPort,
  resourcesRelationTopologyPort,
} from "./ResourcesPage.testSupport";

afterEach(cleanup);

describe("ResourcesPage S11 timeline strip", () => {
  it("does not issue an overflow-prone all-resource timeline read", async () => {
    const timelinePort = resourcesChangeTimelinePort();
    renderResources(
      resourcesPort(),
      "/resources?clusters=cluster-1",
      resourcesClusterPort(),
      vi.fn(),
      "ko",
      resourcesFilterPort(),
      resourcesPhysicalTopologyPort(),
      resourcesMetricHistoryPort(),
      resourcesCapabilitiesPort(),
      resourcesActionsPort(),
      EMPTY_LOG_STREAM_PORT,
      resourcesRelationTopologyPort(),
      timelinePort,
    );

    expect(await screen.findByRole("article", { name: "서버 worker-a" })).toBeTruthy();
    expect(timelinePort.loadChangeTimeline).not.toHaveBeenCalled();
    const timeline = document.querySelector('[data-slot="resources-time-scrubber"]');
    expect(timeline?.getAttribute("data-state")).toBe("unavailable");
    expect(timeline?.getAttribute("data-expanded")).toBe("false");
    expect(screen.queryByRole("slider", { name: "Time" })).toBeNull();
  });

  it("jumps to evidence-backed incidents and persists the historical coordinate", async () => {
    const user = userEvent.setup();
    const timelinePort = resourcesChangeTimelinePort({
      loadChangeTimeline: vi.fn().mockImplementation((_state, options) => {
        const occurredMs = options.toMs - options.bucketMs * 2;
        return Promise.resolve({
          ...options,
          buckets: [{
            startMs: options.fromMs,
            endMs: options.toMs,
            total: 1,
            warnings: 1,
          }],
          events: [{
            id: "incident-checkout",
            kind: "incident",
            occurredMs,
            title: "Readiness failed",
            severity: "critical",
          }],
          gaps: [{
            from: occurredMs - options.bucketMs,
            to: occurredMs,
          }],
        });
      }),
    });
    renderTimelineResources(timelinePort);

    await user.click(await screen.findByRole("button", { name: "Show recorded history" }));
    const marker = await screen.findByRole("button", { name: /Jump to incident/ });
    await user.click(marker);

    await waitFor(() => expect(readQuery().has("t.at")).toBe(true));
    expect(screen.getByText("No record in this interval")).toBeTruthy();
    expect(document.querySelector('[data-slot="resources-time-scrubber"]')
      ?.getAttribute("data-state")).toBe("past");
    expect(timelinePort.loadChangeTimeline).toHaveBeenCalledWith(
      expect.objectContaining({ common: expect.objectContaining({ clusters: ["cluster-1"] }) }),
      expect.objectContaining({ bucketMs: 120_000 }),
      expect.any(AbortSignal),
    );
  });

  it("keeps live history collapsed and only offers playback after selecting the past", async () => {
    const user = userEvent.setup();
    renderTimelineResources(resourcesChangeTimelinePort());

    const expand = await screen.findByRole("button", { name: "Show recorded history" });
    expect(screen.getByText("Live")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Play resource history" })).toBeNull();
    expect(screen.queryByRole("slider", { name: "Time" })).toBeNull();

    await user.click(expand);
    expect(screen.getByText("Recorded changes · 2 min intervals")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Play resource history" })).toBeNull();
    const slider = screen.getByRole("slider", { name: "Time" });
    fireEvent.change(slider, { target: { value: slider.getAttribute("min") } });
    await waitFor(() => expect(readQuery().has("t.at")).toBe(true));
    await user.click(screen.getByRole("button", { name: "Play resource history" }));
    expect(document.querySelector('[data-slot="resources-time-scrubber"]')
      ?.getAttribute("data-state")).toBe("playing");
  });
});

function renderTimelineResources(timelinePort: ReturnType<typeof resourcesChangeTimelinePort>) {
  return renderResources(
    resourcesPort(),
    "/resources?clusters=cluster-1&resources.types=pod",
    resourcesClusterPort(),
    vi.fn(),
    "en",
    resourcesFilterPort(),
    resourcesPhysicalTopologyPort(),
    resourcesMetricHistoryPort(),
    resourcesCapabilitiesPort(),
    resourcesActionsPort(),
    EMPTY_LOG_STREAM_PORT,
    resourcesRelationTopologyPort(),
    timelinePort,
  );
}

function readQuery(): URLSearchParams {
  const location = screen.getByTestId("resources-location").textContent ?? "";
  return new URL(location, "https://product.test").searchParams;
}

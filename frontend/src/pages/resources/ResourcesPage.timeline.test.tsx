// @vitest-environment jsdom

import { cleanup, screen, waitFor } from "@testing-library/react";
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
    expect(document.querySelector('[data-slot="resources-time-scrubber"]')
      ?.getAttribute("data-state")).toBe("unavailable");
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

  it("starts playback from history when invoked at the live edge", async () => {
    const user = userEvent.setup();
    renderTimelineResources(resourcesChangeTimelinePort());

    await user.click(await screen.findByRole("button", { name: "Play resource history" }));
    await waitFor(() => expect(readQuery().has("t.at")).toBe(true));
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

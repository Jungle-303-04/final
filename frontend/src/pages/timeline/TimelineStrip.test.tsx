// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimelineFailure, type TimelineCapabilities, type TimelineMode, type TimelineOverview } from "../../features/timeline/timelineContract";
import type { TimelineLens } from "../../features/filters/timelineUrlState";
import { I18nProvider, useI18n } from "../../shared/i18n";
import { TimelineStrip } from "./TimelineStrip";

afterEach(cleanup);

describe("TimelineStrip", () => {
  it("uses server range and lens IDs without inventing labels or durations", () => {
    const onLensZoomRungChange = vi.fn();
    const onRangeChange = vi.fn();
    renderStrip({ onLensZoomRungChange, onRangeChange });

    fireEvent.click(screen.getByRole("button", { name: "Last six hours" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Lens zoom" }), { target: { value: "lens-wide" } });

    expect(onRangeChange).toHaveBeenCalledWith("range-wide", { kind: "live", widthMs: 600 });
    expect(onLensZoomRungChange).toHaveBeenCalledWith("lens-wide", {
      kind: "window",
      fromMs: 450,
      toMs: 850,
    });
  });

  it("rejects future and outside custom bounds from the server selection and closes after apply", () => {
    const onCustomRange = vi.fn();
    const toMs = Date.parse("2026-07-15T12:00:00");
    const view = renderStrip({
      frame: {
        phase: "ready",
        overview: {
          ...overview(),
          window: { fromMs: toMs - 600_000, toMs },
          queryBounds: { serverNowMs: toMs, earliestQueryableMs: toMs - 600_000, maxWindowMs: 600_000 },
        },
      },
      onCustomRange,
    });

    fireEvent.click(screen.getByText("Custom range"));
    const from = screen.getByLabelText("From") as HTMLInputElement;
    const to = screen.getByLabelText("To") as HTMLInputElement;
    expect(from.min).not.toBe("");
    expect(to.max).not.toBe("");

    fireEvent.change(to, { target: { value: "2026-07-16T12:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply range" }));
    expect(screen.getByRole("alert").textContent).toContain("current timeline boundary");

    fireEvent.change(from, { target: { value: "2026-07-01T12:00" } });
    fireEvent.change(to, { target: { value: "2026-07-15T12:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply range" }));
    expect(screen.getByRole("alert").textContent).toContain("server-retained timeline boundary");

    const max = to.max;
    fireEvent.change(from, { target: { value: from.min } });
    fireEvent.change(to, { target: { value: max } });
    fireEvent.click(screen.getByRole("button", { name: "Apply range" }));
    expect(onCustomRange).toHaveBeenCalledWith("custom", {
      kind: "frozen",
      fromMs: Date.parse(from.min),
      toMs: Date.parse(max),
    });
    expect(view.container.querySelector("details")?.open).toBe(false);
  });

  it("maps actual pointer drag and keyboard navigation to a local visible lens", () => {
    const onLensChange = vi.fn();
    renderStrip({ onLensChange });
    const axis = screen.getByRole("slider", { name: "Retained timeline strip" });
    Object.defineProperty(axis, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 100 }),
    });

    fireEvent.pointerDown(axis, { clientX: 0, pointerId: 3 });
    fireEvent.pointerMove(axis, { clientX: 20, pointerId: 3 });
    fireEvent.pointerUp(axis, { clientX: 20, pointerId: 3 });
    expect(onLensChange).toHaveBeenLastCalledWith({ kind: "window", fromMs: 200, toMs: 300 });

    fireEvent.keyDown(axis, { key: "End" });
    expect(onLensChange).toHaveBeenLastCalledWith({ kind: "window", fromMs: 900, toMs: 1_000 });
    fireEvent.keyDown(axis, { key: "ArrowLeft" });
    expect(onLensChange).toHaveBeenLastCalledWith({ kind: "window", fromMs: 500, toMs: 600 });
    fireEvent.keyDown(axis, { key: "PageUp" });
    expect(onLensChange).toHaveBeenLastCalledWith({ kind: "window", fromMs: 500, toMs: 600 });
  });

  it("shows selection and visible boundaries, preserves frozen span and lens width on Go live", () => {
    const onGoLive = vi.fn();
    renderStrip({
      lens: { kind: "window", fromMs: 200, toMs: 400 },
      mode: { kind: "frozen", fromMs: 0, toMs: 1_000 },
      onGoLive,
    });

    expect(screen.getByText(/Selection:/).textContent).toContain("1970");
    expect(screen.getByText(/Visible lens:/).textContent).toContain("1970");
    expect(screen.getByRole("slider").getAttribute("aria-valuetext")).toContain("Visible lens:");
    fireEvent.click(screen.getByRole("button", { name: "Go live" }));
    expect(onGoLive).toHaveBeenCalledWith(
      "custom",
      { kind: "live", widthMs: 1_000 },
      { kind: "trailing", widthMs: 200 },
    );
  });

  it("shows coverage limits at 320px without synthesizing overview bars", () => {
    renderStrip({ frame: { phase: "failed", failure: new TimelineFailure("unavailable") } });
    const strip = screen.getByLabelText("Retained timeline strip");
    expect(strip.querySelector("svg")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("currently unavailable");

    const ready = renderStrip();
    expect(screen.getByText("Shaded intervals are coverage or retention limits, not intervals with zero events.")).toBeTruthy();
    expect(screen.getByText("Reported coverage gap")).toBeTruthy();
    expect(screen.getByText("Coverage unavailable: GitOps")).toBeTruthy();
    expect(ready.container.querySelector("[data-slot='timeline-strip-axis']")?.className).toContain("min-w-0");
  });
});

function renderStrip(overrides: Partial<{
  frame: { phase: "ready"; overview: TimelineOverview } | { phase: "failed"; failure: TimelineFailure };
  lens: TimelineLens;
  mode: TimelineMode;
  onCustomRange: (rangeId: string, mode: Extract<TimelineMode, { kind: "frozen" }>) => void;
  onGoLive: (rangeId: string, mode: Extract<TimelineMode, { kind: "live" }>, lens: TimelineLens) => void;
  onLensChange: (lens: TimelineLens) => void;
  onLensZoomRungChange: (id: string, lens: TimelineLens) => void;
  onRangeChange: (rangeId: string, mode: Extract<TimelineMode, { kind: "live" }>) => void;
}> = {}) {
  const props = {
    frame: { phase: "ready" as const, overview: overview() },
    lens: { kind: "window" as const, fromMs: 600, toMs: 700 },
    mode: { kind: "live" as const, widthMs: 400 },
    onCustomRange: vi.fn(),
    onGoLive: vi.fn(),
    onLensChange: vi.fn(),
    onLensZoomRungChange: vi.fn(),
    onRangeChange: vi.fn(),
    ...overrides,
  };
  return render(
    <I18nProvider navigatorLanguage="en-US" storage={null}>
      <StripHarness {...props} />
    </I18nProvider>,
  );
}

function StripHarness({
  frame,
  lens,
  mode,
  onCustomRange,
  onGoLive,
  onLensChange,
  onLensZoomRungChange,
  onRangeChange,
}: {
  frame: { phase: "ready"; overview: TimelineOverview } | { phase: "failed"; failure: TimelineFailure };
  lens: TimelineLens;
  mode: TimelineMode;
  onCustomRange: (rangeId: string, mode: Extract<TimelineMode, { kind: "frozen" }>) => void;
  onGoLive: (rangeId: string, mode: Extract<TimelineMode, { kind: "live" }>, lens: TimelineLens) => void;
  onLensChange: (lens: TimelineLens) => void;
  onLensZoomRungChange: (id: string, lens: TimelineLens) => void;
  onRangeChange: (rangeId: string, mode: Extract<TimelineMode, { kind: "live" }>) => void;
}) {
  const { formatDate, t } = useI18n();
  return <TimelineStrip capabilities={capabilities()} formatDate={formatDate} frame={frame} lens={lens} lensZoomRung="lens-near" mode={mode} onCustomRange={onCustomRange} onGoLive={onGoLive} onLensChange={onLensChange} onLensZoomRungChange={onLensZoomRungChange} onRangeChange={onRangeChange} rangeId="range-default" t={t} />;
}

function capabilities(): TimelineCapabilities {
  const option = (id: string, label: string, durationMs: number) => ({ id, label, description: null, durationMs });
  return {
    selectedSourceMode: "retained",
    availableSourceModes: ["retained"],
    maxRetainedRangeMs: 600_000,
    queryBounds: { serverNowMs: 1_000, earliestQueryableMs: 400, maxWindowMs: 600_000 },
    namespaceFilterPolicy: "not_required",
    controlSurface: {
      views: [{ id: "list", label: "List", description: null }],
      groupings: [{ id: "app", label: "App", description: null }],
      sorts: [{ id: "importance", label: "Importance", description: null }],
      activity: [{ id: "all", label: "All", description: null, activity: [], problemsActivity: [] }],
      deleted: { key: "include_deleted", label: "Show deleted", default: true },
      kinds: { key: "kinds", label: "Kinds", selection: "multi", emptySelection: "all" },
      timeRanges: [option("range-default", "Last four hours", 400), option("range-wide", "Last six hours", 600)],
      defaultTimeRangeId: "range-default",
      customTimeRangeId: "custom",
      lensZoomRungs: [option("lens-near", "Near lens", 100), option("lens-wide", "Wide lens", 400)],
      defaultLensZoomRung: "lens-near",
      legend: { key: "legend", label: "Legend", availability: "available", items: [] },
      pins: { key: "pins", label: "Pins", availability: "unavailable", storage: null, revision: null, subjectKinds: [] },
    },
  };
}

function overview(): TimelineOverview {
  return {
    window: { fromMs: 0, toMs: 1_000 },
    queryBounds: { serverNowMs: 1_000, earliestQueryableMs: 400, maxWindowMs: 600_000 },
    bucketWidthMs: 100,
    buckets: [{ fromMs: 0, toMs: 1_000, eventCount: 4, problemCount: 1 }],
    coverage: [{
      scope: { workspaceId: "workspace-a", clusterId: "cluster-a", freshness: "live" },
      source: "gitops",
      fromMs: 400,
      toMs: 500,
      reason: "collection_gap",
    }],
    coverageSources: [{ source: "gitops", availability: "unavailable" }],
    facets: { activity: [], kinds: [] },
    newEvidenceCount: 3,
    pinSetRevision: null,
  };
}

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimelineFailure, type TimelineCapabilities, type TimelineMode, type TimelineOverview } from "../../features/timeline/timelineContract";
import { I18nProvider, useI18n } from "../../shared/i18n";
import { TimelineStrip } from "./TimelineStrip";

afterEach(cleanup);

describe("TimelineStrip", () => {
  it("uses server range and lens IDs without inventing labels or durations", () => {
    const onModeChange = vi.fn();
    const onLensZoomRungChange = vi.fn();
    const onRangeChange = vi.fn();
    renderStrip({ onLensZoomRungChange, onModeChange, onRangeChange });

    fireEvent.click(screen.getByRole("button", { name: "Last six hours" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Lens zoom" }), { target: { value: "lens-near" } });

    expect(onRangeChange).toHaveBeenCalledWith("range-wide", { kind: "live", widthMs: 600 });
    expect(onLensZoomRungChange).toHaveBeenCalledWith("lens-near");
  });

  it("validates custom date-time bounds against the server retained maximum", () => {
    const onModeChange = vi.fn();
    renderStrip({ onModeChange });

    fireEvent.click(screen.getByText("Custom range"));
    const from = screen.getByLabelText("From") as HTMLInputElement;
    const to = screen.getByLabelText("To") as HTMLInputElement;
    fireEvent.change(from, { target: { value: "1970-01-01T09:10" } });
    fireEvent.change(to, { target: { value: "1970-01-01T09:05" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply range" }));
    expect(screen.getByRole("alert").textContent).toContain("Choose an end time");

    fireEvent.change(from, { target: { value: "1970-01-01T09:00" } });
    fireEvent.change(to, { target: { value: "1970-01-01T09:20" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply range" }));
    expect(screen.getByRole("alert").textContent).toContain("exceeds the server retention limit");

    fireEvent.change(to, { target: { value: "1970-01-01T09:10" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply range" }));
    expect(onModeChange).toHaveBeenLastCalledWith({
      kind: "frozen",
      fromMs: Date.parse("1970-01-01T09:00"),
      toMs: Date.parse("1970-01-01T09:10"),
    });
  });

  it("maps pointer and keyboard navigation to a bounded frozen lens", () => {
    const onModeChange = vi.fn();
    renderStrip({ onModeChange });
    const axis = screen.getByRole("slider", { name: "Retained timeline strip" });
    Object.defineProperty(axis, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 100 }),
    });

    fireEvent.pointerDown(axis, { clientX: 0 });
    expect(onModeChange).toHaveBeenLastCalledWith({ kind: "frozen", fromMs: 0, toMs: 100 });
    fireEvent.keyDown(axis, { key: "Home" });
    expect(onModeChange).toHaveBeenLastCalledWith({ kind: "frozen", fromMs: 0, toMs: 100 });
    fireEvent.keyDown(axis, { key: "End" });
    expect(onModeChange).toHaveBeenLastCalledWith({ kind: "frozen", fromMs: 900, toMs: 1_000 });
    fireEvent.keyDown(axis, { key: "ArrowLeft" });
    expect(onModeChange).toHaveBeenLastCalledWith({ kind: "frozen", fromMs: 800, toMs: 900 });
    fireEvent.keyDown(axis, { key: "PageUp" });
    expect(onModeChange).toHaveBeenLastCalledWith({ kind: "frozen", fromMs: 800, toMs: 900 });
  });

  it("reports frozen later evidence and reattaches the descriptor default live mode", () => {
    const onModeChange = vi.fn();
    const onRangeChange = vi.fn();
    renderStrip({ mode: { kind: "frozen", fromMs: 100, toMs: 1_000 }, onModeChange, onRangeChange });

    expect(screen.getByText("3 newer facts are available.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Go live" }));
    expect(onRangeChange).toHaveBeenCalledWith("range-default", { kind: "live", widthMs: 400 });
  });

  it("shows reported coverage limitations at 320px without synthesizing overview bars", () => {
    renderStrip({ frame: { phase: "failed", failure: new TimelineFailure("unavailable") } });
    const strip = screen.getByLabelText("Retained timeline strip");
    expect(strip.querySelector("svg")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("currently unavailable");

    const ready = renderStrip();
    expect(screen.getByText("Reported coverage gap")).toBeTruthy();
    expect(screen.getByText("Coverage unavailable: GitOps")).toBeTruthy();
    expect(ready.container.querySelector("[data-slot='timeline-strip-axis']")?.className).toContain("min-w-0");
  });
});

function renderStrip(overrides: Partial<{
  frame: { phase: "ready"; overview: TimelineOverview } | { phase: "failed"; failure: TimelineFailure };
  mode: TimelineMode;
  onLensZoomRungChange: (id: string) => void;
  onModeChange: (mode: TimelineMode) => void;
  onRangeChange: (rangeId: string, mode: TimelineMode) => void;
}> = {}) {
  const props = {
    frame: { phase: "ready" as const, overview: overview() },
    mode: { kind: "live" as const, widthMs: 400 },
    onLensZoomRungChange: vi.fn(),
    onModeChange: vi.fn(),
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
  mode,
  onLensZoomRungChange,
  onModeChange,
  onRangeChange,
}: {
  frame: { phase: "ready"; overview: TimelineOverview } | { phase: "failed"; failure: TimelineFailure };
  mode: TimelineMode;
  onLensZoomRungChange: (id: string) => void;
  onModeChange: (mode: TimelineMode) => void;
  onRangeChange: (rangeId: string, mode: TimelineMode) => void;
}) {
  const { t } = useI18n();
  return <TimelineStrip capabilities={capabilities()} frame={frame} lensZoomRung="lens-near" mode={mode} onLensZoomRungChange={onLensZoomRungChange} onModeChange={onModeChange} onRangeChange={onRangeChange} t={t} />;
}

function capabilities(): TimelineCapabilities {
  const option = (id: string, label: string, durationMs: number) => ({ id, label, description: null, durationMs });
  return {
    selectedSourceMode: "retained",
    availableSourceModes: ["retained"],
    maxRetainedRangeMs: 600_000,
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

import { describe, expect, it } from "vitest";
import {
  DAY_MILLISECONDS,
  DEFAULT_LIVE_WINDOW_MILLISECONDS,
  isTimelineHighFrequencyOnlyChange,
  parseTimelineUrlState,
  writeTimelineSearchParams,
} from "./timelineUrlState";

describe("Timeline URL state", () => {
  const retainedOptions = {
    isRetained: true,
    maxRetainedRangeMs: DAY_MILLISECONDS * 7,
    requiresNamespaceFilter: false,
  } as const;

  it("parses supported URL state and removes the unsupported legacy pin selector", () => {
    const state = parseTimelineUrlState(
      new URLSearchParams(
        "foreign=keep&view=list&window=all&activity=changes,warnings,invalid&kinds=Pod,Deployment&deleted=0&pinnedOnly=1&q=checkout&grouping=owner&sort=recent&event=inventory%3Acheckout%3A7&filter=legacy",
      ),
      retainedOptions,
    );

    expect(state).toEqual({
      viewMode: "list",
      mode: { kind: "live", widthMs: DEFAULT_LIVE_WINDOW_MILLISECONDS, all: true },
      showDeleted: false,
      search: "checkout",
      activityFilter: ["changes", "warnings"],
      kindFilter: ["Pod", "Deployment"],
      grouping: "owner",
      sort: "recent",
      selectedEventKey: "inventory:checkout:7",
    });

    const written = writeTimelineSearchParams(
      new URLSearchParams("foreign=keep&filter=legacy"),
      state,
      retainedOptions,
    );

    expect(written.get("foreign")).toBe("keep");
    expect(written.get("filter")).toBeNull();
    expect(written.get("view")).toBe("list");
    expect(written.get("window")).toBe("all");
    expect(written.get("activity")).toBe("changes,warnings");
    expect(written.get("kinds")).toBe("Pod,Deployment");
    expect(written.get("deleted")).toBe("0");
    expect(written.get("pinnedOnly")).toBeNull();
    expect(written.get("q")).toBe("checkout");
    expect(written.get("grouping")).toBe("owner");
    expect(written.get("sort")).toBe("recent");
    expect(written.get("event")).toBe("inventory:checkout:7");
  });

  it("normalizes invalid and oversized retained ranges without losing a valid end", () => {
    const tenDays = DAY_MILLISECONDS * 10;
    const state = parseTimelineUrlState(
      new URLSearchParams(`from=1&to=${tenDays}`),
      retainedOptions,
    );

    expect(state.mode).toEqual({
      kind: "frozen",
      fromMs: tenDays - retainedOptions.maxRetainedRangeMs,
      toMs: tenDays,
    });
    expect(parseTimelineUrlState(
      new URLSearchParams("from=-1&to=bad&window=-100"),
      retainedOptions,
    ).mode).toEqual({ kind: "live", widthMs: DEFAULT_LIVE_WINDOW_MILLISECONDS });
  });

  it("clamps retained URLs with the exact server millisecond limit", () => {
    const maxRetainedRangeMs = 91_337;
    const toMs = 1_000_000;

    expect(parseTimelineUrlState(
      new URLSearchParams(`from=1&to=${toMs}`),
      { ...retainedOptions, maxRetainedRangeMs },
    ).mode).toEqual({
      kind: "frozen",
      fromMs: toMs - maxRetainedRangeMs,
      toMs,
    });
  });

  it("does not apply retained time parameters to a local source", () => {
    const localOptions = { ...retainedOptions, isRetained: false };
    const state = parseTimelineUrlState(
      new URLSearchParams("from=100&to=200&window=all"),
      localOptions,
    );
    const written = writeTimelineSearchParams(
      new URLSearchParams("foreign=keep&from=100&to=200&window=all"),
      state,
      localOptions,
    );

    expect(state.mode).toEqual({ kind: "live", widthMs: DEFAULT_LIVE_WINDOW_MILLISECONDS });
    expect(written.get("foreign")).toBe("keep");
    expect(written.get("from")).toBeNull();
    expect(written.get("to")).toBeNull();
    expect(written.get("window")).toBeNull();
  });

  it("forces list mode for required namespace filtering without persisting a view override", () => {
    const requiredNamespaceOptions = { ...retainedOptions, requiresNamespaceFilter: true };
    const state = parseTimelineUrlState(
      new URLSearchParams("view=swimlane"),
      requiredNamespaceOptions,
    );
    const written = writeTimelineSearchParams(
      new URLSearchParams("view=swimlane"),
      state,
      requiredNamespaceOptions,
    );

    expect(state.viewMode).toBe("list");
    expect(written.get("view")).toBeNull();
  });

  it("uses replace navigation only for high-frequency state changes", () => {
    expect(isTimelineHighFrequencyOnlyChange(
      new URLSearchParams("q=one&view=list"),
      new URLSearchParams("q=two&view=list"),
    )).toBe(true);
    expect(isTimelineHighFrequencyOnlyChange(
      new URLSearchParams("q=one&view=list"),
      new URLSearchParams("q=one&view=swimlane"),
    )).toBe(false);
    expect(isTimelineHighFrequencyOnlyChange(
      new URLSearchParams("q=one&foreign=old"),
      new URLSearchParams("q=two&foreign=new"),
    )).toBe(false);
  });
});

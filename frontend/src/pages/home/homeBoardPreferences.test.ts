import { describe, expect, it } from "vitest";

import {
  DEFAULT_HOME_BOARD_PREFERENCES,
  homeBoardPreferenceKey,
  loadHomeBoardPreferences,
  saveHomeBoardPreferences,
} from "./homeBoardPreferences";

describe("home board preferences", () => {
  it("scopes persisted layout to the authenticated user and workspace", () => {
    expect(homeBoardPreferenceKey("workspace-a", "user-a"))
      .toBe("opsia:home-board:workspace-a:user-a:v2");
    expect(homeBoardPreferenceKey(null, "user-a")).toBeNull();
  });

  it("validates stored widget IDs and preserves the catalog order", () => {
    const storage = {
      getItem: () => JSON.stringify({
        order: ["W4", "unknown", "W2"],
        visible: ["W4", "W5", "unknown"],
        collapsed: ["W5", "W2"],
      }),
      setItem: () => undefined,
    };
    expect(loadHomeBoardPreferences(storage, "key")).toEqual({
      order: ["W4", "W2", "W3", "W5", "W6", "W7", "W8"],
      visible: ["W4", "W5"],
      collapsed: ["W5"],
    });
  });

  it("falls back safely and writes normalized preferences", () => {
    let saved = "";
    const storage = {
      getItem: () => "{bad",
      setItem: (_key: string, value: string) => {
        saved = value;
      },
    };
    expect(loadHomeBoardPreferences(storage, "key")).toBe(DEFAULT_HOME_BOARD_PREFERENCES);
    saveHomeBoardPreferences(storage, "key", {
      order: ["W2"],
      visible: ["W2"],
      collapsed: [],
    });
    expect(JSON.parse(saved).order).toEqual(["W2", "W3", "W4", "W5", "W6", "W7", "W8"]);
  });
});

// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import {
  PRODUCT_SIDEBAR_STORAGE_KEY,
  readProductSidebarState,
  resolveInitialProductSidebarState,
} from "./productShellLayout";

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-product-sidebar-state");
});

describe("product shell first-paint layout", () => {
  it("starts with the demo-v3 expanded sidebar when no explicit wide preference exists", () => {
    expect(resolveInitialProductSidebarState(undefined, window.localStorage, false))
      .toBe("expanded");
  });

  it("restores an explicit wide preference without a post-mount width change", () => {
    window.localStorage.setItem(PRODUCT_SIDEBAR_STORAGE_KEY, "expanded");

    expect(readProductSidebarState(window.localStorage)).toBe("expanded");
    expect(resolveInitialProductSidebarState(undefined, window.localStorage, false))
      .toBe("expanded");
  });

  it("uses the compact rail at the demo breakpoint even after a wide preference", () => {
    window.localStorage.setItem(PRODUCT_SIDEBAR_STORAGE_KEY, "expanded");

    expect(resolveInitialProductSidebarState(undefined, window.localStorage, true))
      .toBe("collapsed");
  });

  it("keeps the reference expanded geometry when storage access is unavailable", () => {
    const unavailableStorage = {
      getItem() {
        throw new DOMException("denied", "SecurityError");
      },
    };

    expect(readProductSidebarState(unavailableStorage)).toBeNull();
    expect(resolveInitialProductSidebarState(undefined, unavailableStorage, false))
      .toBe("expanded");
  });

  it("keeps the compact breakpoint authoritative over an explicit desktop default", () => {
    expect(resolveInitialProductSidebarState(false, window.localStorage, true))
      .toBe("collapsed");
  });
});

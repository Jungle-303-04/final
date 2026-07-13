// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createShortcutMatcher,
  PRODUCT_SHORTCUT_EVENT,
  shellShortcutDefinitions,
  type ProductShortcutEventDetail,
  type ShortcutMatcher,
} from "../../app/shortcutRegistry";
import { renderResources, resourcesPort } from "./ResourcesPage.testSupport";

let shortcutMatcher: ShortcutMatcher;
let shortcutKeydown: (event: KeyboardEvent) => void;
const matchedRoutes = vi.fn();

beforeEach(() => {
  resetDocumentTestClock();
  matchedRoutes.mockReset();
  shortcutMatcher = createShortcutMatcher(
    shellShortcutDefinitions(new Set(["home", "resources"]), "resources"),
  );
  shortcutKeydown = (event: KeyboardEvent) => {
    const definition = shortcutMatcher.handle(event);
    if (!definition) return;
    if (definition.id.startsWith("route:")) matchedRoutes(definition.id);
    if (definition.group === "context") {
      window.dispatchEvent(new CustomEvent<ProductShortcutEventDetail>(PRODUCT_SHORTCUT_EVENT, {
        detail: { id: definition.id as ProductShortcutEventDetail["id"] },
      }));
    }
  };
  window.addEventListener("keydown", shortcutKeydown);
});

afterEach(() => {
  window.removeEventListener("keydown", shortcutKeydown);
  shortcutMatcher.dispose();
  cleanup();
  resetDocumentTestClock();
});

describe("ResourcesPage keyboard navigation", () => {
  it("supports j/k, gg/G, Enter, and d without moving focus into hidden rows", async () => {
    const user = userEvent.setup();
    renderResources(resourcesPort(), "/product/resources?clusters=cluster-1&resources.types=pod");
    const checkout = await screen.findByRole("button", { name: /checkout-api-0/u }, { timeout: 10_000 });
    const orders = screen.getByRole("button", { name: /orders-api-0/u });
    const telemetry = screen.getByRole("button", { name: /telemetry-0/u });

    await user.keyboard("j");
    expect(document.activeElement).toBe(checkout);
    await user.keyboard("j");
    expect(document.activeElement).toBe(orders);
    await user.keyboard("k");
    expect(document.activeElement).toBe(checkout);
    await user.keyboard("G");
    expect(document.activeElement).toBe(telemetry);
    await user.keyboard("gg");
    expect(document.activeElement).toBe(checkout);

    await user.keyboard("{Enter}");
    expect(await screen.findByRole("dialog", { name: "checkout-api-0 상세" }, { timeout: 5_000 }))
      .toBeTruthy();
    await user.click(screen.getByRole("button", { name: "상세 닫기" }));
    await waitFor(() => expect(document.activeElement).toBe(checkout));
    await user.keyboard("d");
    expect(await screen.findByRole("dialog", { name: "checkout-api-0 상세" }, { timeout: 5_000 }))
      .toBeTruthy();
  }, 30_000);

  it("cycles API-discovered resource types with [ and ] while focus is outside an editor", async () => {
    renderResources(resourcesPort(), "/product/resources?clusters=cluster-1&resources.types=pod");
    await screen.findByRole("table", { name: "리소스 목록" }, { timeout: 5_000 });

    fireEvent.keyDown(document, { key: "]" });
    await waitFor(() => expect(screen.getByTestId("resources-location").textContent)
      .toContain("clusters=cluster-1&resources.types=node"));
    fireEvent.keyDown(document, { key: "[" });
    await waitFor(() => expect(screen.getByTestId("resources-location").textContent)
      .toContain("clusters=cluster-1&resources.types=pod"));
  }, 15_000);

  it("does not run collection shortcuts while the loaded-results search owns focus", async () => {
    const user = userEvent.setup();
    renderResources(resourcesPort(), "/product/resources?clusters=cluster-1&resources.types=pod");
    const search = await screen.findByRole("searchbox", { name: "표시된 결과 검색" }, { timeout: 5_000 });

    await user.click(search);
    await user.keyboard("jGd");
    fireEvent.keyDown(search, { key: "[" });
    fireEvent.keyDown(search, { key: "]" });
    expect((search as HTMLInputElement).value).toBe("jGd");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("resources-location").textContent)
      .toContain("clusters=cluster-1&resources.types=pod&resources.q=jGd");
  }, 15_000);

  it("keeps global g chords available while reserving gg for the first resource row", async () => {
    renderResources(resourcesPort(), "/product/resources?clusters=cluster-1&resources.types=pod");
    const checkout = await screen.findByRole(
      "button",
      { name: /checkout-api-0/u },
      { timeout: 5_000 },
    );

    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "h" });
    expect(matchedRoutes).toHaveBeenCalledExactlyOnceWith("route:home");

    document.body.tabIndex = -1;
    document.body.focus();
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "g" });
    expect(document.activeElement).toBe(checkout);
    expect(matchedRoutes).toHaveBeenCalledTimes(1);
  }, 15_000);
});

function resetDocumentTestClock() {
  vi.useRealTimers();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
}

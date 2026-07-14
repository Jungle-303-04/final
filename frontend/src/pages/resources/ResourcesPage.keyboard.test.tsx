// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createShortcutMatcher,
  PRODUCT_SHORTCUT_EVENT,
  shellShortcutDefinitions,
  type ProductShortcutEventDetail,
  type ShortcutMatcher,
} from "../../app/shortcutRegistry";
import {
  renderResources,
  resourcesPort,
} from "./ResourcesPage.testSupport";
import type { LogStreamPort } from "../../features/log-stream/logStreamContract";

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
  document.querySelector('[data-slot="unified-filter-input"]')?.remove();
  cleanup();
  resetDocumentTestClock();
});

describe("ResourcesPage keyboard navigation", () => {
  it("supports j/k, gg/G, Enter, and d without moving focus into hidden rows", async () => {
    const user = userEvent.setup();
    renderResources(resourcesPort(), "/resources?clusters=cluster-1&resources.types=pod");
    const table = await screen.findByRole("table", { name: "리소스 목록" });
    const checkout = within(table).getByRole("button", { name: /checkout-api-0/u });
    const orders = within(table).getByRole("button", { name: /orders-api-0/u });
    const telemetry = within(table).getByRole("button", { name: /telemetry-0/u });

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
    await user.keyboard("j");
    expect(await screen.findByRole("dialog", { name: "orders-api-0 상세" })).toBeTruthy();
    expect(screen.getByTestId("resources-location").textContent)
      .toContain("detail=Pod%2Fshop%2Forders-api-0");
    await user.keyboard("k");
    expect(await screen.findByRole("dialog", { name: "checkout-api-0 상세" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "상세 닫기" }));
    const restoredTable = await screen.findByRole("table", { name: "리소스 목록" });
    const restoredCheckout = within(restoredTable).getByRole("button", {
      name: "checkout-api-0 상세 열기",
    });
    await waitFor(() => expect(document.activeElement).toBe(restoredCheckout));
    await user.keyboard("d");
    expect(await screen.findByRole("dialog", { name: "checkout-api-0 상세" }, { timeout: 5_000 }))
      .toBeTruthy();
  }, 30_000);

  it("cycles API-discovered resource types with [ and ] while focus is outside an editor", async () => {
    renderResources(resourcesPort(), "/resources?clusters=cluster-1&resources.types=pod");
    await screen.findByRole("table", { name: "리소스 목록" }, { timeout: 5_000 });

    fireEvent.keyDown(document, { key: "]" });
    await waitFor(() => expect(screen.getByTestId("resources-location").textContent)
      .toContain("clusters=cluster-1&resources.types=node"));
    fireEvent.keyDown(document, { key: "[" });
    await waitFor(() => expect(screen.getByTestId("resources-location").textContent)
      .toContain("clusters=cluster-1&resources.types=pod"));
  }, 15_000);

  it("does not run collection shortcuts while the editable global filter owns focus", async () => {
    const user = userEvent.setup();
    renderResources(resourcesPort(), "/resources?clusters=cluster-1&resources.types=pod");
    await screen.findByRole("table", { name: "리소스 목록" }, { timeout: 5_000 });
    const globalFilter = document.createElement("input");
    globalFilter.setAttribute("aria-label", "전역 필터 검색");
    globalFilter.setAttribute("data-slot", "unified-filter-input");
    globalFilter.setAttribute("role", "combobox");
    document.body.append(globalFilter);

    await user.click(globalFilter);
    await user.keyboard("jGd");
    fireEvent.keyDown(globalFilter, { key: "[" });
    fireEvent.keyDown(globalFilter, { key: "]" });
    expect(globalFilter.value).toBe("jGd");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("resources-location").textContent)
      .toContain("clusters=cluster-1&resources.types=pod");
    expect(screen.getByTestId("resources-location").textContent)
      .not.toContain("resources.types=node");
    expect(matchedRoutes).not.toHaveBeenCalled();
  }, 15_000);

  it("keeps global g chords available while reserving gg for the first resource row", async () => {
    const user = userEvent.setup();
    renderResources(resourcesPort(), "/resources?clusters=cluster-1&resources.types=pod");
    const table = await screen.findByRole("table", { name: "리소스 목록" });
    const checkout = within(table).getByRole("button", { name: /checkout-api-0/u });

    await user.keyboard("gh");
    expect(matchedRoutes).toHaveBeenCalledExactlyOnceWith("route:home");

    document.body.tabIndex = -1;
    document.body.focus();
    await user.keyboard("gg");
    await waitFor(() => expect(document.activeElement).toBe(checkout));
    expect(matchedRoutes).toHaveBeenCalledTimes(1);
  }, 15_000);

  it("opens exact pod logs with l from the focused row", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    const open = vi.fn().mockReturnValue(close);
    renderWithLogStream({ open });
    const table = await screen.findByRole("table", { name: "리소스 목록" });
    const checkout = within(table).getByRole("button", { name: /checkout-api-0/u });

    checkout.focus();
    await user.keyboard("l");
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "pod",
        clusterId: "cluster-1",
        namespace: "shop",
        name: "checkout-api-0",
      }),
      expect.any(Object),
    );
  }, 15_000);

  it("opens the exact resource stream with l inside full detail", async () => {
    const user = userEvent.setup();
    const open = vi.fn().mockReturnValue(vi.fn());
    renderWithLogStream(
      { open },
      "/resources?clusters=cluster-1&resources.types=pod&detail=Pod%2Fshop%2Fcheckout-api-0",
    );
    expect(await screen.findByRole("dialog", { name: "checkout-api-0 상세" })).toBeTruthy();
    await user.keyboard("l");
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({ type: "pod", name: "checkout-api-0" }),
      expect.any(Object),
    );
  }, 15_000);
});

function resetDocumentTestClock() {
  vi.useRealTimers();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
}

function renderWithLogStream(
  logStreamPort: LogStreamPort,
  initialEntry = "/resources?clusters=cluster-1&resources.types=pod",
) {
  return renderResources(
    resourcesPort(),
    initialEntry,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    logStreamPort,
  );
}

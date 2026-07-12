// @vitest-environment jsdom

import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResourcesPortFailure } from "../../features/resources/resourcesContract";
import {
  deferred,
  POD_DETAIL,
  renderResources,
  resourcesPort,
} from "./ResourcesPage.testSupport";

beforeEach(resetDocumentTestClock);

afterEach(() => {
  cleanup();
  resetDocumentTestClock();
});

describe("ResourcesPage URL-backed detail", () => {
  it("keeps detail loading inside the sheet without nesting a page frame", async () => {
    const detail = deferred<typeof POD_DETAIL>();
    const port = resourcesPort({
      loadResourceDetail: vi.fn().mockReturnValue(detail.promise),
    });
    renderResources(
      port,
      "/product/resources/pod?cluster=cluster-1&resource=shop%2Fcheckout-api-0&kind=Pod",
    );

    const dialog = await screen.findByRole("dialog", { name: "checkout-api-0 상세" });
    expect(dialog.querySelector('[data-slot="resource-detail-loading"]')).toBeTruthy();
    expect(dialog.querySelector('[data-slot="product-page-frame"]')).toBeNull();

    await waitFor(
      () => expect(port.loadResourceDetail).toHaveBeenCalledOnce(),
      { timeout: 5_000 },
    );
    detail.resolve(POD_DETAIL);
    expect(await within(dialog).findByText("Running", {}, { timeout: 5_000 })).toBeTruthy();
  }, 15_000);

  it("resolves a direct same-route detail deep link from canonical identity", async () => {
    const list = deferred<Awaited<ReturnType<ReturnType<typeof resourcesPort>["listResources"]>>>();
    const port = resourcesPort({ listResources: vi.fn().mockReturnValue(list.promise) });
    renderResources(
      port,
      "/product/resources/pod?cluster=cluster-1&resource=shop%2Fcheckout-api-0&kind=Pod",
    );

    const dialog = await screen.findByRole("dialog", { name: "checkout-api-0 상세" });
    await waitFor(() => expect(dialog.textContent).toContain("Running"));
    expect(port.loadResourceDetail).toHaveBeenCalledWith(
      "cluster-1",
      {
        resourceType: "pod",
        kind: "Pod",
        namespace: "shop",
        name: "checkout-api-0",
      },
      expect.any(AbortSignal),
    );
    expect(screen.getByTestId("resources-location").textContent)
      .toContain("resource=shop%2Fcheckout-api-0");
  });

  it("keeps the list and renders a scoped not-found detail state", async () => {
    const port = resourcesPort({
      loadResourceDetail: vi.fn().mockRejectedValue(new ResourcesPortFailure("not-found")),
    });
    renderResources(
      port,
      "/product/resources/pod?cluster=cluster-1&resource=shop%2Fmissing&kind=Pod",
    );

    expect(await screen.findByText("checkout-api-0", {}, { timeout: 5_000 })).toBeTruthy();
    const dialog = await screen.findByRole("dialog", { name: "missing 상세" });
    expect(dialog.textContent).toContain("리소스를 찾을 수 없습니다");
    expect(screen.getByRole("button", { name: "상세 닫기" })).toBeTruthy();
  }, 15_000);

  it("closes the detail in place, removes its URL identity, and restores row focus", async () => {
    const user = userEvent.setup();
    const port = resourcesPort({ loadResourceDetail: vi.fn().mockResolvedValue(POD_DETAIL) });
    renderResources(port, "/product/resources/pod?cluster=cluster-1");

    const row = await screen.findByRole("button", { name: /checkout-api-0/u }, { timeout: 5_000 });
    await user.click(row);
    expect(await screen.findByRole("dialog", { name: "checkout-api-0 상세" }, { timeout: 5_000 }))
      .toBeTruthy();
    expect(screen.getByTestId("resources-location").textContent).toContain("resource=");

    await user.click(screen.getByRole("button", { name: "상세 닫기" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("resources-location").textContent).not.toContain("resource=");
    await waitFor(() => expect(document.activeElement).toBe(row));
  }, 15_000);
});

function resetDocumentTestClock() {
  vi.useRealTimers();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
}

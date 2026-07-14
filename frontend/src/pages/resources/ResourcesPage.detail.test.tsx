// @vitest-environment jsdom

import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ResourcesPortFailure,
} from "../../features/resources/resourcesContract";
import {
  deferred,
  POD_DETAIL,
  renderResources,
  resourcesPort,
} from "./ResourcesPage.testSupport";
import { encodeResourceTarget } from "./resourcesUrlState";

beforeEach(resetDocumentTestClock);

afterEach(() => {
  cleanup();
  resetDocumentTestClock();
});

describe("ResourcesPage URL-backed detail", () => {
  it("keeps detail loading inside the full workspace without nesting a page frame", async () => {
    const detail = deferred<typeof POD_DETAIL>();
    const port = resourcesPort({
      loadResourceDetail: vi.fn().mockReturnValue(detail.promise),
    });
    renderResources(
      port,
      "/resources?clusters=cluster-1&resources.types=pod" +
      "&resource=shop%2Fcheckout-api-0&resourceKind=Pod",
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
      "/resources?clusters=cluster-1&resources.types=pod" +
      "&resource=shop%2Fcheckout-api-0&resourceKind=Pod",
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
      .toContain("detail=Pod%2Fshop%2Fcheckout-api-0");
  });

  it("shows the two-state workspace tabs and read-only context without a log tab", async () => {
    renderResources(
      resourcesPort(),
      "/resources?clusters=cluster-1&resources.types=pod" +
        "&labels=team%3Dcheckout&detail=Pod%2Fshop%2Fcheckout-api-0",
    );

    const dialog = await screen.findByRole("dialog", { name: "checkout-api-0 상세" });
    expect(screen.queryByRole("table", { name: "리소스 목록" })).toBeNull();
    expect(within(dialog).getByRole("tab", { name: "개요" })).toBeTruthy();
    expect(within(dialog).getByRole("tab", { name: "YAML" })).toBeTruthy();
    expect(within(dialog).getByRole("tab", { name: "메트릭" })).toBeTruthy();
    expect(within(dialog).queryByRole("tab", { name: /로그/u })).toBeNull();
    const context = within(dialog).getByLabelText("읽기 전용 필터 맥락");
    expect(context.textContent).toContain("team=checkout");
    expect(within(context).queryByRole("button")).toBeNull();
    const close = within(dialog).getByRole("button", { name: "상세 닫기" });
    expect(close.className).toContain("relative");
    expect(close.className).not.toContain("fixed");
  });

  it("traps focus and closes with Escape", async () => {
    const user = userEvent.setup();
    renderResources(
      resourcesPort(),
      "/resources?clusters=cluster-1&resources.types=pod&detail=Pod%2Fshop%2Fcheckout-api-0",
    );
    const dialog = await screen.findByRole("dialog", { name: "checkout-api-0 상세" });
    const close = within(dialog).getByRole("button", { name: "상세 닫기" });
    await waitFor(() => expect(document.activeElement).toBe(close));
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("resources-location").textContent).not.toContain("detail=");
  });

  it("migrates a cross-Cluster legacy target before showing its isolated failure", async () => {
    const target = encodeResourceTarget("kubernetes-ops", {
      resourceType: "pod",
      kind: "Pod",
      namespace: "ops",
      name: "restricted-agent",
    });
    const port = resourcesPort({
      loadResourceDetail: vi.fn().mockRejectedValue(new ResourcesPortFailure("forbidden")),
    });
    renderResources(
      port,
      "/resources?clusters=cluster-1&resources.types=pod" +
      `&resource=${encodeURIComponent(target.resource)}&resourceKind=Pod`,
    );

    const dialog = await screen.findByRole("dialog", { name: "restricted-agent 상세" });
    expect(screen.queryByRole("table", { name: "리소스 목록" })).toBeNull();
    expect(within(dialog).getByRole("heading", { name: "이 범위에 접근할 수 없습니다" }))
      .toBeTruthy();
    expect(port.loadResourceDetail).toHaveBeenCalledWith(
      "kubernetes-ops",
      expect.objectContaining({ name: "restricted-agent", resourceType: "pod" }),
      expect.any(AbortSignal),
    );
    expect(screen.getByTestId("resources-location").textContent)
      .toContain("clusters=kubernetes-ops&resources.types=pod&detail=Pod%2Fops%2Frestricted-agent");
  });

  it("replaces the list with a scoped not-found detail state", async () => {
    const port = resourcesPort({
      loadResourceDetail: vi.fn().mockRejectedValue(new ResourcesPortFailure("not-found")),
    });
    renderResources(
      port,
      "/resources?clusters=cluster-1&resources.types=pod" +
      "&resource=shop%2Fmissing&resourceKind=Pod",
    );

    const dialog = await screen.findByRole("dialog", { name: "missing 상세" });
    expect(screen.queryByRole("table", { name: "리소스 목록" })).toBeNull();
    expect(dialog.textContent).toContain("리소스를 찾을 수 없습니다");
    expect(screen.getByRole("button", { name: "상세 닫기" })).toBeTruthy();
  }, 15_000);

  it("closes the detail in place, removes its URL identity, and restores row focus", async () => {
    const user = userEvent.setup();
    const port = resourcesPort({ loadResourceDetail: vi.fn().mockResolvedValue(POD_DETAIL) });
    renderResources(port, "/resources?clusters=cluster-1&resources.types=pod");

    const table = await screen.findByRole("table", { name: "리소스 목록" });
    const row = within(table).getByRole("button", { name: /checkout-api-0/u });
    await user.click(row);
    expect(await screen.findByRole("dialog", { name: "checkout-api-0 상세" }, { timeout: 5_000 }))
      .toBeTruthy();
    expect(screen.getByTestId("resources-location").textContent).toContain("detail=");

    await user.click(screen.getByRole("button", { name: "상세 닫기" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("resources-location").textContent).not.toContain("detail=");
    const restoredTable = await screen.findByRole("table", { name: "리소스 목록" });
    const restoredRow = within(restoredTable).getByRole("button", {
      name: "checkout-api-0 상세 열기",
    });
    await waitFor(() => expect(document.activeElement).toBe(restoredRow));
  }, 15_000);

});

function resetDocumentTestClock() {
  vi.useRealTimers();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
}

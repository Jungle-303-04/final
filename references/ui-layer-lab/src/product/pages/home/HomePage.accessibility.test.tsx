// @vitest-environment jsdom

import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomePortFailure, type HomeNodeCollection, type HomePodCollection } from "../../features/home/homeContract";
import { deferred, homePort, NODES, PODS, renderHome } from "./HomePage.testSupport";

beforeEach(resetDocumentTestClock);

afterEach(() => {
  cleanup();
  resetDocumentTestClock();
});

describe("HomePage accessibility and bounded rendering", () => {
  it("exposes connection freshness once through a keyboard-accessible tooltip", async () => {
    renderHome(homePort());

    const connection = await screen.findByRole("button", {
      name: /연결됨.*마지막 관측/u,
    }, { timeout: 5_000 });
    connection.focus();

    await waitFor(() => {
      expect(document.querySelector("[data-slot='tooltip-content']")?.textContent)
        .toMatch(/마지막 관측/u);
    });
  }, 15_000);

  it("includes CPU and memory names in each Node metric's accessible text", async () => {
    renderHome(homePort());

    const node = await screen.findByRole("button", { name: /worker-a/u }, { timeout: 5_000 });
    expect(node.textContent).toContain("CPU 37.5%");
    expect(node.textContent).toContain("메모리 54%");
  }, 15_000);

  it("announces an in-flight Node section with aria-busy and status text", async () => {
    const nodes = deferred<HomeNodeCollection>();
    renderHome(homePort({ loadNodes: vi.fn().mockReturnValue(nodes.promise) }));

    const region = await screen.findByRole("region", { name: "Node와 Pod" }, { timeout: 5_000 });
    expect(region.getAttribute("aria-busy")).toBe("true");
    expect(within(region).getByRole("status").textContent).toMatch(/Node.*불러오는 중/u);
    await act(async () => nodes.resolve(NODES));
  }, 15_000);

  it("moves focus to the Pod heading as soon as the selected panel starts loading", async () => {
    const user = userEvent.setup();
    const pods = deferred<HomePodCollection>();
    renderHome(homePort({ loadNodePods: vi.fn().mockReturnValue(pods.promise) }));

    await user.click(await screen.findByRole("button", { name: /worker-b/u }, { timeout: 5_000 }));
    const heading = await screen.findByRole("heading", { name: "worker-b의 Pod" }, { timeout: 5_000 });
    try {
      await waitFor(() => expect(document.activeElement).toBe(heading));
    } finally {
      await act(async () => pods.resolve(PODS));
    }
  }, 15_000);

  it("keeps the selected Pod heading focused when its request fails", async () => {
    const user = userEvent.setup();
    renderHome(homePort({
      loadNodePods: vi.fn().mockRejectedValue(new HomePortFailure("offline")),
    }));

    await user.click(await screen.findByRole("button", { name: /worker-b/u }, { timeout: 5_000 }));
    const heading = await screen.findByRole("heading", { name: "worker-b의 Pod" }, { timeout: 5_000 });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  }, 15_000);

  it("declares a bounded rendering strategy for a large Node collection", async () => {
    const largeNodes = Array.from({ length: 24 }, (_, index) => ({
      ...NODES.nodes[0],
      id: `node:cluster-1/worker-${index}`,
      name: `worker-${index}`,
    }));
    renderHome(homePort({
      loadNodes: vi.fn().mockResolvedValue({ ...NODES, nodes: largeNodes }),
    }));

    const list = await screen.findByRole("list", { name: "Node 목록" }, { timeout: 5_000 });
    expect(["content-visibility", "virtualized"]).toContain(
      list.getAttribute("data-render-strategy"),
    );
  }, 15_000);
});

function resetDocumentTestClock() {
  vi.useRealTimers();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
}

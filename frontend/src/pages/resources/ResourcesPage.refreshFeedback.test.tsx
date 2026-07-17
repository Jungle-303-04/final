// @vitest-environment jsdom

import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomePortFailure } from "../../features/home/homeContract";
import {
  CLUSTERS,
  renderResources,
  resourcesClusterPort,
  resourcesPort,
  setVisibility,
} from "./ResourcesPage.testSupport";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Reflect.deleteProperty(document, "visibilityState");
});

describe("ResourcesPage refresh feedback", () => {
  it("surfaces a cluster-choice background failure while preserving the last valid frame", async () => {
    const clusterPort = resourcesClusterPort({
      listClusterChoices: vi
        .fn()
        .mockResolvedValueOnce(CLUSTERS)
        .mockRejectedValueOnce(new HomePortFailure("offline")),
    });
    renderResources(
      resourcesPort(),
      "/resources?clusters=cluster-1&resources.types=pod",
      clusterPort,
    );
    expect(
      await screen.findByText("checkout-api-0", {}, { timeout: 5_000 }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "새로 고침" }));

    expect(
      await screen.findByText(
        "클러스터 목록을 갱신하지 못했습니다",
        {},
        { timeout: 5_000 },
      ),
    ).toBeTruthy();
    expect(screen.getByText("checkout-api-0")).toBeTruthy();
  });

  it("shows catalog observation freshness instead of implying that polling made stale data current", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T10:05:00Z"));
    setVisibility("visible");
    renderResources(
      resourcesPort(),
      "/resources?clusters=cluster-1&resources.types=pod",
    );
    await flushPromises();

    expect(screen.getByText("스냅샷 지연")).toBeTruthy();
    expect(screen.getByText(/5분 전 관측/u)).toBeTruthy();
  });

  it("keeps live and fallback freshness controls on one reserved row", async () => {
    renderResources(
      resourcesPort(),
      "/resources?clusters=cluster-1&resources.types=pod",
    );
    expect(
      await screen.findByText("checkout-api-0", {}, { timeout: 5_000 }),
    ).toBeTruthy();

    const row = document.querySelector('[data-slot="resources-status-row"]');
    expect(row).toBeTruthy();
    expect(row?.className).toContain("min-h-8");
    expect(row?.className).toContain("flex-nowrap");
    expect(row?.className).not.toContain("flex-wrap");
  });
});

async function flushPromises() {
  await act(async () => {
    for (let index = 0; index < 12; index += 1) await Promise.resolve();
  });
}

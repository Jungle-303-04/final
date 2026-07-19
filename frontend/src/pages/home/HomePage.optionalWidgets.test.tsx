// @vitest-environment jsdom

import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  homeBoardPorts,
  homePort,
  renderHome,
} from "./HomePage.testSupport";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("HomePage optional widgets", () => {
  it("binds W5-W8 to the complete unfiltered fleet scope", async () => {
    window.localStorage.setItem("opsia:home-board:test-workspace:test-user:v2", JSON.stringify({
      collapsed: [],
      order: ["W2", "W3", "W4", "W5", "W6", "W7", "W8"],
      visible: ["W2", "W3", "W4", "W5", "W6", "W7", "W8"],
    }));
    const ports = homeBoardPorts();
    renderHome(homePort(), ["/"], vi.fn(), "ko", ports);

    expect(await screen.findByRole("heading", { name: "네임스페이스 파드 분포" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "장애·주의 리소스" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "비용" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "최근 변경" })).toBeTruthy();
    await waitFor(() => {
      expect(ports.inventory).toHaveBeenCalledWith(
        "cluster-1",
        [],
        expect.any(AbortSignal),
      );
      expect(ports.inventory).toHaveBeenCalledWith(
        "kubernetes-ops",
        [],
        expect.any(AbortSignal),
      );
      expect(ports.resources.listResourcePage).toHaveBeenCalledWith(
        expect.objectContaining({
          common: expect.objectContaining({
            clusters: ["cluster-1", "kubernetes-ops"],
          }),
        }),
        { limit: 5 },
        expect.any(AbortSignal),
      );
      expect(ports.cost.getOverview).toHaveBeenCalledWith({
        clusterIds: ["cluster-1", "kubernetes-ops"],
        namespaces: [],
        timeRange: "24h",
      }, expect.any(AbortSignal));
      expect(ports.timeline.readTimeline).toHaveBeenCalledWith(
        expect.objectContaining({
          scopes: [
            expect.objectContaining({ clusterId: "cluster-1" }),
            expect.objectContaining({ clusterId: "kubernetes-ops" }),
          ],
        }),
        expect.any(AbortSignal),
      );
    });
  });

  it("keeps equal namespace names cluster-qualified for W2, W3, and W7", async () => {
    window.localStorage.setItem("opsia:home-board:test-workspace:test-user:v2", JSON.stringify({
      collapsed: [],
      order: ["W2", "W3", "W7"],
      visible: ["W2", "W3", "W7"],
    }));
    const ports = homeBoardPorts();
    renderHome(
      homePort(),
      ["/?namespaces=cluster-1%2Fshop,kubernetes-ops%2Fshop"],
      vi.fn(),
      "ko",
      ports,
    );

    await waitFor(() => {
      expect(ports.issues.listIssues).toHaveBeenCalledWith(
        "cluster-1",
        3,
        expect.any(AbortSignal),
        { categories: [], namespaces: ["cluster-1/shop"], severities: [] },
      );
      expect(ports.issues.listIssues).toHaveBeenCalledWith(
        "kubernetes-ops",
        3,
        expect.any(AbortSignal),
        { categories: [], namespaces: ["kubernetes-ops/shop"], severities: [] },
      );
      expect(ports.gitops.listSyncTargets).toHaveBeenCalledWith(
        expect.any(AbortSignal),
        {
          applications: [],
          clusters: ["cluster-1", "kubernetes-ops"],
          namespaces: ["cluster-1/shop", "kubernetes-ops/shop"],
        },
      );
      expect(ports.cost.getOverview).toHaveBeenCalledWith({
        clusterIds: ["cluster-1", "kubernetes-ops"],
        namespaces: ["cluster-1/shop", "kubernetes-ops/shop"],
        timeRange: "24h",
      }, expect.any(AbortSignal));
      expect(ports.activity.loadOverview).toHaveBeenCalledWith(
        expect.objectContaining({
          clusterIds: ["cluster-1", "kubernetes-ops"],
          namespaces: ["shop"],
        }),
        expect.any(AbortSignal),
      );
    });
    expect(ports.inventory).not.toHaveBeenCalled();
  });

  it("keeps successful namespace totals and marks a partial fleet fan-out", async () => {
    window.localStorage.setItem("opsia:home-board:test-workspace:test-user:v2", JSON.stringify({
      collapsed: [],
      order: ["W5"],
      visible: ["W5"],
    }));
    const inventory = vi.fn().mockImplementation(async (clusterId: string) => {
      if (clusterId === "kubernetes-ops") throw new Error("offline");
      return {
        cluster_id: clusterId,
        latest_snapshot: null,
        counts: [],
        counts_evidence: {
          completeness: "observed",
          observed_at: "2026-07-19T01:00:00Z",
          namespace_scope: [],
          reason_codes: [],
          forbidden: [],
        },
        namespaces: [{
          namespace: "shop",
          total: 12,
          counts: [{ resource_type: "pod", health: "healthy", count: 12 }],
        }],
      };
    });
    renderHome(
      homePort(),
      ["/"],
      vi.fn(),
      "ko",
      homeBoardPorts({ inventory }),
    );

    const heading = await screen.findByRole("heading", { name: "네임스페이스 파드 분포" });
    const widget = heading.closest<HTMLElement>("[data-slot='widget-frame']")!;
    expect(await within(widget).findByText("shop")).toBeTruthy();
    expect(within(widget).getByText("일부 데이터")).toBeTruthy();
    const namespaceLink = within(widget).getByRole("link", { name: "shop · 12 · 100%" });
    const namespaceHref = new URL(namespaceLink.getAttribute("href")!, "https://product.test");
    expect(namespaceHref.searchParams.get("clusters")).toBe("cluster-1");
    expect(namespaceHref.searchParams.get("namespaces")).toBe("cluster-1/shop");
    expect(namespaceHref.searchParams.get("namespaces")).not.toContain("kubernetes-ops/shop");
    expect(inventory).toHaveBeenCalledTimes(2);
  });

  it("renders W5 by default and uses the inventory namespace projection", async () => {
    const inventory = vi.fn().mockResolvedValue({
      cluster_id: "cluster-1",
      latest_snapshot: null,
      counts: [],
      counts_evidence: {
        completeness: "observed",
        observed_at: "2026-07-19T01:00:00Z",
        namespace_scope: [],
        reason_codes: [],
        forbidden: [],
      },
      namespaces: [{
        namespace: "shop",
        total: 12,
        counts: [{ resource_type: "pod", health: "healthy", count: 12 }],
      }],
    });
    renderHome(
      homePort(),
      ["/?clusters=cluster-1&namespaces=cluster-1%2Fshop"],
      vi.fn(),
      "ko",
      homeBoardPorts({ inventory }),
    );

    expect(await screen.findByRole("img", { name: "Namespace별 Pod 수" })).toBeTruthy();
    const namespaceLink = screen.getByRole("link", { name: "shop · 12 · 100%" });
    const namespaceHref = new URL(namespaceLink.getAttribute("href")!, "https://product.test");
    expect(namespaceHref.pathname).toBe("/resources");
    expect(namespaceHref.searchParams.get("clusters")).toBe("cluster-1");
    expect(namespaceHref.searchParams.get("namespaces")).toBe("cluster-1/shop");
    expect(inventory).toHaveBeenCalledWith("cluster-1", ["shop"], expect.any(AbortSignal));
  });
});

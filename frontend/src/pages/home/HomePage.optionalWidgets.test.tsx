// @vitest-environment jsdom

import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  TimelineEvent,
  TimelineQuery,
} from "../../features/timeline/timelineContract";
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

  it("prioritizes critical before warning resources and keeps each D3 detail filter truthful", async () => {
    const listResourcePage = vi.fn().mockResolvedValue({
      items: [{
        resource: {
          id: "resource-2",
          identityStability: "uid",
          inventoryKey: "inventory-2",
          uid: "uid-2",
          clusterId: "cluster-1",
          resourceType: "pod",
          apiVersion: "v1",
          kind: "Pod",
          namespace: "shop",
          name: "checkout-api-1",
          status: "Pending",
          health: "warning",
          healthStatus: "Pending",
          facts: { type: "generic" },
          observedAt: "2026-07-19T01:01:00Z",
          firstSeenAt: null,
          lastSeenAt: "2026-07-19T01:01:00Z",
          deletedAt: null,
        },
        cluster: { clusterId: "cluster-1", name: "prod", provider: "eks" },
        applicationIds: ["checkout"],
        applicationBindingCompleteness: "exact",
      }, {
        resource: {
          id: "resource-1",
          identityStability: "uid",
          inventoryKey: "inventory-1",
          uid: "uid-1",
          clusterId: "cluster-1",
          resourceType: "pod",
          apiVersion: "v1",
          kind: "Pod",
          namespace: "shop",
          name: "checkout-api-0",
          status: "CrashLoopBackOff",
          health: "critical",
          healthStatus: "CrashLoopBackOff",
          facts: { type: "generic" },
          observedAt: "2026-07-19T01:00:00Z",
          firstSeenAt: null,
          lastSeenAt: "2026-07-19T01:00:00Z",
          deletedAt: null,
        },
        cluster: { clusterId: "cluster-1", name: "prod", provider: "eks" },
        applicationIds: ["checkout"],
        applicationBindingCompleteness: "exact",
      }],
      nextCursor: null,
      hasMore: false,
      counts: {
        filteredCount: 2,
        unfilteredCount: 10,
        filteredCountCompleteness: "exact",
        unfilteredCountCompleteness: "exact",
      },
      snapshot: {
        snapshotRevision: 1,
        authorizationRevision: "auth-1",
        filterFingerprint: "critical-1",
        observedAt: "2026-07-19T01:00:00Z",
        stale: false,
        partialReasonCodes: [],
      },
      excludedCount: 0,
      dataQualityWarnings: [],
    });
    renderHome(
      homePort(),
      ["/?clusters=cluster-1&namespaces=cluster-1%2Fshop"],
      vi.fn(),
      "ko",
      homeBoardPorts({ resources: { listResourcePage } }),
    );

    const row = await screen.findByRole("link", { name: "Pod checkout-api-0" });
    const href = new URL(row.getAttribute("href")!, "https://product.test");
    expect(href.searchParams.get("resources.health")).toBe("critical");
    expect(href.searchParams.get("detail")).toBe("Pod/shop/checkout-api-0");
    expect(href.searchParams.get("namespaces")).toBe("cluster-1/shop");
    const warningRow = screen.getByRole("link", { name: "Pod checkout-api-1" });
    const warningHref = new URL(warningRow.getAttribute("href")!, "https://product.test");
    expect(warningHref.searchParams.get("resources.health")).toBe("warning");
    expect(warningRow.querySelector(".bg-status-warning")).toBeTruthy();
    const attentionList = screen.getByRole("list", { name: "장애·주의 리소스" });
    expect(within(attentionList).getAllByRole("link").map((link) => link.textContent))
      .toEqual(expect.arrayContaining([expect.stringContaining("checkout-api-0"), expect.stringContaining("checkout-api-1")]));
    expect(within(attentionList).getAllByRole("link")[0]?.textContent).toContain("checkout-api-0");
    const attentionWidget = screen.getByRole("region", { name: "장애·주의 리소스" });
    const viewAll = new URL(
      within(attentionWidget).getByRole("link", { name: "전체 보기" }).getAttribute("href")!,
      "https://product.test",
    );
    expect(viewAll.searchParams.get("resources.health")).toBe("critical,warning");
    expect(listResourcePage).toHaveBeenCalledTimes(1);
    expect(listResourcePage).toHaveBeenCalledWith(
      expect.objectContaining({
        common: expect.objectContaining({ clusters: ["cluster-1"] }),
        resources: expect.objectContaining({
          health: ["critical", "warning"],
          includeDeleted: false,
        }),
      }),
      { limit: 5 },
      expect.any(AbortSignal),
    );
  });

  it("labels W7 as a monthly projection and discloses the bounded 7d observation behind a 30d selection", async () => {
    const ports = homeBoardPorts();
    const getOverview = vi.mocked(ports.cost.getOverview);
    renderHome(
      homePort(),
      ["/?clusters=cluster-1&namespaces=cluster-1%2Fshop&home.period=30d"],
      vi.fn(),
      "ko",
      ports,
    );

    const bars = await screen.findByRole("img", { name: "비용률 추세" });
    expect(bars.getAttribute("data-state")).toBe("measured");
    expect(bars.querySelector(":scope > style")?.textContent).toContain(
      "--color-value: var(--color-status-warning)",
    );
    expect(screen.getByText("월간 예상 비용")).toBeTruthy();
    expect(screen.getByText("비용률 추세 · 30일 선택 · 최근 7일 관측")).toBeTruthy();
    expect(bars.closest("[data-slot='mini-bars']")?.children).toHaveLength(1);
    expect(getOverview).toHaveBeenCalledWith({
      clusterIds: ["cluster-1"],
      namespaces: ["cluster-1/shop"],
      timeRange: "7d",
    }, expect.any(AbortSignal));
  });

  it("renders default-visible W8 as the existing Timeline latest-five mini view", async () => {
    const ports = homeBoardPorts();
    const originalRead = ports.timeline.readTimeline;
    const events = Array.from({ length: 6 }, (_, index) =>
      timelineEvent(`event-${index}`, index)
    );
    const readTimeline = vi.fn(async (query: TimelineQuery, signal?: AbortSignal) => ({
      ...await originalRead(query, signal),
      events,
    }));
    ports.timeline = { ...ports.timeline, readTimeline };
    renderHome(homePort(), ["/?clusters=cluster-1"], vi.fn(), "ko", ports);

    const list = await screen.findByRole("list", { name: "타임라인 이벤트" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    expect(within(list).queryByText("Timeline event 0")).toBeNull();
    expect(within(list).getByRole("link", { name: "Timeline event 5" })
      .getAttribute("href")).toContain("event=inventory%3Aevent-5");
    expect(readTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        control: expect.objectContaining({ view: "list" }),
        filters: expect.objectContaining({ sort: "recent" }),
      }),
      expect.any(AbortSignal),
    );
  });
});

function timelineEvent(id: string, minute: number): TimelineEvent {
  return {
    id,
    source: "inventory",
    sourceKey: `inventory:${id}`,
    nativeId: id,
    activity: "change",
    occurredAt: new Date(Date.UTC(2026, 6, 19, 1, minute)).toISOString(),
    scope: {
      workspaceId: "workspace-main",
      clusterId: "cluster-1",
      namespaces: [],
      freshness: "live",
    },
    subject: {
      kind: "resource",
      resource: {
        apiGroup: "",
        version: "v1",
        kind: "Pod",
        namespace: "shop",
        name: `checkout-${minute}`,
        uid: `uid-${minute}`,
      },
    },
    resource: {
      apiGroup: "",
      version: "v1",
      kind: "Pod",
      namespace: "shop",
      name: `checkout-${minute}`,
      uid: `uid-${minute}`,
    },
    type: "update",
    severity: minute === 5 ? "warning" : "info",
    title: `Timeline event ${minute}`,
    owner: null,
    metadata: {},
  };
}

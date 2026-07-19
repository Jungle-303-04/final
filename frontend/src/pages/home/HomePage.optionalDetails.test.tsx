// @vitest-environment jsdom

import { cleanup, screen, within } from "@testing-library/react";
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

describe("HomePage optional resource, cost, and timeline widgets", () => {
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

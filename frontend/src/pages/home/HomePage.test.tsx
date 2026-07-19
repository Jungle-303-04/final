// @vitest-environment jsdom

import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HomePortFailure } from "../../features/home/homeContract";
import type {
  ResourcesFilterCompleteness,
  ResourcesFilterResourcePage,
} from "../../features/resources/resourcesFilterContract";
import {
  CLUSTERS,
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

describe("HomePage three-layer board", () => {
  it("renders only the fixed summary, cluster section, and W2-W4 default board", async () => {
    renderHome(homePort());

    expect(await screen.findByRole("heading", { name: "조회 가능한 클러스터" }))
      .toBeTruthy();
    expectFleetMetrics(screen.getByRole("group", { name: "클러스터 리소스 탐색" }), {
      clusters: "1",
      nodes: "2",
      pods: "18",
    });
    expect(screen.getByRole("heading", { name: "클러스터별 리소스 탐색" }))
      .toBeTruthy();
    expect(await screen.findByRole("heading", { name: "이슈" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "동기화 상태" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "활동" })).toBeTruthy();

    expect(screen.queryByRole("region", { name: "클러스터 상태" })).toBeNull();
    expect(screen.queryByRole("region", { name: "클러스터 인사이트" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Node와 Pod" })).toBeNull();
  });

  it("feeds the fixed OutOfSync summary from the shared GitOps adapter", async () => {
    renderHome(homePort());

    const summary = await screen.findByRole("group", {
      name: "클러스터 리소스 탐색",
    });
    await waitFor(() => {
      const label = within(summary).getByText("동기화 필요");
      expect(label.parentElement?.textContent).toContain("1");
    });
  });

  it("renders the board for the unfiltered fleet without choosing a first cluster", async () => {
    const ports = homeBoardPorts();
    renderHome(homePort(), ["/"], vi.fn(), "ko", ports);

    expect(await screen.findByRole("heading", { name: "이슈" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "동기화 상태" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "활동" })).toBeTruthy();
    expectFleetMetrics(screen.getByRole("group", { name: "클러스터 리소스 탐색" }), {
      clusters: "2",
      nodes: "3",
      pods: "22",
    });
    await waitFor(() => {
      expect(ports.issues.listIssues).toHaveBeenCalledWith(
        null,
        3,
        expect.any(AbortSignal),
        { categories: [], namespaces: [], severities: [] },
      );
      expect(ports.gitops.listSyncTargets).toHaveBeenCalledWith(
        expect.any(AbortSignal),
        {
          applications: [],
          clusters: ["cluster-1", "kubernetes-ops"],
          namespaces: [],
        },
      );
      expect(ports.activity.loadOverview).toHaveBeenCalledWith(
        expect.objectContaining({
          applications: [],
          clusterIds: ["cluster-1", "kubernetes-ops"],
          namespaces: [],
        }),
        expect.any(AbortSignal),
      );
    });
    expect(ports.issues.listIssues).not.toHaveBeenCalledWith(
      "cluster-1",
      3,
      expect.any(AbortSignal),
      expect.anything(),
    );
  });

  it("uses the scoped resource total for the fixed critical summary even when W6 is hidden", async () => {
    const listResourcePage = vi.fn().mockResolvedValue(criticalResourcePage(17, "exact", 5));
    renderHome(
      homePort(),
      ["/?clusters=cluster-1&namespaces=cluster-1%2Fshop&applications=checkout"],
      vi.fn(),
      "ko",
      homeBoardPorts({ resources: { listResourcePage } }),
    );

    const summary = await screen.findByRole("group", {
      name: "클러스터 리소스 탐색",
    });
    const critical = await within(summary).findByRole("link", { name: "임계 17" });
    const href = new URL(critical.getAttribute("href")!, "https://product.test");
    expect(href.pathname).toBe("/resources");
    expect(href.searchParams.get("resources.health")).toBe("critical");
    expect(href.searchParams.get("clusters")).toBe("cluster-1");
    expect(href.searchParams.get("namespaces")).toBe("cluster-1/shop");
    expect(href.searchParams.get("applications")).toBe("checkout");
    expect(screen.queryByRole("heading", { name: "임계 · 리소스 종류" })).toBeNull();
    expect(listResourcePage).toHaveBeenCalledTimes(1);
    expect(listResourcePage).toHaveBeenCalledWith(
      expect.objectContaining({
        common: expect.objectContaining({
          applications: ["checkout"],
          clusters: ["cluster-1"],
          namespaces: [{ clusterId: "cluster-1", namespace: "shop" }],
        }),
        resources: expect.objectContaining({ health: ["critical"], includeDeleted: false }),
      }),
      { limit: 5 },
      expect.any(AbortSignal),
    );
  });

  it("does not present a partial resource total as an exact critical count", async () => {
    const user = userEvent.setup();
    const listResourcePage = vi.fn().mockResolvedValue(criticalResourcePage(17, "partial", 5));
    renderHome(
      homePort(),
      ["/?clusters=cluster-1"],
      vi.fn(),
      "ko",
      homeBoardPorts({ resources: { listResourcePage } }),
    );

    const summary = await screen.findByRole("group", {
      name: "클러스터 리소스 탐색",
    });
    await waitFor(() => expect(listResourcePage).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "수정" }));
    const catalog = screen.getByRole("heading", { name: "리소스 종류" }).parentElement!;
    await user.click(within(catalog).getByRole("button", { name: "임계 · 리소스 종류" }));
    const widgetHeading = await screen.findByRole("heading", { name: "임계 · 리소스 종류" });
    const widget = widgetHeading.closest<HTMLElement>("[data-slot='widget-frame']")!;
    expect(await within(widget).findByText("일부 데이터")).toBeTruthy();
    expect(within(summary).getByRole("link", { name: "임계 —" })).toBeTruthy();
    expect(listResourcePage).toHaveBeenCalledTimes(1);
  });

  it("counts repositories through every application bound to one sync target", async () => {
    const ports = homeBoardPorts({
      gitops: {
        listApplications: vi.fn().mockResolvedValue([
          {
            id: "checkout",
            name: "checkout",
            repository: "team/checkout",
            branch: "main",
            clusterId: "cluster-1",
            manifestPath: "deploy",
          },
          {
            id: "inventory",
            name: "inventory",
            repository: "team/inventory",
            branch: "main",
            clusterId: "cluster-1",
            manifestPath: "deploy",
          },
        ]),
        listSyncTargets: vi.fn().mockResolvedValue([{
          id: "shared-target",
          applicationId: "checkout",
          applicationIds: ["checkout", "inventory", "checkout"],
          applicationName: "shared-target",
          clusterId: "cluster-1",
          namespace: "shop",
          environment: "production",
          syncStatus: "OutOfSync",
          revision: "abc123",
          observedAt: "2026-07-19T01:00:00Z",
        }]),
      },
    });
    renderHome(homePort(), ["/?clusters=cluster-1"], vi.fn(), "ko", ports);

    const sync = await screen.findByRole("region", { name: "동기화 상태" });
    await waitFor(() => {
      expect(within(sync).getByText("저장소·동기화").nextElementSibling?.textContent).toBe("2");
    });
  });

  it("scopes W2-W4 to supported URL dimensions and refuses unsupported application aggregates", async () => {
    const ports = homeBoardPorts();
    renderHome(
      homePort(),
      ["/?clusters=cluster-1&namespaces=cluster-1%2Fshop"],
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
      expect(ports.gitops.listSyncTargets).toHaveBeenCalledWith(
        expect.any(AbortSignal),
        {
          applications: [],
          clusters: ["cluster-1"],
          namespaces: ["cluster-1/shop"],
        },
      );
      expect(ports.activity.loadOverview).toHaveBeenCalledWith(
        expect.objectContaining({
          applications: [],
          clusterIds: ["cluster-1"],
          namespaces: ["shop"],
        }),
        expect.any(AbortSignal),
      );
    });

    cleanup();
    const unsupported = homeBoardPorts();
    renderHome(
      homePort(),
      ["/?clusters=cluster-1&applications=checkout"],
      vi.fn(),
      "ko",
      unsupported,
    );
    const issues = await screen.findByRole("region", { name: "이슈" });
    const activity = await screen.findByRole("region", { name: "활동" });
    expect(within(issues).getByRole("alert")).toBeTruthy();
    expect(within(activity).getByRole("alert")).toBeTruthy();
    expect(unsupported.issues.listIssues).not.toHaveBeenCalled();
    expect(unsupported.activity.loadOverview).not.toHaveBeenCalled();
  });

  it("keeps widget landmarks, labels, links, and editor controls semantic", async () => {
    const user = userEvent.setup();
    renderHome(homePort(), [
      "/?clusters=cluster-1&namespaces=cluster-1%2Fshop&applications=checkout",
    ]);

    const issues = await screen.findByRole("region", { name: "이슈" });
    const deepLink = within(issues).getByRole("link", { name: "이슈" });
    expect(deepLink.tagName).toBe("A");
    expect(deepLink.getAttribute("href")).toContain("clusters=cluster-1");
    const collapse = within(issues).getByRole("button", { name: /접기/u });
    expect(collapse.tagName).toBe("BUTTON");
    expect(collapse.getAttribute("aria-expanded")).toBe("true");
    await user.click(collapse);
    expect(collapse.getAttribute("aria-expanded")).toBe("false");

    const period = screen.getByRole("combobox", { name: "시간 범위" });
    expect(period.textContent).toContain("오늘");
    await user.click(screen.getByRole("button", { name: "수정" }));
    const catalog = screen.getByRole("heading", { name: "리소스 종류" }).parentElement!;
    const namespaceToggle = within(catalog).getByRole("button", {
      name: "Namespace별 Pod 수",
    });
    expect(namespaceToggle.tagName).toBe("BUTTON");
    expect(namespaceToggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("shares one URL period across W4 and preserves unrelated filters", async () => {
    const user = userEvent.setup();
    renderHome(homePort(), [
      "/?clusters=cluster-1&namespaces=cluster-1%2Fshop&applications=checkout",
    ]);

    await user.click(await screen.findByRole("combobox", { name: "시간 범위" }));
    await user.click(await screen.findByRole("option", { name: "30d" }));

    await waitFor(() => {
      const location = screen.getByTestId("home-location").textContent ?? "";
      const params = new URL(location, "https://product.test").searchParams;
      expect(params.get("home.period")).toBe("30d");
      expect(params.get("clusters")).toBe("cluster-1");
      expect(params.get("namespaces")).toBe("cluster-1/shop");
      expect(params.get("applications")).toBe("checkout");
    });
  });

  it("contains a source failure inside its widget and exposes a real retry", async () => {
    const loadOverview = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({
        fromMs: 0,
        toMs: 60_000,
        bucketMs: 60_000,
        buckets: [{
          fromMs: 0,
          toMs: 60_000,
          deployments: 0,
          alerts: 0,
          critical: 0,
        }],
      });
    const user = userEvent.setup();
    const ports = homeBoardPorts({ activity: { loadOverview } });
    renderHome(
      homePort(),
      ["/?clusters=cluster-1"],
      vi.fn(),
      "ko",
      ports,
    );

    const activity = await screen.findByRole("heading", { name: "활동" });
    const widget = activity.closest<HTMLElement>("[data-slot='widget-frame']")!;
    await waitFor(() => {
      expect(ports.issues.listIssues).toHaveBeenCalledTimes(1);
      expect(ports.gitops.listSyncTargets).toHaveBeenCalledTimes(1);
    });
    const activityCalls = loadOverview.mock.calls.length;
    const listIssues = vi.mocked(ports.issues.listIssues);
    const listSyncTargets = vi.mocked(ports.gitops.listSyncTargets);
    const issueCalls = listIssues.mock.calls.length;
    const gitopsCalls = listSyncTargets.mock.calls.length;
    expect(within(widget).getByRole("alert")).toBeTruthy();
    await user.click(await within(widget).findByRole("button", { name: "다시 시도" }));
    expect(await within(widget).findByRole("img", { name: "활동" })).toBeTruthy();
    expect(loadOverview.mock.calls.length - activityCalls).toBe(1);
    expect(listIssues.mock.calls.length - issueCalls).toBe(0);
    expect(listSyncTargets.mock.calls.length - gitopsCalls).toBe(0);
  });

  it("commits layout preferences only when editing completes", async () => {
    const user = userEvent.setup();
    renderHome(homePort());
    await screen.findByRole("heading", { name: "이슈" });

    await user.click(screen.getByRole("button", { name: "수정" }));
    const catalog = screen.getByRole("heading", { name: "리소스 종류" }).parentElement!;
    await user.click(within(catalog).getByRole("button", { name: "Namespace별 Pod 수" }));
    const issues = screen.getByRole("region", { name: "이슈" });
    await user.click(within(issues).getByRole("button", { name: /접기/u }));

    const key = "opsia:home-board:test-workspace:test-user:v1";
    expect(window.localStorage.getItem(key)).toBeNull();
    await user.click(screen.getByRole("button", { name: "변경 저장" }));
    await waitFor(() => expect(window.localStorage.getItem(key)).not.toBeNull());
    const committed = JSON.parse(window.localStorage.getItem(key)!);
    expect(committed.visible).toContain("W5");
    expect(committed.collapsed).toContain("W2");

    await user.click(screen.getByRole("button", { name: "수정" }));
    await user.click(within(catalog).getByRole("button", { name: "Namespace별 Pod 수" }));
    expect(JSON.parse(window.localStorage.getItem(key) ?? "{}").visible).toContain("W5");
  });

  it("keeps authorization failures global and never renders cached board content", async () => {
    renderHome(homePort({
      listClusterChoices: vi.fn().mockRejectedValue(new HomePortFailure("forbidden")),
    }));

    expect(await screen.findByRole("heading", { name: "이 범위에 접근할 수 없습니다" }))
      .toBeTruthy();
    expect(screen.queryByRole("heading", { name: "활동" })).toBeNull();
  });

  it("does not turn an unconfirmed empty cluster catalog into zero-valued widgets", async () => {
    renderHome(homePort({
      listClusterChoices: vi.fn().mockResolvedValue({
        ...CLUSTERS,
        clusters: [],
      }),
    }));

    expect(await screen.findByRole("heading", { name: "연결된 클러스터가 없습니다" }))
      .toBeTruthy();
    expect(screen.queryByRole("heading", { name: "활동" })).toBeNull();
  });
});

function expectFleetMetrics(
  summary: HTMLElement,
  expected: { clusters: string; nodes: string; pods: string },
): void {
  expect(within(summary).getByText("클러스터").nextElementSibling?.textContent)
    .toBe(expected.clusters);
  expect(within(summary).getByText("Node").nextElementSibling?.textContent)
    .toBe(expected.nodes);
  expect(within(summary).getByText("Pod").nextElementSibling?.textContent)
    .toBe(expected.pods);
}

function criticalResourcePage(
  filteredCount: number | null,
  filteredCountCompleteness: ResourcesFilterCompleteness,
  returned: number,
): ResourcesFilterResourcePage {
  return {
    items: Array.from({ length: returned }, (_, index) => ({
      resource: {
        id: `resource-${index}`,
        identityStability: "uid",
        inventoryKey: `inventory-${index}`,
        uid: `uid-${index}`,
        clusterId: "cluster-1",
        resourceType: "pod",
        apiVersion: "v1",
        kind: "Pod",
        namespace: "shop",
        name: `checkout-api-${index}`,
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
      applicationIds: [],
      applicationBindingCompleteness: "exact",
    })),
    nextCursor: returned < (filteredCount ?? returned) ? "next" : null,
    hasMore: returned < (filteredCount ?? returned),
    counts: {
      filteredCount,
      unfilteredCount: 50,
      filteredCountCompleteness,
      unfilteredCountCompleteness: "exact",
    },
    snapshot: {
      snapshotRevision: 1,
      authorizationRevision: "auth-1",
      filterFingerprint: "critical-1",
      observedAt: "2026-07-19T01:00:00Z",
      stale: false,
      partialReasonCodes: filteredCountCompleteness === "partial" ? ["scope_partial"] : [],
    },
    excludedCount: 0,
    dataQualityWarnings: [],
  };
}

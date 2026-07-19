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
  it("renders the fixed summary, cluster section, and W2-W8 default board", async () => {
    renderHome(homePort());

    expect(await screen.findByRole("heading", { name: "조회 가능한 클러스터" }))
      .toBeTruthy();
    await waitFor(() => {
      expectFleetMetrics(screen.getByRole("group", { name: "클러스터 리소스 탐색" }), {
        clusters: "1",
        nodes: "2/2",
        pods: "18",
      });
    });
    expect(screen.getByRole("link", { name: "cluster-1 리소스 열기" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "kubernetes-ops 리소스 열기" })).toBeNull();
    expect(await screen.findByRole("heading", { name: "이슈" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "저장소 동기화" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "활동 추이" })).toBeTruthy();

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
      const label = within(summary).getByText("OutOfSync");
      expect(label.parentElement?.textContent).toContain("1");
    });
  });

  it("keeps all five summary chips visible when GitOps and incident counts are zero", async () => {
    const zeroIncidentClusters = {
      ...CLUSTERS,
      clusters: CLUSTERS.clusters.map((cluster) => ({
        ...cluster,
        incidentCount: 0,
        openIncidentCount: 0,
      })),
    };
    const zeroIncidentPort = homePort();
    const loadFleetSummary = zeroIncidentPort.loadFleetSummary;
    if (!loadFleetSummary) throw new Error("fleet summary is required by the home contract");
    const fleet = await loadFleetSummary();
    vi.mocked(zeroIncidentPort.listClusterChoices).mockResolvedValue(zeroIncidentClusters);
    vi.mocked(loadFleetSummary).mockResolvedValue({
      ...fleet,
      clusters: fleet.clusters.map((cluster) => ({
        ...cluster,
        openIncidents: 0,
      })),
    });
    renderHome(
      zeroIncidentPort,
      ["/?clusters=cluster-1"],
      vi.fn(),
      "ko",
      homeBoardPorts({
        gitops: {
          listApplications: vi.fn().mockResolvedValue([]),
          listSyncTargets: vi.fn().mockResolvedValue([]),
        },
      }),
    );

    const summary = await screen.findByRole("group", {
      name: "클러스터 리소스 탐색",
    });
    await waitFor(() => {
      expectFleetMetrics(summary, { clusters: "1", nodes: "2/2", pods: "18" });
      expect(within(summary).getByText("OutOfSync").parentElement?.textContent).toContain("0");
      expect(within(summary).getByRole("link", { name: "장애 0" })).toBeTruthy();
    });
  });

  it("renders the board for the unfiltered fleet without choosing a first cluster", async () => {
    const ports = homeBoardPorts();
    renderHome(homePort(), ["/"], vi.fn(), "ko", ports);

    expect(await screen.findByRole("heading", { name: "이슈" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "저장소 동기화" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "활동 추이" })).toBeTruthy();
    await waitFor(() => {
      expectFleetMetrics(screen.getByRole("group", { name: "클러스터 리소스 탐색" }), {
        clusters: "2",
        nodes: "3/3",
        pods: "22",
      });
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

  it("uses namespace cluster identities for the fixed summary and cluster cards", async () => {
    renderHome(homePort(), ["/?namespaces=kubernetes-ops%2Fsystem"]);

    await waitFor(() => {
      expectFleetMetrics(screen.getByRole("group", { name: "클러스터 리소스 탐색" }), {
        clusters: "1",
        nodes: "1/1",
        pods: "4",
      });
    });
    expect(screen.getByRole("link", { name: "kubernetes-ops 리소스 열기" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "cluster-1 리소스 열기" })).toBeNull();
  });

  it("routes the incident-backed critical count to the same scoped issue surface", async () => {
    const listResourcePage = vi.fn().mockResolvedValue(criticalResourcePage(17, "partial", 5));
    renderHome(
      homePort(),
      ["/?clusters=cluster-1&namespaces=cluster-1%2Fshop"],
      vi.fn(),
      "ko",
      homeBoardPorts({ resources: { listResourcePage } }),
    );

    const summary = await screen.findByRole("group", {
      name: "클러스터 리소스 탐색",
    });
    await waitFor(() => expect(listResourcePage).toHaveBeenCalledTimes(1));
    const widgetHeading = await screen.findByRole("heading", { name: "장애·주의 리소스" });
    const widget = widgetHeading.closest<HTMLElement>("[data-slot='widget-frame']")!;
    expect(await within(widget).findByText("일부 데이터")).toBeTruthy();
    const critical = within(summary).getByRole("link", { name: "장애 1" });
    const href = new URL(critical.getAttribute("href")!, "https://product.test");
    expect(href.pathname).toBe("/issues");
    expect(href.searchParams.get("resources.health")).toBeNull();
    expect(href.searchParams.get("clusters")).toBe("cluster-1");
    expect(href.searchParams.get("namespaces")).toBe("cluster-1/shop");
    expect(listResourcePage).toHaveBeenCalledTimes(1);
  });

  it("aggregates sync state per repository and lets OutOfSync dominate", async () => {
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
          {
            id: "checkout-canary",
            name: "checkout-canary",
            repository: "team/checkout",
            branch: "canary",
            clusterId: "cluster-1",
            manifestPath: "deploy/canary",
          },
          {
            id: "payments",
            name: "payments",
            repository: "team/payments",
            branch: "main",
            clusterId: "cluster-1",
            manifestPath: "deploy",
          },
          {
            id: "other-cluster",
            name: "other-cluster",
            repository: "team/other-cluster",
            branch: "main",
            clusterId: "kubernetes-ops",
            manifestPath: "deploy",
          },
        ]),
        listSyncTargets: vi.fn().mockResolvedValue([
          {
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
          },
          {
            id: "checkout-canary",
            applicationId: "checkout-canary",
            applicationIds: [],
            applicationName: "checkout-canary",
            clusterId: "cluster-1",
            namespace: "shop",
            environment: "production",
            syncStatus: "Synced",
            revision: "def456",
            observedAt: "2026-07-19T01:01:00Z",
          },
        ]),
      },
    });
    renderHome(homePort(), ["/?clusters=cluster-1"], vi.fn(), "ko", ports);

    const sync = await screen.findByRole("region", { name: "저장소 동기화" });
    await waitFor(() => {
      const outOfSync = within(sync).getByText("OutOfSync");
      expect(outOfSync.querySelector("b")?.textContent).toBe("2");
      expect(outOfSync.textContent).toContain("67%");
      const synced = within(sync).getByText("Synced");
      expect(synced.querySelector("b")?.textContent).toBe("0");
      expect(synced.textContent).toContain("0%");
      expect(within(sync).getByRole("status").textContent)
        .toContain("일부 데이터 · 알 수 없음 1");
      expect(within(sync).queryByText("저장소")).toBeNull();
    });
  });

  it("scopes W2-W4 to URL dimensions and rejects application scope uniformly across W2-W8", async () => {
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
    for (const title of [
      "이슈",
      "저장소 동기화",
      "활동 추이",
      "네임스페이스 파드 분포",
      "장애·주의 리소스",
      "비용",
      "최근 변경",
    ]) {
      const widget = await screen.findByRole("region", { name: title });
      expect(await within(widget).findByRole("alert")).toBeTruthy();
    }
    expect(unsupported.issues.listIssues).not.toHaveBeenCalled();
    expect(unsupported.gitops.listApplications).not.toHaveBeenCalled();
    expect(unsupported.gitops.listSyncTargets).not.toHaveBeenCalled();
    expect(unsupported.activity.loadOverview).not.toHaveBeenCalled();
    expect(unsupported.inventory).not.toHaveBeenCalled();
    expect(unsupported.resources.listResourcePage).not.toHaveBeenCalled();
    expect(unsupported.cost.getOverview).not.toHaveBeenCalled();
    expect(unsupported.timeline.readCapabilities).not.toHaveBeenCalled();
    expect(unsupported.timeline.readTimeline).not.toHaveBeenCalled();
  });

  it("keeps widget landmarks, labels, links, and editor controls semantic", async () => {
    const user = userEvent.setup();
    renderHome(homePort(), [
      "/?clusters=cluster-1&namespaces=cluster-1%2Fshop",
    ]);

    const issues = await screen.findByRole("region", { name: "이슈" });
    const deepLink = within(issues).getByRole("link", { name: "전체 보기" });
    expect(deepLink.tagName).toBe("A");
    expect(deepLink.getAttribute("href")).toContain("clusters=cluster-1");
    const issueRow = await within(issues).findByRole("link", { name: /Restart loop/u });
    const issueHref = new URL(issueRow.getAttribute("href")!, "https://product.test");
    expect(issueHref.pathname).toBe("/issues");
    expect(issueHref.searchParams.get("detail")).toBe("issue:cluster-1/incident-1");
    expect(issueHref.searchParams.get("clusters")).toBe("cluster-1");
    expect(issueHref.searchParams.get("namespaces")).toBe("cluster-1/shop");
    const collapse = within(issues).getByRole("button", { name: /접기/u });
    expect(collapse.tagName).toBe("BUTTON");
    expect(collapse.getAttribute("aria-expanded")).toBe("true");
    await user.click(collapse);
    expect(collapse.getAttribute("aria-expanded")).toBe("false");

    const period = screen.getByRole("group", { name: "시간 범위" });
    expect(within(period).getByRole("button", { name: "오늘" }).getAttribute("aria-pressed"))
      .toBe("true");
    await user.click(screen.getByRole("button", { name: "레이아웃 편집" }));
    const removeIssue = within(issues).getByRole("button", { name: "이슈 위젯 숨기기" });
    expect(removeIssue.tagName).toBe("BUTTON");
    await user.click(removeIssue);
    expect(screen.getByRole("button", { name: "위젯 추가 · 이슈" })).toBeTruthy();
  });

  it("shares one URL period across W4 and preserves unrelated filters", async () => {
    const user = userEvent.setup();
    renderHome(homePort(), [
      "/?clusters=cluster-1&namespaces=cluster-1%2Fshop&applications=checkout",
    ]);

    await user.click(await screen.findByRole("button", { name: "30일" }));

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

    const activity = await screen.findByRole("heading", { name: "활동 추이" });
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
    expect(await within(widget).findByRole("alert")).toBeTruthy();
    await user.click(await within(widget).findByRole("button", { name: "다시 시도" }));
    expect(await within(widget).findByRole("img", { name: "활동" })).toBeTruthy();
    expect(loadOverview.mock.calls.length - activityCalls).toBe(1);
    expect(listIssues.mock.calls.length - issueCalls).toBe(0);
    expect(listSyncTargets.mock.calls.length - gitopsCalls).toBe(0);
  });

  it("commits layout preferences only when editing completes", async () => {
    const user = userEvent.setup();
    seedMinimalHomeBoard();
    const key = "opsia:home-board:test-workspace:test-user:v2";
    const preferencesBeforeEditing = window.localStorage.getItem(key);
    renderHome(homePort());
    await screen.findByRole("heading", { name: "이슈" });

    await user.click(screen.getByRole("button", { name: "레이아웃 편집" }));
    await user.click(screen.getByRole("button", {
      name: "위젯 추가 · 네임스페이스 파드 분포",
    }));
    const issues = screen.getByRole("region", { name: "이슈" });
    await user.click(within(issues).getByRole("button", { name: /접기/u }));

    expect(window.localStorage.getItem(key)).toBe(preferencesBeforeEditing);
    await user.click(screen.getByRole("button", { name: "편집 완료" }));
    await waitFor(() => expect(window.localStorage.getItem(key)).not.toBe(preferencesBeforeEditing));
    const committed = JSON.parse(window.localStorage.getItem(key)!);
    expect(committed.visible).toContain("W5");
    expect(committed.collapsed).toContain("W2");
    const preferencesAfterSaving = window.localStorage.getItem(key);

    await user.click(screen.getByRole("button", { name: "레이아웃 편집" }));
    const namespaceWidget = screen.getByRole("region", { name: "네임스페이스 파드 분포" });
    await user.click(within(namespaceWidget).getByRole("button", {
      name: "네임스페이스 파드 분포 위젯 숨기기",
    }));
    expect(window.localStorage.getItem(key)).toBe(preferencesAfterSaving);
  });

  it("keeps authorization failures global and never renders cached board content", async () => {
    renderHome(homePort({
      listClusterChoices: vi.fn().mockRejectedValue(new HomePortFailure("forbidden")),
    }));

    expect(await screen.findByRole("heading", { name: "이 범위에 접근할 수 없습니다" }))
      .toBeTruthy();
    expect(screen.queryByRole("heading", { name: "활동 추이" })).toBeNull();
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
    expect(screen.queryByRole("heading", { name: "활동 추이" })).toBeNull();
  });
});

function expectFleetMetrics(
  summary: HTMLElement,
  expected: { clusters: string; nodes: string; pods: string },
): void {
  expect(within(summary).getByText("클러스터").nextElementSibling?.textContent)
    .toBe(expected.clusters);
  expect(within(summary).getByText("노드").nextElementSibling?.textContent)
    .toBe(expected.nodes);
  expect(within(summary).getByText("파드").nextElementSibling?.textContent)
    .toBe(expected.pods);
}

function seedMinimalHomeBoard(): void {
  window.localStorage.setItem("opsia:home-board:test-workspace:test-user:v2", JSON.stringify({
    collapsed: [],
    order: ["W2", "W3", "W4", "W5", "W6", "W7", "W8"],
    visible: ["W2", "W3", "W4"],
  }));
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

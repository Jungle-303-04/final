// @vitest-environment jsdom

import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CLUSTERS,
  homeBoardPorts,
  homePort,
  renderHome,
} from "./HomePage.testSupport";
import {
  criticalResourcePage,
  expectFleetMetrics,
} from "./HomePage.assertions.testSupport";

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
});

// @vitest-environment jsdom

import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomePortFailure } from "../../features/home/homeContract";
import { homePort, renderHome } from "./HomePage.testSupport";

afterEach(cleanup);

describe("HomePage", () => {
  it("shows the cluster resource explorer and preserves filters when no cluster is selected", async () => {
    const user = userEvent.setup();
    renderHome(homePort(), ["/?applications=checkout&resources.health=warning"]);

    const explorer = await screen.findByRole("region", {
      name: "클러스터 리소스 탐색",
    });
    expect(explorer).toBeTruthy();
    expect(screen.getByRole("heading", { name: "클러스터별 리소스 탐색" })).toBeTruthy();
    expect(screen.getByText("클러스터를 선택하면 해당 리소스 화면으로 이동합니다.")).toBeTruthy();
    expect(screen.getByRole("img", {
      name: "Amazon Elastic Kubernetes Service",
    })).toBeTruthy();
    expect(screen.getByText("서버 2")).toBeTruthy();
    expect(screen.getByText("파드 18")).toBeTruthy();
    expect(screen.getByText("인시던트 1")).toBeTruthy();

    await user.click(screen.getByRole("link", { name: "cluster-1 리소스 열기" }));
    expect(screen.getByTestId("home-location").textContent)
      .toBe("/resources?clusters=cluster-1&applications=checkout&resources.health=warning");
  });

  it("renders English by default without translating Kubernetes nouns or backend values", async () => {
    renderHome(homePort(), ["/?clusters=cluster-1"], vi.fn(), null);

    expect(await screen.findByRole("heading", { name: "Cluster status" }, { timeout: 5_000 }))
      .toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Active issues" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Node and Pod" })).toBeTruthy();
    expect(await screen.findByText("Restart loop", {}, { timeout: 5_000 })).toBeTruthy();
    expect(screen.getByText("Running", { exact: false })).toBeTruthy();
  }, 15_000);

  it("loads the first real cluster and renders the health and Node bands", async () => {
    const port = homePort();
    renderHome(port);

    expect(await screen.findByRole("heading", { name: "클러스터 상태" }, { timeout: 5_000 }))
      .toBeTruthy();
    expect(await screen.findByText("42.5%", {}, { timeout: 5_000 })).toBeTruthy();
    expect(screen.queryByText("Fleet Home")).toBeNull();
    expect(screen.queryByText("CLUSTER HEALTH")).toBeNull();
    expect(screen.queryByText("ATTENTION")).toBeNull();
    expect(screen.queryByText("RESOURCE SNAPSHOT")).toBeNull();
    expect(screen.queryByText(/실 API/u)).toBeNull();
    expect(screen.queryByText("Home", { exact: true })).toBeNull();
    expect(screen.queryByText(/클러스터 상태에서 Node와 Pod까지/u)).toBeNull();
    expect(screen.queryByText(/시스템·관측 에이전트를 제외한/u)).toBeNull();
    expect(await screen.findByRole("button", { name: /worker-a/u }, { timeout: 5_000 }))
      .toBeTruthy();
    expect(document.querySelector('[data-slot="home-server-band"]')).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "활성 이슈" }).textContent)
      .toContain("Restart loop");
    expect(port.listClusterChoices).toHaveBeenCalledOnce();
    expect(port.loadClusterOverview).toHaveBeenCalledWith("cluster-1", expect.any(AbortSignal));
    expect(port.loadNodes).toHaveBeenCalledWith("cluster-1", expect.any(AbortSignal));
  }, 15_000);

  it("does not advertise source-only cost or MCP capabilities without a product contract", async () => {
    renderHome(homePort());

    expect(await screen.findByRole("heading", { name: "클러스터 상태" }, { timeout: 5_000 }))
      .toBeTruthy();
    expect(screen.queryByText("Cost Insights")).toBeNull();
    expect(screen.queryByText("OpenCost")).toBeNull();
    expect(screen.queryByText("MCP Server")).toBeNull();
    expect(screen.queryByText("Connect your AI tool")).toBeNull();
  }, 15_000);

  it("renders revisioned custom resource and Helm summaries with scoped navigation", async () => {
    renderHome(homePort(), ["/?clusters=cluster-1&applications=checkout"]);

    const insights = await screen.findByRole("region", { name: "클러스터 인사이트" });
    expect(await within(insights).findByText("Application")).toBeTruthy();
    expect(within(insights).getByText("argoproj.io/v1alpha1")).toBeTruthy();
    expect(within(insights).getByText("deployed 2")).toBeTruthy();
    expect(within(insights).getByRole("link", { name: "리소스 열기" }).getAttribute("href"))
      .toBe("/resources?clusters=cluster-1&applications=checkout");
    expect(within(insights).getByRole("link", { name: "Helm 열기" }).getAttribute("href"))
      .toBe("/helm?clusters=cluster-1&applications=checkout");
  });

  it("keeps an internal Node hostname on one identifiable label while preserving its full identity", async () => {
    const port = homePort({
      loadNodes: vi.fn().mockResolvedValue({
        clusterId: "cluster-1",
        completeness: "unknown",
        nodes: [{
          id: "node:cluster-1/ip-192-168-51-161.ap-northeast-2.compute.internal",
          identityStability: "ephemeral",
          name: "ip-192-168-51-161.ap-northeast-2.compute.internal",
          ready: true,
          health: "healthy",
          podsRunning: 18,
          podsCapacity: 29,
          cpuPercent: 11.4,
          memoryPercent: 32.3,
          restartCount: 1,
          conditions: [],
        }],
      }),
    });
    renderHome(port);

    const node = await screen.findByRole("button", { name: /ip-192-168-51-161/u });
    expect(node.textContent).toContain("ip-192-168-51-161");
    expect(node.textContent).not.toContain(".ap-northeast-2.compute.internal");
  });

  it("keeps an unknown URL cluster explicit instead of selecting the first cluster", async () => {
    const port = homePort();
    renderHome(port, ["/?clusters=missing"]);

    expect(await screen.findByRole("heading", { name: "현재 조회 목록에서 확인할 수 없습니다" }))
      .toBeTruthy();
    expect(port.loadClusterOverview).not.toHaveBeenCalled();
    expect(port.loadNodes).not.toHaveBeenCalled();
  });

  it("distinguishes an authorized empty catalog from an access failure", async () => {
    const port = homePort({
      listClusterChoices: vi.fn().mockResolvedValue({ completeness: "unknown", clusters: [] }),
    });
    renderHome(port);

    expect(await screen.findByRole("heading", { name: "연결된 클러스터가 없습니다" }))
      .toBeTruthy();
    expect(screen.queryByRole("heading", { name: "이 범위에 접근할 수 없습니다" }))
      .toBeNull();
  });

  it("renders a first-class forbidden state without retrying another cluster", async () => {
    const port = homePort({
      listClusterChoices: vi.fn().mockRejectedValue(new HomePortFailure("forbidden")),
    });
    renderHome(port);

    expect(await screen.findByRole("heading", { name: "이 범위에 접근할 수 없습니다" }))
      .toBeTruthy();
    expect(port.loadClusterOverview).not.toHaveBeenCalled();
    expect(port.loadNodes).not.toHaveBeenCalled();
  });

  it("opens a selected Node in place and returns focus to the originating Node", async () => {
    const user = userEvent.setup();
    const port = homePort();
    renderHome(port);

    const node = await screen.findByRole("button", { name: /worker-b/u }, { timeout: 5_000 });
    await user.click(node);
    expect(await screen.findByRole("heading", { name: "worker-b의 Pod" })).toBeTruthy();
    expect(screen.getByText("checkout-api-0")).toBeTruthy();
    expect(port.loadNodePods).toHaveBeenCalledWith(
      "cluster-1",
      "worker-b",
      expect.any(AbortSignal),
    );

    await user.click(screen.getByRole("button", { name: "Node 목록으로" }));
    expect(await screen.findByRole("button", { name: /worker-b/u })).toBe(document.activeElement);
  }, 15_000);

  it("keeps available Nodes visible when the overview request fails", async () => {
    const port = homePort({
      loadClusterOverview: vi.fn().mockRejectedValue(new HomePortFailure("offline")),
    });
    renderHome(port);

    expect(await screen.findByRole("button", { name: /worker-a/u }, { timeout: 5_000 }))
      .toBeTruthy();
    expect(screen.getAllByRole("alert").some((alert) => (
      alert.textContent?.includes("일부 정보를 불러오지 못했습니다")
    ))).toBe(true);
    expect(screen.queryByText("0", { selector: "strong" })).toBeNull();
  });

  it("reconciles a feature 401 through the single session authority", async () => {
    const reportUnauthorized = vi.fn();
    const port = homePort({
      listClusterChoices: vi.fn().mockRejectedValue(new HomePortFailure("unauthorized")),
    });
    renderHome(port, ["/?clusters=cluster-1"], reportUnauthorized);

    await waitFor(() => expect(reportUnauthorized).toHaveBeenCalledOnce());
    expect(screen.queryByRole("heading", { name: "정보를 불러오지 못했습니다" }))
      .toBeNull();
  });
});

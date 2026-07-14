// @vitest-environment jsdom

import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomePortFailure } from "../../features/home/homeContract";
import { homePort, renderHome } from "./HomePage.testSupport";

afterEach(cleanup);

describe("HomePage", () => {
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
    expect(screen.getByRole("complementary", { name: "활성 이슈" }).textContent)
      .toContain("Restart loop");
    expect(port.listClusterChoices).toHaveBeenCalledOnce();
    expect(port.loadClusterOverview).toHaveBeenCalledWith("cluster-1", expect.any(AbortSignal));
    expect(port.loadNodes).toHaveBeenCalledWith("cluster-1", expect.any(AbortSignal));
  }, 15_000);

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

    expect(await screen.findByRole("heading", { name: "관측된 Cluster가 없습니다" }))
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
    expect(screen.queryByRole("heading", { name: "검증된 응답을 읽지 못했습니다" }))
      .toBeNull();
  });
});

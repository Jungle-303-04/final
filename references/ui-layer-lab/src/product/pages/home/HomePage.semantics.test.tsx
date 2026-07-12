// @vitest-environment jsdom

import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HomePortFailure,
  type HomeClusterChoices,
  type HomePort,
} from "../../features/home/homeContract";
import { CLUSTERS, homePort, NODES, OVERVIEW, renderHome } from "./HomePage.testSupport";

afterEach(cleanup);

describe("HomePage data semantics", () => {
  it("does not turn an unknown-completeness empty slice into authoritative zero claims", async () => {
    renderHome(homePort({
      loadClusterOverview: vi.fn().mockResolvedValue({
        ...OVERVIEW,
        workloads: [],
        warnings: [],
        incidents: [],
      }),
      loadNodes: vi.fn().mockResolvedValue({ ...NODES, nodes: [] }),
    }));

    await screen.findByRole("heading", { name: "클러스터 상태" });
    expect(screen.queryByText("현재 활성 이슈가 없습니다.")).toBeNull();
    expect(screen.getAllByText(/전체 수 미확인/u).length).toBeGreaterThanOrEqual(1);
  });

  it("keeps the catalog incident count separate from displayed warnings", async () => {
    renderHome(homePort({
      listClusterChoices: vi.fn().mockResolvedValue({
        ...CLUSTERS,
        clusters: [{ ...CLUSTERS.clusters[0], incidentCount: 7 }],
      }),
      loadClusterOverview: vi.fn().mockResolvedValue({
        ...OVERVIEW,
        warnings: [
          OVERVIEW.warnings[0],
          { ...OVERVIEW.warnings[0], id: "warning:second", name: "second-warning" },
        ],
      }),
    }));

    const incidentLabel = await screen.findByText("활성 인시던트");
    expect(incidentLabel.closest("[data-slot='metric']")?.textContent).toContain("7");
    const issues = screen.getByRole("complementary", { name: "활성 이슈" });
    expect(issues.textContent).toMatch(/인시던트\s*1/u);
    expect(issues.textContent).toMatch(/경고\s*2/u);
  });

  it("preserves over-capacity metric text while clamping the visual progress value", async () => {
    renderHome(homePort({
      loadClusterOverview: vi.fn().mockResolvedValue({
        ...OVERVIEW,
        usage: { ...OVERVIEW.usage!, cpuPercent: 142.5 },
      }),
    }));

    expect(await screen.findByText("142.5%")).toBeTruthy();
    const progress = screen.getByRole("progressbar", { name: "CPU 사용률" });
    expect(progress.getAttribute("aria-valuenow")).toBe("100");
    expect(progress.getAttribute("aria-valuetext")).toContain("142.5%");
  });

  it("does not announce an unavailable metric as indeterminate progress", async () => {
    renderHome(homePort({
      loadClusterOverview: vi.fn().mockResolvedValue({
        ...OVERVIEW,
        usage: { ...OVERVIEW.usage!, cpuPercent: null },
      }),
    }));

    await screen.findByRole("heading", { name: "클러스터 상태" });
    expect(screen.queryByRole("progressbar", { name: "CPU 사용률" })).toBeNull();
    expect(screen.getAllByText("사용할 수 없음").length).toBeGreaterThanOrEqual(1);
  });

  it("marks an unavailable overview as an error instead of an in-progress state", async () => {
    renderHome(homePort({
      loadClusterOverview: vi.fn().mockRejectedValue(new HomePortFailure("offline")),
    }));

    const errorLabel = await screen.findByText(/클러스터 요약 (?:오류|실패)/u);
    expect(errorLabel.closest("[data-slot='status-mark']")?.getAttribute("data-status"))
      .toBe("critical");
  });

  it("never gives a not-ready Node a healthy status tone", async () => {
    renderHome(homePort({
      loadNodes: vi.fn().mockResolvedValue({
        ...NODES,
        nodes: [{ ...NODES.nodes[1], health: "healthy" }],
      }),
    }));

    const node = await screen.findByRole("button", { name: /worker-b/u });
    const status = within(node).getByText("Not ready").closest("[data-slot='status-mark']");
    expect(status?.getAttribute("data-status")).toBe("warning");
  });

  it("disambiguates duplicate cluster names with environment, id, and connection status", async () => {
    const user = userEvent.setup();
    const duplicateClusters: HomeClusterChoices = {
      completeness: "unknown",
      clusters: [
        { ...CLUSTERS.clusters[0], id: "shared-a", name: "shared", environment: "production" },
        {
          ...CLUSTERS.clusters[1], id: "shared-b", name: "shared", environment: "management",
          connectionState: "offline",
        },
      ],
    };
    renderHome(homePort({ listClusterChoices: vi.fn().mockResolvedValue(duplicateClusters) }));

    await user.click(await screen.findByRole("combobox", { name: "클러스터 선택" }));
    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(expect.arrayContaining([
      expect.stringMatching(/shared.*production.*shared-a.*연결됨/u),
      expect.stringMatching(/shared.*management.*shared-b.*연결 끊김/u),
    ]));
  });

  it.each([
    ["overview", new HomePortFailure("rate-limited", 17), /클러스터 요약[\s\S]*17초/u],
    ["nodes", new HomePortFailure("offline"), /Node 목록[\s\S]*연결이 끊겼/u],
    ["nodes", new HomePortFailure("invalid-response"), /Node 목록 응답 형식/u],
    ["pods", new HomePortFailure("not-found"), /Pod 목록[\s\S]*찾을 수/u],
  ] as const)("renders a section-specific %s failure and refresh action", async (
    section,
    failure,
    copy,
  ) => {
    const user = userEvent.setup();
    const overrides: Partial<HomePort> = section === "overview"
      ? { loadClusterOverview: vi.fn().mockRejectedValue(failure) }
      : section === "nodes"
        ? { loadNodes: vi.fn().mockRejectedValue(failure) }
        : { loadNodePods: vi.fn().mockRejectedValue(failure) };
    renderHome(homePort(overrides));
    if (section === "pods") {
      await user.click(await screen.findByRole("button", { name: /worker-b/u }));
    }

    const region = await screen.findByRole("region", {
      name: section === "overview" ? "클러스터 상태" : "Node와 Pod",
    });
    await waitFor(() => expect(region.textContent).toMatch(copy));
    expect(within(region).getByRole("button", { name: /새로 고침|다시 불러오기/u }))
      .toBeTruthy();
  });

  it("promotes a cluster-read 403 to the global forbidden surface without cached content", async () => {
    renderHome(homePort({
      loadNodes: vi.fn().mockRejectedValue(new HomePortFailure("forbidden")),
    }));

    expect(await screen.findByRole("heading", { name: "이 범위에 접근할 수 없습니다" }))
      .toBeTruthy();
    expect(screen.queryByRole("button", { name: /worker-a/u })).toBeNull();
    expect(screen.queryByRole("region", { name: "Node와 Pod" })).toBeNull();
  });
});

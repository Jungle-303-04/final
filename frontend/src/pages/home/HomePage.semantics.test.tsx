// @vitest-environment jsdom

import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HomePortFailure,
  type HomePort,
} from "../../features/home/homeContract";
import { createHomeAdapter } from "../../features/home/createHomeAdapter";
import {
  CLUSTER_OVERVIEW,
  endpoints,
} from "../../features/home/createHomeAdapter.testSupport";
import { CLUSTERS, homePort, NODES, OVERVIEW, renderHome } from "./HomePage.testSupport";

beforeEach(resetDocumentTestClock);

afterEach(() => {
  cleanup();
  resetDocumentTestClock();
});

describe("HomePage data semantics", () => {
  it("keeps cluster and incident sections visible when usage is unavailable", async () => {
    const usage = { ...CLUSTER_OVERVIEW.usage } as Record<string, unknown>;
    delete usage.pods_total;
    usage.pods_running = 5;
    renderHome(createHomeAdapter(endpoints({
      getClusterSummary: vi.fn().mockResolvedValue({
        ...CLUSTER_OVERVIEW,
        usage,
      }),
    })), ["/?clusters=cluster-1"]);

    const clusterStatus = await screen.findByRole("region", {
      name: "클러스터 상태",
    }, { timeout: 5_000 });
    await waitFor(() => {
      expect(within(clusterStatus).getAllByText("—").length).toBeGreaterThanOrEqual(1);
    });
    expect(within(clusterStatus).queryByRole("progressbar", { name: "CPU 사용률" })).toBeNull();
    expect(screen.getByRole("complementary", { name: "활성 이슈" })).toBeTruthy();
    expect(screen.getByText("Restart loop")).toBeTruthy();
  }, 15_000);

  it("keeps an incident without a stable incident id as a non-link row", async () => {
    const incident = CLUSTER_OVERVIEW.open_incidents[0];
    renderHome(createHomeAdapter(endpoints({
      getClusterSummary: vi.fn().mockResolvedValue({
        ...CLUSTER_OVERVIEW,
        open_incidents: incident ? [{ ...incident, incident_id: "" }] : [],
      }),
    })), ["/?clusters=cluster-1"]);

    const symptom = await screen.findByText("Restart loop", {}, { timeout: 5_000 });
    expect(symptom.closest("a")).toBeNull();
    expect(screen.queryByRole("link", { name: /Restart loop/u })).toBeNull();
  }, 15_000);

  it("opens a stable incident in the scoped Issues screen", async () => {
    renderHome(homePort(), ["/?clusters=cluster-1"]);

    const incident = await screen.findByRole("link", { name: /Restart loop/u });
    expect(incident.getAttribute("href")).toBe("/issues?clusters=cluster-1");
  });

  it("opens a warning with an observed resource identity in the resource drawer", async () => {
    renderHome(homePort(), ["/?clusters=cluster-1"]);

    const warning = await screen.findByRole("link", { name: /BackOff/u });
    expect(warning.getAttribute("href")).toBe(
      "/resources?clusters=cluster-1&resources.types=pod&detail=Pod%2Fshop%2Fcheckout-api-0",
    );
  });

  it("does not turn an unknown-completeness empty slice into authoritative zero claims", async () => {
    renderHome(homePort({
      loadClusterOverview: vi.fn().mockResolvedValue({
        ...OVERVIEW,
        workloads: [],
        warnings: [],
        incidents: [],
      }),
      loadNodes: vi.fn().mockResolvedValue({ ...NODES, nodes: [] }),
    }), ["/?clusters=cluster-1"]);

    await screen.findAllByText(/전체 수 미확인/u, {}, { timeout: 5_000 });
    expect(screen.queryByText("현재 활성 이슈가 없습니다.")).toBeNull();
    expect(screen.getAllByText(/전체 수 미확인/u).length).toBeGreaterThanOrEqual(1);
  }, 15_000);

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
    }), ["/?clusters=cluster-1"]);

    const incidentLabel = await screen.findByText("활성 인시던트");
    expect(incidentLabel.closest("[data-slot='metric']")?.textContent).toContain("7");
    const issues = screen.getByRole("complementary", { name: "활성 이슈" });
    expect(issues.textContent).toMatch(/인시던트\s*7.*표시\s*1/u);
    expect(issues.textContent).toMatch(/경고\s*2/u);
  });

  it("preserves over-capacity metric text while clamping the visual progress value", async () => {
    renderHome(homePort({
      loadClusterOverview: vi.fn().mockResolvedValue({
        ...OVERVIEW,
        usage: { ...OVERVIEW.usage!, cpuPercent: 142.5 },
      }),
    }), ["/?clusters=cluster-1"]);

    expect(await screen.findByText("142.5%", {}, { timeout: 5_000 })).toBeTruthy();
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
    }), ["/?clusters=cluster-1"]);

    await screen.findAllByText("—", {}, { timeout: 5_000 });
    expect(screen.queryByRole("progressbar", { name: "CPU 사용률" })).toBeNull();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
  }, 15_000);

  it("marks an unavailable overview as an error instead of an in-progress state", async () => {
    renderHome(homePort({
      loadClusterOverview: vi.fn().mockRejectedValue(new HomePortFailure("offline")),
    }), ["/?clusters=cluster-1"]);

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
    }), ["/?clusters=cluster-1"]);

    const node = await screen.findByRole("button", { name: /worker-b/u });
    const status = within(node).getByText("Not Ready").closest("[data-slot='status-mark']");
    expect(status?.getAttribute("data-status")).toBe("warning");
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
    renderHome(homePort(overrides), ["/?clusters=cluster-1"]);
    if (section === "pods") {
      await user.click(await screen.findByRole("button", { name: /worker-b/u }));
    }

    const region = await screen.findByRole("region", {
      name: section === "overview" ? "클러스터 상태" : "Node와 Pod",
    }, { timeout: 5_000 });
    await waitFor(() => expect(region.textContent).toMatch(copy));
    expect(within(region).getByRole("button", { name: /새로 고침|다시 불러오기/u }))
      .toBeTruthy();
  }, 15_000);

  it("promotes a cluster-read 403 to the global forbidden surface without cached content", async () => {
    renderHome(homePort({
      loadNodes: vi.fn().mockRejectedValue(new HomePortFailure("forbidden")),
    }), ["/?clusters=cluster-1"]);

    expect(await screen.findByRole("heading", { name: "이 범위에 접근할 수 없습니다" }))
      .toBeTruthy();
    expect(screen.queryByRole("button", { name: /worker-a/u })).toBeNull();
    expect(screen.queryByRole("region", { name: "Node와 Pod" })).toBeNull();
  });

  it("keeps an inventory-only insights denial inside the Home insights section", async () => {
    renderHome(homePort({
      loadInsights: vi.fn().mockRejectedValue(new HomePortFailure("forbidden")),
    }), ["/?clusters=cluster-1"]);

    const insights = await screen.findByRole("region", { name: "클러스터 인사이트" });
    expect(await within(insights).findByText("조회 권한이 없습니다")).toBeTruthy();
    expect(await screen.findByRole("button", { name: /worker-a/u })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "이 범위에 접근할 수 없습니다" }))
      .toBeNull();
  });
});

function resetDocumentTestClock() {
  vi.useRealTimers();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
}

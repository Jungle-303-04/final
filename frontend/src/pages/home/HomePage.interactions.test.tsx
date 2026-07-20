// @vitest-environment jsdom

import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HomePortFailure } from "../../features/home/homeContract";
import {
  CLUSTERS,
  homeBoardPorts,
  homePort,
  renderHome,
} from "./HomePage.testSupport";
import { seedMinimalHomeBoard } from "./HomePage.assertions.testSupport";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("HomePage board interactions", () => {
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
    const key = "kyro:home-board:test-workspace:test-user:v2";
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

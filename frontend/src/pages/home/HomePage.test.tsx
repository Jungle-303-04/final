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
    await user.click(screen.getByRole("option", { name: "30d" }));

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
    renderHome(
      homePort(),
      ["/?clusters=cluster-1"],
      vi.fn(),
      "ko",
      homeBoardPorts({ activity: { loadOverview } }),
    );

    const activity = await screen.findByRole("heading", { name: "활동" });
    const widget = activity.closest<HTMLElement>("[data-slot='widget-frame']")!;
    await user.click(await within(widget).findByRole("button", { name: "다시 시도" }));
    expect(await within(widget).findByRole("img", { name: "활동" })).toBeTruthy();
    expect(loadOverview.mock.calls.length).toBeGreaterThanOrEqual(2);
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

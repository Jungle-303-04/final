// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const onOpen = vi.fn();
const onSettings = vi.fn();
const onDisconnect = vi.fn();

vi.mock("./devpreview/contracts", () => ({
  useDevpreviewContracts: () => ({
    clusters: [{
      id: "registration-7f6f2",
      workspaceId: "workspace-1",
      name: "internal-registration-name",
      displayName: "game-server",
      environment: "production",
      provider: "eks",
      connectionStatus: "online",
      connectionStage: "ready",
      observationMode: "agent",
      lastObservedAt: "2026-07-22T00:00:00Z",
      kubernetesVersion: "v1.32.0-eks",
      nodeCount: null,
      podCount: null,
      namespaceCount: 13,
      incidentCount: null,
      role: "target",
      readOnly: false,
    }, {
      id: "registration-waiting",
      workspaceId: "workspace-1",
      name: "management-internal-name",
      displayName: "management-server",
      environment: "production",
      provider: "eks",
      connectionStatus: "online",
      connectionStage: "ready",
      observationMode: "agent",
      lastObservedAt: "2026-07-22T00:00:00Z",
      kubernetesVersion: "v1.32.0-eks",
      nodeCount: null,
      podCount: null,
      namespaceCount: 4,
      incidentCount: null,
      role: "management",
      readOnly: false,
    }],
  }),
}));

vi.mock("./devpreview/clusterSummaryFeed", () => ({
  useClusterSummaries: () => ({
    "registration-7f6f2": {
      status: "ready",
      health: null,
      cpuPct: 25,
      memPct: 40,
      podsRunning: 9,
      podsTotal: null,
      nodesReady: 2,
      nodesTotal: 3,
      openIncidents: null,
      nodes: [
        { name: "node-a", ready: true, health: "healthy", cpuPct: 25, memPct: 40, podsRunning: 4, podsCapacity: 29, restartsRecent: 0, conditions: [] },
        { name: "node-b", ready: true, health: "healthy", cpuPct: 25, memPct: 40, podsRunning: 5, podsCapacity: 29, restartsRecent: 0, conditions: [] },
      ],
    },
    "registration-waiting": {
      status: "unavailable",
      health: null,
      cpuPct: null,
      memPct: null,
      podsRunning: null,
      podsTotal: null,
      nodesReady: null,
      nodesTotal: null,
      openIncidents: null,
      nodes: [],
    },
  }),
}));

vi.mock("./devpreview/useNarrowViewport", () => ({
  useNarrowViewport: () => false,
}));

import { HomeClustersWidget } from "./devpreview-opsia";

describe("HomeClustersWidget", () => {
  it("renders one dense cluster row with real metrics and opens the immutable registration id", () => {
    onOpen.mockClear();
    onSettings.mockClear();
    onDisconnect.mockClear();
    const rendered = render(<HomeClustersWidget onOpen={onOpen} onSettings={onSettings} onDisconnect={onDisconnect} />);

    expect(screen.getByText("game-server")).toBeTruthy();
    expect(screen.queryByText("registration-7f6f2")).toBeNull();
    expect(screen.getByText("2/3")).toBeTruthy();
    expect(screen.getByText("9/58")).toBeTruthy();
    expect(screen.getByText("25%")).toBeTruthy();
    expect(screen.getByText("40%")).toBeTruthy();
    expect(screen.queryByText("정상")).toBeNull();
    expect(screen.queryByText("노드 보기")).toBeNull();
    expect(screen.queryByText("v1.32.0-eks")).toBeNull();
    expect(screen.getByText("메트릭 수집 대기")).toBeTruthy();
    expect(screen.getByLabelText("메트릭 수집 대기: CPU·메모리 최신 샘플 미수신").getAttribute("title")).toBe("CPU·메모리 최신 샘플을 아직 수신하지 못했습니다.");
    expect(screen.queryByText("일부 관측")).toBeNull();

    const compact = rendered.container.querySelector("[data-home-clusters='compact']") as HTMLElement;
    expect(compact.style.overflowY).toBe("auto");

    fireEvent.click(screen.getByRole("button", { name: "game-server 클러스터 상세" }));
    expect(onOpen).toHaveBeenCalledWith("registration-7f6f2");

    fireEvent.click(screen.getByRole("button", { name: "game-server 클러스터 메뉴" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "설정" }));
    expect(onSettings).toHaveBeenCalledWith("registration-7f6f2");

    fireEvent.click(screen.getByRole("button", { name: "game-server 클러스터 메뉴" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "연결 해제…" }));
    expect(onDisconnect).toHaveBeenCalledWith("registration-7f6f2");
  });
});

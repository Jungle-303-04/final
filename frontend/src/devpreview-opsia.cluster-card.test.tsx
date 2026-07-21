// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const onOpen = vi.fn();

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
    },
  }),
}));

vi.mock("./devpreview/useNarrowViewport", () => ({
  useNarrowViewport: () => false,
}));

import { HomeClusterSection } from "./devpreview-opsia";

describe("HomeClusterSection", () => {
  it("renders the provider display name but opens the immutable registration id", () => {
    onOpen.mockClear();
    render(<HomeClusterSection onOpen={onOpen} />);

    expect(screen.getByText("game-server")).toBeTruthy();
    expect(screen.queryByText("registration-7f6f2")).toBeNull();
    expect(screen.getByText("2/3")).toBeTruthy();
    expect(screen.getByText("25%")).toBeTruthy();
    expect(screen.getByText("40%")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /game-server/ }));
    expect(onOpen).toHaveBeenCalledWith("registration-7f6f2");
  });
});

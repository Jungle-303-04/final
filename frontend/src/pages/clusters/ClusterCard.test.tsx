// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HomeClusterChoice } from "../../features/home/homeContract";
import { I18nProvider } from "../../shared/i18n";
import { ClusterCard } from "./ClusterCard";

const cluster: HomeClusterChoice = {
  id: "cluster-1",
  workspaceId: "workspace-main",
  name: "Production",
  environment: "production",
  provider: "eks",
  connectionStage: "ready",
  registrationState: "active",
  connectionState: "online",
  lastObservedAt: "2026-07-14T01:00:00Z",
  nodeCount: 8,
  podCount: 47,
  incidentCount: 1,
  serverCount: 8,
  appCount: 6,
  openIncidentCount: 1,
};

afterEach(cleanup);


function countsText(container: HTMLElement): string {
  const counts = container.querySelector("[data-slot='cluster-card-counts']");
  return (counts?.textContent ?? "").replace(/\s+/gu, " ").trim();
}

describe("ClusterCard", () => {
  it("renders the D1 status, identity, count line, mini bars, and staggered entrance", () => {
    const { container } = renderCard(cluster, 2);

    expect(screen.getByRole("img", { name: "Amazon Elastic Kubernetes Service" })
      .getAttribute("data-provider")).toBe("eks");
    expect(screen.getByText("Critical 1")).toBeTruthy();
    const counts = countsText(container);
    expect(counts).toContain("Nodes —/8 ready");
    expect(counts).toContain("Pods 47 · Critical 1");
    expect(counts).toContain("Namespaces —");
    expect(screen.getByRole("img", { name: "CPU —" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Memory —" })).toBeTruthy();
    expect((container.querySelector("[data-cluster-id='cluster-1']") as HTMLElement).style.animationDelay)
      .toBe("140ms");
    expect(container.querySelectorAll("[data-morph-id]")).toHaveLength(0);
    const card = container.querySelector("[data-cluster-id='cluster-1']");
    expect(card?.className).not.toContain("hover:-translate");
    expect(card?.className).toContain("hover:shadow-[0_10px_26px_-20px"); // 데모 ELEV.hover 문법
    expect(card?.textContent).not.toContain("Apps 6");
  });

  it("omits unknown counts instead of presenting them as zero", () => {
    const { container } = renderCard({
      ...cluster,
      nodeCount: null,
      podCount: null,
      incidentCount: null,
      serverCount: null,
      appCount: null,
      openIncidentCount: null,
    });

    const counts = countsText(container);
    expect(counts).toContain("Nodes —/— ready");
    expect(counts).toContain("Pods —");
    expect(counts).toContain("Namespaces —");
    // 데모 문법: 장애 0·미상은 표기하지 않는다(빈 값의 침묵)
    expect(counts).not.toContain("Critical");
    expect(screen.queryByText(/\b0\b/u)).toBeNull();
  });

  it("does not label a pending registration healthy before it connects", () => {
    renderCard({
      ...cluster,
      connectionState: "pending",
      registrationState: "pending",
      openIncidentCount: 0,
    });

    expect(screen.getByText("Warning")).toBeTruthy();
    expect(screen.getByText("Waiting for the outbound agent's first heartbeat.")).toBeTruthy();
  });

  it("keeps disconnected content readable and labels synthetic evidence", () => {
    const { container } = renderCard({
      ...cluster,
      connectionState: "pending",
      observationMode: "simulation",
      lastObservedAt: null,
    });

    const card = container.querySelector("[data-cluster-id='cluster-1']");
    expect(card?.className).not.toContain("saturate-0");
    expect(screen.getByText("Synthetic read-only evidence; cluster actions are unavailable.")).toBeTruthy();
  });

  it("uses the selected cluster overview as the only CPU and memory evidence", () => {
    const { container } = renderCard(cluster, 0, undefined, undefined, {
      observedAt: null,
      podsRunning: 45,
      podsTotal: 47,
      nodesReady: 7,
      nodesTotal: 8,
      restartCount: 2,
      cpuPercent: 42.5,
      memoryPercent: 61.25,
    });

    const counts = countsText(container);
    expect(counts).toContain("Nodes 7/8 ready");
    expect(counts).toContain("Pods 47 · Critical 1");
    expect(screen.getByRole("img", { name: "CPU 42.5%" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Memory 61.25%" })).toBeTruthy();
  });

  it("links the whole card to the canonical Resources URL", () => {
    renderCard(cluster);

    expect(screen.getByRole("link", { name: "Open resources for Production" })
      .getAttribute("href")).toBe("/resources?clusters=cluster-1");
  });

  it("opens a separate card menu without nesting the disconnect action in navigation", async () => {
    const user = userEvent.setup();
    const onDisconnect = vi.fn();
    renderCard(cluster, 0, onDisconnect);

    await user.click(screen.getByRole("button", { name: "Cluster actions for Production" }));
    const action = screen.getByRole("menuitem", { name: "Disconnect" });
    expect(action.closest("a")).toBeNull();
    await user.click(action);
    expect(onDisconnect).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("keeps a background disconnection visible on the card and resumes it", async () => {
    const user = userEvent.setup();
    const onDisconnect = vi.fn();
    renderCard(cluster, 0, onDisconnect, "uninstalling");

    const progress = screen.getByRole("button", { name: "Disconnecting · 2/3" });
    expect(progress.closest("a")).toBeNull();
    await user.click(progress);
    expect(onDisconnect).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Cluster actions for Production" }));
    expect(screen.getByRole("menuitem", { name: "View disconnection progress" })).toBeTruthy();
  });
});

function renderCard(
  value: HomeClusterChoice,
  index = 0,
  onDisconnect?: () => void,
  disconnectPhase?: "uninstalling",
  usage?: {
    observedAt: string | null;
    podsRunning: number;
    podsTotal: number;
    nodesReady: number;
    nodesTotal: number;
    restartCount: number;
    cpuPercent: number | null;
    memoryPercent: number | null;
  },
) {
  return render(
    <I18nProvider navigatorLanguage="en-US" storage={null}>
      <MemoryRouter>
        <ClusterCard
          cluster={value}
          href="/resources?clusters=cluster-1"
          index={index}
          disconnectPhase={disconnectPhase}
          onDisconnect={onDisconnect}
          usage={usage}
        />
      </MemoryRouter>
    </I18nProvider>,
  );
}

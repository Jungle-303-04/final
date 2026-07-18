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

describe("ClusterCard", () => {
  it("renders the canonical provider, verified metrics, and staggered card entrance", () => {
    const { container } = renderCard(cluster, 2);

    expect(screen.getByRole("img", { name: "Amazon Elastic Kubernetes Service" })
      .getAttribute("data-provider")).toBe("eks");
    expect(screen.getByText("Servers 8")).toBeTruthy();
    expect(screen.getByText("Pods 47")).toBeTruthy();
    expect(screen.getByText("Apps 6")).toBeTruthy();
    expect(screen.getByText("Incidents 1")).toBeTruthy();
    expect((container.querySelector("[data-cluster-id='cluster-1']") as HTMLElement).style.animationDelay)
      .toBe("140ms");
    expect(container.querySelectorAll("[data-morph-id]")).toHaveLength(0);
    const card = container.querySelector("[data-cluster-id='cluster-1']");
    expect(card?.className).not.toContain("hover:-translate");
    expect(card?.className).not.toContain("hover:shadow");
    const serverMetric = screen.getByText("Servers 8").parentElement;
    expect(serverMetric?.className).not.toContain("rounded");
    expect(serverMetric?.className).not.toContain("bg-muted");
    expect(serverMetric?.parentElement?.className).toContain("grid-cols-1");
    expect(serverMetric?.parentElement?.className).toContain("min-[26rem]:grid-cols-2");
    expect(serverMetric?.parentElement?.className).toContain("sm:grid-cols-4");
  });

  it("omits unknown counts instead of presenting them as zero", () => {
    renderCard({
      ...cluster,
      nodeCount: null,
      podCount: null,
      incidentCount: null,
      serverCount: null,
      appCount: null,
      openIncidentCount: null,
    });

    expect(screen.getByText("Servers —")).toBeTruthy();
    expect(screen.getByText("Pods —")).toBeTruthy();
    expect(screen.getByText("Apps —")).toBeTruthy();
    expect(screen.getByText("Incidents —")).toBeTruthy();
  });

  it("does not label a pending registration healthy before it connects", () => {
    renderCard({
      ...cluster,
      connectionState: "pending",
      registrationState: "pending",
      openIncidentCount: 0,
    });

    expect(screen.getByText("Waiting for connection")).toBeTruthy();
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
    expect(screen.getByText("Demo simulation")).toBeTruthy();
    expect(screen.getByText("Synthetic read-only evidence; cluster actions are unavailable.")).toBeTruthy();
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
        />
      </MemoryRouter>
    </I18nProvider>,
  );
}

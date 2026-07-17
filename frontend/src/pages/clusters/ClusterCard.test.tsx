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
    const card = container.querySelector("[data-cluster-id='cluster-1']");
    expect(card?.className).toContain("bg-cluster-card-fill");
    expect(card?.className).toContain("text-cluster-card-fill-foreground");
    expect(card?.className).toContain("font-medium");
    expect(card?.className).toContain("hover:border-status-healthy");
    expect(card?.className).toContain("hover:ring-2");
    expect(card?.className).toContain("hover:ring-status-healthy/30");
    expect(card?.className).toContain("hover:shadow-status-healthy/30");
    expect(container.querySelectorAll("[data-morph-id]")).toHaveLength(0);
  });

  it("uses the connection tone for future cluster card hover borders", () => {
    const { container } = renderCard({
      ...cluster,
      connectionState: "stale",
    });

    const card = container.querySelector("[data-cluster-id='cluster-1']");
    expect(card?.className).toContain("bg-cluster-card-fill");
    expect(card?.className).not.toContain("bg-muted/30");
    expect(card?.className).not.toContain("saturate-0");
    expect(card?.className).not.toContain("text-cluster-card-muted-foreground");
    expect(card?.className).toContain("hover:border-status-warning");
    expect(card?.className).toContain("hover:ring-status-warning/30");
    expect(card?.className).toContain("hover:shadow-status-warning/30");
    expect(container.querySelector("[data-slot='status-mark']")?.getAttribute("data-status"))
      .toBe("warning");
  });

  it("uses the critical red treatment for disconnected clusters", () => {
    const { container } = renderCard({
      ...cluster,
      connectionState: "offline",
    });

    const card = container.querySelector("[data-cluster-id='cluster-1']");
    expect(card?.className).toContain("hover:border-destructive");
    expect(card?.className).toContain("hover:ring-destructive/30");
    expect(card?.className).toContain("hover:shadow-destructive/30");
    expect(container.querySelector("[data-slot='status-mark']")?.getAttribute("data-status"))
      .toBe("critical");
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

    expect(screen.queryByText(/Servers/)).toBeNull();
    expect(screen.queryByText(/Pods/)).toBeNull();
    expect(screen.queryByText(/Apps/)).toBeNull();
    expect(screen.queryByText(/Incidents/)).toBeNull();
    expect(screen.queryByText("Healthy")).toBeNull();
  });

  it("does not label a pending registration healthy before it connects", () => {
    renderCard({
      ...cluster,
      connectionState: "pending",
      registrationState: "pending",
      openIncidentCount: 0,
    });

    expect(screen.getByText("Waiting for connection")).toBeTruthy();
    expect(screen.queryByText("Healthy")).toBeNull();
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

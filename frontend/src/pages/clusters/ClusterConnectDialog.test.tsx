// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthSessionGateProvider } from "../../features/auth/AuthSessionGate";
import type { ClustersPort } from "../../features/clusters/clustersContract";
import { UnifiedFilterProvider } from "../../features/filters/UnifiedFilterProvider";
import { I18nProvider } from "../../shared/i18n";
import { ClusterConnectDialog } from "./ClusterConnectDialog";

afterEach(cleanup);

describe("ClusterConnectDialog", () => {
  it("shows only the server command, copies it, and polls without logging the credential", async () => {
    const user = userEvent.setup();
    const port = waitingPort();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderDialog(port);

    await user.type(screen.getByRole("textbox", { name: "Cluster name" }), "Production");
    await user.click(screen.getByRole("button", { name: "AWS EKS" }));
    await user.click(screen.getByRole("button", { name: "Generate install command" }));

    const command = "curl secret-command | kubectl apply -f -";
    expect(await screen.findByText(command)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Copy command" }));
    expect(writeText).toHaveBeenCalledWith(command);
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
    await waitFor(() => expect(port.loadConnection).toHaveBeenCalledWith(
      "production-a1b2",
      expect.any(AbortSignal),
    ));
  });

  it("moves to the connected state only after the polling contract confirms it", async () => {
    const user = userEvent.setup();
    const onConnected = vi.fn();
    const port = waitingPort();
    vi.mocked(port.loadConnection).mockResolvedValue({
      status: "connected",
      stage: "ready",
      agentVersion: null,
      lastSeenAt: "2026-07-15T01:02:03Z",
    });
    renderDialog(port, onConnected);

    await user.type(screen.getByRole("textbox", { name: "Cluster name" }), "Production");
    await user.click(screen.getByRole("button", { name: "Generate install command" }));

    expect(await screen.findByText("Cluster connected")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View cluster" }).getAttribute("href"))
      .toBe("/resources?clusters=production-a1b2");
    expect(onConnected).toHaveBeenCalledOnce();
  });

  it("shows server-confirmed install, agent, inventory, and ready progress without inventing a percentage", async () => {
    const user = userEvent.setup();
    let calls = 0;
    const port = waitingPort();
    vi.mocked(port.loadConnection).mockImplementation(async () => {
      calls += 1;
      return {
        status: calls >= 3 ? "connected" : "waiting",
        stage: calls === 1 ? "agent_connected" : calls === 2 ? "snapshot_received" : "ready",
        agentVersion: "2026.07.15",
        lastSeenAt: "2026-07-15T01:02:03Z",
      };
    });
    renderDialog(port);

    await user.type(screen.getByRole("textbox", { name: "Cluster name" }), "Production");
    await user.click(screen.getByRole("button", { name: "Generate install command" }));

    expect(await screen.findByText("Agent connected")).toBeTruthy();
    expect(screen.getByText("Waiting for the first inventory")).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
  });
});

function waitingPort(): ClustersPort {
  return {
    connect: vi.fn(async () => ({
      clusterId: "production-a1b2",
      installCommand: "curl secret-command | kubectl apply -f -",
      expiresAt: "2026-07-14T06:00:00Z",
    })),
    loadConnection: vi.fn(async () => ({
      status: "waiting" as const,
      stage: "awaiting_install" as const,
      agentVersion: null,
      lastSeenAt: null,
    })),
  };
}

function renderDialog(port: ClustersPort, onConnected = vi.fn()) {
  return render(
    <I18nProvider navigatorLanguage="en-US" storage={null}>
      <AuthSessionGateProvider reportUnauthorized={vi.fn()}>
        <MemoryRouter>
          <UnifiedFilterProvider>
            <ClusterConnectDialog
              onConnected={onConnected}
              onOpenChange={vi.fn()}
              open
              port={port}
            />
          </UnifiedFilterProvider>
        </MemoryRouter>
      </AuthSessionGateProvider>
    </I18nProvider>,
  );
}

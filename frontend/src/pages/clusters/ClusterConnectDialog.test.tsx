// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClustersPort } from "../../features/clusters/clustersContract";
import {
  deferred,
  renderDialog,
  renderHarness,
  waitingPort,
} from "./tests/ClusterConnectDialog.testSupport";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("ClusterConnectDialog", () => {
  it("marks registration as busy and uses the shared reduced-motion-safe spinner", async () => {
    const user = userEvent.setup();
    const pending = deferred<Awaited<ReturnType<ClustersPort["connect"]>>>();
    const port = waitingPort();
    vi.mocked(port.connect).mockReturnValue(pending.promise);
    renderDialog(port);

    expect([
      "AWS EKS",
      "Google GKE",
      "Azure AKS",
      "Your servers",
    ].every((name) => screen.getByRole("button", { name }))).toBe(true);
    const dialog = screen.getByRole("dialog");
    screen.getByRole("button", { name: "Close" }).focus();
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.type(screen.getByRole("textbox", { name: "Cluster name" }), "Production");
    await user.click(screen.getByRole("button", { name: "Generate install command" }));

    const register = screen.getByRole("button", { name: "Generate install command" });
    const spinner = register.querySelector<HTMLElement>('[data-slot="spinner"]');
    expect(register.getAttribute("aria-busy")).toBe("true");
    expect(spinner?.classList.contains("motion-safe:animate-spin")).toBe(true);
    expect(spinner?.getAttribute("aria-hidden")).toBe("true");

    pending.resolve({
      clusterId: "production-a1b2",
      installCommand: "curl secret-command | kubectl apply -f -",
      expiresAt: "2026-07-14T06:00:00Z",
    });
    expect(await screen.findByText("curl secret-command | kubectl apply -f -")).toBeTruthy();
  });

  it("stores the selected environment in the real registration request", async () => {
    const user = userEvent.setup();
    const port = waitingPort();
    renderDialog(port);

    expect(screen.getByRole("button", { name: "Development" }).getAttribute("aria-pressed"))
      .toBe("true");
    await user.click(screen.getByRole("button", { name: "Production" }));
    await user.type(screen.getByRole("textbox", { name: "Cluster name" }), "Game Cluster");
    await user.click(screen.getByRole("button", { name: "Generate install command" }));

    expect(port.connect).toHaveBeenCalledWith({
      environment: "production",
      name: "Game Cluster",
      provider: "aws",
    }, expect.any(AbortSignal));
  });

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

  it("wraps the command without a horizontal scroller, keeps copy visible, and acknowledges it immediately", async () => {
    const user = userEvent.setup();
    let resolveClipboard: (() => void) | undefined;
    const writeText = vi.fn(() => new Promise<void>((resolve) => {
      resolveClipboard = resolve;
    }));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderDialog(waitingPort());

    await user.type(screen.getByRole("textbox", { name: "Cluster name" }), "Production");
    await user.click(screen.getByRole("button", { name: "Generate install command" }));

    const commandRegion = await screen.findByRole("region", { name: /Run this command/ });
    const commandSurface = commandRegion.closest('[data-command-surface="true"]');
    const copyButton = screen.getByRole("button", { name: "Copy command" });
    expect(commandSurface).not.toBeNull();
    expect(commandRegion.className).toContain("overflow-hidden");
    expect(commandRegion.className).not.toContain("overflow-x-auto");
    expect(commandRegion.querySelector("pre")?.className).toContain("whitespace-pre-wrap");
    expect(commandRegion.querySelector("pre")?.className).toContain("break-all");
    expect(commandRegion.contains(copyButton)).toBe(false);
    expect(commandSurface?.contains(copyButton)).toBe(true);
    expect(copyButton.className).toContain("shrink-0");

    await user.click(copyButton);
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
    expect(screen.getByText("Copied", { selector: "p" }).getAttribute("aria-live")).toBe("polite");
    resolveClipboard?.();
  });

  it("moves to the connected state only after the polling contract confirms it", async () => {
    const user = userEvent.setup();
    const onConnected = vi.fn();
    const port = waitingPort();
    vi.mocked(port.loadConnection).mockResolvedValue({
      status: "connected",
      stage: "ready",
      refreshAfterSeconds: null,
      agentVersion: null,
      lastSeenAt: "2026-07-15T01:02:03Z",
    });
    renderDialog(port, onConnected);

    await user.type(screen.getByRole("textbox", { name: "Cluster name" }), "Production");
    await user.click(screen.getByRole("button", { name: "Generate install command" }));

    expect(await screen.findByText("Cluster connected", {}, { timeout: 4_000 })).toBeTruthy();
    expect(screen.getByRole("link", { name: "View cluster" }).getAttribute("href"))
      .toBe("/resources?clusters=production-a1b2&view=map");
    expect(onConnected).toHaveBeenCalledOnce();
  });

  it("shows server-confirmed install, agent, inventory, and ready progress without inventing a percentage", async () => {
    const user = userEvent.setup();
    const port = waitingPort();
    vi.mocked(port.loadConnection).mockResolvedValue({
      status: "waiting",
      stage: "agent_connected",
      refreshAfterSeconds: 0.5,
      agentVersion: "2026.07.15",
      lastSeenAt: "2026-07-15T01:02:03Z",
    });
    renderDialog(port);

    await user.type(screen.getByRole("textbox", { name: "Cluster name" }), "Production");
    await user.click(screen.getByRole("button", { name: "Generate install command" }));

    expect(await screen.findByText("Agent connected")).toBeTruthy();
    expect(screen.getByText("Waiting for the first inventory")).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it("keeps a pending connection when the dialog closes and resumes polling when it reopens", async () => {
    const user = userEvent.setup();
    const port = waitingPort();
    let now = 100_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    renderHarness(port);

    await user.type(screen.getByRole("textbox", { name: "Cluster name" }), "Production");
    await user.click(screen.getByRole("button", { name: "Generate install command" }));
    expect(await screen.findByText("curl secret-command | kubectl apply -f -")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText("curl secret-command | kubectl apply -f -")).toBeNull();
    now += 14_000;
    await user.click(screen.getByRole("button", { name: "Connect a cluster" }));

    expect(await screen.findByText("curl secret-command | kubectl apply -f -")).toBeTruthy();
    expect(await screen.findByText("14s elapsed")).toBeTruthy();
    expect(port.connect).toHaveBeenCalledOnce();
    await waitFor(() => expect(port.loadConnection).toHaveBeenCalledTimes(2));
  });

  it("reissues an expired one-time command for the same pending registration", async () => {
    const user = userEvent.setup();
    const port = waitingPort();
    vi.mocked(port.loadConnection)
      .mockResolvedValueOnce({
        status: "expired",
        stage: "expired",
        refreshAfterSeconds: null,
        agentVersion: null,
        lastSeenAt: null,
      })
      .mockResolvedValue({
        status: "waiting",
        stage: "awaiting_install",
        refreshAfterSeconds: 0.5,
        agentVersion: null,
        lastSeenAt: null,
      });
    vi.mocked(port.reissue).mockResolvedValue({
      clusterId: "production-a1b2",
      installCommand: "curl rotated-command | kubectl apply -f -",
      expiresAt: "2026-07-15T07:00:00Z",
    });
    renderDialog(port);

    await user.type(screen.getByRole("textbox", { name: "Cluster name" }), "Production");
    await user.click(screen.getByRole("button", { name: "Generate install command" }));
    expect(await screen.findByText("Connection window expired")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Issue a new command" }));

    expect(port.reissue).toHaveBeenCalledWith("production-a1b2", expect.any(AbortSignal));
    expect(await screen.findByText("curl rotated-command | kubectl apply -f -")).toBeTruthy();
  });

  it("blocks a duplicate display name before issuing a credential", async () => {
    const user = userEvent.setup();
    const port = waitingPort();
    renderDialog(port, vi.fn(), ["  production  "]);

    await user.type(screen.getByRole("textbox", { name: "Cluster name" }), "Production");

    expect(screen.getByText("A cluster with this name already exists in this workspace.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Generate install command" }).hasAttribute("disabled"))
      .toBe(true);
    expect(port.connect).not.toHaveBeenCalled();
  });

  it("keeps the server-confirmed completion visible without inventing a second finalizing poll", async () => {
    const user = userEvent.setup();
    const onConnected = vi.fn();
    const onRegistered = vi.fn();
    const port = waitingPort();
    const connected = {
      status: "connected" as const,
      stage: "ready" as const,
      refreshAfterSeconds: null,
      agentVersion: "2026.07.15",
      lastSeenAt: "2026-07-15T01:02:03Z",
    };
    vi.mocked(port.loadConnection).mockResolvedValue(connected);
    renderHarness(port, onConnected, onRegistered);

    await user.type(screen.getByRole("textbox", { name: "Cluster name" }), "Production");
    fireEvent.click(screen.getByRole("button", { name: "Generate install command" }));

    await waitFor(() => expect(onRegistered).toHaveBeenCalledOnce());
    await waitFor(() => expect(onConnected).toHaveBeenCalledOnce());
    expect(port.loadConnection).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Cluster connected")).toBeTruthy();
    expect(screen.getByText("2026.07.15")).toBeTruthy();
    expect(screen.getByTestId("cluster-notification-probe").textContent)
      .toBe("cluster-connected:production-a1b2");
    expect(screen.getByRole("link", { name: "View cluster" }).getAttribute("href"))
      .toBe("/resources?clusters=production-a1b2&view=map");
  });

});

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthSessionGateProvider } from "../../features/auth/AuthSessionGate";
import type { ClustersPort } from "../../features/clusters/clustersContract";
import { UnifiedFilterProvider } from "../../features/filters/UnifiedFilterProvider";
import { I18nProvider } from "../../shared/i18n";
import { ClusterConnectDialog } from "./ClusterConnectDialog";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ClusterConnectDialog", () => {
  it("marks registration as busy and uses the shared reduced-motion-safe spinner", async () => {
    const user = userEvent.setup();
    const pending = deferred<Awaited<ReturnType<ClustersPort["connect"]>>>();
    const port = waitingPort();
    vi.mocked(port.connect).mockReturnValue(pending.promise);
    renderDialog(port);

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
      powershellInstallCommand: "curl secret-command | kubectl apply -f -",
      expiresAt: "2026-07-14T06:00:00Z",
    });
    expect(await screen.findByText("curl secret-command | kubectl apply -f -")).toBeTruthy();
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
      agentVersion: null,
      lastSeenAt: "2026-07-15T01:02:03Z",
    });
    renderDialog(port, onConnected);

    await user.type(screen.getByRole("textbox", { name: "Cluster name" }), "Production");
    await user.click(screen.getByRole("button", { name: "Generate install command" }));

    expect(await screen.findByText("Cluster connected", {}, { timeout: 4_000 })).toBeTruthy();
    expect(screen.getByRole("link", { name: "View cluster" }).getAttribute("href"))
      .toBe("/resources?clusters=production-a1b2");
    expect(onConnected).toHaveBeenCalledOnce();
  });

  it("shows server-confirmed install, agent, inventory, and ready progress without inventing a percentage", async () => {
    const user = userEvent.setup();
    const port = waitingPort();
    vi.mocked(port.loadConnection).mockResolvedValue({
      status: "waiting",
      stage: "agent_connected",
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
    await user.click(screen.getByRole("button", { name: "Open connection" }));

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
        agentVersion: null,
        lastSeenAt: null,
      })
      .mockResolvedValue({
        status: "waiting",
        stage: "awaiting_install",
        agentVersion: null,
        lastSeenAt: null,
      });
    vi.mocked(port.reissue).mockResolvedValue({
      clusterId: "production-a1b2",
      installCommand: "curl rotated-command | kubectl apply -f -",
      powershellInstallCommand: "curl rotated-command | kubectl apply -f -",
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

  it("shows the server-confirmed ready stage before revealing the completion screen", async () => {
    const user = userEvent.setup();
    const port = waitingPort();
    const connected = {
      status: "connected" as const,
      stage: "ready" as const,
      agentVersion: "2026.07.15",
      lastSeenAt: "2026-07-15T01:02:03Z",
    };
    let confirmReady: ((value: typeof connected) => void) | undefined;
    vi.mocked(port.loadConnection)
      .mockResolvedValueOnce(connected)
      .mockImplementationOnce(() => new Promise((resolve) => {
        confirmReady = resolve;
      }));
    renderDialog(port);

    await user.type(screen.getByRole("textbox", { name: "Cluster name" }), "Production");
    fireEvent.click(screen.getByRole("button", { name: "Generate install command" }));

    expect((await screen.findAllByText("Finalizing the connection")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Cluster connected")).toBeNull();
    await waitFor(() => expect(port.loadConnection).toHaveBeenCalledTimes(2), { timeout: 4_000 });
    confirmReady?.(connected);
    expect(await screen.findByText("Cluster connected", {}, { timeout: 4_000 })).toBeTruthy();
  });
});

function waitingPort(): ClustersPort {
  return {
    connect: vi.fn(async () => ({
      clusterId: "production-a1b2",
      installCommand: "curl secret-command | kubectl apply -f -",
      powershellInstallCommand: "curl secret-command | kubectl apply -f -",
      expiresAt: "2026-07-14T06:00:00Z",
    })),
    loadConnection: vi.fn(async () => ({
      status: "waiting" as const,
      stage: "awaiting_install" as const,
      agentVersion: null,
      lastSeenAt: null,
    })),
    reissue: vi.fn(async () => ({
      clusterId: "production-a1b2",
      installCommand: "curl rotated-command | kubectl apply -f -",
      powershellInstallCommand: "curl rotated-command | kubectl apply -f -",
      expiresAt: "2026-07-15T07:00:00Z",
    })),
  };
}

function renderDialog(
  port: ClustersPort,
  onConnected = vi.fn(),
  existingNames: readonly string[] = [],
) {
  return render(
    <I18nProvider navigatorLanguage="en-US" storage={null}>
      <AuthSessionGateProvider reportUnauthorized={vi.fn()}>
        <MemoryRouter>
          <UnifiedFilterProvider>
            <ClusterConnectDialog
              existingNames={existingNames}
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

function renderHarness(port: ClustersPort) {
  return render(
    <I18nProvider navigatorLanguage="en-US" storage={null}>
      <AuthSessionGateProvider reportUnauthorized={vi.fn()}>
        <MemoryRouter>
          <UnifiedFilterProvider>
            <ConnectionHarness port={port} />
          </UnifiedFilterProvider>
        </MemoryRouter>
      </AuthSessionGateProvider>
    </I18nProvider>,
  );
}

function ConnectionHarness({ port }: { port: ClustersPort }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button onClick={() => setOpen(true)} type="button">Open connection</button>
      <ClusterConnectDialog
        existingNames={[]}
        onConnected={vi.fn()}
        onOpenChange={setOpen}
        open={open}
        port={port}
      />
    </>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve;
  });
  return { promise, resolve };
}

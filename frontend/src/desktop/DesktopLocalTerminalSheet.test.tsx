// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  isDesktop: true,
  capabilities: vi.fn(),
  startLocalTerminal: vi.fn(),
  sendLocalTerminalInput: vi.fn(),
  resizeLocalTerminal: vi.fn(),
  closeLocalTerminal: vi.fn(),
  onLocalTerminalEvent: vi.fn(),
}));

vi.mock("./desktopBridge", () => ({ desktopBridge: bridge }));

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    loadAddon = vi.fn();
    open = vi.fn();
    focus = vi.fn();
    write = vi.fn();
    dispose = vi.fn();
    onData = vi.fn(() => ({ dispose: vi.fn() }));
  },
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit = vi.fn();
  },
}));

vi.mock("@xterm/addon-web-links", () => ({
  WebLinksAddon: class {},
}));

import { DesktopLocalTerminalSheet } from "./DesktopLocalTerminalSheet";
import { I18nProvider } from "../shared/i18n";

class ResizeObserverStub {
  disconnect = vi.fn();
  observe = vi.fn();
}

beforeEach(() => {
  bridge.isDesktop = true;
  bridge.capabilities.mockResolvedValue({ localTerminal: { state: "available" } });
  bridge.startLocalTerminal.mockResolvedValue({ sessionId: "session-1", shell: "/bin/sh" });
  bridge.sendLocalTerminalInput.mockResolvedValue(undefined);
  bridge.resizeLocalTerminal.mockResolvedValue(undefined);
  bridge.closeLocalTerminal.mockResolvedValue(undefined);
  bridge.onLocalTerminalEvent.mockResolvedValue(vi.fn());
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("DesktopLocalTerminalSheet", () => {
  it("does not expose the native terminal in a browser runtime", async () => {
    bridge.isDesktop = false;
    renderTerminal();

    await Promise.resolve();
    expect(screen.queryByRole("button", { name: "Open local terminal" })).toBeNull();
    expect(bridge.capabilities).not.toHaveBeenCalled();
  });

  it("starts the opaque native PTY only after a desktop capability allows it", async () => {
    renderTerminal();

    const opener = await screen.findByRole("button", { name: "Open local terminal" });
    fireEvent.click(opener);

    await waitFor(() => {
      expect(bridge.startLocalTerminal).toHaveBeenCalledWith({ columns: 80, rows: 24 });
    });
    expect(await screen.findByText("Local terminal")).toBeTruthy();
    expect(bridge.onLocalTerminalEvent).toHaveBeenCalledTimes(1);
  });

  it("installs the native event listener before starting the PTY", async () => {
    let installListener: ((unlisten: () => void) => void) | undefined;
    bridge.onLocalTerminalEvent.mockImplementation(() => new Promise((resolve) => {
      installListener = resolve;
    }));
    renderTerminal();

    fireEvent.click(await screen.findByRole("button", { name: "Open local terminal" }));
    await waitFor(() => expect(bridge.onLocalTerminalEvent).toHaveBeenCalledTimes(1));
    expect(bridge.startLocalTerminal).not.toHaveBeenCalled();

    installListener?.(vi.fn());
    await waitFor(() => expect(bridge.startLocalTerminal).toHaveBeenCalledTimes(1));
  });
});

function renderTerminal() {
  return render(
    <I18nProvider navigatorLanguage="en-US" storage={null}>
      <DesktopLocalTerminalSheet />
    </I18nProvider>,
  );
}

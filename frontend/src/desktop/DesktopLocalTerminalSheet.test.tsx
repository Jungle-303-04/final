// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";

const bridge = vi.hoisted(() => ({
  isDesktop: true,
  capabilities: vi.fn(),
  startLocalTerminal: vi.fn(),
  sendLocalTerminalInput: vi.fn(),
  resizeLocalTerminal: vi.fn(),
  closeLocalTerminal: vi.fn(),
  acknowledgeLocalTerminalOutput: vi.fn(),
  onLocalTerminalEvent: vi.fn(),
  terminalListener: undefined as ((event: {
    sessionId: string;
    kind: "output" | "exit" | "error";
    data?: string;
    byteLength?: number;
    exitCode?: number;
    message?: string;
  }) => void) | undefined,
}));
const xterm = vi.hoisted(() => ({
  constructorOptions: undefined as { cursorBlink?: boolean } | undefined,
  inputListener: undefined as ((data: string) => void) | undefined,
  keyHandler: undefined as ((event: KeyboardEvent) => boolean) | undefined,
  write: vi.fn(),
  focus: vi.fn(),
}));
const resizeObserver = vi.hoisted(() => ({
  notify: undefined as (() => void) | undefined,
}));

vi.mock("./desktopBridge", () => ({ desktopBridge: bridge }));

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    constructor(options: { cursorBlink?: boolean }) {
      xterm.constructorOptions = options;
    }
    loadAddon = vi.fn();
    open = vi.fn();
    focus = xterm.focus;
    write = xterm.write;
    dispose = vi.fn();
    attachCustomKeyEventHandler = vi.fn((handler: (event: KeyboardEvent) => boolean) => {
      xterm.keyHandler = handler;
    });
    onData = vi.fn((listener: (data: string) => void) => {
      xterm.inputListener = listener;
      return { dispose: vi.fn() };
    });
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
  constructor(callback: ResizeObserverCallback) {
    resizeObserver.notify = () => callback([], this as unknown as ResizeObserver);
  }
  disconnect = vi.fn();
  observe = vi.fn();
}

beforeEach(() => {
  bridge.isDesktop = true;
  bridge.capabilities.mockResolvedValue({ localTerminal: { state: "available" } });
  bridge.startLocalTerminal.mockResolvedValue({
    sessionId: "session-1",
    shell: "/bin/sh",
    outputWindowBytes: 128 * 1024,
    outputFrameBytes: 32 * 1024,
  });
  bridge.sendLocalTerminalInput.mockResolvedValue(undefined);
  bridge.resizeLocalTerminal.mockResolvedValue(undefined);
  bridge.closeLocalTerminal.mockResolvedValue(undefined);
  bridge.acknowledgeLocalTerminalOutput.mockResolvedValue(undefined);
  bridge.onLocalTerminalEvent.mockImplementation(async (listener) => {
    bridge.terminalListener = listener;
    return vi.fn();
  });
  bridge.terminalListener = undefined;
  xterm.constructorOptions = undefined;
  xterm.inputListener = undefined;
  xterm.keyHandler = undefined;
  xterm.write.mockReset();
  xterm.write.mockImplementation((_data: string, callback?: () => void) => callback?.());
  xterm.focus.mockReset();
  resizeObserver.notify = undefined;
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
    queueMicrotask(() => callback(0));
    return 1;
  }));
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
    expect(screen.getByRole("button", { name: "Close local terminal" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Connected");
  });

  it("does not spawn a duplicate local shell during StrictMode effect preflight", async () => {
    renderTerminal({ strictMode: true });

    fireEvent.click(await screen.findByRole("button", { name: "Open local terminal" }));
    await waitFor(() => expect(bridge.startLocalTerminal).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(bridge.startLocalTerminal).toHaveBeenCalledTimes(1);
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

  it("writes native output but never renders a native error message", async () => {
    const rendered = renderTerminal();
    await openTerminal();

    bridge.terminalListener?.({ sessionId: "session-1", kind: "output", data: "ready\r\n", byteLength: 7 });
    await waitFor(() => expect(xterm.write).toHaveBeenCalledWith("ready\r\n", expect.any(Function)));
    expect(bridge.acknowledgeLocalTerminalOutput).toHaveBeenCalledWith({ sessionId: "session-1", byteLength: 7 });

    bridge.terminalListener?.({
      sessionId: "session-1",
      kind: "error",
      message: "native local path /private/diagnostic",
    });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("reported an error");
    expect(alert.textContent).not.toContain("/private/diagnostic");
    expect(screen.getByRole("status").textContent).toContain("Local terminal failed");

    rendered.unmount();
    expect(bridge.closeLocalTerminal).not.toHaveBeenCalled();
  });

  it("closes the owned PTY when the renderer cannot acknowledge a bounded output batch", async () => {
    renderTerminal();
    await openTerminal();
    bridge.acknowledgeLocalTerminalOutput.mockRejectedValue(new Error("native acknowledgement failed"));

    bridge.terminalListener?.({ sessionId: "session-1", kind: "output", data: "ready", byteLength: 5 });

    await waitFor(() => expect(bridge.closeLocalTerminal).toHaveBeenCalledWith("session-1"));
    expect(screen.getByRole("status").textContent).toContain("Local terminal failed");
  });

  it("does not flush queued terminal output after the sheet closes", async () => {
    let queuedFrame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      queuedFrame = callback;
      return 17;
    }));
    renderTerminal();
    const opener = await openTerminal();
    xterm.write.mockClear();

    bridge.terminalListener?.({ sessionId: "session-1", kind: "output", data: "late", byteLength: 4 });
    fireEvent.click(screen.getByRole("button", { name: "Close local terminal" }));
    queuedFrame?.(0);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(xterm.write).not.toHaveBeenCalled();
    expect(bridge.acknowledgeLocalTerminalOutput).not.toHaveBeenCalled();
    expect(bridge.closeLocalTerminal).toHaveBeenCalledWith("session-1");
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it("keeps a bridge start error out of the rendered UI", async () => {
    bridge.startLocalTerminal.mockRejectedValue(new Error("native local path /private/diagnostic"));
    renderTerminal();
    fireEvent.click(await screen.findByRole("button", { name: "Open local terminal" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not start the local shell");
    expect(alert.textContent).not.toContain("/private/diagnostic");
  });

  it("keeps a successful exit final and stops input, resize, and cleanup close calls", async () => {
    const rendered = renderTerminal();
    await openTerminal();
    const resizeCallsBeforeExit = bridge.resizeLocalTerminal.mock.calls.length;

    bridge.terminalListener?.({ sessionId: "session-1", kind: "exit", exitCode: 0 });
    expect(await screen.findByText("Shell exited")).toBeTruthy();
    xterm.inputListener?.("echo should-not-send\r");
    resizeObserver.notify?.();
    expect(bridge.sendLocalTerminalInput).not.toHaveBeenCalled();
    expect(bridge.resizeLocalTerminal).toHaveBeenCalledTimes(resizeCallsBeforeExit);

    rendered.unmount();
    expect(bridge.closeLocalTerminal).not.toHaveBeenCalled();
  });

  it("maps a nonzero exit code to an accessible safe failure", async () => {
    renderTerminal();
    await openTerminal();

    bridge.terminalListener?.({
      sessionId: "session-1",
      kind: "exit",
      exitCode: 23,
      message: "native path /private/diagnostic",
    });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("code 23");
    expect(alert.textContent).not.toContain("/private/diagnostic");
    expect(screen.getByRole("status").textContent).toContain("Local terminal failed");
  });

  it("starts a new session after a final exit", async () => {
    renderTerminal();
    await openTerminal();
    bridge.terminalListener?.({ sessionId: "session-1", kind: "exit", exitCode: 0 });
    fireEvent.click(await screen.findByRole("button", { name: "Start a new shell" }));

    await waitFor(() => expect(bridge.startLocalTerminal).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("status").textContent).toContain("Connected");
  });

  it("keeps plain Escape in the shell but Alt+Escape closes and restores opener focus", async () => {
    renderTerminal();
    const opener = await openTerminal();
    expect(xterm.keyHandler?.(new KeyboardEvent("keydown", { key: "Escape" }))).toBe(true);
    expect(screen.getByRole("dialog")).toBeTruthy();

    expect(xterm.keyHandler?.(new KeyboardEvent("keydown", { altKey: true, key: "Escape" }))).toBe(false);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
    expect(bridge.closeLocalTerminal).toHaveBeenCalledTimes(1);
  });

  it("lets a keyboard user close through the visible sheet control", async () => {
    renderTerminal();
    const opener = await openTerminal();
    fireEvent.click(screen.getByRole("button", { name: "Close local terminal" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
    expect(bridge.closeLocalTerminal).toHaveBeenCalledTimes(1);
  });

  it("uses one native close for the pointer path without synthesizing a click", async () => {
    renderTerminal();
    const opener = await openTerminal();
    const close = screen.getByRole("button", { name: "Close local terminal" });

    fireEvent.pointerDown(close);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
    expect(bridge.closeLocalTerminal).toHaveBeenCalledTimes(1);
  });

  it("disables terminal cursor blinking when reduced motion is preferred", async () => {
    vi.stubGlobal("matchMedia", () => ({
      addEventListener: vi.fn(),
      matches: true,
      removeEventListener: vi.fn(),
    }));
    renderTerminal();
    await openTerminal();

    expect(xterm.constructorOptions?.cursorBlink).toBe(false);
  });
});

async function openTerminal(): Promise<HTMLButtonElement> {
  const opener = await screen.findByRole("button", { name: "Open local terminal" });
  fireEvent.click(opener);
  await waitFor(() => expect(bridge.startLocalTerminal).toHaveBeenCalledWith({ columns: 80, rows: 24 }));
  return opener as HTMLButtonElement;
}

function renderTerminal({ strictMode = false }: { strictMode?: boolean } = {}) {
  const tree = (
    <I18nProvider navigatorLanguage="en-US" storage={null}>
      <DesktopLocalTerminalSheet />
    </I18nProvider>
  );
  return render(strictMode ? <StrictMode>{tree}</StrictMode> : tree);
}

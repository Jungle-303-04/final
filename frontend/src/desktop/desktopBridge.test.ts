import { describe, expect, it, vi } from "vitest";

import {
  DESKTOP_COMMAND,
  createDesktopBridge,
  type DesktopCapabilitySet,
} from "./desktopBridge";

const CAPABILITIES: DesktopCapabilitySet = {
  platform: "linux",
  activeClusterTitle: { state: "available" },
  nativeMenu: { state: "available" },
  systemTheme: { state: "available" },
  externalUrl: { state: "available" },
  safeFile: { state: "available" },
  localTerminal: { state: "unsupported", reason: "Not implemented." },
  updater: { state: "unsupported", reason: "Not implemented." },
};

describe("desktopBridge", () => {
  it("keeps browser mode honest about unavailable native capabilities", async () => {
    const bridge = createDesktopBridge(undefined);

    expect(bridge.isDesktop).toBe(false);
    await expect(bridge.capabilities()).resolves.toMatchObject({
      platform: "browser",
      localTerminal: { state: "unsupported" },
      updater: { state: "unsupported" },
    });
  });

  it("uses typed native commands without routing local work through the API", async () => {
    const calls: Array<{ command: string; args: Record<string, unknown> | undefined }> = [];
    const invoke = async <T,>(
      command: string,
      args?: Record<string, unknown>,
    ): Promise<T> => {
      calls.push({ command, args });
      // The bridge has two result shapes in this exercise: the capability
      // command returns the declared fixture; the remaining commands resolve
      // as void. The cast is confined to this protocol-aware test double.
      return (command === DESKTOP_COMMAND.capabilities ? CAPABILITIES : undefined) as T;
    };
    const bridge = createDesktopBridge({ core: { invoke } });

    await bridge.setActiveClusterTitle({ clusterId: "cluster-a", displayName: "Production" });
    await bridge.openExternalUrl("https://docs.example.test/guide");
    await expect(bridge.capabilities()).resolves.toEqual(CAPABILITIES);

    expect(calls).toEqual([
      {
        command: DESKTOP_COMMAND.setActiveClusterTitle,
        args: { request: { clusterId: "cluster-a", displayName: "Production" } },
      },
      {
        command: DESKTOP_COMMAND.openExternalUrl,
        args: { request: { url: "https://docs.example.test/guide" } },
      },
      { command: DESKTOP_COMMAND.capabilities, args: undefined },
    ]);
  });

  it("rejects unsafe external protocols before they reach the native process", async () => {
    const invoke = vi.fn();
    const bridge = createDesktopBridge({ core: { invoke } });

    await expect(bridge.openExternalUrl("file:///tmp/report")).rejects.toThrow("HTTP(S)");
    await expect(bridge.openExternalUrl("https://user:pass@example.test")).rejects.toThrow("HTTP(S)");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("removes a native menu subscription when its consumer unmounts", async () => {
    let emit: ((payload: { payload: unknown }) => void) | undefined;
    const removeListener = vi.fn();
    const bridge = createDesktopBridge({
      core: { invoke: vi.fn() },
      event: {
        listen: vi.fn(async (_event, listener) => {
          emit = listener;
          return removeListener;
        }),
      },
    });
    const listener = vi.fn();
    const dispose = bridge.onMenuAction(listener);
    await Promise.resolve();

    emit?.({ payload: "settings" });
    dispose();
    await Promise.resolve();
    emit?.({ payload: "reload" });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("settings");
    expect(removeListener).toHaveBeenCalledTimes(1);
  });
});

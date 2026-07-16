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
  localTerminal: { state: "available" },
  portForwardSessions: { state: "available" },
  updater: { state: "unsupported", reason: "Not implemented." },
};

describe("desktopBridge", () => {
  it("keeps browser mode honest about unavailable native capabilities", async () => {
    const bridge = createDesktopBridge(undefined);

    expect(bridge.isDesktop).toBe(false);
    await expect(bridge.capabilities()).resolves.toMatchObject({
      platform: "browser",
      localTerminal: { state: "unsupported" },
      portForwardSessions: { state: "unsupported" },
      updater: { state: "unsupported" },
    });
  });

  it("lists and stops only native-owned port-forward sessions through typed commands", async () => {
    const calls: Array<{ command: string; args: Record<string, unknown> | undefined }> = [];
    const invoke = async <T,>(
      command: string,
      args?: Record<string, unknown>,
    ): Promise<T> => {
      calls.push({ command, args });
      return (command === DESKTOP_COMMAND.portForwardSessions ? [{
          id: "0d47b74f-4218-4f5a-a149-53bfb0610217",
          workspaceId: "workspace-a",
          clusterId: "cluster-a",
          freshness: "live",
          namespace: "shop",
          resourceKind: "Service",
          resourceName: "checkout",
          resourceUid: "uid-service-1",
          podName: null,
          podPort: 8080,
          localPort: 18080,
          listenAddress: "127.0.0.1",
          serviceName: "checkout",
          servicePort: 80,
          scheme: "http",
          startedAt: "2026-07-17T03:00:00Z",
          status: "running",
          error: null,
          exitCode: null,
        }] : undefined) as T;
    };
    const bridge = createDesktopBridge({ core: { invoke } });

    await expect(bridge.listPortForwardSessions()).resolves.toHaveLength(1);
    await bridge.stopPortForwardSession("0d47b74f-4218-4f5a-a149-53bfb0610217");

    expect(calls).toEqual([
      { command: DESKTOP_COMMAND.portForwardSessions, args: undefined },
      {
        command: DESKTOP_COMMAND.portForwardStop,
        args: { request: { sessionId: "0d47b74f-4218-4f5a-a149-53bfb0610217" } },
      },
    ]);
  });

  it("starts and recreates an exact confirmed native port-forward request", async () => {
    const calls: Array<{ command: string; args: Record<string, unknown> | undefined }> = [];
    const receipt = {
      sessionId: "0d47b74f-4218-4f5a-a149-53bfb0610217",
      generation: 4,
      localPort: 18_080,
      startedAt: "2026-07-17T03:00:00Z",
    };
    const invoke = async <T,>(
      command: string,
      args?: Record<string, unknown>,
    ): Promise<T> => {
      calls.push({ command, args });
      return receipt as T;
    };
    const bridge = createDesktopBridge({ core: { invoke } });
    const request = {
      scope: {
        workspaceId: "workspace-a",
        clusterId: "cluster-a",
        namespaces: ["shop"],
        freshness: "live" as const,
      },
      resource: {
        apiGroup: "" as const,
        version: "v1" as const,
        kind: "Service" as const,
        namespace: "shop",
        name: "checkout",
        uid: "uid-service-1",
      },
      remotePort: 80,
      localPort: 18_080,
      listenAddress: "127.0.0.1" as const,
      confirmation: true as const,
    };

    await expect(bridge.startPortForward(request)).resolves.toEqual(receipt);
    await expect(bridge.recreatePortForward(receipt.sessionId)).resolves.toEqual(receipt);

    expect(calls).toEqual([
      { command: DESKTOP_COMMAND.portForwardStart, args: { request } },
      {
        command: DESKTOP_COMMAND.portForwardRecreate,
        args: { request: { sessionId: receipt.sessionId, confirmation: true } },
      },
    ]);
  });

  it("does not treat the legacy window global as a desktop capability", async () => {
    const globalWithLegacyGlobal = globalThis as typeof globalThis & { __TAURI__?: unknown };
    globalWithLegacyGlobal.__TAURI__ = { core: { invoke: vi.fn() } };

    const bridge = createDesktopBridge(undefined);

    expect(bridge.isDesktop).toBe(false);
    await expect(bridge.startLocalTerminal({ columns: 80, rows: 24 })).rejects.toThrow("Local PTY");
    delete globalWithLegacyGlobal.__TAURI__;
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

  it("keeps local PTY input, resize, and close inside typed desktop commands", async () => {
    const calls: Array<{ command: string; args: Record<string, unknown> | undefined }> = [];
    const invoke = async <T,>(command: string, args?: Record<string, unknown>): Promise<T> => {
      calls.push({ command, args });
      if (command === DESKTOP_COMMAND.localTerminalStart) {
        return {
          sessionId: "session-1",
          shell: "/bin/sh",
          outputWindowBytes: 128 * 1024,
          outputFrameBytes: 32 * 1024,
        } as T;
      }
      return undefined as T;
    };
    const bridge = createDesktopBridge({ core: { invoke } });

    await expect(bridge.startLocalTerminal({ columns: 120, rows: 32 })).resolves.toEqual({
      sessionId: "session-1",
      shell: "/bin/sh",
      outputWindowBytes: 128 * 1024,
      outputFrameBytes: 32 * 1024,
    });
    await bridge.sendLocalTerminalInput({ sessionId: "session-1", data: "kubectl get pods\r" });
    await bridge.resizeLocalTerminal({ sessionId: "session-1", columns: 140, rows: 40 });
    await bridge.closeLocalTerminal("session-1");
    await bridge.acknowledgeLocalTerminalOutput({ sessionId: "session-1", byteLength: 128 });

    expect(calls).toEqual([
      {
        command: DESKTOP_COMMAND.localTerminalStart,
        args: { request: { columns: 120, rows: 32 } },
      },
      {
        command: DESKTOP_COMMAND.localTerminalInput,
        args: { request: { sessionId: "session-1", data: "kubectl get pods\r" } },
      },
      {
        command: DESKTOP_COMMAND.localTerminalResize,
        args: { request: { sessionId: "session-1", columns: 140, rows: 40 } },
      },
      {
        command: DESKTOP_COMMAND.localTerminalClose,
        args: { request: { sessionId: "session-1" } },
      },
      {
        command: DESKTOP_COMMAND.localTerminalAckOutput,
        args: { request: { sessionId: "session-1", byteLength: 128 } },
      },
    ]);
  });

  it("delivers only well-formed native local terminal events and removes its listener", async () => {
    let emit: ((payload: { payload: unknown }) => void) | undefined;
    const removeListener = vi.fn();
    const bridge = createDesktopBridge({
      core: { invoke: vi.fn() },
      event: {
        listen: vi.fn(async (event, listener) => {
          expect(event).toBe("desktop:local-terminal");
          emit = listener;
          return removeListener;
        }),
      },
    });
    const listener = vi.fn();
    const dispose = await bridge.onLocalTerminalEvent(listener);

    emit?.({ payload: { sessionId: "session-1", kind: "output", data: "ready", byteLength: 5 } });
    emit?.({ payload: { sessionId: "session-1", kind: "output" } });
    emit?.({ payload: { sessionId: "session-1", kind: "output", data: "invalid", byteLength: 0 } });
    dispose();
    await Promise.resolve();
    emit?.({ payload: { sessionId: "session-1", kind: "exit", exitCode: 0 } });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      sessionId: "session-1",
      kind: "output",
      data: "ready",
      byteLength: 5,
    });
    expect(removeListener).toHaveBeenCalledTimes(1);
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

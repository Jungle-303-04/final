import { describe, expect, it, vi } from "vitest";

import { createPortForwardSessionAdapter } from "./createPortForwardSessionAdapter";

function desktopBoundary(isDesktop = true) {
  return {
    isDesktop,
    capabilities: vi.fn().mockResolvedValue({
      portForwardSessions: {
        state: "unsupported" as const,
        reason: "agent-backed port-forward tunnel is unavailable",
      },
    }),
    listPortForwardSessions: vi.fn(),
    startPortForward: vi.fn(),
    stopPortForwardSession: vi.fn(),
    recreatePortForward: vi.fn(),
  };
}

describe("createPortForwardSessionAdapter", () => {
  it("fails closed without invoking the native boundary until the agent tunnel exists", async () => {
    const desktop = desktopBoundary();
    const adapter = createPortForwardSessionAdapter(desktop);

    expect(adapter.available).toBe(false);
    await expect(adapter.list()).rejects.toThrow("agent-backed");
    await expect(adapter.start({} as never)).rejects.toThrow("agent-backed");
    await expect(adapter.stop("session-a")).rejects.toThrow("agent-backed");
    await expect(adapter.recreate("session-a")).rejects.toThrow("agent-backed");

    expect(desktop.capabilities).not.toHaveBeenCalled();
    expect(desktop.listPortForwardSessions).not.toHaveBeenCalled();
    expect(desktop.startPortForward).not.toHaveBeenCalled();
    expect(desktop.stopPortForwardSession).not.toHaveBeenCalled();
    expect(desktop.recreatePortForward).not.toHaveBeenCalled();
  });

  it("does not infer target transport authority from desktop presence", () => {
    expect(createPortForwardSessionAdapter(desktopBoundary(true)).available).toBe(false);
    expect(createPortForwardSessionAdapter(desktopBoundary(false)).available).toBe(false);
  });
});

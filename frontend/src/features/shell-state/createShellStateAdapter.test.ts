import { describe, expect, it, vi } from "vitest";

import { createShellStateAdapter } from "./createShellStateAdapter";

describe("createShellStateAdapter", () => {
  it("maps namespace scope and user preferences behind one authenticated port", async () => {
    const adapter = createShellStateAdapter({
      getNamespaceScope: vi.fn().mockResolvedValue({
        cluster_id: "cluster-a",
        actives: ["shop"],
        revision: 2,
      }),
      updateNamespaceScope: vi.fn(),
      getUiPreferences: vi.fn().mockResolvedValue({
        preferences: { theme: "dark", locale: "ko" },
        revision: 3,
      }),
      updateUiPreferences: vi.fn(),
    });

    await expect(adapter.getNamespaceScope("cluster-a")).resolves.toEqual({
      clusterId: "cluster-a",
      activeNamespaces: ["shop"],
      revision: 2,
    });
    await expect(adapter.getUiPreferences()).resolves.toEqual({
      preferences: { theme: "dark", locale: "ko" },
      revision: 3,
    });
  });

  it("turns optimistic revision conflicts into a feature-owned failure", async () => {
    const adapter = createShellStateAdapter({
      getNamespaceScope: vi.fn(),
      updateNamespaceScope: vi.fn().mockRejectedValue({ status: 409 }),
      getUiPreferences: vi.fn(),
      updateUiPreferences: vi.fn(),
    });

    await expect(adapter.updateNamespaceScope({
      clusterId: "cluster-a",
      namespaces: ["shop"],
      expectedRevision: 1,
    })).rejects.toMatchObject({ code: "conflict" });
  });
});

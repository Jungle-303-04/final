import { describe, expect, it, vi } from "vitest";

import { createBrowserRefreshPolicyRegistry } from "./browserRefreshPolicyRegistry";

describe("browser refresh policy registry", () => {
  it("maps and caches one complete successful server inventory for every consumer", async () => {
    const load = vi.fn().mockResolvedValue({
      revision: "a".repeat(64),
      policies: {
        changes: { refresh_after_seconds: 15 },
        resource_list: { refresh_after_seconds: 60 },
      },
    });
    const registry = createBrowserRefreshPolicyRegistry({
      load,
      map: (wire: { refresh_after_seconds: number }) => ({
        staleAfterSeconds: null,
        refreshAfterSeconds: wire.refresh_after_seconds,
        keepLastSuccess: true as const,
        pauseWhenHidden: true as const,
        eventInvalidation: false,
        retryAfterSeconds: null,
        retryLimit: null,
        postMutationRefreshAfterSeconds: null,
      }),
    });

    await expect(registry.getPolicy("changes")).resolves.toMatchObject({
      refreshAfterSeconds: 15,
    });
    await expect(registry.getPolicy("resource_list")).resolves.toMatchObject({
      refreshAfterSeconds: 60,
    });
    expect(load).toHaveBeenCalledOnce();
  });

  it("does not cache a failed inventory request", async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        revision: "b".repeat(64),
        policies: { changes: { refresh_after_seconds: 15 } },
      });
    const registry = createBrowserRefreshPolicyRegistry({
      load,
      map: (wire: { refresh_after_seconds: number }) => ({
        staleAfterSeconds: null,
        refreshAfterSeconds: wire.refresh_after_seconds,
        keepLastSuccess: true as const,
        pauseWhenHidden: true as const,
        eventInvalidation: false,
        retryAfterSeconds: null,
        retryLimit: null,
        postMutationRefreshAfterSeconds: null,
      }),
    });

    await expect(registry.getPolicy("changes")).rejects.toThrow("offline");
    await expect(registry.getPolicy("changes")).resolves.toMatchObject({
      refreshAfterSeconds: 15,
    });
    expect(load).toHaveBeenCalledTimes(2);
  });
});

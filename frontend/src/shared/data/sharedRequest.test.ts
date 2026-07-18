import { afterEach, describe, expect, it, vi } from "vitest";

import { acquireSharedRequest } from "./sharedRequest";

afterEach(() => {
  vi.useRealTimers();
});

describe("acquireSharedRequest", () => {
  it("deduplicates concurrent consumers and aborts only after the final release", async () => {
    const owner = {};
    const load = vi.fn(async (signal: AbortSignal) => {
      await Promise.resolve();
      return signal.aborted ? "aborted" : "ready";
    });

    const first = acquireSharedRequest(owner, "resource:a", load);
    const second = acquireSharedRequest(owner, "resource:a", load);

    expect(load).toHaveBeenCalledTimes(1);
    expect(await first.promise).toBe("ready");
    expect(await second.promise).toBe("ready");
    first.release();
    second.release();
    await Promise.resolve();
  });

  it("retains only successful reads for rapid detail navigation", async () => {
    vi.useFakeTimers();
    const owner = {};
    const load = vi.fn().mockResolvedValue({ name: "aws-node" });

    const first = acquireSharedRequest(owner, "detail:aws-node", load, { retainForMs: 1_000 });
    await first.promise;
    first.release();
    await Promise.resolve();

    const cached = acquireSharedRequest(owner, "detail:aws-node", load, { retainForMs: 1_000 });
    expect(await cached.promise).toEqual({ name: "aws-node" });
    expect(load).toHaveBeenCalledTimes(1);
    cached.release();
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(1_001);
    const refreshed = acquireSharedRequest(owner, "detail:aws-node", load, { retainForMs: 1_000 });
    expect(await refreshed.promise).toEqual({ name: "aws-node" });
    expect(load).toHaveBeenCalledTimes(2);
    refreshed.release();
  });

  it("never caches a rejected detail read", async () => {
    const owner = {};
    const load = vi.fn()
      .mockRejectedValueOnce(new Error("temporarily unavailable"))
      .mockResolvedValueOnce("recovered");

    const failed = acquireSharedRequest(owner, "detail:pod-a", load, { retainForMs: 10_000 });
    await expect(failed.promise).rejects.toThrow("temporarily unavailable");
    failed.release();
    await Promise.resolve();

    const recovered = acquireSharedRequest(owner, "detail:pod-a", load, { retainForMs: 10_000 });
    await expect(recovered.promise).resolves.toBe("recovered");
    expect(load).toHaveBeenCalledTimes(2);
    recovered.release();
  });
});

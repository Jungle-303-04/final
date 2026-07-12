import { describe, expect, it, vi } from "vitest";
import type { HomePort } from "../../features/home/homeContract";
import { acquireHomeRequest } from "./homeRequest";

describe("Home request coordinator", () => {
  it("shares an in-flight request across StrictMode reacquisition", async () => {
    let resolveRequest: ((value: string) => void) | undefined;
    const load = vi.fn((_signal: AbortSignal) => new Promise<string>((resolve) => {
      resolveRequest = resolve;
    }));
    const port = {} as HomePort;

    const first = acquireHomeRequest(port, "clusters", load);
    first.release();
    const second = acquireHomeRequest(port, "clusters", load);

    expect(load).toHaveBeenCalledOnce();
    resolveRequest?.("ready");
    await expect(second.promise).resolves.toBe("ready");
    second.release();
    await Promise.resolve();
  });

  it("aborts a pending request after its last consumer releases", async () => {
    const load = vi.fn((signal: AbortSignal) => new Promise<never>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    const port = {} as HomePort;
    const request = acquireHomeRequest(port, "nodes:cluster-1", load);

    request.release();
    await expect(request.promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("starts a fresh request after a settled request has no consumers", async () => {
    const load = vi.fn().mockResolvedValue("ready");
    const port = {} as HomePort;
    const first = acquireHomeRequest(port, "clusters", load);
    await first.promise;
    first.release();
    await Promise.resolve();

    const second = acquireHomeRequest(port, "clusters", load);
    await second.promise;
    expect(load).toHaveBeenCalledTimes(2);
    second.release();
  });
});

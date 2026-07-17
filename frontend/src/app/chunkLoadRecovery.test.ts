import { describe, expect, it, vi } from "vitest";
import { installChunkLoadRecovery } from "./chunkLoadRecovery";

const SOURCE_SHA = "c1e4cda195becb8f3b97f72e394b1c11baa33c3f";

describe("chunk load recovery", () => {
  it("reloads once when Vite reports a missing lazy chunk", () => {
    const target = new EventTarget();
    const storage = createMemoryStorage();
    const reload = vi.fn();
    const dispose = installChunkLoadRecovery({
      sourceSha: SOURCE_SHA,
      eventTarget: target,
      storage,
      reload,
      now: () => 1_000,
    });

    const firstError = new Event("vite:preloadError", { cancelable: true });
    target.dispatchEvent(firstError);
    const repeatedError = new Event("vite:preloadError", { cancelable: true });
    target.dispatchEvent(repeatedError);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(firstError.defaultPrevented).toBe(true);
    expect(repeatedError.defaultPrevented).toBe(false);

    dispose();
    target.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("allows a later recovery and isolates attempts by deployed source SHA", () => {
    const target = new EventTarget();
    const storage = createMemoryStorage();
    const reload = vi.fn();
    let currentTime = 1_000;
    installChunkLoadRecovery({
      sourceSha: SOURCE_SHA,
      eventTarget: target,
      storage,
      reload,
      now: () => currentTime,
    });

    target.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));
    currentTime += 5 * 60 * 1000;
    target.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));

    const nextBuildTarget = new EventTarget();
    installChunkLoadRecovery({
      sourceSha: "d".repeat(40),
      eventTarget: nextBuildTarget,
      storage,
      reload,
      now: () => currentTime,
    });
    nextBuildTarget.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));

    expect(reload).toHaveBeenCalledTimes(3);
  });

  it("uses an in-memory loop guard when session storage is unavailable", () => {
    const target = new EventTarget();
    const reload = vi.fn();
    const blockedStorage = {
      getItem() {
        throw new DOMException("blocked");
      },
      setItem() {
        throw new DOMException("blocked");
      },
    };
    installChunkLoadRecovery({
      eventTarget: target,
      storage: blockedStorage,
      reload,
      now: () => 1_000,
    });

    target.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));
    target.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));

    expect(reload).toHaveBeenCalledTimes(1);
  });
});

function createMemoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const values = new Map<string, string>();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

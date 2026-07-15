import { describe, expect, it, vi } from "vitest";
import { createProductSurfaceLoader } from "./surfaceLoader";

const FirstSurface = () => null;
const RecoveredSurface = () => null;

describe("product surface loader", () => {
  it("shares one in-flight module load and reuses the resolved surface", async () => {
    const factory = vi.fn(async () => ({ default: FirstSurface }));
    const loader = createProductSurfaceLoader(factory);

    const [first, second] = await Promise.all([loader.load(), loader.load()]);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(first.default).toBe(FirstSurface);
    expect(second).toBe(first);
    await loader.load();
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("does not retain a failed import so the route boundary can retry it", async () => {
    const factory = vi
      .fn<() => Promise<{ default: typeof RecoveredSurface }>>()
      .mockRejectedValueOnce(new Error("module unavailable"))
      .mockResolvedValueOnce({ default: RecoveredSurface });
    const loader = createProductSurfaceLoader(factory);

    await expect(loader.load()).rejects.toThrow("module unavailable");
    await expect(loader.load()).resolves.toEqual({ default: RecoveredSurface });
    expect(factory).toHaveBeenCalledTimes(2);
  });
});

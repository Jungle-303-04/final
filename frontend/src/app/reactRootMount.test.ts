// @vitest-environment jsdom

import type { Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import {
  acquireReactRoot,
  renderReactRootOnce,
  type ReactRootRegistry,
} from "./reactRootMount";

function fakeRoot() {
  return {
    render: vi.fn(),
    unmount: vi.fn(),
  } as unknown as Root;
}

describe("single React product root", () => {
  it("reuses the existing root when HMR evaluates the entry against the same container", () => {
    const container = document.createElement("div");
    const registry: ReactRootRegistry = { container: null, root: null };
    const root = fakeRoot();
    const create = vi.fn(() => root);

    expect(acquireReactRoot(container, registry, create)).toBe(root);
    expect(acquireReactRoot(container, registry, create)).toBe(root);

    expect(create).toHaveBeenCalledTimes(1);
    expect(root.unmount).not.toHaveBeenCalled();
  });

  it("unmounts the old tree only when the document supplies a new root container", () => {
    const firstContainer = document.createElement("div");
    const nextContainer = document.createElement("div");
    const firstRoot = fakeRoot();
    const nextRoot = fakeRoot();
    const registry: ReactRootRegistry = {
      container: firstContainer,
      root: firstRoot,
    };
    const create = vi.fn(() => nextRoot);

    expect(acquireReactRoot(nextContainer, registry, create)).toBe(nextRoot);

    expect(firstRoot.unmount).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(nextContainer);
    expect(registry).toEqual({ container: nextContainer, root: nextRoot });
  });

  it("renders a retained root only once when the entry module is re-evaluated", () => {
    const root = fakeRoot();
    const mountedRoots = new WeakSet<Root>();

    expect(renderReactRootOnce(root, "first", mountedRoots)).toBe(true);
    expect(renderReactRootOnce(root, "hmr", mountedRoots)).toBe(false);

    expect(root.render).toHaveBeenCalledTimes(1);
    expect(root.render).toHaveBeenCalledWith("first");
  });
});

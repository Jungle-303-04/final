// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthSessionGateProvider, useAuthSessionGate } from "./AuthSessionGate";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AuthSessionGate", () => {
  it("exposes one canonical unauthorized event inside the authenticated boundary", () => {
    const reportUnauthorized = vi.fn();
    let received: (() => void) | null = null;

    function Consumer() {
      received = useAuthSessionGate().reportUnauthorized;
      return null;
    }

    render(
      <AuthSessionGateProvider reportUnauthorized={reportUnauthorized}>
        <Consumer />
      </AuthSessionGateProvider>,
    );

    expect(received).toBe(reportUnauthorized);
  });

  it("fails closed when a feature is mounted outside the session authority", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    function Consumer() {
      useAuthSessionGate();
      return null;
    }

    expect(() => render(<Consumer />)).toThrow(
      "useAuthSessionGate must be used within AuthSessionGateProvider",
    );
  });
});

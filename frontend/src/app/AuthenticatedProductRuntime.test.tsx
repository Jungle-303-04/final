// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedAuthState, AuthPort } from "../features/auth/authContract";
import type { ProductComposition } from "./productComposition";

const runtimeMocks = vi.hoisted(() => ({
  createComposition: vi.fn(),
  renderedCompositions: [] as Array<{ id: string; dispose: ReturnType<typeof vi.fn> }>,
}));

vi.mock("./apiComposition", () => ({
  createApiComposition: runtimeMocks.createComposition,
}));

vi.mock("./ProductRouter", () => ({
  ProductRouter({ composition }: { composition: { id: string; dispose: ReturnType<typeof vi.fn> } }) {
    runtimeMocks.renderedCompositions.push(composition);
    return <output>{composition.id}</output>;
  },
}));

import { AuthenticatedProductRuntime } from "./AuthenticatedProductRuntime";

const auth: AuthenticatedAuthState = {
  session: {
    authEnabled: true,
    authMode: "password",
    groups: [],
    logout: {
      action: "end_session",
      supported: true,
      reauthenticationExpected: false,
    },
    userId: "qa-user",
    roles: ["viewer"],
    workspaceId: "qa-workspace",
  },
  signOutIssue: null,
  signOutPending: false,
  onSignOut: () => undefined,
};
const authPort: AuthPort = {
  loadSession: async () => ({ status: "authenticated", session: auth.session }),
  signIn: async () => auth.session,
  signOut: async () => undefined,
};

afterEach(() => cleanup());

beforeEach(() => {
  runtimeMocks.createComposition.mockReset();
  runtimeMocks.renderedCompositions.splice(0);
});

describe("AuthenticatedProductRuntime composition lifetime", () => {
  it("replaces the StrictMode preflight composition before mounting a route and disposes the live composition on unmount", async () => {
    const preflight = composition("preflight");
    const active = composition("active");
    runtimeMocks.createComposition
      .mockReturnValueOnce(preflight)
      .mockReturnValueOnce(active);

    const view = render(
      <StrictMode>
        <AuthenticatedProductRuntime auth={auth} authPort={authPort} />
      </StrictMode>,
    );

    expect(await screen.findByText("active")).toBeTruthy();
    expect(runtimeMocks.createComposition).toHaveBeenCalledTimes(2);
    expect(preflight.dispose).toHaveBeenCalledOnce();
    expect(active.dispose).not.toHaveBeenCalled();
    expect(runtimeMocks.renderedCompositions[runtimeMocks.renderedCompositions.length - 1]).toBe(active);

    view.unmount();

    expect(active.dispose).toHaveBeenCalledOnce();
  });
});

function composition(id: string) {
  return {
    id,
    dispose: vi.fn(),
  } as unknown as ProductComposition & { id: string; dispose: ReturnType<typeof vi.fn> };
}

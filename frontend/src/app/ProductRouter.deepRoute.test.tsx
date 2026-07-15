// @vitest-environment jsdom

import { ThemeProvider } from "next-themes";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { AuthSessionGateProvider } from "../features/auth/AuthSessionGate";
import type { AuthPort } from "../features/auth/authContract";
import { I18nProvider } from "../shared/i18n";
import { ProductRouter } from "./ProductRouter";
import { createProductComposition } from "./productComposition";
import { createProductSurfaceLoader } from "./surfaceLoader";
import {
  installMatchMedia,
  testAuth,
  testClusterScope,
} from "./__tests__/ProductShellInteractionSupport";

const authPort: AuthPort = {
  loadSession: async () => ({ status: "unauthenticated" }),
  signIn: async () => { throw new Error("not used"); },
  signOut: async () => undefined,
};

afterEach(() => cleanup());

beforeEach(() => installMatchMedia(false));

describe("deferred product routes", () => {
  it("keeps a declared deep route through navigation back and forward", async () => {
    const user = userEvent.setup();
    const deepRoute = "/gitops/detail/application/default/storefront";
    const composition = createProductComposition([
      { id: "home", loader: surfaceLoader(HomeSurface) },
      { id: "gitops", loader: surfaceLoader(GitOpsSurface) },
    ], authPort, testClusterScope);
    const router = createMemoryRouter([{
      path: "*",
      element: (
        <I18nProvider navigatorLanguage="en-US" storage={null}>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
            <AuthSessionGateProvider reportUnauthorized={vi.fn()}>
              <ProductRouter auth={testAuth} composition={composition} />
            </AuthSessionGateProvider>
          </ThemeProvider>
        </I18nProvider>
      ),
    }], { initialEntries: [deepRoute] });

    render(<RouterProvider router={router} />);

    expect(await screen.findByText("GitOps surface")).toBeTruthy();
    expect(router.state.location.pathname).toBe(deepRoute);

    await user.keyboard("gh");
    await waitFor(() => expect(router.state.location.pathname).toBe("/home"));

    await router.navigate(-1);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(deepRoute);
      expect(screen.getByText("GitOps surface")).toBeTruthy();
    });
  });
});

function surfaceLoader(Component: ComponentType) {
  return createProductSurfaceLoader(async () => ({ default: Component }));
}

function HomeSurface() {
  return <p>Home surface</p>;
}

function GitOpsSurface() {
  return <p>GitOps surface</p>;
}

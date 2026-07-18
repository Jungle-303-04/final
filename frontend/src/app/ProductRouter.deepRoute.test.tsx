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
  listWorkspaces: async () => ({ currentWorkspaceId: "test", items: [] }),
  loadSession: async () => ({ status: "unauthenticated" }),
  signIn: async () => { throw new Error("not used"); },
  signOut: async () => undefined,
  switchWorkspace: async () => { throw new Error("not used"); },
};

afterEach(() => cleanup());

beforeEach(() => installMatchMedia(false));

describe("deferred product routes", () => {
  it("canonicalizes a legacy GitOps deep route to the Deploy repository section", async () => {
    const user = userEvent.setup();
    const deepRoute = "/gitops/detail/application/default/storefront";
    const composition = createProductComposition([
      { id: "home", loader: surfaceLoader(HomeSurface) },
      { id: "deploy", loader: surfaceLoader(DeploySurface) },
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

    expect(await screen.findByText("Deploy surface")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/deploy");
    expect(router.state.location.search).toBe("?section=repositories");

    await user.keyboard("gh");
    await waitFor(() => expect(router.state.location.pathname).toBe("/home"));

    await router.navigate(-1);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/deploy");
      expect(router.state.location.search).toBe("?section=repositories");
      expect(screen.getByText("Deploy surface")).toBeTruthy();
    });
  });

  it("renders the matching surface across a Resources to Settings round trip", async () => {
    const user = userEvent.setup();
    const composition = createProductComposition([
      { id: "resources", loader: surfaceLoader(ResourcesSurface) },
      { id: "settings", loader: surfaceLoader(SettingsSurface) },
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
    }], { initialEntries: ["/resources"] });

    render(<RouterProvider router={router} />);

    expect(await screen.findByText("Resources surface")).toBeTruthy();

    await user.click(screen.getByRole("link", { name: "Settings" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/settings"));
    expect(await screen.findByText("Settings surface")).toBeTruthy();
    expect(screen.queryByText("Resources surface")).toBeNull();

    await user.click(screen.getByRole("link", { name: "Resources" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/resources"));
    expect(await screen.findByText("Resources surface")).toBeTruthy();
    expect(screen.queryByText("Settings surface")).toBeNull();
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

function DeploySurface() {
  return <p>Deploy surface</p>;
}

function ResourcesSurface() {
  return <p>Resources surface</p>;
}

function SettingsSurface() {
  return <p>Settings surface</p>;
}

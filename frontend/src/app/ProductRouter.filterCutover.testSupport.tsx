import { ThemeProvider } from "next-themes";
import type { ComponentType } from "react";
import { render } from "@testing-library/react";
import {
  createMemoryRouter,
  RouterProvider,
  useLocation,
  useNavigationType,
} from "react-router-dom";
import { vi } from "vitest";

import { AuthSessionGateProvider } from "../features/auth/AuthSessionGate";
import type { AuthPort } from "../features/auth/authContract";
import type { ClusterScopePort } from "../features/cluster-scope/clusterScopeContract";
import { I18nProvider } from "../shared/i18n";
import { testAuth } from "./__tests__/ProductShellInteractionSupport";
import { ProductRouter } from "./ProductRouter";
import { createProductComposition } from "./productComposition";
import { createProductSurfaceLoader } from "./surfaceLoader";

const authPort: AuthPort = {
  listWorkspaces: async () => ({ currentWorkspaceId: "test", items: [] }),
  loadSession: async () => ({ status: "unauthenticated" }),
  signIn: async () => { throw new Error("not used"); },
  signOut: async () => undefined,
  switchWorkspace: async () => { throw new Error("not used"); },
};
const labels = {
  clusters: "Clusters surface",
  deploy: "Deploy surface",
  home: "Home surface",
  issues: "Issues surface",
  resources: "Resources surface",
};

export const emptyClusterScope: ClusterScopePort = {
  listClusterChoices: async () => ({ completeness: "unknown", clusters: [] }),
};

export function renderProductRouter(
  initialEntry: string,
  clusterScope: ClusterScopePort,
  includeDeploy = false,
) {
  const composition = createProductComposition([
    { id: "home", loader: surfaceLoader(HomeSurface) },
    { id: "clusters", loader: surfaceLoader(ClustersSurface) },
    { id: "resources", loader: surfaceLoader(ResourcesSurface) },
    { id: "issues", loader: surfaceLoader(IssuesSurface) },
    ...(includeDeploy ? [{ id: "deploy" as const, loader: surfaceLoader(DeploySurface) }] : []),
  ], authPort, clusterScope);
  const router = createMemoryRouter([{
    path: "*",
    element: (
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <AuthSessionGateProvider reportUnauthorized={vi.fn()}>
            <ProductRouter auth={testAuth} composition={composition} />
            <LocationProbe />
          </AuthSessionGateProvider>
        </ThemeProvider>
      </I18nProvider>
    ),
  }], { initialEntries: [initialEntry] });
  return { ...render(<RouterProvider router={router} />), router };
}

export function currentLocation(
  router: ReturnType<typeof createMemoryRouter>,
): string {
  const { hash, pathname, search } = router.state.location;
  return `${pathname}${search}${hash}`;
}

function surfaceLoader(Component: ComponentType) {
  return createProductSurfaceLoader(async () => ({ default: Component }));
}

function HomeSurface() {
  return <p>{labels.home}</p>;
}

function ResourcesSurface() {
  return <p>{labels.resources}</p>;
}

function ClustersSurface() {
  return <p>{labels.clusters}</p>;
}

function IssuesSurface() {
  return <p>{labels.issues}</p>;
}

function DeploySurface() {
  return <p>{labels.deploy}</p>;
}

function LocationProbe() {
  const location = useLocation();
  const navigationType = useNavigationType();
  return (
    <output data-testid="router-location">
      {`${navigationType}:${location.pathname}${location.search}${location.hash}`}
    </output>
  );
}

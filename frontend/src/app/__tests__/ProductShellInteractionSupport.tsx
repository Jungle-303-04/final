import { ThemeProvider } from "next-themes";
import { render } from "@testing-library/react";
import { StrictMode, useEffect, useState } from "react";
import { vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProductShell } from "../ProductShell";
import type { AuthenticatedAuthState } from "../../features/auth/authContract";
import { AuthSessionGateProvider } from "../../features/auth/AuthSessionGate";
import { ClusterScopeProvider } from "../../features/cluster-scope/ClusterScopeProvider";
import type { ClusterScopePort } from "../../features/cluster-scope/clusterScopeContract";
import { UnifiedFilterProvider } from "../../features/filters/UnifiedFilterProvider";
import { I18nProvider } from "../../shared/i18n";
import type { AiAssistantPort } from "../../features/ai-assistant/aiAssistantContract";
import type { LogStreamPort } from "../../features/log-stream/logStreamContract";
import type { AlertEventsPort } from "../../features/alerts/alertEventsContract";
import type { GlobalFilterPort } from "../../features/global-filter/globalFilterContract";
import type { PortForwardSessionPort } from "../../features/service-access/portForwardSessionContract";
import type { ProductSurfaceId } from "../productRoutes";
import { useBottomDock } from "../../features/bottom-dock/BottomDockProvider";
import {
  PRODUCT_SHORTCUT_EVENT,
  type ProductShortcutEventDetail,
} from "../shortcutRegistry";

export const testAuth: AuthenticatedAuthState = {
  session: { userId: "test-user", roles: ["viewer"], workspaceId: "test-workspace" },
  signOutIssue: null,
  signOutPending: false,
  onSignOut: () => undefined,
};

export const testClusterScope: ClusterScopePort = {
  listClusterChoices: async () => ({
    completeness: "unknown",
    clusters: [{
      id: "cluster-1",
      workspaceId: "test-workspace",
      name: "cluster-1",
      environment: "production",
      provider: "eks",
      connectionStage: null,
      registrationState: "active",
      connectionState: "online",
      lastObservedAt: "2026-07-13T00:00:00.000Z",
      nodeCount: 1,
      podCount: 1,
      incidentCount: 0,
    }],
  }),
};

export function installMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

export function renderShell({
  alertEventsPort,
  aiAssistantPort,
  globalFilterPort,
  initialEntry = "/home?clusters=cluster-1",
  logStreamPort,
  portForwardSessions,
  releasedSurfaceIds = new Set(["home", "issues"]),
}: {
  alertEventsPort?: AlertEventsPort;
  aiAssistantPort?: AiAssistantPort;
  globalFilterPort?: GlobalFilterPort;
  logStreamPort?: LogStreamPort;
  portForwardSessions?: PortForwardSessionPort;
  initialEntry?: string;
  releasedSurfaceIds?: ReadonlySet<ProductSurfaceId>;
} = {}) {
  return render(
    <StrictMode>
      <I18nProvider navigatorLanguage="ko-KR" storage={window.localStorage}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          themes={["light", "dark"]}
        >
          <MemoryRouter initialEntries={[initialEntry]}>
            <AuthSessionGateProvider reportUnauthorized={vi.fn()}>
              <UnifiedFilterProvider>
                <ClusterScopeProvider authorityKey="test-workspace:test-user" port={testClusterScope}>
                  <Routes>
                    <Route element={(
                      <ProductShell
                        alertEventsPort={alertEventsPort}
                        aiAssistantPort={aiAssistantPort}
                        auth={testAuth}
                        globalFilterPort={globalFilterPort}
                        logStreamPort={logStreamPort}
                        portForwardSessions={portForwardSessions}
                        releasedSurfaceIds={releasedSurfaceIds}
                      />
                    )}>
                      <Route path="/home" element={<><p>Home content</p><input aria-label="화면 입력" /></>} />
                      <Route path="/resources" element={<ResourcesShortcutProbe />} />
                      <Route path="/issues" element={<p>Issue content</p>} />
                      <Route path="/alerts" element={<p>Alert content</p>} />
                    </Route>
                  </Routes>
                </ClusterScopeProvider>
              </UnifiedFilterProvider>
            </AuthSessionGateProvider>
          </MemoryRouter>
        </ThemeProvider>
      </I18nProvider>
    </StrictMode>,
  );
}

function ResourcesShortcutProbe() {
  const [shortcutId, setShortcutId] = useState("none");
  const dock = useBottomDock();

  useEffect(() => {
    const handleShortcut = (event: Event) => {
      const detail = (event as CustomEvent<ProductShortcutEventDetail>).detail;
      setShortcutId(detail.id);
    };
    window.addEventListener(PRODUCT_SHORTCUT_EVENT, handleShortcut);
    return () => window.removeEventListener(PRODUCT_SHORTCUT_EVENT, handleShortcut);
  }, []);

  return (
    <>
      <p data-testid="resources-shortcut">{shortcutId}</p>
      {['checkout', 'payment'].map((name) => (
        <button
          key={name}
          onClick={() => dock.openLogs({
            type: "pod",
            clusterId: "cluster-1",
            namespace: "shop",
            name,
            container: null,
          })}
          type="button"
        >
          {name} 로그 열기
        </button>
      ))}
    </>
  );
}

export function replaceProperty(target: object, property: PropertyKey, value: unknown) {
  const descriptor = Object.getOwnPropertyDescriptor(target, property);
  Object.defineProperty(target, property, {
    configurable: true,
    writable: true,
    value,
  });
  return () => {
    if (descriptor) Object.defineProperty(target, property, descriptor);
    else Reflect.deleteProperty(target, property);
  };
}

import { lazy, Suspense, useCallback, useLayoutEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useI18n } from "../shared/i18n";
import { LocaleToggle } from "../shared/ui/LocaleToggle";
import { ThemeToggle } from "../shared/ui/ThemeToggle";
import {
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from "../shared/ui/primitives/sidebar";
import { TooltipProvider } from "../shared/ui/primitives/tooltip";
import { useProductTheme } from "../shared/ui/useProductTheme";
import { ProductSessionProvider } from "../features/auth/ProductSessionContext";
import type { AuthenticatedAuthState } from "../features/auth/authContract";
import { useUnifiedFilter } from "../features/filters/UnifiedFilterProvider";
import {
  EMPTY_GLOBAL_FILTER_PORT,
  type GlobalFilterPort,
} from "../features/global-filter/globalFilterContract";
import { ShortcutHelpDialog } from "./ShortcutHelpDialog";
import {
  landingProductRouteForReleasedSurfaces,
  productKeyboardNavigationRoutes,
  productNavigationForReleasedSurfaces,
  productRouteForPath,
  routeDefinitionForSurface,
  type ProductSurfaceId,
} from "./productRoutes";
import { shellShortcutDefinitions } from "./shortcutRegistry";
import { useProductShortcuts } from "./useProductShortcuts";
import {
  EMPTY_AI_ASSISTANT_PORT,
  type AiAssistantPort,
} from "../features/ai-assistant/aiAssistantContract";
import {
  EMPTY_AI_CONVERSATION_HISTORY_PORT,
  type AiConversationHistoryPort,
} from "../features/ai-assistant/aiConversationHistoryContract";
import {
  closeAiConversation,
  useAiConversationSession,
} from "../features/ai-assistant/aiConversationSession";
import { Toaster, toast } from "../shared/ui/primitives/sonner";
import { AiAssistantPanel } from "./AiAssistantPanel";
import { AI_ASSISTANT_PANEL_DEFAULT_WIDTH } from "./AiAssistantResizeHandle";
import { AiAssistantLayoutProvider } from "../features/ai-assistant/AiAssistantLayoutContext";
import { createAiAssistantContext } from "./aiAssistantContext";
import { ProductSidebarTrigger } from "./ProductShellSidebar";
import { BottomDockProvider, useBottomDock } from "../features/bottom-dock/BottomDockProvider";
import { EMPTY_LOG_STREAM_PORT, type LogStreamPort } from "../features/log-stream/logStreamContract";
import { BottomDock } from "./BottomDock";
import { ProductHeaderProfileMenu } from "./ProductHeaderProfileMenu";
import { ProductHeaderWorkspaceSwitcher } from "./ProductHeaderWorkspaceSwitcher";
import { navLabelKeys } from "./ProductShellNavigation";
import { AlertEventsProvider } from "../features/alerts/AlertEventsProvider";
import {
  EMPTY_ALERT_EVENTS_PORT,
  type AlertEventsPort,
} from "../features/alerts/alertEventsContract";
import type { ProductRouteDefinition } from "./productRoutes";
import { DesktopLocalTerminalEntry } from "../desktop/DesktopLocalTerminalEntry";
import { useOptionalDiagnoseSession } from "../features/diagnose/DiagnoseSessionContext";
import { NamespaceScopeSync } from "../features/namespace-scope/NamespaceScopeSync";
import {
  EMPTY_SHELL_STATE_PORT,
  type ShellStatePort,
} from "../features/shell-state/shellStateContract";
import {
  EMPTY_RUNTIME_STATUS_PORT,
  type RuntimeStatusPort,
} from "../features/runtime-status/runtimeStatusContract";
import {
  RuntimeDiagnosticsDialog,
  type RuntimeDiagnosticsDialogHandle,
} from "../features/runtime-status/RuntimeDiagnosticsDialog";
import { VersionUpdateNotice } from "../features/runtime-status/VersionUpdateNotice";
import {
  EMPTY_PORT_FORWARD_SESSION_PORT,
  type PortForwardSessionPort,
} from "../features/service-access/portForwardSessionContract";
import { PortForwardSessionsProvider } from "../features/service-access/PortForwardSessionsProvider";
import { PortForwardSessionIndicator } from "./PortForwardSessionIndicator";
import { ShellSessionsProvider } from "../features/shell-sessions/ShellSessionsProvider";
import { ProductHeaderFilter, type ProductHeaderFilterHandle } from "./ProductHeaderFilter";
import { ProductNotificationsProvider } from "../features/notifications/ProductNotificationsProvider";
import { ProductNotificationCenter } from "./ProductNotificationCenter";
import { useClusterScope } from "../features/cluster-scope/ClusterScopeProvider";
import { ProductPrimarySidebar } from "./ProductPrimarySidebar";
import { useProductSidebarController } from "./productShellLayout";

const ProductCommandPalette = lazy(async () => ({
  default: (await import("./ProductCommandPalette")).ProductCommandPalette,
}));

interface ProductShellProps {
  auth: AuthenticatedAuthState;
  releasedSurfaceIds: ReadonlySet<ProductSurfaceId>;
  defaultSidebarCollapsed?: boolean;
  globalFilterPort?: GlobalFilterPort;
  aiAssistantPort?: AiAssistantPort;
  aiConversationHistoryPort?: AiConversationHistoryPort;
  logStreamPort?: LogStreamPort;
  alertEventsPort?: AlertEventsPort;
  shellStatePort?: ShellStatePort;
  runtimeStatusPort?: RuntimeStatusPort;
  portForwardSessions?: PortForwardSessionPort;
}

export function ProductShell({
  auth,
  releasedSurfaceIds,
  defaultSidebarCollapsed,
  globalFilterPort = EMPTY_GLOBAL_FILTER_PORT,
  aiAssistantPort = EMPTY_AI_ASSISTANT_PORT,
  aiConversationHistoryPort = EMPTY_AI_CONVERSATION_HISTORY_PORT,
  logStreamPort = EMPTY_LOG_STREAM_PORT,
  alertEventsPort = EMPTY_ALERT_EVENTS_PORT,
  shellStatePort = EMPTY_SHELL_STATE_PORT,
  runtimeStatusPort = EMPTY_RUNTIME_STATUS_PORT,
  portForwardSessions = EMPTY_PORT_FORWARD_SESSION_PORT,
}: ProductShellProps) {
  const sidebar = useProductSidebarController(defaultSidebarCollapsed);
  return (
    <ProductSessionProvider session={auth.session}>
      <TooltipProvider>
        <SidebarProvider onOpenChange={sidebar.setOpen} open={sidebar.open}>
          <PortForwardSessionsProvider port={portForwardSessions}>
            <ShellSessionsProvider>
              <BottomDockProvider port={logStreamPort}>
                <AlertEventsProvider port={alertEventsPort}>
                  <ProductNotificationsProvider>
                    <ProductShellFrame
                      auth={auth}
                      aiAssistantPort={aiAssistantPort}
                      aiConversationHistoryPort={aiConversationHistoryPort}
                      globalFilterPort={globalFilterPort}
                      releasedSurfaceIds={releasedSurfaceIds}
                      shellStatePort={shellStatePort}
                      runtimeStatusPort={runtimeStatusPort}
                    />
                  </ProductNotificationsProvider>
                </AlertEventsProvider>
              </BottomDockProvider>
            </ShellSessionsProvider>
          </PortForwardSessionsProvider>
        </SidebarProvider>
      </TooltipProvider>
    </ProductSessionProvider>
  );
}

function ProductShellFrame({
  aiAssistantPort = EMPTY_AI_ASSISTANT_PORT,
  aiConversationHistoryPort = EMPTY_AI_CONVERSATION_HISTORY_PORT,
  auth,
  releasedSurfaceIds,
  globalFilterPort,
  shellStatePort = EMPTY_SHELL_STATE_PORT,
  runtimeStatusPort = EMPTY_RUNTIME_STATUS_PORT,
}: Pick<ProductShellProps, "aiAssistantPort" | "aiConversationHistoryPort" | "auth" | "globalFilterPort" | "releasedSurfaceIds" | "runtimeStatusPort" | "shellStatePort">) {
  const [isShortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [isAiOpen, setAiOpen] = useState(false);
  const [aiPanelWidth, setAiPanelWidth] = useState(AI_ASSISTANT_PANEL_DEFAULT_WIDTH);
  const diagnosticsDialogRef = useRef<RuntimeDiagnosticsDialogHandle>(null);
  const unifiedFilterRef = useRef<ProductHeaderFilterHandle>(null);
  const mainScrollRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const filter = useUnifiedFilter();
  const clusterScope = useClusterScope();
  const aiConversationSession = useAiConversationSession();
  const dock = useBottomDock();
  const { isMobile } = useSidebar();
  const { t } = useI18n();
  const themeController = useProductTheme();
  const diagnose = useOptionalDiagnoseSession();
  useLayoutEffect(() => {
    mainScrollRef.current?.scrollTo?.({ behavior: "auto", left: 0, top: 0 });
  }, [location.pathname]);
  const navigationRoutes = productNavigationForReleasedSurfaces(releasedSurfaceIds);
  const primaryNavigationRoutes = navigationRoutes.filter(({ id }) => id !== "settings");
  const settingsRoute = navigationRoutes.find(({ id }) => id === "settings");
  const matchedRoute = productRouteForPath(location.pathname);
  const currentRoute = matchedRoute ?? navigationRoutes[0];
  const activeSurfaceKey = currentRoute?.id ?? "";
  const activeSurfaceId = activeSurfaceKey || undefined;
  const detailWorkspaceOpen = activeSurfaceId === "resources" && (
    filter.detail.detail !== null ||
    filter.detail.resource !== null ||
    filter.detail.resourceKind !== null
  );
  const aiContext = createAiAssistantContext(
    activeSurfaceId ?? "home",
    filter.state,
    filter.detail,
    dock.activeStreamId,
  );
  const shortcutDefinitions = shellShortcutDefinitions(releasedSurfaceIds, activeSurfaceId);
  const toggleShortcutHelp = useCallback(() => {
    setShortcutHelpOpen((value) => !value);
  }, []);
  const selectProductRoute = useCallback((routeDefinition: ProductRouteDefinition): boolean => {
    if (!releasedSurfaceIds.has(routeDefinition.id)) {
      toast.warning(t("shell.route.unavailable.toast", {
        route: t(navLabelKeys[routeDefinition.id]),
      }));
      return false;
    }
    const target = filter.navigationHref(routeDefinition.path);
    if (
      location.pathname !== routeDefinition.path ||
      location.hash !== "" ||
      filter.needsCanonicalWrite ||
      hasProductDetail(filter.detail)
    ) {
      navigate(target);
    }
    queueMicrotask(() => document.getElementById("product-main")?.focus());
    return true;
  }, [filter, location.hash, location.pathname, navigate, releasedSurfaceIds, t]);
  useProductShortcuts({
    definitions: shortcutDefinitions,
    isCommandPaletteOpen,
    isHelpOpen: isShortcutHelpOpen,
    onCommandPaletteOpen: () => setCommandPaletteOpen(true),
    onContextOpen: () => unifiedFilterRef.current?.openGroup("cluster"),
    onDiagnosticsOpen: () => diagnosticsDialogRef.current?.open(),
    onHelpToggle: toggleShortcutHelp,
    onNamespaceOpen: () => unifiedFilterRef.current?.openGroup("namespace"),
    onRouteSelect: selectProductRoute,
    onSearchFocus: () => unifiedFilterRef.current?.focus(),
    onThemeToggle: themeController.toggle,
  });
  if (!currentRoute) {
    throw new Error("ProductShell requires at least one released surface");
  }
  const landingRoute = landingProductRouteForReleasedSurfaces(releasedSurfaceIds);
  const settingsHref = filter.navigationHref(routeDefinitionForSurface("settings").path);
  const currentRouteLabel = t(navLabelKeys[currentRoute.id]);
  const assistantOpen = isAiOpen || aiConversationSession.mode !== "idle" || Boolean(diagnose?.activeRunId);
  const changeAiOpen = (next: boolean) => {
    if (next && detailWorkspaceOpen && isNarrowAiViewport()) {
      filter.updateDetail(() => ({
        detail: null,
        resource: null,
        resourceKind: null,
        tab: null,
        full: false,
        node: null,
      }), "detail-close");
      toast.info(t("shell.ai.narrowDetailClosed"));
    }
    if (!next) {
      diagnose?.closeRun();
      closeAiConversation();
    }
    setAiOpen(next);
  };
  return (
    <>
      <NamespaceScopeSync port={shellStatePort} />
      <a
        className="fixed left-3 top-3 z-50 -translate-y-20 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-transform focus:translate-y-0 motion-reduce:transition-none"
        href="#product-main"
      >
        {t("shell.skipToContent")}
      </a>

      <ProductPrimarySidebar
        currentRouteId={currentRoute.id}
        landingRoute={landingRoute}
        primaryNavigationRoutes={primaryNavigationRoutes}
        settingsRoute={settingsRoute}
      />

      <SidebarInset className="flex h-svh max-h-svh min-h-0 flex-col overflow-hidden bg-background text-foreground">
        <header
          className="sticky top-0 z-[74] flex h-(--product-shell-header-height) max-h-(--product-shell-header-height) min-h-(--product-shell-header-height) min-w-0 shrink-0 flex-nowrap items-center gap-[0.78125rem] overflow-hidden border-b border-border bg-card px-[1.40625rem] py-[0.9375rem]"
          data-slot="product-header"
        >
          <div className="flex min-w-0 shrink-0 items-center gap-1 pl-[0.28125rem] lg:w-[8.25rem]" data-slot="product-header-workspace">
            {isMobile ? <ProductSidebarTrigger labelMode="sr-only" /> : null}
            <ProductHeaderWorkspaceSwitcher auth={auth} />
            <h1 className="sr-only">{currentRouteLabel}</h1>
          </div>
          <div className={activeSurfaceId === "resources"
            ? "min-w-0 flex-1"
            : "min-w-0 flex-1 lg:mx-auto lg:w-(--product-global-search-width) lg:flex-initial"}
          >
            <ProductHeaderFilter
              activeSurfaceId={activeSurfaceId ?? ""}
              port={globalFilterPort ?? EMPTY_GLOBAL_FILTER_PORT}
              ref={unifiedFilterRef}
            />
          </div>
          <div
            className="flex min-w-0 shrink-0 flex-nowrap items-center justify-end gap-3 overflow-hidden whitespace-nowrap"
            data-slot="product-header-account"
          >
            <ProductHeaderRefreshStatus
              refreshing={clusterScope.collection.phase === "ready" && clusterScope.collection.refreshing}
            />
            <ProductNotificationCenter />
            {isCommandPaletteOpen ? (
              <Suspense fallback={null}>
                <ProductCommandPalette
                  availableSurfaceIds={releasedSurfaceIds}
                  onOpenChange={setCommandPaletteOpen}
                  onSelectRoute={selectProductRoute}
                  open
                  routeDefinitions={productKeyboardNavigationRoutes()}
                />
              </Suspense>
            ) : null}
            <ProductHeaderProfileMenu
              auth={auth}
              settingsHref={settingsHref}
              utilities={(
                <>
                  <LocaleToggle />
                  <ThemeToggle controller={themeController} />
                  <ShortcutHelpDialog
                    definitions={shortcutDefinitions}
                    onOpenChange={setShortcutHelpOpen}
                    open={isShortcutHelpOpen}
                  />
                  <RuntimeDiagnosticsDialog port={runtimeStatusPort} ref={diagnosticsDialogRef} />
                  <PortForwardSessionIndicator
                    resourcesAvailable={releasedSurfaceIds.has("resources")}
                  />
                  <VersionUpdateNotice port={runtimeStatusPort} />
                  <DesktopLocalTerminalEntry />
                </>
              )}
            />
          </div>
        </header>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <AiAssistantLayoutProvider value={{ open: assistantOpen, width: aiPanelWidth }}>
            <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
              <main
                className="relative min-h-0 min-w-0 flex-1 overflow-y-auto"
                id="product-main"
                ref={mainScrollRef}
                tabIndex={-1}
              >
                <Outlet />
              </main>
              <AiAssistantPanel
                context={aiContext}
                historyPort={aiConversationHistoryPort}
                onOpenChange={changeAiOpen}
                onShowHistory={() => {
                  closeAiConversation();
                  setAiOpen(false);
                  navigate(filter.navigationHref("/ai"));
                }}
                onWidthChange={setAiPanelWidth}
                open={assistantOpen}
                port={aiAssistantPort}
              />
            </div>
          </AiAssistantLayoutProvider>
          <BottomDock onAskAi={() => changeAiOpen(true)} />
        </div>
      </SidebarInset>
      <Toaster />
    </>
  );
}

function ProductHeaderRefreshStatus({ refreshing }: { refreshing: boolean }) {
  const { t } = useI18n();
  return (
    <span
      aria-live="polite"
      className="hidden w-(--product-refresh-status-width) shrink-0 items-center justify-end gap-1.5 overflow-hidden whitespace-nowrap text-label text-muted-foreground xl:flex"
      data-refreshing={refreshing || undefined}
      data-slot="product-auto-refresh"
    >
      <span
        aria-hidden="true"
        className="size-2 rounded-full bg-status-healthy motion-safe:data-[refreshing=true]:animate-pulse motion-reduce:animate-none"
        data-refreshing={refreshing || undefined}
      />
      <span className="min-w-0 truncate">
        {refreshing ? t("shell.refresh.refreshing") : t("shell.refresh.auto")}
      </span>
    </span>
  );
}
function isNarrowAiViewport(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 895px)").matches;
}

function hasProductDetail(detail: ReturnType<typeof useUnifiedFilter>["detail"]): boolean {
  return detail.detail !== null || detail.resource !== null ||
    detail.resourceKind !== null || detail.tab !== null ||
    detail.full || detail.node !== null;
}

import { Activity, Settings } from "lucide-react";
import { lazy, Suspense, useCallback, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useI18n } from "../shared/i18n";
import { LocaleToggle } from "../shared/ui/LocaleToggle";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuLink,
  SidebarNavigation,
} from "../shared/ui/primitives/sidebar-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarText,
  useSidebar,
} from "../shared/ui/primitives/sidebar";
import { Separator } from "../shared/ui/primitives/separator";
import { TooltipProvider } from "../shared/ui/primitives/tooltip";
import { useProductTheme } from "../shared/ui/useProductTheme";
import { ProductSessionProvider } from "../features/auth/ProductSessionContext";
import type { AuthenticatedAuthState } from "../features/auth/authContract";
import { useUnifiedFilter } from "../features/filters/UnifiedFilterProvider";
import {
  UnifiedFilterBar,
  type UnifiedFilterBarHandle,
} from "../features/global-filter/UnifiedFilterBar";
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
import { Toaster, toast } from "../shared/ui/primitives/sonner";
import { AiAssistantPanel } from "./AiAssistantPanel";
import { createAiAssistantContext } from "./aiAssistantContext";
import { ProductSidebarTrigger } from "./ProductShellSidebar";
import { BottomDockProvider, useBottomDock } from "../features/bottom-dock/BottomDockProvider";
import { EMPTY_LOG_STREAM_PORT, type LogStreamPort } from "../features/log-stream/logStreamContract";
import { BottomDock } from "./BottomDock";
import { SidebarProfileMenu } from "../shared/ui/blocks/SidebarProfileMenu";
import { SidebarWorkspaceSwitcher } from "../shared/ui/blocks/SidebarWorkspaceSwitcher";
import { navLabelKeys, routeIcons } from "./ProductShellNavigation";
import { AlertEventsProvider, useAlertEvents } from "../features/alerts/AlertEventsProvider";
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

const ProductCommandPalette = lazy(async () => ({
  default: (await import("./ProductCommandPalette")).ProductCommandPalette,
}));

interface ProductShellProps {
  auth: AuthenticatedAuthState;
  releasedSurfaceIds: ReadonlySet<ProductSurfaceId>;
  defaultSidebarCollapsed?: boolean;
  globalFilterPort?: GlobalFilterPort;
  aiAssistantPort?: AiAssistantPort;
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
  logStreamPort = EMPTY_LOG_STREAM_PORT,
  alertEventsPort = EMPTY_ALERT_EVENTS_PORT,
  shellStatePort = EMPTY_SHELL_STATE_PORT,
  runtimeStatusPort = EMPTY_RUNTIME_STATUS_PORT,
  portForwardSessions = EMPTY_PORT_FORWARD_SESSION_PORT,
}: ProductShellProps) {
  return (
    <ProductSessionProvider session={auth.session}>
      <TooltipProvider>
        <SidebarProvider defaultOpen={!defaultSidebarCollapsed}>
          <PortForwardSessionsProvider port={portForwardSessions}>
            <ShellSessionsProvider>
              <BottomDockProvider port={logStreamPort}>
                <AlertEventsProvider port={alertEventsPort}>
                  <ProductShellFrame
                    auth={auth}
                    aiAssistantPort={aiAssistantPort}
                    globalFilterPort={globalFilterPort}
                    releasedSurfaceIds={releasedSurfaceIds}
                    shellStatePort={shellStatePort}
                    runtimeStatusPort={runtimeStatusPort}
                  />
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
  auth,
  releasedSurfaceIds,
  globalFilterPort,
  shellStatePort = EMPTY_SHELL_STATE_PORT,
  runtimeStatusPort = EMPTY_RUNTIME_STATUS_PORT,
}: Pick<ProductShellProps, "aiAssistantPort" | "auth" | "globalFilterPort" | "releasedSurfaceIds" | "runtimeStatusPort" | "shellStatePort">) {
  const [isShortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [isAiOpen, setAiOpen] = useState(false);
  const diagnosticsDialogRef = useRef<RuntimeDiagnosticsDialogHandle>(null);
  const unifiedFilterRef = useRef<UnifiedFilterBarHandle>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const filter = useUnifiedFilter();
  const dock = useBottomDock();
  const { isMobile } = useSidebar();
  const { t } = useI18n();
  const themeController = useProductTheme();
  const alertEvents = useAlertEvents();
  const diagnose = useOptionalDiagnoseSession();
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
    if (!next) diagnose?.closeRun();
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

      <Sidebar
        aria-label={t("shell.menu.label")}
        id="product-sidebar"
        mobileCloseLabel={t("shell.menu.mobileClose")}
        mobileDescription={t("shell.menu.mobileDescription")}
        mobileTitle={t("shell.menu.mobileTitle")}
      >
        <SidebarHeader className="h-14 flex-row items-center gap-2 px-2 py-0">
          <Link
            aria-label={t("shell.brand.landing", { route: t(navLabelKeys[landingRoute.id]) })}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[state=collapsed]/sidebar:justify-center"
            to={filter.navigationHref(landingRoute.path)}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-sidebar-border bg-sidebar-primary text-sidebar-primary-foreground">
              <Activity aria-hidden="true" className="size-4" />
            </span>
            <SidebarText className="text-sm font-semibold tracking-tight group-data-[state=collapsed]/sidebar:sr-only">
              {t("product.name")}
            </SidebarText>
          </Link>
          {!isMobile ? <ProductSidebarTrigger labelMode="sr-only" /> : null}
        </SidebarHeader>

        <SidebarContent className="p-0">
          <SidebarNavigation aria-label={t("shell.menu.primary")} id="product-primary-navigation">
            <SidebarMenu>
              {primaryNavigationRoutes.map((routeDefinition) => {
                const Icon = routeIcons[routeDefinition.icon];
                const label = t(navLabelKeys[routeDefinition.id]);
                return (
                  <SidebarMenuItem key={routeDefinition.id}>
                    <SidebarMenuLink
                      isActive={currentRoute.id === routeDefinition.id}
                      to={filter.navigationHref(routeDefinition.path)}
                      tooltip={label}
                    >
                      <Icon aria-hidden="true" className="size-4 shrink-0" />
                      <SidebarText>{label}</SidebarText>
                      {routeDefinition.id === "alerts" && alertEvents.unreadCount > 0 ? (
                        <span
                          aria-label={t("alerts.sidebar.unread", { count: alertEvents.unreadCount })}
                          className="ml-auto min-w-5 rounded-full bg-destructive/15 px-1.5 text-center text-xs font-semibold text-destructive"
                        >
                          {alertEvents.unreadCount > 99 ? "99+" : alertEvents.unreadCount}
                        </span>
                      ) : null}
                    </SidebarMenuLink>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarNavigation>
          {settingsRoute ? (
            <>
              <Separator className="mx-2 data-horizontal:w-auto" />
              <SidebarNavigation
                aria-label={t("shell.nav.settings")}
                className="flex-none"
              >
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuLink
                      isActive={currentRoute.id === settingsRoute.id}
                      to={filter.navigationHref(settingsRoute.path)}
                      tooltip={t(navLabelKeys[settingsRoute.id])}
                    >
                      <Settings aria-hidden="true" className="size-4 shrink-0" />
                      <SidebarText>{t(navLabelKeys[settingsRoute.id])}</SidebarText>
                    </SidebarMenuLink>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarNavigation>
            </>
          ) : null}
        </SidebarContent>

        <SidebarFooter className="gap-1.5 overflow-x-hidden">
          <SidebarWorkspaceSwitcher workspaceId={auth.session.workspaceId} />
          <Separator className="mx-2 data-horizontal:w-auto" />
          <SidebarProfileMenu
            auth={auth}
            settingsHref={settingsHref}
            themeController={themeController}
          />
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="flex h-svh max-h-svh min-h-0 flex-col overflow-hidden bg-background text-foreground">
        <header className="sticky top-0 z-30 flex min-h-14 flex-wrap items-center gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/75 lg:flex-nowrap">
          <div className="order-1 flex min-w-0 items-center gap-2">
            {isMobile ? <ProductSidebarTrigger labelMode="sr-only" /> : null}
            <h1 className="sr-only">{currentRouteLabel}</h1>
          </div>
          <div className="order-2 ml-auto flex items-center gap-1 lg:order-3">
            <PortForwardSessionIndicator
              resourcesAvailable={releasedSurfaceIds.has("resources")}
            />
            <VersionUpdateNotice port={runtimeStatusPort} />
            <RuntimeDiagnosticsDialog port={runtimeStatusPort} ref={diagnosticsDialogRef} />
            <ShortcutHelpDialog
              definitions={shortcutDefinitions}
              onOpenChange={setShortcutHelpOpen}
              open={isShortcutHelpOpen}
            />
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
            <DesktopLocalTerminalEntry />
            <LocaleToggle />
          </div>
          <div className="order-3 w-full min-w-0 lg:order-2 lg:flex-1">
            <UnifiedFilterBar
              port={globalFilterPort ?? EMPTY_GLOBAL_FILTER_PORT}
              ref={unifiedFilterRef}
            />
          </div>
        </header>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
            <main
              className="min-h-0 min-w-0 flex-1 overflow-y-auto"
              id="product-main"
              tabIndex={-1}
            >
              <Outlet />
            </main>
            <AiAssistantPanel
              context={aiContext}
              onOpenChange={changeAiOpen}
              open={isAiOpen || Boolean(diagnose?.activeRunId)}
              port={aiAssistantPort}
            />
          </div>
          <BottomDock onAskAi={() => changeAiOpen(true)} />
        </div>
      </SidebarInset>
      <Toaster />
    </>
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

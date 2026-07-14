import {
  Activity,
  Boxes,
  GitBranch,
  Home,
  Layers3,
  Server,
  Settings,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useI18n, type MessageKey } from "../shared/i18n";
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
import { UnifiedFilterBar } from "../features/global-filter/UnifiedFilterBar";
import {
  EMPTY_GLOBAL_FILTER_PORT,
  type GlobalFilterPort,
} from "../features/global-filter/globalFilterContract";
import { ShortcutHelpDialog } from "./ShortcutHelpDialog";
import {
  productNavigationForReleasedSurfaces,
  productRouteForPath,
  type ProductRouteIcon,
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

interface ProductShellProps {
  auth: AuthenticatedAuthState;
  releasedSurfaceIds: ReadonlySet<ProductSurfaceId>;
  defaultSidebarCollapsed?: boolean;
  globalFilterPort?: GlobalFilterPort;
  aiAssistantPort?: AiAssistantPort;
  logStreamPort?: LogStreamPort;
}

const routeIcons: Record<ProductRouteIcon, LucideIcon> = {
  clusters: Server,
  home: Home,
  resources: Boxes,
  issues: TriangleAlert,
  applications: Layers3,
  gitops: GitBranch,
  settings: Settings,
};

const navLabelKeys = {
  clusters: "shell.nav.clusters",
  applications: "shell.nav.applications",
  gitops: "shell.nav.gitops",
  home: "shell.nav.home",
  issues: "shell.nav.issues",
  resources: "shell.nav.resources",
  settings: "shell.nav.settings",
} satisfies Record<ProductSurfaceId, MessageKey>;

export function ProductShell({
  auth,
  releasedSurfaceIds,
  defaultSidebarCollapsed,
  globalFilterPort = EMPTY_GLOBAL_FILTER_PORT,
  aiAssistantPort = EMPTY_AI_ASSISTANT_PORT,
  logStreamPort = EMPTY_LOG_STREAM_PORT,
}: ProductShellProps) {
  return (
    <ProductSessionProvider session={auth.session}>
      <TooltipProvider>
        <SidebarProvider defaultOpen={!defaultSidebarCollapsed}>
          <BottomDockProvider port={logStreamPort}>
            <ProductShellFrame
              auth={auth}
              aiAssistantPort={aiAssistantPort}
              globalFilterPort={globalFilterPort}
              releasedSurfaceIds={releasedSurfaceIds}
            />
          </BottomDockProvider>
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
}: Pick<ProductShellProps, "aiAssistantPort" | "auth" | "globalFilterPort" | "releasedSurfaceIds">) {
  const [isShortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [isAiOpen, setAiOpen] = useState(false);
  const location = useLocation();
  const filter = useUnifiedFilter();
  const dock = useBottomDock();
  const { isMobile } = useSidebar();
  const { t } = useI18n();
  const themeController = useProductTheme();
  const navigationRoutes = productNavigationForReleasedSurfaces(releasedSurfaceIds);
  const primaryNavigationRoutes = navigationRoutes.filter(({ id }) => id !== "settings");
  const settingsRoute = navigationRoutes.find(({ id }) => id === "settings");
  const matchedRoute = productRouteForPath(location.pathname);
  const currentRoute = matchedRoute && releasedSurfaceIds.has(matchedRoute.id)
    ? matchedRoute
    : navigationRoutes[0];
  const activeSurfaceId = currentRoute?.id;
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
  useProductShortcuts({
    definitions: shortcutDefinitions,
    isHelpOpen: isShortcutHelpOpen,
    onHelpToggle: toggleShortcutHelp,
    onThemeToggle: themeController.toggle,
  });
  if (!currentRoute) {
    throw new Error("ProductShell requires at least one released surface");
  }
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
    setAiOpen(next);
  };

  return (
    <>
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
          <div className="flex min-w-0 flex-1 items-center gap-2 group-data-[state=collapsed]/sidebar:hidden">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-sidebar-border bg-sidebar-primary text-sidebar-primary-foreground">
              <Activity aria-hidden="true" className="size-4" />
            </span>
            <SidebarText className="text-sm font-semibold tracking-tight">
              {t("product.name")}
            </SidebarText>
          </div>
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
                    </SidebarMenuLink>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarNavigation>
          {settingsRoute ? (
            <>
              <Separator className="mx-2 w-auto" />
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

        <SidebarFooter className="gap-1">
          <SidebarWorkspaceSwitcher workspaceId={auth.session.workspaceId} />
          <SidebarProfileMenu
            auth={auth}
            settingsHref={filter.navigationHref("/settings")}
            themeController={themeController}
          />
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="flex min-h-svh flex-col bg-background text-foreground">
        <header className="sticky top-0 z-30 flex min-h-14 flex-wrap items-center gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/75 lg:flex-nowrap">
          <div className="order-1 flex min-w-0 items-center gap-2">
            {isMobile ? <ProductSidebarTrigger labelMode="sr-only" /> : null}
            <h1 className="sr-only">{currentRouteLabel}</h1>
          </div>
          <div className="order-3 w-full min-w-0 lg:order-2 lg:flex-1">
            {detailWorkspaceOpen
              ? null
              : <UnifiedFilterBar port={globalFilterPort ?? EMPTY_GLOBAL_FILTER_PORT} />}
          </div>
          <div className="order-2 ml-auto flex items-center gap-1 lg:order-3">
            <ShortcutHelpDialog
              definitions={shortcutDefinitions}
              onOpenChange={setShortcutHelpOpen}
              open={isShortcutHelpOpen}
            />
            <LocaleToggle />
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
              open={isAiOpen}
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

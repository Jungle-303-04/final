import {
  Activity,
  Boxes,
  ChartNoAxesCombined,
  GitBranch,
  Home,
  Layers3,
  Library,
  Server,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useI18n, type MessageKey } from "../shared/i18n";
import { LocaleToggle } from "../shared/ui/LocaleToggle";
import { ThemeToggle } from "../shared/ui/ThemeToggle";
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
  SidebarTrigger,
  useSidebar,
} from "../shared/ui/primitives/sidebar";
import { TooltipProvider } from "../shared/ui/primitives/tooltip";
import { useProductTheme } from "../shared/ui/useProductTheme";
import { AuthSessionControl } from "../features/auth/AuthSessionControl";
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

interface ProductShellProps {
  auth: AuthenticatedAuthState;
  releasedSurfaceIds: ReadonlySet<ProductSurfaceId>;
  defaultSidebarCollapsed?: boolean;
  globalFilterPort?: GlobalFilterPort;
}

const routeIcons: Record<ProductRouteIcon, LucideIcon> = {
  clusters: Server,
  home: Home,
  resources: Boxes,
  issues: TriangleAlert,
  metrics: ChartNoAxesCombined,
  applications: Layers3,
  gitops: GitBranch,
  catalog: Library,
};

const navLabelKeys = {
  clusters: "shell.nav.clusters",
  applications: "shell.nav.applications",
  gitops: "shell.nav.gitops",
  home: "shell.nav.home",
  issues: "shell.nav.issues",
  metrics: "shell.nav.metrics",
  resources: "shell.nav.resources",
  catalog: "shell.nav.catalog",
} satisfies Record<ProductSurfaceId, MessageKey>;

export function ProductShell({
  auth,
  releasedSurfaceIds,
  defaultSidebarCollapsed,
  globalFilterPort = EMPTY_GLOBAL_FILTER_PORT,
}: ProductShellProps) {
  return (
    <ProductSessionProvider session={auth.session}>
      <TooltipProvider>
        <SidebarProvider defaultOpen={!defaultSidebarCollapsed}>
          <ProductShellFrame
            auth={auth}
            globalFilterPort={globalFilterPort}
            releasedSurfaceIds={releasedSurfaceIds}
          />
        </SidebarProvider>
      </TooltipProvider>
    </ProductSessionProvider>
  );
}

function ProductShellFrame({
  auth,
  releasedSurfaceIds,
  globalFilterPort,
}: Pick<ProductShellProps, "auth" | "globalFilterPort" | "releasedSurfaceIds">) {
  const [isShortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const location = useLocation();
  const filter = useUnifiedFilter();
  const { isMobile, open: sidebarOpen, setOpen: setSidebarOpen } = useSidebar();
  const { t } = useI18n();
  const themeController = useProductTheme();
  const navigationRoutes = productNavigationForReleasedSurfaces(releasedSurfaceIds);
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
  useDetailSidebarRail(
    detailWorkspaceOpen,
    isMobile,
    sidebarOpen,
    setSidebarOpen,
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
        <SidebarHeader className="h-14 flex-row items-center gap-2 px-3 py-0">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-sidebar-border bg-sidebar-primary text-sidebar-primary-foreground">
            <Activity aria-hidden="true" className="size-4" />
          </span>
          <SidebarText className="text-sm font-semibold tracking-tight">
            {t("product.name")}
          </SidebarText>
        </SidebarHeader>

        <SidebarContent className="p-0">
          <SidebarNavigation aria-label={t("shell.menu.primary")} id="product-primary-navigation">
            <SidebarMenu>
              {navigationRoutes.map((routeDefinition) => {
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
        </SidebarContent>

        <SidebarFooter>
          {!isMobile ? <ProductSidebarTrigger /> : null}
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
            <AuthSessionControl auth={auth} mode="toolbar" />
            <ShortcutHelpDialog
              definitions={shortcutDefinitions}
              onOpenChange={setShortcutHelpOpen}
              open={isShortcutHelpOpen}
            />
            <LocaleToggle />
            <ThemeToggle controller={themeController} />
          </div>
        </header>

        <main
          className="min-h-0 min-w-0 flex-1"
          id="product-main"
          tabIndex={-1}
        >
          <Outlet />
        </main>
      </SidebarInset>
    </>
  );
}

function useDetailSidebarRail(
  active: boolean,
  isMobile: boolean,
  sidebarOpen: boolean,
  setSidebarOpen: (next: boolean) => void,
) {
  const activeRef = useRef(false);
  const restoreOpen = useRef(true);
  useEffect(() => {
    if (isMobile) {
      if (activeRef.current) setSidebarOpen(restoreOpen.current);
      activeRef.current = false;
      return;
    }
    if (active && !activeRef.current) {
      restoreOpen.current = sidebarOpen;
      activeRef.current = true;
      setSidebarOpen(false);
      return;
    }
    if (!active && activeRef.current) {
      activeRef.current = false;
      setSidebarOpen(restoreOpen.current);
    }
  }, [active, isMobile, setSidebarOpen, sidebarOpen]);
}

function ProductSidebarTrigger({
  labelMode = "responsive",
}: {
  labelMode?: "responsive" | "sr-only";
}) {
  const { t } = useI18n();
  return (
    <SidebarTrigger
      collapseLabel={t("shell.sidebar.collapse")}
      controls="product-primary-navigation"
      expandLabel={t("shell.sidebar.expand")}
      labelMode={labelMode}
      mobileCloseLabel={t("shell.menu.mobileClose")}
      mobileOpenLabel={t("shell.menu.mobileOpen")}
      size={labelMode === "sr-only" ? "icon-sm" : "default"}
      variant="ghost"
    />
  );
}

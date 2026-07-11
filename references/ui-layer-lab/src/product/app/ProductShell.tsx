import {
  Activity,
  Boxes,
  GitBranch,
  History,
  Home,
  Layers3,
  Network,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { ThemeToggle } from "../shared/ui/ThemeToggle";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
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
  releasedSurfaceIds: ReadonlySet<ProductSurfaceId>;
  defaultSidebarCollapsed?: boolean;
}

const routeIcons: Record<ProductRouteIcon, LucideIcon> = {
  home: Home,
  resources: Boxes,
  issues: TriangleAlert,
  topology: Network,
  applications: Layers3,
  timeline: History,
  gitops: GitBranch,
};

export function ProductShell({
  releasedSurfaceIds,
  defaultSidebarCollapsed,
}: ProductShellProps) {
  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen={!defaultSidebarCollapsed}>
        <ProductShellFrame releasedSurfaceIds={releasedSurfaceIds} />
      </SidebarProvider>
    </TooltipProvider>
  );
}

function ProductShellFrame({
  releasedSurfaceIds,
}: Pick<ProductShellProps, "releasedSurfaceIds">) {
  const [isShortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const location = useLocation();
  const { isMobile } = useSidebar();
  const themeController = useProductTheme();
  const navigationRoutes = productNavigationForReleasedSurfaces(releasedSurfaceIds);
  const shortcutDefinitions = useMemo(
    () => shellShortcutDefinitions(releasedSurfaceIds),
    [releasedSurfaceIds],
  );
  const toggleShortcutHelp = useCallback(() => {
    setShortcutHelpOpen((value) => !value);
  }, []);
  useProductShortcuts({
    definitions: shortcutDefinitions,
    isHelpOpen: isShortcutHelpOpen,
    onHelpToggle: toggleShortcutHelp,
    onThemeToggle: themeController.toggle,
  });
  const matchedRoute = productRouteForPath(location.pathname);
  const currentRoute = matchedRoute && releasedSurfaceIds.has(matchedRoute.id)
    ? matchedRoute
    : navigationRoutes[0];

  if (!currentRoute) {
    throw new Error("ProductShell requires at least one released surface");
  }

  return (
    <>
      <a
        className="fixed left-3 top-3 z-50 -translate-y-20 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-transform focus:translate-y-0 motion-reduce:transition-none"
        href="#product-main"
      >
        본문으로 건너뛰기
      </a>

      <Sidebar
        aria-label="제품 메뉴"
        id="product-sidebar"
        mobileCloseLabel="모바일 사이드바 닫기"
        mobileDescription="현재 사용할 수 있는 제품 화면으로 이동합니다."
        mobileTitle="제품 탐색"
      >
        <SidebarHeader className="h-14 flex-row items-center gap-2 px-3 py-0">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-sidebar-border bg-sidebar-primary text-sidebar-primary-foreground">
            <Activity aria-hidden="true" className="size-4" />
          </span>
          <SidebarText className="text-sm font-semibold tracking-tight">
            KubeHeal
          </SidebarText>
        </SidebarHeader>

        <SidebarContent className="p-0">
          <SidebarNavigation aria-label="주요 메뉴" id="product-primary-navigation">
            <SidebarMenu>
              {navigationRoutes.map((routeDefinition) => {
                const Icon = routeIcons[routeDefinition.icon];
                return (
                  <SidebarMenuItem key={routeDefinition.id}>
                    <SidebarMenuButton
                      isActive={currentRoute.id === routeDefinition.id}
                      render={(
                        <NavLink
                          aria-label={routeDefinition.label}
                          end={routeDefinition.id === "home"}
                          to={routeDefinition.path}
                        />
                      )}
                      tooltip={routeDefinition.label}
                    >
                      <Icon aria-hidden="true" className="size-4 shrink-0" />
                      <SidebarText>{routeDefinition.label}</SidebarText>
                    </SidebarMenuButton>
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
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75">
          <div className="flex min-w-0 items-center gap-2">
            {isMobile ? <ProductSidebarTrigger labelMode="sr-only" /> : null}
            <div className="min-w-0">
              <h1 className="truncate text-sm font-medium">{currentRoute.label}</h1>
              <p className="truncate text-xs text-muted-foreground">Operations workspace</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ShortcutHelpDialog
              definitions={shortcutDefinitions}
              onOpenChange={setShortcutHelpOpen}
              open={isShortcutHelpOpen}
            />
            <ThemeToggle controller={themeController} />
          </div>
        </header>

        <main
          className="min-h-[calc(100svh-3.5rem)] min-w-0"
          id="product-main"
          tabIndex={-1}
        >
          <Outlet />
        </main>
      </SidebarInset>
    </>
  );
}

function ProductSidebarTrigger({
  labelMode = "responsive",
}: {
  labelMode?: "responsive" | "sr-only";
}) {
  return (
    <SidebarTrigger
      collapseLabel="사이드바 접기"
      controls="product-primary-navigation"
      expandLabel="사이드바 펼치기"
      labelMode={labelMode}
      mobileCloseLabel="모바일 사이드바 닫기"
      mobileOpenLabel="모바일 사이드바 열기"
      size={labelMode === "sr-only" ? "icon-sm" : "default"}
      variant="ghost"
    />
  );
}

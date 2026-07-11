import {
  Activity,
  Boxes,
  GitBranch,
  History,
  Home,
  Layers3,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { ThemeToggle } from "../shared/ui/ThemeToggle";
import { Button } from "../shared/ui/primitives/button";
import { cn } from "../shared/ui/primitives/cn";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../shared/ui/primitives/tooltip";
import { useProductTheme } from "../shared/ui/useProductTheme";
import { ShortcutHelpDialog } from "./ShortcutHelpDialog";
import {
  productNavigationForReleasedSurfaces,
  productRouteForPath,
  type ProductSurfaceId,
  type ProductRouteIcon,
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
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(() => (
    defaultSidebarCollapsed ?? (
      typeof window !== "undefined"
      && typeof window.matchMedia === "function"
      && window.matchMedia("(max-width: 767px)").matches
    )
  ));
  const [isShortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const location = useLocation();
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
  const sidebarToggleLabel = isSidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기";

  if (!currentRoute) {
    throw new Error("ProductShell requires at least one released surface");
  }

  return (
    <TooltipProvider>
      <div className="flex min-h-svh bg-background text-foreground" data-sidebar-collapsed={isSidebarCollapsed || undefined}>
        <a
          className="fixed left-3 top-3 z-50 -translate-y-20 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-transform focus:translate-y-0"
          href="#product-main"
        >
          본문으로 건너뛰기
        </a>

        <aside
          className={cn(
            "sticky top-0 flex h-svh shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out",
            isSidebarCollapsed ? "w-14" : "w-44",
          )}
          aria-label="제품 메뉴"
        >
          <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-sidebar-border bg-sidebar-primary text-sidebar-primary-foreground">
              <Activity className="size-4" aria-hidden="true" />
            </span>
            <span className={cn("min-w-0 text-sm font-semibold tracking-tight", isSidebarCollapsed && "sr-only")}>
              KubeHeal
            </span>
          </div>

          <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2" id="product-primary-navigation" aria-label="주요 메뉴">
            {navigationRoutes.map((routeDefinition) => {
              const Icon = routeIcons[routeDefinition.icon];
              const link = (
                <NavLink
                  aria-label={routeDefinition.label}
                  className={({ isActive }) => cn(
                    "flex h-9 min-w-0 items-center gap-3 rounded-lg px-2.5 text-sm font-medium text-sidebar-foreground/70 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                    isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
                    isSidebarCollapsed && "justify-center px-0",
                  )}
                  end={routeDefinition.id === "home"}
                  to={routeDefinition.path}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className={cn("truncate", isSidebarCollapsed && "sr-only")}>
                    {routeDefinition.label}
                  </span>
                </NavLink>
              );

              return (
                <Tooltip key={routeDefinition.id}>
                  <TooltipTrigger render={link} />
                  <TooltipContent>{routeDefinition.label}</TooltipContent>
                </Tooltip>
              );
            })}
          </nav>

          <div className="border-t border-sidebar-border p-2">
            <Button
              aria-controls="product-primary-navigation"
              aria-expanded={!isSidebarCollapsed}
              className={cn("w-full", isSidebarCollapsed ? "px-0" : "justify-start")}
              variant="ghost"
              onClick={() => setSidebarCollapsed((value) => !value)}
            >
              {isSidebarCollapsed
                ? <PanelLeftOpen aria-hidden="true" data-icon="inline-start" />
                : <PanelLeftClose aria-hidden="true" data-icon="inline-start" />}
              <span className={cn(isSidebarCollapsed && "sr-only")}>{sidebarToggleLabel}</span>
            </Button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75">
            <div className="min-w-0">
              <h1 className="truncate text-sm font-medium">{currentRoute.label}</h1>
              <p className="truncate text-xs text-muted-foreground">Operations workspace</p>
            </div>
            <div className="flex items-center gap-1">
              <ShortcutHelpDialog
                definitions={shortcutDefinitions}
                open={isShortcutHelpOpen}
                onOpenChange={setShortcutHelpOpen}
              />
              <ThemeToggle controller={themeController} />
            </div>
          </header>

          <main className="min-h-[calc(100svh-3.5rem)] min-w-0" id="product-main" tabIndex={-1}>
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

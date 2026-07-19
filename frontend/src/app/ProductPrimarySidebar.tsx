import { Settings } from "lucide-react";
import { Link } from "react-router-dom";

import { useUnifiedFilter } from "../features/filters/UnifiedFilterProvider";
import { useI18n } from "../shared/i18n";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarText,
  useSidebar,
} from "../shared/ui/primitives/sidebar";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuLink,
  SidebarNavigation,
} from "../shared/ui/primitives/sidebar-menu";
import type { ProductRouteDefinition, ProductSurfaceId } from "./productRoutes";
import { navLabelKeys, routeIcons } from "./ProductShellNavigation";
import { ProductSidebarTrigger } from "./ProductShellSidebar";

export function ProductPrimarySidebar({
  currentRouteId,
  landingRoute,
  primaryNavigationRoutes,
  settingsRoute,
}: {
  currentRouteId: ProductSurfaceId;
  landingRoute: ProductRouteDefinition;
  primaryNavigationRoutes: readonly ProductRouteDefinition[];
  settingsRoute: ProductRouteDefinition | undefined;
}) {
  const filter = useUnifiedFilter();
  const { t } = useI18n();
  const { isMobile } = useSidebar();

  return (
    <Sidebar
      aria-label={t("shell.menu.label")}
      className="gap-0 px-[0.625rem] pb-3 pt-3.5"
      id="product-sidebar"
      mobileCloseLabel={t("shell.menu.mobileClose")}
      mobileDescription={t("shell.menu.mobileDescription")}
      mobileTitle={t("shell.menu.mobileTitle")}
    >
      <SidebarHeader className="h-14 flex-row items-start gap-2 border-b-0 px-[0.15625rem] pb-4 pt-[0.21875rem]">
        <Link
          aria-label={t("shell.brand.landing", { route: t(navLabelKeys[landingRoute.id]) })}
          className="flex min-w-0 flex-1 items-center gap-[0.6875rem] rounded-[var(--product-radius-md)] px-[0.3125rem] outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[state=collapsed]/sidebar:justify-center group-data-[state=collapsed]/sidebar:px-0"
          to={filter.navigationHref(landingRoute.path)}
        >
          <span className="grid size-[2.03125rem] shrink-0 place-items-center rounded-[0.625rem] bg-gradient-to-br from-primary to-brand-accent text-sidebar-primary-foreground">
            <span aria-hidden="true" className="size-[0.703125rem] rounded-full border-2 border-card" />
          </span>
          <SidebarText className="text-[length:var(--type-title-3)] leading-[1.81640625rem] font-extrabold tracking-[-0.02em] text-foreground group-data-[state=collapsed]/sidebar:sr-only">
            {t("product.name")}
          </SidebarText>
        </Link>
      </SidebarHeader>

      <SidebarContent className="overflow-hidden p-0">
        <SidebarNavigation
          aria-label={t("shell.menu.primary")}
          className="flex-1 px-[0.15625rem] py-0"
          id="product-primary-navigation"
        >
          <SidebarMenu>
            {primaryNavigationRoutes.map((routeDefinition) => {
              const Icon = routeIcons[routeDefinition.icon];
              const label = t(navLabelKeys[routeDefinition.id]);
              return (
                <SidebarMenuItem key={routeDefinition.id}>
                  <SidebarMenuLink
                    isActive={currentRouteId === routeDefinition.id}
                    to={filter.navigationHref(routeDefinition.path)}
                    tooltip={label}
                  >
                    <Icon aria-hidden="true" className="size-5 shrink-0" />
                    <SidebarText>{label}</SidebarText>
                  </SidebarMenuLink>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarNavigation>
      </SidebarContent>

      <SidebarFooter className="mb-[0.1875rem] gap-px border-t border-sidebar-border px-[0.1875rem] pb-0 pt-2">
        {settingsRoute ? (
          <SidebarNavigation
            aria-label={t("shell.nav.settings")}
            className="flex-none overflow-visible p-0"
          >
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuLink
                  isActive={currentRouteId === settingsRoute.id}
                  to={filter.navigationHref(settingsRoute.path)}
                  tooltip={t(navLabelKeys[settingsRoute.id])}
                >
                  <Settings aria-hidden="true" className="size-5 shrink-0" />
                  <SidebarText>{t(navLabelKeys[settingsRoute.id])}</SidebarText>
                </SidebarMenuLink>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarNavigation>
        ) : null}
        {!isMobile ? (
          <ProductSidebarTrigger
            className="h-(--product-navigation-row-height) gap-[0.859375rem] rounded-[var(--product-radius-md)] px-[0.796875rem] text-[length:var(--type-body)] leading-[var(--type-body-line)] font-semibold text-muted-foreground aria-expanded:bg-transparent aria-expanded:text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          />
        ) : null}
      </SidebarFooter>
    </Sidebar>
  );
}

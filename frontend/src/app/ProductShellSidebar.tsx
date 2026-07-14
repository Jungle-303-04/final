import { useEffect, useRef } from "react";

import { useI18n } from "../shared/i18n";
import { SidebarTrigger } from "../shared/ui/primitives/sidebar";

export function useDetailSidebarRail(
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

export function ProductSidebarTrigger({
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

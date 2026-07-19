import { useI18n } from "../shared/i18n";
import { SidebarTrigger } from "../shared/ui/primitives/sidebar";

export function ProductSidebarTrigger({
  className,
  labelMode = "responsive",
}: {
  className?: string;
  labelMode?: "responsive" | "sr-only";
}) {
  const { t } = useI18n();
  return (
    <SidebarTrigger
      collapseLabel={t("shell.sidebar.collapse")}
      className={className}
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
